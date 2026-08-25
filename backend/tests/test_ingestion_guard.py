"""
Tests for the embedding completeness guard in IngestionService.

The bug these cover: chunks and vectors are paired with zip(), which stops at
the shorter sequence. A short embedding batch silently dropped chunks and the
document was still marked "indexed" — a corpus that looks healthy in the UI
while most of it is unreachable by semantic search.
"""

import pytest

from app.ingestion.chunker import Chunk
from app.services.ingestion_service import IngestionService


class StubEmbedder:
    """Returns whatever the test tells it to, so failures are reproducible."""

    def __init__(self, vectors, dims=768):
        self._vectors = vectors
        self._dims = dims

    async def embed_documents(self, texts):
        return self._vectors

    def dimensions(self):
        return self._dims


def _service(embedder):
    service = IngestionService.__new__(IngestionService)
    service.embedder = embedder
    return service


def _chunks(n):
    return [Chunk(content=f"chunk {i}", chunk_index=i) for i in range(n)]


@pytest.mark.asyncio
async def test_embed_chunks_accepts_a_complete_batch():
    service = _service(StubEmbedder([[0.1] * 768, [0.2] * 768]))
    vectors = await service._embed_chunks(_chunks(2), "ok.pdf")
    assert len(vectors) == 2


@pytest.mark.asyncio
async def test_short_batch_is_rejected_rather_than_truncated():
    # 38 vectors for 72 chunks is the exact shape of the observed failure.
    service = _service(StubEmbedder([[0.1] * 768] * 38))
    with pytest.raises(RuntimeError, match="38 vectors for 72 chunks"):
        await service._embed_chunks(_chunks(72), "partial.pdf")


@pytest.mark.asyncio
async def test_empty_batch_is_rejected():
    service = _service(StubEmbedder([]))
    with pytest.raises(RuntimeError, match="0 vectors for 3 chunks"):
        await service._embed_chunks(_chunks(3), "none.pdf")


@pytest.mark.asyncio
async def test_wrong_dimensionality_is_rejected():
    # A model swap that does not match the vector column would otherwise fail
    # deep inside the insert, or silently write an unsearchable row.
    service = _service(StubEmbedder([[0.1] * 384, [0.2] * 384]))
    with pytest.raises(RuntimeError, match="expected 768"):
        await service._embed_chunks(_chunks(2), "wrong-dims.pdf")


@pytest.mark.asyncio
async def test_empty_vector_in_an_otherwise_full_batch_is_rejected():
    service = _service(StubEmbedder([[0.1] * 768, [], [0.3] * 768]))
    with pytest.raises(RuntimeError, match="chunk 1 of 3"):
        await service._embed_chunks(_chunks(3), "hole.pdf")
