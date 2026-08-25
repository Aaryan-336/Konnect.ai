"""Admin dashboard and analytics schemas."""

from datetime import datetime
from pydantic import BaseModel


class OverviewStats(BaseModel):
    total_users: int
    active_users: int
    total_queries: int
    avg_response_time_ms: float
    total_documents: int
    indexed_documents: int
    total_agents: int
    total_knowledge_sources: int


class QueryAnalytics(BaseModel):
    queries_per_day: list[dict]
    queries_by_agent: list[dict]
    no_answer_rate: float
    avg_latency_ms: float


class KnowledgeAnalytics(BaseModel):
    total_files: int
    indexed: int
    processing: int
    failed: int
    deleted: int
    unsupported: int


class AgentAnalytics(BaseModel):
    agents: list[dict]


class SecurityAnalytics(BaseModel):
    failed_logins: int
    auth_failures: int
    admin_actions: int
    recent_events: list[dict]


class AuditLogEntry(BaseModel):
    id: str
    user_email: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    result: str
    created_at: datetime

    class Config:
        from_attributes = True
