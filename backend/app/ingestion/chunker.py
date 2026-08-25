"""
Semantic chunker — splits parsed document sections into retrieval-sized chunks
while preserving semantic boundaries.

Per rag_specifications.md: prefer section → paragraph → chunk.
Avoids blindly splitting every document into fixed token lengths.

Two texts come out of every chunk and they are not the same:

  content     the raw passage, and the only thing the model is ever shown.
  embed_text  the passage prefixed with where it came from — document, fund,
              section, page — and the only thing that is embedded.

They are separate because a line like "AUM: 500cr" is identical in every fund's
deck. Embedded bare, it is equally close to a question about any of them, which
is what makes retrieval pull from the wrong PDF. Embedded with its provenance
attached, it is anchored to one document. Putting that header in `content` too
would repeat it in the prompt for every chunk and waste scarce context tokens.
"""

from dataclasses import dataclass, field

from app.ingestion.parser import ParsedSection


@dataclass
class DocumentContext:
    """What a chunk should say about itself when it is embedded."""

    document_name: str
    #: Human label for the subject — a fund or product name, when known.
    descriptor: str | None = None
    #: Extra provenance, e.g. document type or as-of date.
    attributes: dict[str, str] = field(default_factory=dict)

    def header_for(self, section: str | None, page: int | None) -> str:
        parts: list[str] = []
        if self.descriptor:
            parts.append(self.descriptor)
        parts.append(self.document_name)
        for value in self.attributes.values():
            if value:
                parts.append(str(value))
        if section:
            parts.append(str(section))
        if page is not None:
            parts.append(f"p.{page}")
        return " · ".join(parts)


@dataclass
class Chunk:
    """A retrieval-sized chunk of content."""
    content: str
    page: int | None = None
    section: str | None = None
    chunk_index: int = 0
    metadata: dict | None = None
    #: Provenance-prefixed text used for embedding. Falls back to `content`.
    embed_text: str | None = None

    def text_to_embed(self) -> str:
        return self.embed_text or self.content


class SemanticChunker:
    """
    Splits document sections into chunks that respect semantic boundaries.

    Strategy:
    1. If a section is within max_chunk_size, keep it as one chunk.
    2. Otherwise, split by paragraphs (double newlines).
    3. If a paragraph is still too large, split by sentences.
    4. Merge small consecutive chunks up to min_chunk_size.

    `max_chunk_size` is deliberately aligned with `rag_max_context_chars`: the
    prompt builder truncates each chunk to that width, so anything longer is
    written to the index but never actually shown to the model.
    """

    def __init__(
        self,
        max_chunk_size: int = 1200,
        min_chunk_size: int = 200,
        overlap: int = 120,
    ):
        self.max_chunk_size = max_chunk_size
        self.min_chunk_size = min_chunk_size
        self.overlap = overlap

    def chunk_sections(
        self,
        sections: list[ParsedSection],
        context: DocumentContext | None = None,
    ) -> list[Chunk]:
        """Chunk a list of parsed sections into retrieval-sized chunks."""
        all_chunks: list[Chunk] = []
        chunk_index = 0

        for section in sections:
            content = section.content.strip()
            if not content:
                continue

            if len(content) <= self.max_chunk_size:
                all_chunks.append(Chunk(
                    content=content,
                    page=section.page,
                    section=section.section,
                    chunk_index=chunk_index,
                    metadata=section.metadata,
                ))
                chunk_index += 1
            else:
                # Split by paragraphs first
                paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
                buffer: list[str] = []
                buffer_len = 0

                def flush(buf: list[str]) -> str:
                    return "\n\n".join(buf)

                for para in paragraphs:
                    if buffer_len + len(para) > self.max_chunk_size and buffer:
                        text = flush(buffer)
                        all_chunks.append(Chunk(
                            content=text,
                            page=section.page,
                            section=section.section,
                            chunk_index=chunk_index,
                            metadata=section.metadata,
                        ))
                        chunk_index += 1

                        # Carry a fixed tail of the emitted text into the next
                        # chunk. Taking the last *paragraph* instead, as this
                        # once did, duplicated a whole paragraph whenever that
                        # paragraph happened to be short.
                        tail = text[-self.overlap:] if self.overlap else ""
                        buffer = [tail] if tail else []
                        buffer_len = len(tail)

                    if len(para) > self.max_chunk_size:
                        # Paragraph too large — split by sentences
                        if buffer:
                            all_chunks.append(Chunk(
                                content=flush(buffer),
                                page=section.page,
                                section=section.section,
                                chunk_index=chunk_index,
                                metadata=section.metadata,
                            ))
                            chunk_index += 1
                            buffer = []
                            buffer_len = 0

                        for sc in self._split_by_sentences(para):
                            all_chunks.append(Chunk(
                                content=sc,
                                page=section.page,
                                section=section.section,
                                chunk_index=chunk_index,
                                metadata=section.metadata,
                            ))
                            chunk_index += 1
                    else:
                        # Checked before appending, not after: the previous
                        # order let the final paragraph push a chunk past
                        # max_chunk_size, and anything over that ceiling is
                        # silently truncated when the prompt is built.
                        if buffer and buffer_len + len(para) > self.max_chunk_size:
                            all_chunks.append(Chunk(
                                content=flush(buffer),
                                page=section.page,
                                section=section.section,
                                chunk_index=chunk_index,
                                metadata=section.metadata,
                            ))
                            chunk_index += 1
                            tail = flush(buffer)[-self.overlap:] if self.overlap else ""
                            buffer = [tail] if tail else []
                            buffer_len = len(tail)
                        buffer.append(para)
                        buffer_len += len(para)

                if buffer:
                    all_chunks.append(Chunk(
                        content=flush(buffer),
                        page=section.page,
                        section=section.section,
                        chunk_index=chunk_index,
                        metadata=section.metadata,
                    ))
                    chunk_index += 1

        merged = self._enforce_ceiling(self._merge_small_chunks(all_chunks))
        if context is not None:
            self._apply_context(merged, context)
        return merged

    def _enforce_ceiling(self, chunks: list[Chunk]) -> list[Chunk]:
        """
        Guarantee no chunk exceeds max_chunk_size.

        A final backstop rather than a fix in each split path: PDF pages of
        tables and bullet lists often contain no sentence terminator at all, so
        the sentence splitter has nothing to split on and emits the whole block.
        Oversized chunks are silently truncated when the prompt is built, so the
        tail would be indexed but never readable.
        """
        out: list[Chunk] = []
        for chunk in chunks:
            if len(chunk.content) <= self.max_chunk_size:
                out.append(chunk)
                continue

            words = chunk.content.split(" ")
            piece: list[str] = []
            length = 0
            for word in words:
                if piece and length + len(word) + 1 > self.max_chunk_size:
                    out.append(Chunk(
                        content=" ".join(piece),
                        page=chunk.page,
                        section=chunk.section,
                        metadata=chunk.metadata,
                    ))
                    piece, length = [], 0
                piece.append(word)
                length += len(word) + 1
            if piece:
                out.append(Chunk(
                    content=" ".join(piece),
                    page=chunk.page,
                    section=chunk.section,
                    metadata=chunk.metadata,
                ))

        for i, chunk in enumerate(out):
            chunk.chunk_index = i
        return out

    @staticmethod
    def _apply_context(chunks: list[Chunk], context: DocumentContext) -> None:
        """Attach provenance to the text that will be embedded."""
        for chunk in chunks:
            header = context.header_for(chunk.section, chunk.page)
            chunk.embed_text = f"{header}\n{chunk.content}" if header else chunk.content

    def _split_by_sentences(self, text: str) -> list[str]:
        """Split text into sentence-based chunks."""
        import re
        sentences = re.split(r'(?<=[.!?])\s+', text)
        chunks = []
        current = []
        current_len = 0

        for sentence in sentences:
            if current_len + len(sentence) > self.max_chunk_size and current:
                chunks.append(" ".join(current))
                current = []
                current_len = 0
            current.append(sentence)
            current_len += len(sentence) + 1

        if current:
            chunks.append(" ".join(current))

        return chunks

    def _merge_small_chunks(self, chunks: list[Chunk]) -> list[Chunk]:
        """Merge consecutive small chunks that share the same section."""
        if len(chunks) <= 1:
            return chunks

        merged = [chunks[0]]
        for chunk in chunks[1:]:
            prev = merged[-1]
            if (
                len(prev.content) < self.min_chunk_size
                and prev.section == chunk.section
                and prev.page == chunk.page
                and len(prev.content) + len(chunk.content) <= self.max_chunk_size
            ):
                merged[-1] = Chunk(
                    content=prev.content + "\n\n" + chunk.content,
                    page=prev.page,
                    section=prev.section,
                    chunk_index=prev.chunk_index,
                    metadata=prev.metadata,
                )
            else:
                merged.append(chunk)

        # Re-index
        for i, chunk in enumerate(merged):
            chunk.chunk_index = i

        return merged
