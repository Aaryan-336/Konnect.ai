"""
Hybrid retriever — pgvector cosine similarity + PostgreSQL full-text search,
combined with Reciprocal Rank Fusion.

Authorization-aware: filters by tenant_id and allowed source_ids before search.

Why RRF rather than a weighted sum of the two scores: cosine similarity lands
in roughly 0.4-0.9 while `ts_rank` returns roughly 0.01-0.1, so any fixed
weighting is dominated by whichever metric happens to have the larger range.
RRF ranks each channel independently and fuses the ranks, which is scale-free
and needs no tuning.

Two scores travel with every chunk and they mean different things:

  fusion_score  ordering only. RRF output, ~0.01-0.03, not comparable to
                anything else and never compared against a threshold.
  relevance     semantic closeness to the query on a 0-1 cosine scale. This is
                what the evidence threshold in grounding.py judges, so it is
                populated for every candidate including keyword-only hits.
"""

import re
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.ingestion.embedder import EmbeddingProvider, get_embedding_provider

settings = get_settings()

# Standard RRF damping. Large enough that the top few ranks are not winner-take-all.
RRF_K = 60

_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")


def _to_or_query(query: str) -> str:
    """
    Build a lenient full-text query from natural language.

    `plainto_tsquery` ANDs every term, so a question phrased as a sentence
    ("who is the fund manager of PCF B") requires all of fund AND manag AND
    pcf AND b in a single chunk and usually matches nothing — which silently
    reduced hybrid search to vector-only search.

    Tokens are OR'd instead and `ts_rank` sorts the result, so chunks matching
    more (and rarer) terms still surface first. The output is fed to
    `websearch_to_tsquery`, which is total over arbitrary input: unlike
    `to_tsquery` it cannot raise a syntax error on user text.
    """
    tokens = [t.lower() for t in _WORD.findall(query or "")]
    # A single trailing letter such as the "B" in "PCF B" is a real
    # discriminator between share classes and must survive tokenisation.
    tokens = [t for t in tokens if len(t) >= 1][:24]
    return " or ".join(tokens)


class HybridRetriever:
    """
    Performs hybrid retrieval:
    1. Semantic search via pgvector cosine distance
    2. Keyword search via PostgreSQL full-text search
    3. Fuses the two rankings with Reciprocal Rank Fusion
    """

    def __init__(self, embedder: EmbeddingProvider | None = None):
        self.embedder = embedder or get_embedding_provider()

    async def retrieve(
        self,
        db: AsyncSession,
        query: str,
        tenant_id: uuid.UUID,
        source_ids: list[uuid.UUID],
        top_k: int | None = None,
        embedding: list[float] | None = None,
        document_ids: list[uuid.UUID] | None = None,
    ) -> list[dict]:
        """
        Perform hybrid retrieval with authorization filtering.

        `embedding` may be supplied by a caller that has already embedded this
        query, so multi-query retrieval can batch every phrasing into a single
        embed call instead of paying the per-call overhead five times.

        Returns a list of chunk dicts ordered by fused rank.
        """
        top_k = top_k or settings.rag_candidate_k

        if not source_ids:
            return []

        if embedding is None:
            embedding = (await self.embedder.embed_queries([query]))[0]
        query_embedding = str(embedding)
        source_id_strs = [str(sid) for sid in source_ids]

        # An empty list would mean "match nothing"; only a populated list
        # narrows the search. See rag/router.py — routing fails open.
        doc_filter = "AND dc.document_id = ANY(:document_ids)" if document_ids else ""

        common = {
            "tenant_id": str(tenant_id),
            "source_ids": source_id_strs,
            "limit": top_k,
        }
        if document_ids:
            common["document_ids"] = [str(d) for d in document_ids]

        # --- Channel 1: dense vector search --------------------------------
        vector_sql = text("""
            SELECT
                dc.id, dc.document_id, dc.content, dc.page, dc.section,
                dc.chunk_index, dc.source_id,
                d.name AS document_name, d.path AS document_path,
                (dc.embedding <=> CAST(:query_embedding AS vector)) AS distance
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE dc.tenant_id = :tenant_id
              AND dc.source_id = ANY(:source_ids)
              AND d.status = 'indexed'
              {doc_filter}
            ORDER BY distance ASC
            LIMIT :limit
        """.format(doc_filter=doc_filter))
        vector_rows = (
            await db.execute(vector_sql, {**common, "query_embedding": query_embedding})
        ).fetchall()

        # --- Channel 2: lexical search -------------------------------------
        fts_rows = []
        or_query = _to_or_query(query)
        if or_query:
            fts_sql = text("""
                SELECT
                    dc.id, dc.document_id, dc.content, dc.page, dc.section,
                    dc.chunk_index, dc.source_id,
                    d.name AS document_name, d.path AS document_path,
                    ts_rank(
                        dc.search_vector,
                        websearch_to_tsquery('english', :fts_query)
                    ) AS rank,
                    (dc.embedding <=> CAST(:query_embedding AS vector)) AS distance
                FROM document_chunks dc
                JOIN documents d ON d.id = dc.document_id
                WHERE dc.tenant_id = :tenant_id
                  AND dc.source_id = ANY(:source_ids)
                  AND d.status = 'indexed'
                  {doc_filter}
                  AND dc.search_vector @@ websearch_to_tsquery('english', :fts_query)
                ORDER BY rank DESC
                LIMIT :limit
            """.format(doc_filter=doc_filter))
            fts_rows = (
                await db.execute(
                    fts_sql,
                    {**common, "fts_query": or_query, "query_embedding": query_embedding},
                )
            ).fetchall()

        # --- Fuse -----------------------------------------------------------
        # The cosine distance is selected in both queries so a keyword-only hit
        # still carries a real relevance score. Previously those chunks were
        # assigned 0.0, which put the one chunk containing the user's exact
        # search term below every vague semantic match and then failed the
        # evidence threshold.
        chunks: dict[str, dict] = {}

        def _record(row) -> dict:
            key = str(row.id)
            existing = chunks.get(key)
            if existing:
                return existing
            entry = {
                "chunk_id": row.id,
                "document_id": row.document_id,
                "document_name": row.document_name,
                "document_path": row.document_path,
                "content": row.content,
                "page": row.page,
                "section": row.section,
                "chunk_index": row.chunk_index,
                "source_id": row.source_id,
                "vector_score": round(1.0 - float(row.distance), 6),
                "fts_score": 0.0,
                "vector_rank": None,
                "fts_rank": None,
            }
            chunks[key] = entry
            return entry

        for rank, row in enumerate(vector_rows, start=1):
            entry = _record(row)
            entry["vector_rank"] = rank

        for rank, row in enumerate(fts_rows, start=1):
            entry = _record(row)
            entry["fts_rank"] = rank
            entry["fts_score"] = round(float(row.rank), 6)

        for entry in chunks.values():
            fusion = 0.0
            if entry["vector_rank"] is not None:
                fusion += 1.0 / (RRF_K + entry["vector_rank"])
            if entry["fts_rank"] is not None:
                fusion += 1.0 / (RRF_K + entry["fts_rank"])
            entry["fusion_score"] = round(fusion, 8)

            # Relevance stays on the cosine scale so the evidence threshold in
            # grounding.py keeps its meaning. A strong lexical hit lifts it
            # slightly, capped so it can never manufacture confidence on its own.
            lexical_bonus = min(entry["fts_score"], 0.1) * 0.5
            entry["relevance"] = round(min(1.0, entry["vector_score"] + lexical_bonus), 6)
            # Retained for callers that predate the rename.
            entry["combined_score"] = entry["relevance"]

        results = sorted(chunks.values(), key=lambda c: c["fusion_score"], reverse=True)
        return results[:top_k]

    async def retrieve_many(
        self,
        db: AsyncSession,
        queries: list[str],
        tenant_id: uuid.UUID,
        source_ids: list[uuid.UUID],
        top_k: int | None = None,
        document_ids: list[uuid.UUID] | None = None,
    ) -> list[dict]:
        """
        Retrieve for several phrasings of one question and fuse the results.

        A chunk that ranks well for any phrasing surfaces, which is what lets a
        question worded in the user's vocabulary reach a passage written in the
        document's vocabulary. Fusion is RRF again, so a chunk found by two
        phrasings outranks one found by a single phrasing without any phrasing
        needing a hand-assigned weight.

        `relevance` is carried over as the maximum across phrasings rather than
        summed: it feeds the evidence threshold and must stay a similarity, not
        a tally.
        """
        top_k = top_k or settings.rag_candidate_k

        unique = [q for q in dict.fromkeys(q.strip() for q in queries if q and q.strip())]
        if not unique:
            return []
        if len(unique) == 1:
            return await self.retrieve(
                db, unique[0], tenant_id, source_ids, top_k, document_ids=document_ids
            )

        # One embed call for every phrasing; the model batches internally and
        # this is far cheaper than N round trips.
        vectors = await self.embedder.embed_queries(unique)

        fused: dict[str, dict] = {}
        for query, vector in zip(unique, vectors):
            results = await self.retrieve(
                db, query, tenant_id, source_ids, top_k,
                embedding=vector, document_ids=document_ids,
            )
            for rank, chunk in enumerate(results, start=1):
                key = str(chunk["chunk_id"])
                existing = fused.get(key)
                if existing is None:
                    chunk["fusion_score"] = 1.0 / (RRF_K + rank)
                    chunk["matched_queries"] = 1
                    fused[key] = chunk
                else:
                    existing["fusion_score"] += 1.0 / (RRF_K + rank)
                    existing["matched_queries"] += 1
                    if chunk["relevance"] > existing["relevance"]:
                        existing["relevance"] = chunk["relevance"]
                        existing["combined_score"] = chunk["relevance"]
                        existing["vector_score"] = chunk["vector_score"]
                    existing["fts_score"] = max(existing["fts_score"], chunk["fts_score"])

        for entry in fused.values():
            entry["fusion_score"] = round(entry["fusion_score"], 8)

        results = sorted(fused.values(), key=lambda c: c["fusion_score"], reverse=True)
        return results[:top_k]
