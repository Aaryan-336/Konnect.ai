"""Chat service — manages conversations, messages, and RAG orchestration."""

import json
import uuid
import structlog
from typing import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation, Message
from app.models.agent import Agent, AgentVersion, AgentKnowledgeSource
from app.models.knowledge import KnowledgeSource
from app.models.query import Query, QueryRetrieval, QueryCitation
from app.rag.pipeline import RAGPipeline
from app.rag.grounding import NO_ANSWER_TEXT

logger = structlog.get_logger()

# Fields stripped from the client payload — internal tracing only.
INTERNAL_FIELDS = ("retrieved_chunks",)

CONVERSATION_TITLE_MAX = 80


class ChatService:
    """Manages chat conversations and RAG execution."""

    def __init__(self):
        self.rag = RAGPipeline()

    # ----------------------------------------------------------------- #
    # Non-streaming
    # ----------------------------------------------------------------- #

    async def chat(
        self,
        db: AsyncSession,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        agent_id: uuid.UUID,
        message: str,
        conversation_id: uuid.UUID | None = None,
    ) -> dict:
        """Execute a chat query (non-streaming)."""
        agent, source_ids, instructions, threshold = await self._resolve_agent(
            db, tenant_id, agent_id
        )

        conversation = await self._get_or_create_conversation(
            db, tenant_id, user_id, agent_id, conversation_id, message
        )

        history = await self._get_conversation_history(db, conversation.id)

        db.add(Message(conversation_id=conversation.id, role="user", content=message))
        await db.flush()

        result = await self.rag.execute(
            db=db,
            query=message,
            tenant_id=tenant_id,
            source_ids=source_ids,
            agent_instructions=instructions,
            evidence_threshold=threshold,
            conversation_history=history,
        )

        assistant_msg = await self._save_assistant_message(db, conversation.id, result)
        await self._log_query(
            db, tenant_id, user_id, agent_id, conversation.id, message, result
        )

        return {
            "conversation_id": conversation.id,
            "message_id": assistant_msg.id,
            "response": self._client_payload(result),
        }

    # ----------------------------------------------------------------- #
    # Streaming
    # ----------------------------------------------------------------- #

    async def chat_stream(
        self,
        db: AsyncSession,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        agent_id: uuid.UUID,
        message: str,
        conversation_id: uuid.UUID | None = None,
    ) -> AsyncIterator[dict]:
        """
        Execute a streaming chat query.

        Persists the assistant message and the query trace once the structured
        response arrives, so the streaming path feeds analytics exactly like the
        non-streaming one.
        """
        agent, source_ids, instructions, threshold = await self._resolve_agent(
            db, tenant_id, agent_id
        )

        conversation = await self._get_or_create_conversation(
            db, tenant_id, user_id, agent_id, conversation_id, message
        )

        history = await self._get_conversation_history(db, conversation.id)

        db.add(Message(conversation_id=conversation.id, role="user", content=message))
        await db.flush()

        yield {
            "type": "meta",
            "data": {
                "conversation_id": str(conversation.id),
                "agent_id": str(agent_id),
                "agent_name": agent.name,
            },
        }

        streamed_text: list[str] = []
        result: dict | None = None

        async for chunk in self.rag.execute_stream(
            db=db,
            query=message,
            tenant_id=tenant_id,
            source_ids=source_ids,
            agent_instructions=instructions,
            evidence_threshold=threshold,
            conversation_history=history,
        ):
            if chunk["type"] == "token":
                streamed_text.append(chunk["data"])
            elif chunk["type"] == "structured":
                result = chunk["data"]
                # Strip internal tracing before the payload leaves the server.
                yield {"type": "structured", "data": self._client_payload(result)}
                continue
            yield chunk

        if result is None:
            # Generation failed before a structured payload was produced.
            result = {
                "answer": "".join(streamed_text) or NO_ANSWER_TEXT,
                "confidence": "insufficient",
                "citations": [],
                "retrieved_chunks": [],
            }

        assistant_msg = await self._save_assistant_message(db, conversation.id, result)
        await self._log_query(
            db, tenant_id, user_id, agent_id, conversation.id, message, result
        )

        yield {
            "type": "done",
            "data": {
                "message_id": str(assistant_msg.id),
                "conversation_id": str(conversation.id),
                "trace_id": result.get("trace_id"),
                "latency_ms": result.get("latency_ms"),
                "model_used": result.get("model_used"),
                "confidence": result.get("confidence"),
            },
        }

    # ----------------------------------------------------------------- #
    # Conversation reads
    # ----------------------------------------------------------------- #

    async def get_conversations(
        self, db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID
    ) -> list[Conversation]:
        """Get the user's conversations, most recently updated first."""
        result = await db.execute(
            select(Conversation)
            .where(Conversation.tenant_id == tenant_id, Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_conversation_messages(
        self, db: AsyncSession, conversation_id: uuid.UUID,
        tenant_id: uuid.UUID, user_id: uuid.UUID
    ) -> list[Message]:
        """Get messages in a conversation (with ownership check)."""
        conv = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.tenant_id == tenant_id,
                Conversation.user_id == user_id,
            )
        )
        if conv.scalar_one_or_none() is None:
            return []

        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
        return list(result.scalars().all())

    # ----------------------------------------------------------------- #
    # Internals
    # ----------------------------------------------------------------- #

    @staticmethod
    def _client_payload(result: dict) -> dict:
        """
        Strip server-only tracing fields and guarantee the payload is JSON-safe.

        The same dict is both streamed as SSE and written to a JSONB column;
        a stray UUID or datetime in either path aborts the whole turn.
        """
        trimmed = {k: v for k, v in result.items() if k not in INTERNAL_FIELDS}
        return json.loads(json.dumps(trimmed, default=str))

    async def _save_assistant_message(
        self, db: AsyncSession, conversation_id: uuid.UUID, result: dict
    ) -> Message:
        """
        Persist the assistant turn including its structured blocks, so reopening
        a conversation re-renders the charts, tables, and citations.
        """
        payload = self._client_payload(result)
        assistant_msg = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=result.get("answer", ""),
            response_metadata=payload,
        )
        db.add(assistant_msg)
        await db.flush()
        return assistant_msg

    async def _resolve_agent(
        self, db: AsyncSession, tenant_id: uuid.UUID, agent_id: uuid.UUID
    ) -> tuple[Agent, list[uuid.UUID], str | None, float | None]:
        """Resolve the agent, its knowledge sources, instructions, and threshold."""
        result = await db.execute(
            select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise ValueError("Agent not found")
        if agent.status not in ("published", "testing"):
            raise ValueError("Agent is not available")

        # Joined to the source rather than reading the link table alone: a
        # disconnected source is hidden everywhere in the UI, but its documents
        # stayed searchable here, so an agent could answer from a source the
        # operator believes is switched off.
        ks_result = await db.execute(
            select(AgentKnowledgeSource.knowledge_source_id)
            .join(
                KnowledgeSource,
                KnowledgeSource.id == AgentKnowledgeSource.knowledge_source_id,
            )
            .where(
                AgentKnowledgeSource.agent_id == agent_id,
                KnowledgeSource.tenant_id == tenant_id,
                KnowledgeSource.status != "disconnected",
            )
        )
        source_ids = [r[0] for r in ks_result.all()]
        if not source_ids:
            raise ValueError(
                "This agent has no active knowledge sources assigned. "
                "Attach one under the agent's Knowledge settings."
            )

        instructions: str | None = None
        threshold: float | None = None

        version = await self._resolve_version(db, agent)
        if version:
            instructions = version.instructions
            model_config = version.model_config_json or {}
            raw_threshold = model_config.get("evidence_threshold")
            if isinstance(raw_threshold, (int, float)):
                threshold = float(raw_threshold)

        return agent, source_ids, instructions, threshold

    @staticmethod
    async def _resolve_version(db: AsyncSession, agent: Agent) -> AgentVersion | None:
        """
        Get the agent's active version.

        Falls back to the highest version number when `current_version_id` was
        never set, so an agent created outside the normal flow still applies its
        instructions instead of silently running unconfigured.
        """
        if agent.current_version_id:
            result = await db.execute(
                select(AgentVersion).where(AgentVersion.id == agent.current_version_id)
            )
            version = result.scalar_one_or_none()
            if version:
                return version

        result = await db.execute(
            select(AgentVersion)
            .where(AgentVersion.agent_id == agent.id)
            .order_by(AgentVersion.version.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_or_create_conversation(
        self, db: AsyncSession, tenant_id: uuid.UUID,
        user_id: uuid.UUID, agent_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
        first_message: str,
    ) -> Conversation:
        """Get an existing conversation or create one titled from the first message."""
        if conversation_id:
            result = await db.execute(
                select(Conversation).where(
                    Conversation.id == conversation_id,
                    Conversation.tenant_id == tenant_id,
                    Conversation.user_id == user_id,
                )
            )
            conv = result.scalar_one_or_none()
            if conv:
                return conv

        title = first_message.strip().replace("\n", " ")
        if len(title) > CONVERSATION_TITLE_MAX:
            title = title[:CONVERSATION_TITLE_MAX - 1].rstrip() + "…"

        conv = Conversation(
            tenant_id=tenant_id,
            user_id=user_id,
            agent_id=agent_id,
            title=title or None,
        )
        db.add(conv)
        await db.flush()
        return conv

    async def _get_conversation_history(
        self, db: AsyncSession, conversation_id: uuid.UUID
    ) -> list[dict]:
        """Get the last few turns for reference resolution."""
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(10)
        )
        messages = list(result.scalars().all())
        messages.reverse()
        return [{"role": m.role, "content": m.content} for m in messages]

    async def _log_query(
        self, db: AsyncSession, tenant_id: uuid.UUID,
        user_id: uuid.UUID, agent_id: uuid.UUID,
        conversation_id: uuid.UUID, query_text: str, result: dict
    ):
        """Log the query trace for analytics and observability."""
        query = Query(
            tenant_id=tenant_id,
            user_id=user_id,
            agent_id=agent_id,
            conversation_id=conversation_id,
            query_text=query_text,
            trace_id=result.get("trace_id") or "",
            latency_ms=result.get("latency_ms"),
            status="completed",
            answer_text=(result.get("answer") or "")[:2000],
            confidence=result.get("confidence"),
            model_used=result.get("model_used"),
        )
        db.add(query)
        await db.flush()

        for chunk_info in result.get("retrieved_chunks", []):
            db.add(QueryRetrieval(
                query_id=query.id,
                chunk_id=uuid.UUID(chunk_info["chunk_id"]),
                rank=chunk_info.get("rank", 0),
                retrieval_score=chunk_info.get("score"),
                rerank_score=chunk_info.get("score"),
            ))

        for citation in result.get("citations", []):
            document_id = citation.get("document_id")
            if not document_id:
                continue
            db.add(QueryCitation(
                query_id=query.id,
                document_id=document_id,
                page=citation.get("page"),
                section=citation.get("section"),
                snippet=(citation.get("snippet") or "")[:500],
            ))

        await db.flush()
        logger.info(
            "query_logged",
            trace_id=query.trace_id,
            confidence=query.confidence,
            latency_ms=query.latency_ms,
        )
