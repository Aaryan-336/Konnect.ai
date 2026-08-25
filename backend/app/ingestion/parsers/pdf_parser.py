"""PDF parser using PyMuPDF."""

try:
    import pymupdf as fitz
except ImportError:
    import fitz
from app.ingestion.parser import DocumentParser, ParsedDocument, ParsedSection


class PDFParser(DocumentParser):

    def supported_extensions(self) -> list[str]:
        return [".pdf"]

    async def parse(self, file_path: str, filename: str) -> ParsedDocument:
        doc = fitz.open(file_path)
        sections = []
        tables = []
        total_pages = len(doc)

        try:
            for page_num in range(total_pages):
                page = doc[page_num]
                text = page.get_text("text")

                if text.strip():
                    sections.append(ParsedSection(
                        content=text.strip(),
                        page=page_num + 1,
                        section=f"Page {page_num + 1}",
                    ))

                # Extract tables if available
                try:
                    page_tables = page.find_tables()
                    if page_tables and page_tables.tables:
                        for table in page_tables.tables:
                            try:
                                extracted = table.extract()
                                if extracted:
                                    tables.append({
                                        "page": page_num + 1,
                                        "headers": extracted[0] if extracted else [],
                                        "rows": extracted[1:] if len(extracted) > 1 else [],
                                    })
                            except Exception:
                                pass
                except Exception:
                    pass
        finally:
            doc.close()
            import gc
            gc.collect()

        return ParsedDocument(
            sections=sections,
            title=filename,
            metadata={"format": "pdf", "pages": total_pages},
            tables=tables,
        )
