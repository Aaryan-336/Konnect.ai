"""
Chat and RAG response schemas.

These mirror the structured contract defined in app/rag/grounding.py and
enforced by app/rag/structured.py. They document the wire format for the
frontend and for /docs; the pipeline itself normalizes to plain dicts so a
malformed model response degrades gracefully instead of raising.
"""

import uuid
from typing import Literal
from pydantic import BaseModel, Field

Confidence = Literal["supported", "partial", "insufficient"]
ChartType = Literal[
    "bar", "line", "pie", "donut", "area", "scatter", "stacked_bar", "horizontal_bar"
]


class ChatRequest(BaseModel):
    agent_id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    message: str = Field(min_length=1, max_length=8000)


class Citation(BaseModel):
    document_id: uuid.UUID | None = None
    document_name: str
    page: int | None = None
    section: str | None = None
    snippet: str = ""


class SourceRef(BaseModel):
    """A document consulted during retrieval, whether or not it was cited."""
    document_id: str
    document_name: str
    pages: list[int] = []
    top_score: float = 0.0


class KeyPoint(BaseModel):
    text: str
    source: str | None = None


class ChartDataset(BaseModel):
    label: str
    data: list[float | None]


class VisualizationSpec(BaseModel):
    chart_type: ChartType
    title: str
    labels: list[str]
    datasets: list[ChartDataset]
    units: str | None = None
    source: str | None = None
    insight: str | None = None


class TableData(BaseModel):
    title: str | None = None
    headers: list[str]
    rows: list[list[str | int | float | None]]
    source: str | None = None


class KPICard(BaseModel):
    label: str
    value: str
    change: str | None = None
    trend: Literal["up", "down", "stable"] | None = None
    source: str | None = None


class FlowNode(BaseModel):
    id: str
    label: str
    detail: str | None = None


class FlowEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    label: str | None = None

    model_config = {"populate_by_name": True}


class FlowDiagram(BaseModel):
    title: str
    nodes: list[FlowNode]
    edges: list[FlowEdge]
    source: str | None = None


class TimelineEvent(BaseModel):
    date: str | None = None
    label: str
    detail: str | None = None


class RetrievalStats(BaseModel):
    candidates: int = 0
    reranked: int = 0
    context_chunks: int = 0
    top_score: float = 0.0


class RAGResponse(BaseModel):
    """Structured response from the RAG pipeline, as sent to the client."""
    answer: str
    headline: str | None = None
    confidence: Confidence
    key_points: list[KeyPoint] = []
    kpi_cards: list[KPICard] = []
    table: TableData | None = None
    visualizations: list[VisualizationSpec] = []
    flow_diagram: FlowDiagram | None = None
    timeline: list[TimelineEvent] = []
    citations: list[Citation] = []
    sources: list[SourceRef] = []
    follow_up_questions: list[str] = []

    # Trace metadata
    trace_id: str | None = None
    latency_ms: int | None = None
    model_used: str | None = None
    retrieval: RetrievalStats | None = None


class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    response: RAGResponse


class StreamChunk(BaseModel):
    """One Server-Sent Event from /api/chat/stream."""
    type: Literal["meta", "stage", "source", "token", "structured", "done", "error"]
    data: dict
