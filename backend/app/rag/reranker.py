"""
Reranker — orders retrieved chunks by relevance before they enter the prompt.

This stage decides which handful of chunks the model actually sees, so its
precision matters more than the recall of the retriever feeding it.

Current strategy is lexical-coverage reranking over the fused retrieval order.
It is deliberately domain-agnostic: no synonym tables, no per-corpus tuning.
A cross-encoder (bge-reranker-v2-m3, or a hosted rerank API) is the intended
successor and would slot in behind the same interface — it reads query and
passage together and would resolve cases this cannot, such as a question about
a person being answered by an organisation's name.
"""

import re

from app.config import get_settings

settings = get_settings()

_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")

# Question and filler words carry no retrieval signal; counting them as
# "covered" would score every chunk identically.
_STOPWORDS = frozenset("""
a an and are as at be by for from has have how in is it its of on or that the
their there these this to was were what when where which who whom why will
with you your me my we us give list show tell about into over under please
""".split())


def _terms(query: str) -> list[str]:
    """Distinctive query tokens, in order, deduplicated."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in _WORD.findall(query or ""):
        token = raw.lower()
        if token in _STOPWORDS or token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


class Reranker:
    """Reranks retrieved chunks and returns the top_k for the prompt."""

    async def rerank(
        self,
        chunks: list[dict],
        query: str,
        top_k: int | None = None,
        fund_name: str | None = None,
    ) -> list[dict]:
        """
        Order by fused retrieval rank, adjusted by how much of the query a
        chunk actually covers.

        `rerank_score` stays on the retriever's 0-1 relevance scale because the
        evidence threshold in grounding.py is calibrated against it; ordering
        uses a separate key so the two concerns cannot drift apart.

        When `fund_name` is provided, chunks whose document name or content
        matches the target fund receive a ranking boost, ensuring the correct
        fund's evidence surfaces above similarly-scored chunks from other funds.
        """
        top_k = top_k or settings.rag_rerank_k
        if not chunks:
            return []

        terms = _terms(query)
        query_lower = (query or "").lower()

        # Pre-compute fund name tokens for matching.
        fund_tokens = _terms(fund_name) if fund_name else []
        fund_lower = (fund_name or "").lower().strip()

        for chunk in chunks:
            content_lower = (chunk.get("content") or "").lower()

            # Share of the distinctive query terms present in this chunk. This
            # is what separates "PCF B" from "PCF A" once the lexical channel
            # is actually contributing.
            if terms:
                hits = sum(1 for term in terms if term in content_lower)
                coverage = hits / len(terms)
            else:
                coverage = 0.0

            # A section heading that echoes the question is a strong hint that
            # the chunk is on-topic rather than merely nearby in vector space.
            section = (chunk.get("section") or "").lower()
            section_hit = bool(section) and any(term in section for term in terms)

            # Fund-name boost: when we know which fund the user asked about,
            # chunks from that fund's document should rank higher.
            fund_boost = 0.0
            if fund_tokens:
                doc_name_lower = (chunk.get("document_name") or "").lower()
                # Check if the fund name appears in the document name or content.
                fund_hits_doc = sum(1 for ft in fund_tokens if ft in doc_name_lower)
                fund_hits_content = sum(1 for ft in fund_tokens if ft in content_lower)
                if fund_hits_doc >= len(fund_tokens):
                    # Full match in document name — strong signal.
                    fund_boost = 0.008
                elif fund_hits_doc > 0:
                    # Partial match in document name.
                    fund_boost = 0.004
                elif fund_hits_content >= len(fund_tokens):
                    # Full match in content.
                    fund_boost = 0.003

            base = float(chunk.get("fusion_score") or 0.0)
            relevance = float(
                chunk.get("relevance", chunk.get("combined_score", 0.0)) or 0.0
            )

            # Fusion scores cluster tightly (~0.016-0.033), so coverage is
            # scaled to be able to reorder within that band without swamping it.
            chunk["coverage"] = round(coverage, 4)
            chunk["ranking_key"] = round(
                base
                + coverage * 0.01
                + (0.004 if section_hit else 0.0)
                + fund_boost
                # Keeps ordering stable when everything else ties.
                + relevance * 0.001,
                8,
            )
            chunk["rerank_score"] = round(relevance, 6)

        chunks.sort(key=lambda c: c["ranking_key"], reverse=True)
        return chunks[:top_k]
