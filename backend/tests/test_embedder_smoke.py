"""
Smoke tests that actually execute the embedding code paths.

These exist because a NameError inside _run — a module-level constant deleted
while its reference survived — made every query embedding raise at runtime.
Nothing caught it: the module imported fine, and no test called the functions.
Retrieval silently returned no candidates, so every answer became "no evidence"
rather than an error anyone could see.
"""

import pytest

from app.ingestion.embedder import EMBED_BATCH_SIZE, get_embedding_provider


def test_batch_size_is_defined_and_sane():
    assert isinstance(EMBED_BATCH_SIZE, int)
    assert 1 <= EMBED_BATCH_SIZE <= 256


@pytest.mark.asyncio
async def test_embed_queries_returns_correctly_shaped_vectors():
    provider = get_embedding_provider()
    vectors = await provider.embed_queries(["who is the fund manager of PCF B"])
    assert len(vectors) == 1
    assert len(vectors[0]) == provider.dimensions()
    assert any(v != 0.0 for v in vectors[0])


@pytest.mark.asyncio
async def test_embed_documents_spans_more_than_one_mini_batch():
    # Larger than EMBED_BATCH_SIZE so the outer loop runs more than once —
    # the path where a per-batch bug would otherwise hide.
    provider = get_embedding_provider()
    texts = [f"Fund performance figure number {i}." for i in range(EMBED_BATCH_SIZE * 2 + 3)]
    vectors = await provider.embed_documents(texts)
    assert len(vectors) == len(texts)
    assert all(len(v) == provider.dimensions() for v in vectors)


@pytest.mark.asyncio
async def test_empty_input_short_circuits():
    provider = get_embedding_provider()
    assert await provider.embed_queries([]) == []
    assert await provider.embed_documents([]) == []
