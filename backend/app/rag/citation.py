"""
Citation validator — validates LLM-generated citations against retrieved chunks.

Per rag_specifications.md: citations must be validated after generation. A
citation that names a document the retriever never returned is dropped, because
presenting it would imply evidence the system does not actually hold.
"""

import difflib
import structlog

logger = structlog.get_logger()

MAX_CITATIONS = 8


class CitationValidator:
    """Validates that citations in LLM output reference actual retrieved chunks."""

    def validate(
        self, citations: list[dict], retrieved_chunks: list[dict]
    ) -> list[dict]:
        """
        Validate citations against retrieved chunks.

        Resolves each citation to a real chunk (preferring an exact
        document + page match), attaches the true document_id, backfills a
        snippet from the chunk when the model omitted one, and removes
        duplicates.
        """
        if not citations or not retrieved_chunks:
            return []

        # Index chunks by document name, and by (document name, page).
        by_name: dict[str, list[dict]] = {}
        by_name_page: dict[tuple[str, int | None], dict] = {}
        # Documents whose retrieved chunks actually carry page numbers. Only for
        # these can a cited page be checked; formats like .txt and .csv have none.
        paged_docs: set[str] = set()

        for chunk in retrieved_chunks:
            name = (chunk.get("document_name") or "").strip().lower()
            if not name:
                continue
            by_name.setdefault(name, []).append(chunk)
            by_name_page.setdefault((name, chunk.get("page")), chunk)
            if chunk.get("page") is not None:
                paged_docs.add(name)

        known_names = list(by_name.keys())
        validated: list[dict] = []
        seen: set[tuple[str, int | None]] = set()

        for citation in citations:
            cited_name = (citation.get("document_name") or "").strip().lower()
            if not cited_name:
                continue

            resolved_name = self._resolve_name(cited_name, known_names)
            if resolved_name is None:
                logger.info("citation_rejected", document_name=citation.get("document_name"))
                continue

            page = citation.get("page")
            chunk = by_name_page.get((resolved_name, page)) or by_name[resolved_name][0]

            # Correct a page the retriever contradicts. When the document's
            # chunks carry no page numbers at all there is nothing to check
            # against, so the model's locator is kept rather than discarded —
            # dropping it would lose information without gaining verification.
            if (
                page is not None
                and resolved_name in paged_docs
                and (resolved_name, page) not in by_name_page
            ):
                page = chunk.get("page")

            key = (resolved_name, page)
            if key in seen:
                continue
            seen.add(key)

            snippet = (citation.get("snippet") or "").strip()
            if not snippet:
                snippet = (chunk.get("content") or "")[:300]

            validated.append({
                "document_id": chunk.get("document_id"),
                "document_name": chunk.get("document_name"),
                "page": page,
                "section": citation.get("section") or chunk.get("section"),
                "snippet": snippet[:600],
            })

            if len(validated) >= MAX_CITATIONS:
                break

        return validated

    @staticmethod
    def _resolve_name(cited: str, known: list[str]) -> str | None:
        """Match a cited document name to a retrieved one, tolerating small drift."""
        if cited in known:
            return cited

        for name in known:
            if cited in name or name in cited:
                return name

        close = difflib.get_close_matches(cited, known, n=1, cutoff=0.8)
        return close[0] if close else None

    def build_sources(self, retrieved_chunks: list[dict]) -> list[dict]:
        """
        Build the 'sources consulted' list shown alongside validated citations.

        One entry per document, so the UI can show provenance even when the
        model cited only a subset.
        """
        sources: dict[str, dict] = {}
        for chunk in retrieved_chunks:
            name = chunk.get("document_name") or "Unknown"
            entry = sources.setdefault(name, {
                "document_id": str(chunk.get("document_id")),
                "document_name": name,
                "pages": [],
                "top_score": 0.0,
            })
            page = chunk.get("page")
            if page is not None and page not in entry["pages"]:
                entry["pages"].append(page)
            score = float(chunk.get("rerank_score", chunk.get("combined_score", 0)) or 0)
            entry["top_score"] = max(entry["top_score"], round(score, 4))

        for entry in sources.values():
            entry["pages"].sort()

        return sorted(sources.values(), key=lambda s: s["top_score"], reverse=True)
