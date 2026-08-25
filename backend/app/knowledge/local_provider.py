"""
Local file-based knowledge source provider.

Stores uploaded files on local disk under uploads/{tenant_id}/{source_id}/.
"""

import os
import uuid
import hashlib
import aiofiles
from pathlib import Path

from app.knowledge.provider import KnowledgeSourceProvider
from app.config import get_settings

settings = get_settings()


class LocalProvider(KnowledgeSourceProvider):
    """Local filesystem storage for uploaded documents."""

    def _get_base_path(self, tenant_id: uuid.UUID, source_id: uuid.UUID) -> Path:
        return Path(settings.upload_dir) / str(tenant_id) / str(source_id)

    async def upload_file(
        self, tenant_id: uuid.UUID, source_id: uuid.UUID,
        filename: str, content: bytes
    ) -> dict:
        base_path = self._get_base_path(tenant_id, source_id)
        base_path.mkdir(parents=True, exist_ok=True)

        file_path = base_path / filename
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)

        content_hash = hashlib.sha256(content).hexdigest()

        return {
            "path": str(file_path),
            "size_bytes": len(content),
            "content_hash": content_hash,
        }

    async def get_file(
        self, tenant_id: uuid.UUID, source_id: uuid.UUID, file_path: str
    ) -> bytes:
        async with aiofiles.open(file_path, "rb") as f:
            return await f.read()

    async def delete_file(
        self, tenant_id: uuid.UUID, source_id: uuid.UUID, file_path: str
    ) -> bool:
        try:
            os.remove(file_path)
            return True
        except FileNotFoundError:
            return False

    async def list_files(
        self, tenant_id: uuid.UUID, source_id: uuid.UUID
    ) -> list[dict]:
        base_path = self._get_base_path(tenant_id, source_id)
        if not base_path.exists():
            return []

        files = []
        for f in base_path.iterdir():
            if f.is_file():
                stat = f.stat()
                files.append({
                    "name": f.name,
                    "path": str(f),
                    "size_bytes": stat.st_size,
                })
        return files
