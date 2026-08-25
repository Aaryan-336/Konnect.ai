"""Unit tests for semantic chunker."""

from app.ingestion.parser import ParsedSection
from app.ingestion.chunker import SemanticChunker


def test_chunker_small_section():
    chunker = SemanticChunker(max_chunk_size=1000, min_chunk_size=100)
    sections = [
        ParsedSection(content="This is a short paragraph of text.", section="Intro", page=1)
    ]

    chunks = chunker.chunk_sections(sections)
    assert len(chunks) == 1
    assert chunks[0].content == "This is a short paragraph of text."
    assert chunks[0].section == "Intro"
    assert chunks[0].page == 1


def test_chunker_paragraph_splitting():
    chunker = SemanticChunker(max_chunk_size=200, min_chunk_size=50)
    long_text = "Paragraph 1: " + ("A" * 120) + "\n\nParagraph 2: " + ("B" * 120)
    sections = [
        ParsedSection(content=long_text, section="Body", page=2)
    ]

    chunks = chunker.chunk_sections(sections)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert chunk.section == "Body"
        assert chunk.page == 2


def test_chunker_merges_tiny_fragments():
    chunker = SemanticChunker(max_chunk_size=500, min_chunk_size=100)
    sections = [
        ParsedSection(content="Tiny snippet 1.", section="Notes", page=1),
        ParsedSection(content="Tiny snippet 2.", section="Notes", page=1),
    ]

    chunks = chunker.chunk_sections(sections)
    # Consecutive tiny chunks with same section/page get merged
    assert len(chunks) == 1
    assert "Tiny snippet 1." in chunks[0].content
    assert "Tiny snippet 2." in chunks[0].content
