"""Query, QueryRetrieval, and QueryCitation models — query tracking and tracing."""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Integer, Float, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Query(Base):
    __tablename__ = "queries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True
    )
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id")
    )
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="processing")
    answer_text: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[str | None] = mapped_column(String(30))
    model_used: Mapped[str | None] = mapped_column(String(100))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    retrievals = relationship("QueryRetrieval", back_populates="query", lazy="selectin")
    citations = relationship("QueryCitation", back_populates="query", lazy="selectin")


class QueryRetrieval(Base):
    __tablename__ = "query_retrievals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    query_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queries.id", ondelete="CASCADE"), nullable=False
    )
    # SET NULL, not CASCADE: a retrieval row is analytics history — the query
    # ran, took its latency and scored what it scored, and that stays true after
    # the chunk is gone. A plain NOT NULL reference made the row immortal
    # instead, so re-indexing or deleting any document that had ever been
    # queried failed on this constraint.
    chunk_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_chunks.id", ondelete="SET NULL"),
        nullable=True,
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    retrieval_score: Mapped[float | None] = mapped_column(Float)
    rerank_score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    query = relationship("Query", back_populates="retrievals", lazy="selectin")


class QueryCitation(Base):
    __tablename__ = "query_citations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    query_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queries.id", ondelete="CASCADE"), nullable=False
    )
    # SET NULL, like the retrieval rows above: the citation is a record that an
    # answer really did cite this document, and that stays true once the
    # document is gone. A NOT NULL reference instead made every cited document
    # undeletable — deleting a knowledge source failed on this constraint, and
    # the UI reported it as the backend being unreachable.
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    page: Mapped[int | None] = mapped_column(Integer)
    section: Mapped[str | None] = mapped_column(String(500))
    snippet: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    query = relationship("Query", back_populates="citations", lazy="selectin")
