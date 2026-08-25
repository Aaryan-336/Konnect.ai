"""
Migrate the chunk schema and rebuild the index.

Run after changing the embedding model, the chunker, or a parser:

    ./.venv/bin/python scripts/reindex.py

What it does, in order:

1. Migrates the schema — the vector column to the configured width, a
   descriptor column on documents, and search_vector to a generated column
   with a GIN index.
2. Deletes every chunk. Embeddings from a different model are not comparable
   with new ones, so they cannot be kept.
3. Re-parses each indexed document from its stored file and rebuilds its
   chunks, descriptors and embeddings.

Source files are never touched. Only derived data is rebuilt.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import async_session_factory  # noqa: E402
from app.ingestion.chunker import DocumentContext, SemanticChunker  # noqa: E402
from app.ingestion.doc_metadata import extract_document_metadata  # noqa: E402
from app.ingestion.embedder import get_embedding_provider  # noqa: E402
from app.ingestion.parsers import get_parser_for_extension  # noqa: E402
from app.llm import get_llm_provider  # noqa: E402

settings = get_settings()


async def migrate(db) -> None:
    dim = settings.embedding_dimensions
    print(f"  vector column -> vector({dim})")

    await db.execute(text("DROP INDEX IF EXISTS ix_chunks_embedding"))
    await db.execute(text("DROP INDEX IF EXISTS ix_chunks_search_vector"))

    # The old vectors cannot be cast to a new width, and are being discarded
    # anyway, so the column is dropped and recreated rather than altered.
    await db.execute(text("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding"))
    await db.execute(text(f"ALTER TABLE document_chunks ADD COLUMN embedding vector({dim})"))

    await db.execute(text(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_metadata JSONB"
    ))

    print("  search_vector -> generated column + GIN index")
    await db.execute(text("ALTER TABLE document_chunks DROP COLUMN IF EXISTS search_vector"))
    await db.execute(text(
        "ALTER TABLE document_chunks ADD COLUMN search_vector tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', content)) STORED"
    ))
    await db.execute(text(
        "CREATE INDEX ix_chunks_search_vector ON document_chunks USING GIN (search_vector)"
    ))


async def rebuild_indexes(db) -> None:
    """HNSW is built last: on an empty table it would be built twice."""
    print("  building HNSW index")
    await db.execute(text(
        "CREATE INDEX ix_chunks_embedding ON document_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    ))


async def reindex_document(db, doc, chunker, embedder, llm) -> int:
    path = Path(doc.path)
    if not path.exists():
        print(f"    !! missing file, skipped: {doc.path}")
        return 0

    parser = get_parser_for_extension(path.suffix.lower())
    if parser is None:
        print(f"    !! no parser for {path.suffix}, skipped")
        return 0

    parsed = await parser.parse(str(path), doc.name)
    if not parsed.sections:
        print("    !! no content extracted")
        return 0

    sample = "\n\n".join(sec.content for sec in parsed.sections[:6])
    meta = await extract_document_metadata(llm, doc.name, sample)

    context = DocumentContext(
        document_name=doc.name,
        descriptor=meta.descriptor() or None,
        attributes={"doc_type": meta.doc_type, "as_of": meta.as_of},
    )
    chunks = chunker.chunk_sections(parsed.sections, context)
    if not chunks:
        return 0

    vectors = await embedder.embed_documents([c.text_to_embed() for c in chunks])

    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        await db.execute(
            text("""
                INSERT INTO document_chunks
                    (id, document_id, tenant_id, source_id, chunk_index,
                     content, page, section, metadata_extra, embedding)
                VALUES
                    (gen_random_uuid(), :document_id, :tenant_id, :source_id, :chunk_index,
                     :content, :page, :section, CAST(:metadata AS jsonb), CAST(:embedding AS vector))
            """),
            {
                "document_id": str(doc.id),
                "tenant_id": str(doc.tenant_id),
                "source_id": str(doc.source_id),
                "chunk_index": i,
                "content": chunk.content,
                "page": chunk.page,
                "section": chunk.section,
                "metadata": __import__("json").dumps(chunk.metadata or {}),
                "embedding": str(vector),
            },
        )

    await db.execute(
        text("UPDATE documents SET doc_metadata = CAST(:m AS jsonb) WHERE id = :id"),
        {"m": __import__("json").dumps(meta.to_dict()), "id": str(doc.id)},
    )

    label = meta.descriptor() or "(no descriptor)"
    print(f"    {len(chunks):4} chunks · {label}")
    return len(chunks)


async def main() -> None:
    print(f"Embedding model : {settings.embedding_model} ({settings.embedding_dimensions}d)")

    chunker = SemanticChunker()
    embedder = get_embedding_provider()
    llm = get_llm_provider()

    async with async_session_factory() as db:
        print("\nMigrating schema…")
        await migrate(db)
        await db.commit()

        docs = (await db.execute(text(
            "SELECT id, tenant_id, source_id, name, path FROM documents "
            "WHERE status = 'indexed' ORDER BY name"
        ))).fetchall()
        print(f"\nRe-indexing {len(docs)} documents…")

        total = 0
        for doc in docs:
            print(f"  {doc.name}")
            try:
                total += await reindex_document(db, doc, chunker, embedder, llm)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                print(f"    !! failed: {str(exc)[:180]}")

        await rebuild_indexes(db)
        await db.commit()
        print(f"\nDone — {total} chunks across {len(docs)} documents.")


if __name__ == "__main__":
    asyncio.run(main())
