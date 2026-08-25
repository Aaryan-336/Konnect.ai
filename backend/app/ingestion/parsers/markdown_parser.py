"""Markdown parser."""

import re
import aiofiles
from app.ingestion.parser import DocumentParser, ParsedDocument, ParsedSection


class MarkdownParser(DocumentParser):

    def supported_extensions(self) -> list[str]:
        return [".md", ".markdown"]

    async def parse(self, file_path: str, filename: str) -> ParsedDocument:
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = await f.read()

        # Split by headings to create semantic sections
        heading_pattern = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
        sections = []
        last_pos = 0
        last_heading = None

        for match in heading_pattern.finditer(content):
            # Save content before this heading
            chunk = content[last_pos:match.start()].strip()
            if chunk:
                sections.append(ParsedSection(
                    content=chunk,
                    section=last_heading,
                ))

            last_heading = match.group(2).strip()
            last_pos = match.start()

        # Remaining content
        remaining = content[last_pos:].strip()
        if remaining:
            sections.append(ParsedSection(
                content=remaining,
                section=last_heading,
            ))

        if not sections and content.strip():
            sections.append(ParsedSection(content=content.strip()))

        return ParsedDocument(
            sections=sections,
            title=filename,
            metadata={"format": "markdown"},
        )
