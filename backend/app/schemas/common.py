"""Common Pydantic schemas used across the application."""

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class RoleName(str, Enum):
    USER = "USER"
    AGENT_MANAGER = "AGENT_MANAGER"
    KNOWLEDGE_ADMIN = "KNOWLEDGE_ADMIN"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


# Role hierarchy: higher index = more privilege
ROLE_HIERARCHY = {
    RoleName.USER: 0,
    RoleName.AGENT_MANAGER: 1,
    RoleName.KNOWLEDGE_ADMIN: 2,
    RoleName.ADMIN: 3,
    RoleName.SUPER_ADMIN: 4,
}


class AgentStatus(str, Enum):
    DRAFT = "draft"
    TESTING = "testing"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class DocumentStatus(str, Enum):
    DISCOVERED = "discovered"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    INDEXED = "indexed"
    UPDATED = "updated"
    FAILED = "failed"
    DELETED = "deleted"
    UNSUPPORTED = "unsupported"


class SourceStatus(str, Enum):
    ACTIVE = "active"
    SYNCING = "syncing"
    HEALTHY = "healthy"
    PARTIAL_FAILURE = "partial_failure"
    FAILED = "failed"
    PAUSED = "paused"
    DISCONNECTED = "disconnected"


class APIResponse(BaseModel):
    """Standard API response wrapper."""
    success: bool = True
    message: str | None = None
    data: dict | list | None = None


class PaginatedResponse(BaseModel):
    """Paginated response."""
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int
