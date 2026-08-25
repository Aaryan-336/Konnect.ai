"""Knowledge source, document, document version, and document chunk models."""

import uuid
from datetime import datetime

from sqlalchemy import (
    String, DateTime, Integer, BigInteger, Text, ForeignKey, func, Index, Computed,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, TSVECTOR
from pgvector.sqlalchemy import Vector

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import get_settings
from app.database import Base

# The vector column width is fixed at import time from configuration, so the
# ORM and the database agree on a single source of truth.
_EMBEDDING_DIM = get_settings().embedding_dimensions


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    provider_type: Mapped[str] = mapped_column(String(50), default="local")
    # Provider-specific config (e.g., SharePoint site_id, drive_id, folder_id)
    provider_config: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(30), default="active")
    # SharePoint delta token (future)
    delta_token: Mapped[str | None] = mapped_column(Text)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tenant = relationship("Tenant", back_populates="knowledge_sources", lazy="selectin")
    documents = relationship("Document", back_populates="source", lazy="selectin")
    agent_links = relationship("AgentKnowledgeSource", back_populates="knowledge_source", lazy="selectin")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_sources.id"), nullable=False, index=True
    )
    # SharePoint external file ID (future)
    external_file_id: Mapped[str | None] = mapped_column(String(500))
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    path: Mapped[str] = mapped_column(String(1000), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    content_hash: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(30), default="discovered")
    error_message: Mapped[str | None] = mapped_column(Text)
    # Identifying descriptors extracted at ingest (subject, series, doc_type,
    # as_of, aliases). Drives both the chunk provenance header and the query
    # router's document filter. See ingestion/doc_metadata.py.
    doc_metadata: Mapped[dict | None] = mapped_column(JSONB)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    source = relationship("KnowledgeSource", back_populates="documents", lazy="selectin")
    versions = relationship("DocumentVersion", back_populates="document", lazy="selectin")
    chunks = relationship("DocumentChunk", back_populates="document", lazy="selectin")


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="indexed")

    document = relationship("Document", back_populates="versions", lazy="selectin")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_sources.id"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[int | None] = mapped_column(Integer)
    section: Mapped[str | None] = mapped_column(String(500))
    metadata_extra: Mapped[dict | None] = mapped_column(JSONB)
    # Width follows settings.embedding_dimensions. Changing the embedding model
    # therefore requires a migration of this column plus a full re-index; see
    # scripts/reindex.py.
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(_EMBEDDING_DIM), nullable=True
    )
    # Maintained by Postgres, not by application code: a column the ingest
    # path has to remember to populate is a column that eventually is not.
    # Backed by a GIN index (see scripts/reindex.py) — the previous query
    # computed to_tsvector() per row per search, which is a sequential scan.
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', content)", persisted=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    document = relationship("Document", back_populates="chunks", lazy="selectin")

    __table_args__ = (
        Index("ix_chunks_embedding", "embedding", postgresql_using="hnsw", postgresql_ops={"embedding": "vector_cosine_ops"}),
        Index("ix_chunks_search_vector", "search_vector", postgresql_using="gin"),
    )
