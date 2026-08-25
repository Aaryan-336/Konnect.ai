"""
RAG Pipeline orchestrator.

Executes the full pipeline:
Query → Retrieval → Reranking → Evidence Validation → Grounding → LLM
      → Structured Parsing → Citation Validation → Response

Both entry points return the same structured contract. `execute` returns it in
one shot; `execute_stream` streams the answer prose as it is generated and then
emits the validated structured blocks. The stream never exposes JSON syntax to
the client — see app/rag/structured.py.
"""

import asyncio
import time
import uuid
import structlog
from typing import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.rag.retriever import HybridRetriever
from app.rag.query_rewriter import QueryRewriter, RewrittenQuery
from app.rag.router import DocumentRouter
from app.rag.reranker import Reranker
from app.rag.grounding import GroundingEngine, NO_ANSWER_TEXT
from app.rag.citation import CitationValidator
from app.rag.structured import (
    AnswerFieldStreamer,
    normalize_response,
    parse_structured_response,
)
from app.llm import get_llm_provider
from app.llm.provider import LLMRateLimitError
from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

JSON_RESPONSE_FORMAT = {"type": "json_object"}

RATE_LIMIT_MESSAGE = (
    "The language model is currently rate limited. Please wait a few seconds and ask again."
)
GENERIC_ERROR_MESSAGE = (
    "I encountered an error while processing your question. Please try again."
)


# One short retry absorbs a burst that briefly exceeds the provider's
# tokens-per-minute window. A sustained overage is surfaced to the user instead
# of stalling the request behind a long backoff.
RATE_LIMIT_RETRIES = 1
RATE_LIMIT_BACKOFF_SECONDS = 3.0


def _error_message(exc: Exception) -> str:
    """A rate limit is transient and worth saying so; other failures are not."""
    return RATE_LIMIT_MESSAGE if isinstance(exc, LLMRateLimitError) else GENERIC_ERROR_MESSAGE


class RAGPipeline:
    """Full RAG pipeline orchestrator."""

    def __init__(self):
        self.retriever = HybridRetriever()
        self.reranker = Reranker()
        self.grounding = GroundingEngine()
        self.citation_validator = CitationValidator()
        self.llm = get_llm_provider()
        self.query_rewriter = QueryRewriter(self.llm)
        self.router = DocumentRouter()

    # ----------------------------------------------------------------- #
    # Shared stages
    # ----------------------------------------------------------------- #

    async def _gather_evidence(
        self,
        db: AsyncSession,
        query: str,
        tenant_id: uuid.UUID,
        source_ids: list[uuid.UUID],
        evidence_threshold: float | None,
        trace_id: str,
        plan: RewrittenQuery | None = None,
    ) -> tuple[bool, list[dict], dict]:
        """Retrieve → rerank → validate. Returns (sufficient, context_chunks, stats)."""
        plan = plan or RewrittenQuery.passthrough(query)

        # Narrow to the documents the question is actually about, before
        # searching. Returns None when nothing matches, which searches all of
        # them — routing must never be able to produce an empty result set.
        document_ids = None
        if settings.rag_document_routing_enabled:
            candidates = await self._candidate_documents(db, tenant_id, source_ids)
            document_ids = self.router.select(plan.resolved, candidates, trace_id)

        retrieved = await self.retriever.retrieve_many(
            db=db,
            queries=plan.queries,
            tenant_id=tenant_id,
            source_ids=source_ids,
            top_k=settings.rag_candidate_k,
            document_ids=document_ids,
        )
        logger.info(
            "retrieval_complete",
            trace_id=trace_id,
            candidates=len(retrieved),
            phrasings=len(plan.queries),
            routed_documents=len(document_ids) if document_ids else 0,
        )

        # Reranking scores against the resolved question, not the raw one: a
        # turn like "is he the fund manager?" has no content to match on.
        reranked = await self.reranker.rerank(
            chunks=retrieved,
            query=plan.resolved,
            top_k=settings.rag_rerank_k,
            fund_name=plan.fund_name or None,
        )

        is_sufficient, valid_chunks = self.grounding.validate_evidence(
            reranked, threshold=evidence_threshold
        )

        context_chunks = valid_chunks[:min(len(valid_chunks), settings.rag_context_k)]
        stats = {
            "candidates": len(retrieved),
            "reranked": len(reranked),
            "context_chunks": len(context_chunks),
            "top_score": round(
                float(reranked[0].get("rerank_score", 0)) if reranked else 0.0, 4
            ),
        }
        return is_sufficient, context_chunks, stats

    @staticmethod
    async def _candidate_documents(
        db: AsyncSession,
        tenant_id: uuid.UUID,
        source_ids: list[uuid.UUID],
    ) -> list[dict]:
        """Indexed documents the caller is allowed to search, with descriptors."""
        if not source_ids:
            return []
        rows = (
            await db.execute(
                text("""
                    SELECT id, name, doc_metadata
                    FROM documents
                    WHERE tenant_id = :tenant_id
                      AND source_id = ANY(:source_ids)
                      AND status = 'indexed'
                """),
                {
                    "tenant_id": str(tenant_id),
                    "source_ids": [str(s) for s in source_ids],
                },
            )
        ).fetchall()
        return [
            {"id": r.id, "name": r.name, "doc_metadata": r.doc_metadata}
            for r in rows
        ]

    def _build_messages(
        self,
        context_chunks: list[dict],
        query: str,
        agent_instructions: str | None,
        conversation_history: list[dict] | None,
        answer_type: str | None = None,
        fund_name: str | None = None,
        needs_history: bool = False,
    ) -> list[dict]:
        messages = self.grounding.build_context(
            context_chunks, agent_instructions, answer_type, fund_name=fund_name
        )

        if conversation_history and needs_history:
            # Inject history ONLY when the question depends on prior turns
            # (coreference resolution changed the query). For self-contained
            # questions like "who is the fund manager of ASKWA AISI", history
            # from a prior PCF B question would contaminate the answer.
            messages.extend(conversation_history[-6:])

        messages.append({"role": "user", "content": query})
        return messages

    async def _generate_with_retry(self, messages: list[dict], trace_id: str) -> str:
        """Generate once, retrying a rate-limited call after a short backoff."""
        for attempt in range(RATE_LIMIT_RETRIES + 1):
            try:
                return await self.llm.generate(
                    messages=messages,
                    temperature=0.1,
                    max_tokens=settings.llm_max_output_tokens,
                    response_format=JSON_RESPONSE_FORMAT,
                )
            except LLMRateLimitError:
                if attempt >= RATE_LIMIT_RETRIES:
                    raise
                logger.warning("llm_rate_limited_retrying", trace_id=trace_id, attempt=attempt + 1)
                await asyncio.sleep(RATE_LIMIT_BACKOFF_SECONDS)
        raise LLMRateLimitError("retries exhausted")

    def _finalize(
        self,
        parsed: dict | None,
        raw_fallback: str,
        context_chunks: list[dict],
        trace_id: str,
        started_at: float,
        retrieval_stats: dict,
    ) -> dict:
        """Normalize, validate citations, and attach trace metadata."""
        response = normalize_response(parsed, fallback_answer=raw_fallback)

        validated = self.citation_validator.validate(response["citations"], context_chunks)
        # Stringify ids: this payload is persisted to JSONB and streamed as JSON,
        # neither of which can encode a raw UUID.
        for citation in validated:
            if citation.get("document_id") is not None:
                citation["document_id"] = str(citation["document_id"])
        response["citations"] = validated
        response["sources"] = self.citation_validator.build_sources(context_chunks)

        # A "supported" answer with no surviving citation is not supported.
        if response["confidence"] == "supported" and not response["citations"]:
            response["confidence"] = "partial"

        response["trace_id"] = trace_id
        response["latency_ms"] = int((time.time() - started_at) * 1000)
        response["model_used"] = self.llm.model_name()
        response["retrieval"] = retrieval_stats
        response["retrieved_chunks"] = [
            {
                "chunk_id": str(c["chunk_id"]),
                "document_id": str(c["document_id"]),
                "document_name": c["document_name"],
                "page": c.get("page"),
                "section": c.get("section"),
                "rank": rank,
                "score": round(
                    float(c.get("rerank_score", c.get("combined_score", 0)) or 0), 4
                ),
            }
            for rank, c in enumerate(context_chunks)
        ]
        return response

    def _no_answer(
        self,
        trace_id: str,
        started_at: float,
        retrieval_stats: dict,
        message: str | None = None,
    ) -> dict:
        response = self.grounding.build_no_answer_response()
        if message:
            response["answer"] = message
        response.update({
            "sources": [],
            "trace_id": trace_id,
            "latency_ms": int((time.time() - started_at) * 1000),
            "model_used": self.llm.model_name(),
            "retrieval": retrieval_stats,
            "retrieved_chunks": [],
        })
        return response

    # ----------------------------------------------------------------- #
    # Non-streaming
    # ----------------------------------------------------------------- #

    async def execute(
        self,
        db: AsyncSession,
        query: str,
        tenant_id: uuid.UUID,
        source_ids: list[uuid.UUID],
        agent_instructions: str | None = None,
        evidence_threshold: float | None = None,
        conversation_history: list[dict] | None = None,
    ) -> dict:
        """Execute the full RAG pipeline. Returns the structured response dict."""
        started_at = time.time()
        trace_id = str(uuid.uuid4())[:16]

        logger.info("rag_pipeline_start", trace_id=trace_id, query_length=len(query))

        plan = (
            await self.query_rewriter.rewrite(query, conversation_history, trace_id)
            if settings.rag_query_rewrite_enabled
            else RewrittenQuery.passthrough(query)
        )

        is_sufficient, context_chunks, stats = await self._gather_evidence(
            db, query, tenant_id, source_ids, evidence_threshold, trace_id, plan
        )

        if not is_sufficient:
            logger.info("evidence_insufficient", trace_id=trace_id)
            return self._no_answer(trace_id, started_at, stats)

        messages = self._build_messages(
            context_chunks, plan.resolved, agent_instructions, conversation_history,
            plan.answer_type, fund_name=plan.fund_name,
            needs_history=plan.needs_history,
        )

        try:
            raw_response = await self._generate_with_retry(messages, trace_id)
        except Exception as e:
            logger.error("llm_error", trace_id=trace_id, error=str(e))
            return self._no_answer(trace_id, started_at, stats, message=_error_message(e))

        parsed = parse_structured_response(raw_response)
        if parsed is None:
            logger.warning("llm_invalid_json", trace_id=trace_id)

        response = self._finalize(
            parsed, raw_response, context_chunks, trace_id, started_at, stats
        )

        logger.info(
            "rag_pipeline_complete",
            trace_id=trace_id,
            latency_ms=response["latency_ms"],
            confidence=response["confidence"],
            citation_count=len(response["citations"]),
            charts=len(response["visualizations"]),
        )
        return response

    # ----------------------------------------------------------------- #
    # Streaming
    # ----------------------------------------------------------------- #

    async def execute_stream(
        self,
        db: AsyncSession,
        query: str,
        tenant_id: uuid.UUID,
        source_ids: list[uuid.UUID],
        agent_instructions: str | None = None,
        evidence_threshold: float | None = None,
        conversation_history: list[dict] | None = None,
    ) -> AsyncIterator[dict]:
        """
        Execute the pipeline with a streamed answer.

        Yields events of type:
          stage      — pipeline progress, for the thinking indicator
          source     — a document consulted, emitted before generation starts
          token      — decoded plain text of the answer prose (never JSON)
          structured — the complete validated response contract
          error      — generation failed
        """
        trace_id = str(uuid.uuid4())[:16]
        started_at = time.time()

        yield {"type": "stage", "data": {"stage": "retrieving", "trace_id": trace_id}}

        plan = (
            await self.query_rewriter.rewrite(query, conversation_history, trace_id)
            if settings.rag_query_rewrite_enabled
            else RewrittenQuery.passthrough(query)
        )

        is_sufficient, context_chunks, stats = await self._gather_evidence(
            db, query, tenant_id, source_ids, evidence_threshold, trace_id, plan
        )

        yield {"type": "stage", "data": {"stage": "grounding", **stats}}

        if not is_sufficient:
            logger.info("evidence_insufficient", trace_id=trace_id)
            yield {"type": "token", "data": NO_ANSWER_TEXT}
            yield {
                "type": "structured",
                "data": self._no_answer(trace_id, started_at, stats),
            }
            return

        for source in self.citation_validator.build_sources(context_chunks):
            yield {"type": "source", "data": source}

        messages = self._build_messages(
            context_chunks, plan.resolved, agent_instructions, conversation_history,
            plan.answer_type, fund_name=plan.fund_name,
            needs_history=plan.needs_history,
        )

        yield {"type": "stage", "data": {"stage": "generating"}}

        streamer = AnswerFieldStreamer("answer")
        raw_parts: list[str] = []
        attempt = 0

        while True:
            try:
                async for token in self.llm.generate_stream(
                    messages=messages,
                    temperature=0.1,
                    max_tokens=settings.llm_max_output_tokens,
                    response_format=JSON_RESPONSE_FORMAT,
                ):
                    raw_parts.append(token)
                    # Only the decoded prose of the "answer" field reaches the client.
                    delta = streamer.feed(token)
                    if delta:
                        yield {"type": "token", "data": delta}
                break
            except LLMRateLimitError as e:
                # Safe to retry only while nothing has been emitted yet.
                if raw_parts or attempt >= RATE_LIMIT_RETRIES:
                    logger.error("llm_stream_rate_limited", trace_id=trace_id, error=str(e))
                    message = _error_message(e)
                    yield {"type": "error", "data": message}
                    yield {
                        "type": "structured",
                        "data": self._no_answer(trace_id, started_at, stats, message=message),
                    }
                    return
                attempt += 1
                logger.warning("llm_stream_rate_limited_retrying", trace_id=trace_id, attempt=attempt)
                yield {"type": "stage", "data": {"stage": "rate_limited", "retry_in_s": RATE_LIMIT_BACKOFF_SECONDS}}
                await asyncio.sleep(RATE_LIMIT_BACKOFF_SECONDS)
                streamer = AnswerFieldStreamer("answer")
            except Exception as e:
                logger.error("llm_stream_error", trace_id=trace_id, error=str(e))
                message = _error_message(e)
                yield {"type": "error", "data": message}
                yield {
                    "type": "structured",
                    "data": self._no_answer(trace_id, started_at, stats, message=message),
                }
                return

        raw_response = "".join(raw_parts)
        parsed = parse_structured_response(raw_response)

        if parsed is None:
            logger.warning("llm_invalid_json_stream", trace_id=trace_id)

        response = self._finalize(
            parsed, raw_response, context_chunks, trace_id, started_at, stats
        )

        # If the model never produced a usable "answer" field, the prose the
        # client already rendered is wrong; tell it to replace the whole body.
        response["replace_answer"] = not streamer.started or parsed is None

        logger.info(
            "rag_stream_complete",
            trace_id=trace_id,
            latency_ms=response["latency_ms"],
            confidence=response["confidence"],
            citation_count=len(response["citations"]),
            charts=len(response["visualizations"]),
        )

        yield {"type": "structured", "data": response}
