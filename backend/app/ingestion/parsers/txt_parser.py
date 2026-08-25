"""Plain text parser."""

import aiofiles
from app.ingestion.parser import DocumentParser, ParsedDocument, ParsedSection


class TXTParser(DocumentParser):

    def supported_extensions(self) -> list[str]:
        return [".txt"]

    async def parse(self, file_path: str, filename: str) -> ParsedDocument:
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = await f.read()

        # Split by double newlines for paragraph-level sections
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]

        sections = []
        for i, para in enumerate(paragraphs):
            sections.append(ParsedSection(
                content=para,
                section=f"Section {i + 1}",
            ))

        # If no paragraph breaks found, treat as single section
        if not sections and content.strip():
            sections.append(ParsedSection(content=content.strip()))

        return ParsedDocument(
            sections=sections,
            title=filename,
            metadata={"format": "txt"},
        )
