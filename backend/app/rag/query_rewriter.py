"""
Query rewriting — turns a conversational question into search queries.

Retrieval runs on the user's raw words, which breaks in two common ways:

  Coreference     "is he the fund manager?" embeds a pronoun, not a person, so
                  nothing relevant is near it in vector space.
  Vocabulary gap  the asker's words and the document's words differ. "Fund
                  manager" sits closest to "Fund Management Entity" (a firm),
                  while the individual is filed under "ED & Head" or "Managing
                  Partner" and shares no vocabulary with the question at all.

Both are fixed the same way: expand one question into several phrasings and
retrieve for all of them. The expansion is produced by the model rather than a
hand-maintained synonym table, so it carries no domain assumptions and works
the same on fund decks, HR policies or contracts.

Failure here is never fatal — if the rewrite call fails or returns nonsense,
retrieval proceeds on the original question.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

import structlog

from app.llm.provider import LLMProvider

logger = structlog.get_logger()

MAX_VARIANTS = 3
# The reply is three short strings, but gpt-oss spends tokens on reasoning
# before emitting any of them — at 250 the budget was consumed before the JSON
# started and the call returned an empty string, silently disabling rewriting.
REWRITE_MAX_TOKENS = 800

_SYSTEM = """You prepare a user's question for a document retrieval system.

Return ONE JSON object, nothing else:

{
  "resolved": "The question with every pronoun and back-reference replaced by what it refers to, using the conversation history. If nothing needs resolving, repeat the question unchanged.",
  "fund_name": "The exact fund, product, scheme, or entity name the user is asking about, copied as closely as possible to how it appears in documents. Include series/class if mentioned. Empty string if the question is not about a specific fund or product.",
  "passage": "One or two sentences written as they would appear INSIDE the source document, as if answering the question. Invent placeholder specifics freely — this text is never shown to anyone, it is only used to search.",
  "labels": ["1 or 2 headings or labels a formal document would file this answer under"],
  "answer_type": "person" | "organisation" | "number" | "date" | "list" | "explanation" | "other"
}

The point of "passage" and "labels" is to bridge vocabulary. A reader asks in their own words; the document uses its own. Searching with the document's phrasing finds passages the question's phrasing never reaches.

- "fund_name": extract the SPECIFIC fund, product, or scheme the user names. Preserve the name as-is — if the user writes \"AKSWA AISI\", output \"AKSWA AISI\" (do not correct typos). If the user writes \"PCF B\", output \"PCF B\" or \"PCF – Series B\".
- "passage": write in the document's register, not the question's. Use the job titles, section names and sentence patterns such a document would actually contain.
- "labels": short noun phrases only — the kind of thing printed as a heading or a table row label. Not restatements of the question.
- Preserve identifiers, codes and series letters exactly (e.g. "Series B" stays "Series B").

Rules for "answer_type":
- "person" when the question asks for a named human being (who is, name of, which individual).
- "organisation" when it asks for a company, firm or entity.
Set it from what the user wants, not from what the documents contain."""

_EXAMPLE = """Question: who is the fund manager of PCF B

{"resolved":"who is the fund manager of PCF B","fund_name":"PCF – Series B","passage":"The PCF Series B portfolio is managed by Mr A. Sharma, Managing Partner, who joined in 2018 and heads the private credit investment team. He is supported by the investment committee.","labels":["key managerial personnel","investment team","senior leadership designations"],"answer_type":"person"}"""


@dataclass
class RewrittenQuery:
    """The retrieval plan for one user turn."""

    original: str
    resolved: str
    queries: list[str] = field(default_factory=list)
    answer_type: str = "other"
    #: HyDE passage — a fabricated answer used only as a retrieval probe.
    passage: str = ""
    #: The specific fund/product the user is asking about, if any.
    fund_name: str = ""
    #: True when coreference resolution changed the query, meaning the question
    #: depends on conversation history to make sense (e.g. "is he the manager?").
    #: False when the question is self-contained and history would only
    #: contaminate the answer.
    needs_history: bool = False
    #: False when the rewrite failed and the original question is being used.
    rewritten: bool = True

    @property
    def expects_person(self) -> bool:
        return self.answer_type == "person"

    @classmethod
    def passthrough(cls, query: str) -> "RewrittenQuery":
        return cls(
            original=query,
            resolved=query,
            queries=[query],
            answer_type="other",
            fund_name="",
            needs_history=False,
            rewritten=False,
        )


def _extract_json(raw: str) -> dict | None:
    """Models occasionally wrap JSON in prose or fences despite instructions."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _clean_queries(values, resolved: str) -> list[str]:
    """Deduplicate case-insensitively while preserving order, resolved first."""
    out: list[str] = []
    seen: set[str] = set()
    for candidate in [resolved, *(values or [])]:
        if not isinstance(candidate, str):
            continue
        text = " ".join(candidate.split()).strip()
        if not text or len(text) > 600:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= MAX_VARIANTS:
            break
    return out


class QueryRewriter:
    """Expands one question into several retrieval queries."""

    def __init__(self, llm: LLMProvider):
        self.llm = llm

    async def rewrite(
        self,
        query: str,
        conversation_history: list[dict] | None = None,
        trace_id: str | None = None,
    ) -> RewrittenQuery:
        question = (query or "").strip()
        if not question:
            return RewrittenQuery.passthrough(query)

        # Quick check: does the question contain pronouns or back-references
        # that would need conversation history to resolve? If not, skip history
        # in the rewrite prompt — it only adds tokens and latency.
        _COREFERENCE_WORDS = {
            "he", "she", "it", "they", "him", "her", "them", "his", "its",
            "their", "this", "that", "these", "those", "the same",
            "above", "previous", "mentioned", "said",
        }
        words_lower = set(question.lower().split())
        has_coreference = bool(words_lower & _COREFERENCE_WORDS)

        # Only the last few turns matter for resolving a reference, and they
        # keep the rewrite prompt small.
        history_text = ""
        if conversation_history and has_coreference:
            recent = conversation_history[-4:]
            history_text = "\n".join(
                f"{m.get('role', 'user')}: {str(m.get('content', ''))[:300]}"
                for m in recent
            )

        user_content = _EXAMPLE + "\n\n"
        if history_text:
            user_content += f"Conversation so far:\n{history_text}\n\n"
        user_content += f"Question: {question}\n"

        messages = [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user_content},
        ]

        raw = None
        # Constrained JSON mode is stricter but providers sometimes reject their
        # own output with json_validate_failed. Falling back to free-form and
        # parsing it ourselves recovers the rewrite instead of losing it.
        for response_format in ({"type": "json_object"}, None):
            try:
                raw = await self.llm.generate(
                    messages=messages,
                    temperature=0.0,
                    max_tokens=REWRITE_MAX_TOKENS,
                    response_format=response_format,
                )
                break
            except Exception as exc:
                logger.warning(
                    "query_rewrite_attempt_failed",
                    trace_id=trace_id,
                    constrained=response_format is not None,
                    error=str(exc)[:160],
                )

        if raw is None:
            # Retrieval must still run; a missing rewrite only costs recall.
            return RewrittenQuery.passthrough(question)

        payload = _extract_json(raw)
        if not isinstance(payload, dict):
            logger.warning("query_rewrite_unparsable", trace_id=trace_id)
            return RewrittenQuery.passthrough(question)

        resolved = payload.get("resolved")
        resolved = resolved.strip() if isinstance(resolved, str) and resolved.strip() else question

        passage = payload.get("passage")
        passage = passage.strip() if isinstance(passage, str) else ""

        labels = payload.get("labels")
        labels = labels if isinstance(labels, list) else []

        # The hypothetical passage goes in as its own retrieval probe (HyDE):
        # written in the document's register, it lands near the passage that
        # actually holds the answer, which the question's own wording does not.
        variants = ([passage] if passage else []) + [str(x) for x in labels]
        queries = _clean_queries(variants, resolved)
        if not queries:
            queries = [question]

        answer_type = payload.get("answer_type")
        if not isinstance(answer_type, str):
            answer_type = "other"

        fund_name = payload.get("fund_name")
        fund_name = fund_name.strip() if isinstance(fund_name, str) else ""

        # Detect whether the question needed coreference resolution.
        # If resolved == original (or very close), the question is self-
        # contained and conversation history should NOT be injected into the
        # generation prompt — doing so lets the previous answer bleed into
        # the current one ("who is the fund manager of ASKWA AISI" after
        # asking about PCF B would conflate both funds).
        needs_history = resolved.lower().strip() != question.lower().strip()

        logger.info(
            "query_rewritten",
            trace_id=trace_id,
            answer_type=answer_type,
            fund_name=fund_name or "(none)",
            needs_history=needs_history,
            variants=len(queries),
        )

        return RewrittenQuery(
            original=question,
            resolved=resolved,
            queries=queries,
            answer_type=answer_type.lower().strip(),
            passage=passage,
            fund_name=fund_name,
            needs_history=needs_history,
        )
