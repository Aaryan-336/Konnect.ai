"""CSV parser using pandas."""

import pandas as pd
from app.ingestion.parser import DocumentParser, ParsedDocument, ParsedSection


class CSVParser(DocumentParser):

    def supported_extensions(self) -> list[str]:
        return [".csv"]

    async def parse(self, file_path: str, filename: str) -> ParsedDocument:
        df = pd.read_csv(file_path, encoding="utf-8", on_bad_lines="skip")
        sections = []
        tables = []

        # Build text representation
        text_lines = []
        headers = list(df.columns)
        text_lines.append(" | ".join(str(h) for h in headers))

        for _, row in df.iterrows():
            text_lines.append(" | ".join(str(v) for v in row.values))

        if text_lines:
            sections.append(ParsedSection(
                content="\n".join(text_lines),
                section="Data",
            ))

        # Store as structured table
        tables.append({
            "headers": [str(h) for h in headers],
            "rows": df.astype(str).values.tolist(),
        })

        return ParsedDocument(
            sections=sections,
            title=filename,
            metadata={"format": "csv", "rows": len(df), "columns": len(headers)},
            tables=tables,
        )
