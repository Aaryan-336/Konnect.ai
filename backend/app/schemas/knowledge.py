"""Knowledge source and document schemas."""

import uuid
from datetime import datetime
from pydantic import BaseModel


class KnowledgeSourceCreate(BaseModel):
    name: str
    description: str | None = None


class KnowledgeSourceResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    provider_type: str
    status: str
    last_sync_at: datetime | None
    document_count: int = 0
    indexed_count: int = 0
    failed_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    name: str
    path: str
    mime_type: str
    size_bytes: int | None
    status: str
    chunk_count: int = 0
    error_message: str | None
    indexed_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentDetail(DocumentResponse):
    content_hash: str | None
    chunks: list[dict] = []
