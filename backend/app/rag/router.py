"""
Query routing — narrows a search to the documents a question is actually about.

Without this, every question searches every document in the knowledge source,
so asking about one fund retrieves passages from all of them. Dense similarity
cannot separate them on its own: "AUM: 500cr" reads the same in every deck, and
short identifiers like "Series B" barely move an embedding.

Routing runs on the descriptors extracted at ingest (see
ingestion/doc_metadata.py) and is purely lexical — no model call, no tokens, no
measurable latency. That matters because it happens on every single query.

It fails open by design. A question that matches no document searches all of
them, exactly as before. Returning nothing because the router guessed wrong
would be a worse bug than the one it fixes.
"""

from __future__ import annotations

import re
import uuid

import structlog

from app.ingestion.doc_metadata import DocumentMetadata

logger = structlog.get_logger()

# Single characters and digits carry no routing signal on their own; a series
# letter only means something alongside a rarer token like "pcf".
_MIN_TOKEN = 2
# A document must clear this weighted score to be considered a match at all.
_MIN_SCORE = 0.7
# Upper bound on documents selected, so a vague query does not "narrow" to
# everything and pay the filter for nothing.
_MAX_SELECTED = 3
# A document is kept when it scores at least this fraction of the best match.
# Set low enough that a comparison question keeps its weaker subject, high
# enough that one generic shared token ("fund") does not drag a document in.
_TIE_RATIO = 0.5

_NORMALISE = re.compile(r"[^a-z0-9]+")


def _normalise(text: str) -> str:
    """Lowercase and collapse punctuation so 'PCF-B' and 'pcf b' match."""
    return _NORMALISE.sub(" ", (text or "").lower()).strip()


def _edit_distance_one(a: str, b: str) -> bool:
    """True when `a` and `b` differ by at most one Damerau-Levenshtein edit.

    Covers substitution, insertion, deletion, AND transposition of two
    adjacent characters — the last one matters because fund-name typos are
    very often transpositions ('akswa' ↔ 'askwa').
    """
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if a == b:
        return False

    if la == lb:
        # Substitution or transposition.
        diffs = [(i, ca, cb) for i, (ca, cb) in enumerate(zip(a, b)) if ca != cb]
        if len(diffs) == 1:
            return True  # single substitution
        if len(diffs) == 2:
            # Transposition: adjacent positions, swapped chars.
            (i1, ca1, cb1), (i2, ca2, cb2) = diffs
            return i2 == i1 + 1 and ca1 == cb2 and ca2 == cb1
        return False

    # Insert / delete: the shorter must equal the longer with one char removed.
    short, long_ = (a, b) if la < lb else (b, a)
    i = j = 0
    edits = 0
    while i < len(short) and j < len(long_):
        if short[i] != long_[j]:
            edits += 1
            if edits > 1:
                return False
            j += 1
        else:
            i += 1
            j += 1
    return True


def _bigrams(tokens: list[str] | set[str]) -> set[str]:
    """Consecutive token pairs joined by a space."""
    token_list = sorted(tokens) if isinstance(tokens, set) else list(tokens)
    return {f"{token_list[i]} {token_list[i+1]}" for i in range(len(token_list) - 1)}


# Generic domain terms and common file keywords that appear across almost all
# documents or queries, and therefore carry zero routing signal to distinguish
# one fund from another.
ROUTING_STOPWORDS = {
    "fund", "funds", "manager", "managers", "management", "investment",
    "investments", "investor", "investors", "portfolio", "portfolios",
    "scheme", "schemes", "deck", "pitchbook", "presentation", "report",
    "document", "overview", "factsheet", "pdf", "xlsx", "xlsm", "docx",
    "pvt", "ltd", "private", "limited", "who", "what", "where", "when",
    "which", "the", "and", "for", "with", "from", "about",
}


class DocumentRouter:
    """Selects which documents a query should be restricted to."""

    def select(
        self,
        query: str,
        documents: list[dict],
        trace_id: str | None = None,
    ) -> list[uuid.UUID] | None:
        """
        Return the document ids to search, or None to search everything.

        Matching is per-token and weighted by how rare a token is across the
        candidate documents, rather than by exact substring. Exact matching was
        too brittle: the descriptor for the Series B deck lists the alias
        "ask pcf b", and a user asking about "PCF B" contains no such substring,
        so the document it names would not have been selected.

        Generic financial stopwords ('fund', 'manager', 'deck', etc.) are
        filtered out so they do not cause every fund document to be selected
        when the user asks "who is the fund manager of X".

        Fuzzy matching (1-edit-distance for tokens ≥ 4 characters) handles
        common typos like "akswa" for "askwa". Bigram matching scores
        multi-word identifiers more strongly when consecutive tokens match.
        """
        haystack = _normalise(query)
        if not haystack or not documents:
            return None

        query_tokens = [t for t in haystack.split() if t not in ROUTING_STOPWORDS]
        query_token_set = set(query_tokens)
        query_bigrams = _bigrams(query_tokens)
        if not query_token_set:
            return None

        # Document frequency per token, over the candidate set.
        doc_terms: list[tuple[uuid.UUID, str, set[str], set[str]]] = []
        frequency: dict[str, int] = {}
        for doc in documents:
            meta = DocumentMetadata.from_dict(doc.get("doc_metadata"))
            raw_terms = list(meta.routing_terms())
            # Include tokens from document filename as well (e.g. 'AISI', 'PitchBook')
            if doc.get("name"):
                raw_terms.append(doc["name"])

            tokens: set[str] = set()
            for term in raw_terms:
                tokens.update(_normalise(term).split())
            tokens = {
                t for t in tokens
                if len(t) >= _MIN_TOKEN and t not in ROUTING_STOPWORDS
            }

            # Build bigrams from routing terms (preserving original order).
            all_term_tokens: list[str] = []
            for term in raw_terms:
                all_term_tokens.extend([
                    t for t in _normalise(term).split()
                    if t not in ROUTING_STOPWORDS
                ])
            doc_bigrams = _bigrams(all_term_tokens)
            doc_terms.append((doc["id"], meta.descriptor() or doc.get("name", ""), tokens, doc_bigrams))
            for token in tokens:
                frequency[token] = frequency.get(token, 0) + 1

        total_docs = len(documents)
        scored: list[tuple[float, uuid.UUID, str]] = []
        for doc_id, label, tokens, doc_bigrams in doc_terms:
            # Exact token matches.
            matched = tokens & query_token_set

            # Fuzzy token matches: 1-edit-distance for tokens ≥ 4 chars.
            for qt in query_token_set:
                if qt in matched or len(qt) < 4:
                    continue
                for dt in tokens:
                    if dt in matched or len(dt) < 4:
                        continue
                    if _edit_distance_one(qt, dt):
                        matched.add(dt)
                        break

            if not matched and not (doc_bigrams & query_bigrams):
                continue

            # A token shared by every document distinguishes nothing.
            score = sum(
                1.0 - (frequency[t] - 1) / max(1, total_docs)
                for t in matched
            )

            # Bigram bonus: a consecutive pair matching is strong evidence the
            # query names this specific document. Weighted at 1.5× per bigram.
            bigram_matches = doc_bigrams & query_bigrams
            score += len(bigram_matches) * 1.5

            if score >= _MIN_SCORE:
                scored.append((score, doc_id, label))

        if not scored:
            logger.info("router_no_match", trace_id=trace_id)
            return None

        # Every document clearing the bar is kept, ranked, rather than only
        # those close to the best score. A comparison question names two
        # subjects and they are rarely equally distinctive — "compare PCF B and
        # ASKWA AISI" matches one token for the first and two for the second,
        # and a relative cutoff silently dropped the weaker one.
        scored.sort(key=lambda row: row[0], reverse=True)
        top = scored[0][0]
        cutoff = max(_MIN_SCORE, top * _TIE_RATIO)
        selected = [
            (doc_id, label)
            for score, doc_id, label in scored[:_MAX_SELECTED]
            if score >= cutoff
        ]

        if len(selected) >= total_docs:
            logger.info("router_matched_all", trace_id=trace_id)
            return None

        logger.info(
            "router_selected",
            trace_id=trace_id,
            documents=[label for _, label in selected],
            of_total=total_docs,
            top_score=round(top, 3),
        )
        return [doc_id for doc_id, _ in selected]
