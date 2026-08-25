"""
Document-level metadata extraction.

Retrieval previously had no way to tell one PDF from another: chunks were
filtered by knowledge source, and every document in a source was searched for
every question. Asking about one fund therefore matched passages in all of
them, because the text of "AUM: 500cr" is the same wherever it appears.

Extracting a descriptor per document — subject, series, type, as-of date —
gives two things: a provenance header to embed into every chunk, and something
for the query router to filter on before searching.

Costs one LLM call per document at ingest. Never per query.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field

import structlog

from app.llm.provider import LLMProvider

logger = structlog.get_logger()

EXTRACT_MAX_TOKENS = 800  # reasoning tokens are drawn from this budget too

_SYSTEM = """You extract identifying metadata from a business document.

Return ONE JSON object, nothing else:

{
  "subject": "The primary entity the document is about — a fund, product or company name, exactly as written in the document. Empty string if there is no single clear subject.",
  "series": "The share class, series or variant, if the document names one (e.g. 'Series B', 'Class A', 'Direct Growth'). Empty string otherwise.",
  "doc_type": "One of: factsheet, pitch_deck, investment_deck, tracker, policy, report, filing, other",
  "as_of": "The document's as-of or publication date as written, e.g. 'August 2026'. Empty string if absent.",
  "aliases": ["Up to 4 short alternative names or abbreviations a reader might use for the subject, including acronyms"]
}

Rules:
- Copy names verbatim from the document. Do not translate, expand or tidy them.
- Preserve series letters exactly ("Series B" stays "Series B").
- "aliases" is how someone would actually refer to this in conversation — if the document is "ASK Private Credit Fund – Series B", useful aliases include "PCF B", "PCF Series B", "ASK PCF B".
- If you cannot tell, use an empty string rather than guessing."""


@dataclass
class DocumentMetadata:
    """Identifying descriptors for one document."""

    subject: str = ""
    series: str = ""
    doc_type: str = ""
    as_of: str = ""
    aliases: list[str] = field(default_factory=list)

    def descriptor(self) -> str:
        """Short human label, used as the chunk provenance header."""
        parts = [p for p in (self.subject, self.series) if p]
        return " ".join(parts)

    def routing_terms(self) -> list[str]:
        """Lowercased terms the query router matches a question against."""
        terms = {t.lower() for t in ([self.subject, self.series, *self.aliases]) if t}
        return sorted(terms)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, raw: dict | None) -> "DocumentMetadata":
        if not isinstance(raw, dict):
            return cls()
        aliases = raw.get("aliases")
        return cls(
            subject=str(raw.get("subject") or "")[:200],
            series=str(raw.get("series") or "")[:100],
            doc_type=str(raw.get("doc_type") or "")[:50],
            as_of=str(raw.get("as_of") or "")[:60],
            aliases=[str(a)[:80] for a in aliases][:6] if isinstance(aliases, list) else [],
        )


def _extract_json(raw: str) -> dict | None:
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


async def extract_document_metadata(
    llm: LLMProvider,
    filename: str,
    sample_text: str,
    *,
    max_sample_chars: int = 4000,
) -> DocumentMetadata:
    """
    Identify what a document is about, from its filename and opening pages.

    Falls back to a filename-derived descriptor when the call fails: ingestion
    must never be blocked by metadata, and a weak descriptor still beats none.
    """
    sample = (sample_text or "")[:max_sample_chars]
    user = f"Filename: {filename}\n\nOpening content:\n{sample}"

    raw = None
    for response_format in ({"type": "json_object"}, None):
        try:
            raw = await llm.generate(
                messages=[
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": user},
                ],
                temperature=0.0,
                max_tokens=EXTRACT_MAX_TOKENS,
                response_format=response_format,
            )
            break
        except Exception as exc:
            logger.warning(
                "doc_metadata_attempt_failed",
                filename=filename,
                constrained=response_format is not None,
                error=str(exc)[:160],
            )

    payload = _extract_json(raw) if raw else None
    if not payload:
        # The filename is usually a decent subject on its own.
        stem = re.sub(r"\.[A-Za-z0-9]+$", "", filename)
        stem = re.sub(r"[_\-]+", " ", stem).strip()
        logger.info("doc_metadata_fallback", filename=filename)
        return DocumentMetadata(subject=stem[:200])

    meta = DocumentMetadata.from_dict(payload)
    logger.info(
        "doc_metadata_extracted",
        filename=filename,
        subject=meta.subject,
        series=meta.series,
        doc_type=meta.doc_type,
        aliases=len(meta.aliases),
    )
    return meta
