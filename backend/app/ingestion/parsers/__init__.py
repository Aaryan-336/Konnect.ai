# Parsers package
from app.ingestion.parsers.pdf_parser import PDFParser
from app.ingestion.parsers.docx_parser import DOCXParser
from app.ingestion.parsers.xlsx_parser import XLSXParser
from app.ingestion.parsers.pptx_parser import PPTXParser
from app.ingestion.parsers.csv_parser import CSVParser
from app.ingestion.parsers.txt_parser import TXTParser
from app.ingestion.parsers.markdown_parser import MarkdownParser

PARSER_REGISTRY: dict[str, type] = {
    ".pdf": PDFParser,
    ".docx": DOCXParser,
    ".xlsx": XLSXParser,
    ".xlsm": XLSXParser,
    ".xltx": XLSXParser,
    ".xltm": XLSXParser,
    ".pptx": PPTXParser,
    ".csv": CSVParser,
    ".txt": TXTParser,
    ".md": MarkdownParser,
    ".markdown": MarkdownParser,
}


def get_parser_for_extension(ext: str):
    """Get the appropriate parser instance for a file extension."""
    parser_class = PARSER_REGISTRY.get(ext.lower())
    if parser_class is None:
        return None
    return parser_class()
