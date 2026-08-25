"""
Abstract knowledge source provider interface.

Concrete implementations:
- LocalProvider (file upload to disk) ← MVP
- SharePointProvider (Microsoft Graph) ← Future
"""

from abc import ABC, abstractmethod
import uuid
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession


class KnowledgeSourceProvider(ABC):
    """Base class for knowledge source providers."""

    @abstractmethod
    async def upload_file(
        self, tenant_id: uuid.UUID, source_id: uuid.UUID,
        filename: str, content: bytes
    ) -> dict:
        """Store a file. Returns file metadata."""
        ...

    @abstractmethod
    async def get_file(
        self, tenant_id: uuid.UUID, source_id: uuid.UUID, file_path: str
    ) -> bytes:
        """Retrieve file content."""
        ...

    @abstractmethod
    async def delete_file(
        self, tenant_id: uuid.UUID, source_id: uuid.UUID, file_path: str
    ) -> bool:
        """Delete a file. Returns success."""
        ...

    @abstractmethod
    async def list_files(
        self, tenant_id: uuid.UUID, source_id: uuid.UUID
    ) -> list[dict]:
        """List files in a source."""
        ...
