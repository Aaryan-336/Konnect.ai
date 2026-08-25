"""Unit tests for GroundingEngine and CitationValidator."""

import uuid
from app.rag.grounding import GroundingEngine
from app.rag.citation import CitationValidator


def test_grounding_evidence_validation():
    grounding = GroundingEngine()

    # Empty chunks -> insufficient
    sufficient, valid = grounding.validate_evidence([], threshold=0.3)
    assert not sufficient
    assert len(valid) == 0

    # Chunks below threshold -> insufficient
    low_chunks = [
        {"chunk_id": uuid.uuid4(), "rerank_score": 0.15, "content": "Vague mention"},
        {"chunk_id": uuid.uuid4(), "rerank_score": 0.20, "content": "Another vague mention"},
    ]
    sufficient, valid = grounding.validate_evidence(low_chunks, threshold=0.3)
    assert not sufficient
    assert len(valid) == 0

    # Chunks above threshold -> sufficient
    high_chunks = [
        {"chunk_id": uuid.uuid4(), "rerank_score": 0.85, "content": "Exact policy rule on leave"},
        {"chunk_id": uuid.uuid4(), "rerank_score": 0.25, "content": "Irrelevant text"},
    ]
    sufficient, valid = grounding.validate_evidence(high_chunks, threshold=0.3)
    assert sufficient
    assert len(valid) == 1
    assert valid[0]["content"] == "Exact policy rule on leave"


def test_grounding_no_answer_response():
    grounding = GroundingEngine()
    resp = grounding.build_no_answer_response()

    assert resp["confidence"] == "insufficient"
    assert "I couldn't find enough information" in resp["answer"]
    assert resp["citations"] == []


def test_citation_validator():
    validator = CitationValidator()
    doc_id = uuid.uuid4()

    retrieved = [
        {
            "document_id": doc_id,
            "document_name": "Leave_Policy_2025.pdf",
            "content": "Employees are entitled to 20 days annual leave.",
        }
    ]

    llm_citations = [
        {
            "document_name": "Leave_Policy_2025.pdf",
            "page": 4,
            "snippet": "Employees are entitled to 20 days annual leave.",
        },
        {
            "document_name": "Non_Existent_File.pdf",
            "page": 1,
            "snippet": "Hallucinated citation.",
        },
    ]

    validated = validator.validate(llm_citations, retrieved)

    # Only the matching citation is preserved with document_id attached
    assert len(validated) == 1
    assert validated[0]["document_id"] == doc_id
    assert validated[0]["document_name"] == "Leave_Policy_2025.pdf"
    assert validated[0]["page"] == 4


def test_citation_page_is_corrected_when_the_retriever_contradicts_it():
    """A page the retriever never returned is replaced by one it did."""
    validator = CitationValidator()
    doc_id = uuid.uuid4()

    retrieved = [
        {"document_id": doc_id, "document_name": "Deck.pdf", "page": 40, "content": "Slide 40 text"},
        {"document_id": doc_id, "document_name": "Deck.pdf", "page": 41, "content": "Slide 41 text"},
    ]

    validated = validator.validate(
        [{"document_name": "Deck.pdf", "page": 99, "snippet": "claim"}], retrieved
    )

    assert len(validated) == 1
    assert validated[0]["page"] in (40, 41)


def test_citation_page_is_kept_when_the_document_has_no_page_metadata():
    """Formats without pages give nothing to check against, so keep the locator."""
    validator = CitationValidator()
    retrieved = [
        {"document_id": uuid.uuid4(), "document_name": "notes.txt", "page": None, "content": "text"}
    ]

    validated = validator.validate(
        [{"document_name": "notes.txt", "page": 3, "snippet": "claim"}], retrieved
    )

    assert validated[0]["page"] == 3


def test_duplicate_citations_are_collapsed():
    validator = CitationValidator()
    doc_id = uuid.uuid4()
    retrieved = [
        {"document_id": doc_id, "document_name": "Deck.pdf", "page": 40, "content": "Slide 40"}
    ]

    validated = validator.validate(
        [
            {"document_name": "Deck.pdf", "page": 40, "snippet": "first claim"},
            {"document_name": "Deck.pdf", "page": 40, "snippet": "second claim"},
        ],
        retrieved,
    )

    assert len(validated) == 1


def test_missing_snippet_is_backfilled_from_the_chunk():
    validator = CitationValidator()
    retrieved = [
        {
            "document_id": uuid.uuid4(),
            "document_name": "Deck.pdf",
            "page": 40,
            "content": "The fund targets secured lending.",
        }
    ]

    validated = validator.validate([{"document_name": "Deck.pdf", "page": 40}], retrieved)

    assert "secured lending" in validated[0]["snippet"]


def test_sources_list_groups_pages_by_document():
    validator = CitationValidator()
    doc_a, doc_b = uuid.uuid4(), uuid.uuid4()
    chunks = [
        {"document_id": doc_a, "document_name": "A.pdf", "page": 2, "rerank_score": 0.7},
        {"document_id": doc_a, "document_name": "A.pdf", "page": 1, "rerank_score": 0.5},
        {"document_id": doc_b, "document_name": "B.pdf", "page": 9, "rerank_score": 0.9},
    ]

    sources = validator.build_sources(chunks)

    assert [s["document_name"] for s in sources] == ["B.pdf", "A.pdf"]
    assert sources[1]["pages"] == [1, 2]
