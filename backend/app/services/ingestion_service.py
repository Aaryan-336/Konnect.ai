"""Ingestion service — orchestrates document parsing, chunking, and embedding."""

import uuid
import hashlib
import os
import structlog
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, func, select

from app.models.knowledge import KnowledgeSource, Document, DocumentVersion, DocumentChunk
from app.ingestion.parser import DocumentParser
from app.ingestion.parsers import get_parser_for_extension
from app.ingestion.chunker import DocumentContext, SemanticChunker
from app.ingestion.doc_metadata import extract_document_metadata
from app.ingestion.embedder import get_embedding_provider
from app.knowledge.local_provider import LocalProvider
from app.config import get_settings
from app.llm import get_llm_provider

logger = structlog.get_logger()
settings = get_settings()

MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
    ".xltx": "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
    ".xltm": "application/vnd.ms-excel.template.macroEnabled.12",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
}


class IngestionService:
    """Orchestrates document ingestion: parse → chunk → embed → store."""

    def __init__(self):
        self.chunker = SemanticChunker()
        self.embedder = get_embedding_provider()
        self.provider = LocalProvider()

    # ------------------------------------------------------------------ #
    # Embedding
    # ------------------------------------------------------------------ #

    async def _embed_chunks(self, chunks: list, filename: str) -> list[list[float]]:
        """
        Embed every chunk, or refuse the document.

        The store loop pairs chunks with vectors using zip(), which stops at
        the shorter sequence. A short or empty embedding batch therefore used
        to drop chunks on the floor and still mark the document "indexed" —
        producing a document that is invisible to semantic search in exactly
        the places it lost its vectors, with nothing downstream able to notice.
        A corpus indexed that way looks healthy and answers badly.

        Raising here routes the document to "failed" with a message, which is
        the only state that tells the truth about what happened.
        """
        texts = [c.text_to_embed() for c in chunks]
        embeddings = await self.embedder.embed_documents(texts)
        expected_dim = self.embedder.dimensions()

        if len(embeddings) != len(chunks):
            raise RuntimeError(
                f"embedder returned {len(embeddings)} vectors for {len(chunks)} chunks"
            )

        for i, vector in enumerate(embeddings):
            if not vector:
                raise RuntimeError(f"chunk {i} of {len(chunks)} embedded to an empty vector")
            if len(vector) != expected_dim:
                raise RuntimeError(
                    f"chunk {i} embedded to {len(vector)} dimensions, expected {expected_dim} "
                    f"— the index and the embedding model disagree"
                )

        logger.info("embedding_complete", filename=filename, vectors=len(embeddings))
        return embeddings

    # ------------------------------------------------------------------ #
    # Shared indexing body
    # ------------------------------------------------------------------ #

    async def _index_document(
        self,
        db: AsyncSession,
        doc: Document,
        parser: DocumentParser,
        file_path: str,
        content_hash: str,
        version_number: int = 1,
    ) -> Document:
        """Parse → chunk → embed → store, for a Document row that already exists."""
        try:
            logger.info("parsing_document", filename=doc.name, path=file_path)
            parsed = await parser.parse(file_path, doc.name)

            # Identify what this document is about, before chunking, so every
            # chunk can carry that identity into its embedding.
            sample = "\n\n".join(sec.content for sec in parsed.sections[:6])
            doc_meta = await extract_document_metadata(
                get_llm_provider(), doc.name, sample
            )
            doc.doc_metadata = doc_meta.to_dict()

            context = DocumentContext(
                document_name=doc.name,
                descriptor=doc_meta.descriptor() or None,
                attributes={"doc_type": doc_meta.doc_type, "as_of": doc_meta.as_of},
            )

            # Chunk
            chunks = self.chunker.chunk_sections(parsed.sections, context)
            logger.info("chunking_complete", filename=doc.name, chunks=len(chunks))

            if not chunks:
                doc.status = "failed"
                doc.error_message = "No content extracted"
                await db.flush()
                return doc

            cap = settings.max_chunks_per_document
            truncated = 0
            if len(chunks) > cap:
                truncated = len(chunks) - cap
                chunks = chunks[:cap]
                logger.warning(
                    "document_truncated",
                    filename=doc.name, kept=cap, dropped=truncated,
                )

            # Embed the provenance-prefixed text, not the raw passage — see
            # ingestion/chunker.py for why the two differ.
            embeddings = await self._embed_chunks(chunks, doc.name)

            # Store in database
            indexed_at = datetime.now(timezone.utc)

            version = DocumentVersion(
                document_id=doc.id,
                version=version_number,
                content_hash=content_hash,
                status="indexed",
                indexed_at=indexed_at,
            )
            db.add(version)
            await db.flush()

            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                db.add(DocumentChunk(
                    document_id=doc.id,
                    tenant_id=doc.tenant_id,
                    source_id=doc.source_id,
                    chunk_index=i,
                    content=chunk.content,
                    page=chunk.page,
                    section=chunk.section,
                    metadata_extra=chunk.metadata,
                    embedding=embedding,
                ))

            doc.status = "indexed"
            # Not an error, but the operator needs to see it: the tail of
            # this document is not in the index and cannot be retrieved.
            doc.error_message = (
                f"Indexed first {len(chunks)} chunks; {truncated} dropped "
                f"(document exceeds the {settings.max_chunks_per_document}-chunk limit)"
                if truncated else None
            )
            doc.indexed_at = indexed_at
            await db.flush()

            logger.info("ingestion_complete", filename=doc.name, chunks=len(chunks))
            return doc

        except Exception as e:
            logger.error("ingestion_error", filename=doc.name, error=str(e))
            doc.status = "failed"
            doc.error_message = str(e)[:500]
            try:
                await db.flush()
            except Exception:
                pass
            return doc

    # ------------------------------------------------------------------ #
    # Entry points
    # ------------------------------------------------------------------ #

    async def ingest_file(
        self,
        db: AsyncSession,
        tenant_id: uuid.UUID,
        source_id: uuid.UUID,
        filename: str,
        content: bytes,
    ) -> Document:
        """Store an uploaded file, then parse, chunk, embed and index it."""
        ext = Path(filename).suffix.lower()
        mime_type = MIME_TYPES.get(ext, "application/octet-stream")

        parser = get_parser_for_extension(ext)
        if parser is None:
            doc = Document(
                tenant_id=tenant_id,
                source_id=source_id,
                name=filename,
                path="",
                mime_type=mime_type,
                size_bytes=len(content),
                status="unsupported",
                error_message=f"Unsupported file type: {ext}",
            )
            db.add(doc)
            await db.flush()
            return doc

        content_hash = hashlib.sha256(content).hexdigest()
        file_info = await self.provider.upload_file(tenant_id, source_id, filename, content)

        # Re-uploading a file replaces it rather than adding a second copy.
        # Without this every upload inserted a new row, so the same deck could
        # sit in the index several times over — identical chunks then compete
        # for the same fusion ranks and duplicate slots in the prompt, cutting
        # the effective context width for no gain.
        existing = (
            await db.execute(
                select(Document).where(
                    Document.source_id == source_id,
                    Document.tenant_id == tenant_id,
                    Document.name == filename,
                    Document.status != "deleted",
                )
            )
        ).scalars().first()

        if existing is not None:
            logger.info(
                "document_replaced",
                filename=filename,
                document_id=str(existing.id),
                unchanged=existing.content_hash == content_hash,
            )
            existing.path = file_info["path"]
            existing.mime_type = mime_type
            existing.size_bytes = file_info["size_bytes"]
            existing.content_hash = content_hash
            return await self.reindex_document(db, existing)

        doc = Document(
            tenant_id=tenant_id,
            source_id=source_id,
            name=filename,
            path=file_info["path"],
            mime_type=mime_type,
            size_bytes=file_info["size_bytes"],
            content_hash=content_hash,
            status="processing",
        )
        db.add(doc)
        await db.flush()

        return await self._index_document(
            db, doc, parser, file_info["path"], content_hash, version_number=1
        )

    async def reindex_document(self, db: AsyncSession, doc: Document) -> Document:
        """
        Re-run parse → chunk → embed for a document whose file is already stored.

        In place, keeping the document id, so agent and knowledge-source
        associations survive. Needed whenever the ingestion pipeline itself
        changes: the stored chunks are a product of the code that ran at upload
        time, and nothing about them is refreshed by a newer chunker, parser or
        embedding model until they are rebuilt.
        """
        path = doc.path or ""
        if not path or not os.path.exists(path):
            doc.status = "failed"
            doc.error_message = f"Source file missing: {path or '(no path recorded)'}"
            await db.flush()
            return doc

        ext = Path(doc.name).suffix.lower()
        parser = get_parser_for_extension(ext)
        if parser is None:
            doc.status = "unsupported"
            doc.error_message = f"Unsupported file type: {ext}"
            await db.flush()
            return doc

        content_hash = doc.content_hash
        if not content_hash:
            with open(path, "rb") as fh:
                content_hash = hashlib.sha256(fh.read()).hexdigest()
            doc.content_hash = content_hash

        # The old chunks describe a pipeline that no longer exists; keeping any
        # of them would leave the index half in one generation and half in another.
        await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))

        next_version = (
            await db.execute(
                select(func.coalesce(func.max(DocumentVersion.version), 0) + 1)
                .where(DocumentVersion.document_id == doc.id)
            )
        ).scalar_one()

        doc.status = "processing"
        doc.error_message = None
        await db.flush()

        return await self._index_document(
            db, doc, parser, path, content_hash, version_number=int(next_version)
        )
