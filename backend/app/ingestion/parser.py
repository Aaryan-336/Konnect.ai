"""
Abstract document parser interface.

Each file format has a concrete parser implementation.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ParsedSection:
    """A section of parsed content from a document."""
    content: str
    page: int | None = None
    section: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class ParsedDocument:
    """Result of parsing a document."""
    sections: list[ParsedSection]
    title: str | None = None
    metadata: dict = field(default_factory=dict)
    tables: list[dict] = field(default_factory=list)


class DocumentParser(ABC):
    """Base class for document parsers."""

    @abstractmethod
    def supported_extensions(self) -> list[str]:
        """Return list of supported file extensions (e.g., ['.pdf'])."""
        ...

    @abstractmethod
    async def parse(self, file_path: str, filename: str) -> ParsedDocument:
        """Parse a file and return structured content."""
        ...
