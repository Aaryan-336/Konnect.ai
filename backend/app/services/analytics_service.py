"""
Analytics service — computes dashboard metrics.

Every series returned here is chart-ready: date ranges are gap-filled so a
sparse week does not render as a misleading line, and ratios are returned as
percentages rounded once at the edge.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, distinct, case, Float
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.query import Query, QueryCitation, QueryRetrieval
from app.models.knowledge import KnowledgeSource, Document, DocumentChunk
from app.models.agent import Agent
from app.models.audit import AuditLog

TREND_DAYS = 14
LATENCY_TARGET_MS = 2000


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _fill_date_series(rows: dict[str, float], days: int) -> list[dict]:
    """Expand a sparse {date: value} map into a contiguous daily series."""
    today = _utc_now().date()
    series = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        key = day.isoformat()
        series.append({"date": key, "value": rows.get(key, 0)})
    return series


class AnalyticsService:
    """Computes analytics for the admin dashboard."""

    # ----------------------------------------------------------------- #
    # Overview
    # ----------------------------------------------------------------- #

    async def get_overview(self, db: AsyncSession, tenant_id: uuid.UUID) -> dict:
        """Headline KPIs for the top of the dashboard."""
        now = _utc_now()
        thirty_days_ago = now - timedelta(days=30)
        day_ago = now - timedelta(days=1)

        total_users = await self._scalar(
            db, select(func.count(User.id)).where(User.tenant_id == tenant_id)
        )
        active_users = await self._scalar(
            db,
            select(func.count(distinct(Query.user_id))).where(
                Query.tenant_id == tenant_id, Query.created_at >= thirty_days_ago
            ),
        )
        total_queries = await self._scalar(
            db, select(func.count(Query.id)).where(Query.tenant_id == tenant_id)
        )
        queries_24h = await self._scalar(
            db,
            select(func.count(Query.id)).where(
                Query.tenant_id == tenant_id, Query.created_at >= day_ago
            ),
        )
        avg_latency = await self._scalar(
            db, select(func.avg(Query.latency_ms)).where(Query.tenant_id == tenant_id)
        )
        p95_latency = await self._scalar(
            db,
            select(
                func.percentile_cont(0.95).within_group(Query.latency_ms.asc())
            ).where(Query.tenant_id == tenant_id, Query.latency_ms.isnot(None)),
        )

        total_documents = await self._scalar(
            db,
            select(func.count(Document.id))
            .join(KnowledgeSource, KnowledgeSource.id == Document.source_id)
            .where(KnowledgeSource.tenant_id == tenant_id, Document.status != "deleted"),
        )
        indexed_documents = await self._scalar(
            db,
            select(func.count(Document.id))
            .join(KnowledgeSource, KnowledgeSource.id == Document.source_id)
            .where(KnowledgeSource.tenant_id == tenant_id, Document.status == "indexed"),
        )
        total_chunks = await self._scalar(
            db,
            select(func.count(DocumentChunk.id)).where(DocumentChunk.tenant_id == tenant_id),
        )
        total_agents = await self._scalar(
            db, select(func.count(Agent.id)).where(Agent.tenant_id == tenant_id)
        )
        published_agents = await self._scalar(
            db,
            select(func.count(Agent.id)).where(
                Agent.tenant_id == tenant_id, Agent.status == "published"
            ),
        )
        total_sources = await self._scalar(
            db,
            select(func.count(KnowledgeSource.id)).where(
                KnowledgeSource.tenant_id == tenant_id
            ),
        )

        # Share of answered queries that carried at least one validated citation.
        answered = await self._scalar(
            db,
            select(func.count(Query.id)).where(
                Query.tenant_id == tenant_id, Query.confidence != "insufficient"
            ),
        )
        cited = await self._scalar(
            db,
            select(func.count(distinct(QueryCitation.query_id)))
            .join(Query, Query.id == QueryCitation.query_id)
            .where(Query.tenant_id == tenant_id),
        )

        return {
            "total_users": total_users,
            "active_users": active_users,
            "total_queries": total_queries,
            "queries_last_24h": queries_24h,
            "queries_per_user": round(total_queries / total_users, 1) if total_users else 0.0,
            "avg_response_time_ms": round(float(avg_latency), 1),
            "p95_response_time_ms": round(float(p95_latency), 1),
            "latency_target_ms": LATENCY_TARGET_MS,
            "total_documents": total_documents,
            "indexed_documents": indexed_documents,
            "total_chunks": total_chunks,
            "total_agents": total_agents,
            "published_agents": published_agents,
            "total_knowledge_sources": total_sources,
            "citation_coverage": round(cited / answered * 100, 1) if answered else 0.0,
        }

    # ----------------------------------------------------------------- #
    # Queries
    # ----------------------------------------------------------------- #

    async def get_query_analytics(self, db: AsyncSession, tenant_id: uuid.UUID) -> dict:
        """Query volume, latency, grounding quality, and agent breakdown."""
        window_start = _utc_now() - timedelta(days=TREND_DAYS)

        daily = await db.execute(
            select(
                func.date(Query.created_at).label("date"),
                func.count(Query.id).label("count"),
                func.avg(Query.latency_ms).label("avg_latency"),
            )
            .where(Query.tenant_id == tenant_id, Query.created_at >= window_start)
            .group_by(func.date(Query.created_at))
            .order_by(func.date(Query.created_at))
        )
        volume_map: dict[str, float] = {}
        latency_map: dict[str, float] = {}
        for row in daily.all():
            key = str(row.date)
            volume_map[key] = row.count
            latency_map[key] = round(float(row.avg_latency or 0), 1)

        by_agent = await db.execute(
            select(
                Agent.name,
                func.count(Query.id).label("count"),
                func.avg(Query.latency_ms).label("avg_latency"),
            )
            .join(Agent, Agent.id == Query.agent_id)
            .where(Query.tenant_id == tenant_id)
            .group_by(Agent.name)
            .order_by(func.count(Query.id).desc())
            .limit(10)
        )
        queries_by_agent = [
            {
                "agent": row.name,
                "count": row.count,
                "avg_latency_ms": round(float(row.avg_latency or 0), 1),
            }
            for row in by_agent.all()
        ]

        by_confidence = await db.execute(
            select(Query.confidence, func.count(Query.id).label("count"))
            .where(Query.tenant_id == tenant_id)
            .group_by(Query.confidence)
        )
        confidence_counts = {
            (row.confidence or "unknown"): row.count for row in by_confidence.all()
        }
        total_count = sum(confidence_counts.values())

        avg_latency_overall = await self._scalar(
            db,
            select(func.avg(Query.latency_ms)).where(Query.tenant_id == tenant_id),
        )

        # Average context chunks per query: total retrievals over distinct queries.
        # Cast to float so Postgres does not perform integer division.
        chunks_per_query = select(
            func.cast(func.count(QueryRetrieval.id), Float)
            / func.greatest(func.count(distinct(QueryRetrieval.query_id)), 1)
        ).select_from(QueryRetrieval).join(
            Query, Query.id == QueryRetrieval.query_id
        ).where(Query.tenant_id == tenant_id)
        retrieved_per_query = await self._scalar(db, chunks_per_query)

        recent = await db.execute(
            select(Query)
            .where(Query.tenant_id == tenant_id)
            .order_by(Query.created_at.desc())
            .limit(15)
        )
        recent_queries = [
            {
                "id": str(q.id),
                "trace_id": q.trace_id,
                "query": q.query_text[:160],
                "confidence": q.confidence,
                "latency_ms": q.latency_ms,
                "model_used": q.model_used,
                "created_at": q.created_at.isoformat() if q.created_at else None,
            }
            for q in recent.scalars().all()
        ]

        no_answer = confidence_counts.get("insufficient", 0)

        return {
            "queries_per_day": _fill_date_series(volume_map, TREND_DAYS),
            "latency_per_day": _fill_date_series(latency_map, TREND_DAYS),
            "queries_by_agent": queries_by_agent,
            "confidence_breakdown": [
                {"confidence": k, "count": v} for k, v in sorted(confidence_counts.items())
            ],
            "no_answer_rate": round(no_answer / total_count * 100, 1) if total_count else 0.0,
            "grounded_rate": (
                round(confidence_counts.get("supported", 0) / total_count * 100, 1)
                if total_count else 0.0
            ),
            "avg_latency_ms": round(float(avg_latency_overall), 1),
            "avg_chunks_per_query": round(float(retrieved_per_query), 1),
            "recent_queries": recent_queries,
        }

    # ----------------------------------------------------------------- #
    # Knowledge
    # ----------------------------------------------------------------- #

    async def get_knowledge_analytics(self, db: AsyncSession, tenant_id: uuid.UUID) -> dict:
        """Ingestion health, per-source breakdown, and the most-cited documents."""
        by_status = await db.execute(
            select(Document.status, func.count(Document.id).label("count"))
            .join(KnowledgeSource, KnowledgeSource.id == Document.source_id)
            .where(KnowledgeSource.tenant_id == tenant_id)
            .group_by(Document.status)
        )
        status_counts = {row.status: row.count for row in by_status.all()}

        by_source = await db.execute(
            select(
                KnowledgeSource.name,
                func.count(Document.id).label("documents"),
                func.sum(
                    case((Document.status == "indexed", 1), else_=0)
                ).label("indexed"),
            )
            .join(
                Document,
                (Document.source_id == KnowledgeSource.id) & (Document.status != "deleted"),
                isouter=True,
            )
            .where(KnowledgeSource.tenant_id == tenant_id)
            .group_by(KnowledgeSource.name)
            .order_by(func.count(Document.id).desc())
        )
        sources = [
            {
                "source": row.name,
                "documents": row.documents or 0,
                "indexed": int(row.indexed or 0),
            }
            for row in by_source.all()
        ]

        chunks_by_source = await db.execute(
            select(KnowledgeSource.name, func.count(DocumentChunk.id).label("chunks"))
            .join(DocumentChunk, DocumentChunk.source_id == KnowledgeSource.id)
            .where(KnowledgeSource.tenant_id == tenant_id)
            .group_by(KnowledgeSource.name)
            .order_by(func.count(DocumentChunk.id).desc())
        )
        chunk_distribution = [
            {"source": row.name, "chunks": row.chunks} for row in chunks_by_source.all()
        ]

        most_cited = await db.execute(
            select(Document.name, func.count(QueryCitation.id).label("citations"))
            .join(QueryCitation, QueryCitation.document_id == Document.id)
            .join(Query, Query.id == QueryCitation.query_id)
            .where(Query.tenant_id == tenant_id)
            .group_by(Document.name)
            .order_by(func.count(QueryCitation.id).desc())
            .limit(8)
        )
        top_documents = [
            {"document": row.name, "citations": row.citations} for row in most_cited.all()
        ]

        failed = await db.execute(
            select(Document.name, Document.error_message, Document.updated_at)
            .join(KnowledgeSource, KnowledgeSource.id == Document.source_id)
            .where(KnowledgeSource.tenant_id == tenant_id, Document.status == "failed")
            .order_by(Document.updated_at.desc())
            .limit(10)
        )
        failed_documents = [
            {
                "document": row.name,
                "error": (row.error_message or "Unknown error")[:200],
                "at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in failed.all()
        ]

        indexed = status_counts.get("indexed", 0)
        active_total = sum(v for k, v in status_counts.items() if k != "deleted")

        return {
            "total_files": active_total,
            "indexed": indexed,
            "processing": status_counts.get("processing", 0),
            "failed": status_counts.get("failed", 0),
            "deleted": status_counts.get("deleted", 0),
            "unsupported": status_counts.get("unsupported", 0),
            "index_rate": round(indexed / active_total * 100, 1) if active_total else 0.0,
            "by_source": sources,
            "chunk_distribution": chunk_distribution,
            "top_documents": top_documents,
            "failed_documents": failed_documents,
        }

    # ----------------------------------------------------------------- #
    # Security
    # ----------------------------------------------------------------- #

    async def get_security_analytics(self, db: AsyncSession, tenant_id: uuid.UUID) -> dict:
        """Auth failures, admin activity, and the recent audit trail."""
        window_start = _utc_now() - timedelta(days=TREND_DAYS)

        failed_logins = await self._scalar(
            db,
            select(func.count(AuditLog.id)).where(
                AuditLog.tenant_id == tenant_id, AuditLog.action == "login_failed"
            ),
        )
        auth_failures = await self._scalar(
            db,
            select(func.count(AuditLog.id)).where(
                AuditLog.tenant_id == tenant_id, AuditLog.action == "authorization_failed"
            ),
        )
        admin_actions = await self._scalar(
            db,
            select(func.count(AuditLog.id)).where(
                AuditLog.tenant_id == tenant_id,
                AuditLog.action.in_([
                    "agent_created", "agent_published", "agent_archived",
                    "source_created", "source_deleted", "document_deleted", "user_created",
                ]),
            ),
        )

        by_action = await db.execute(
            select(AuditLog.action, func.count(AuditLog.id).label("count"))
            .where(AuditLog.tenant_id == tenant_id)
            .group_by(AuditLog.action)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
        events_by_action = [
            {"action": row.action, "count": row.count} for row in by_action.all()
        ]

        daily = await db.execute(
            select(func.date(AuditLog.created_at).label("date"), func.count(AuditLog.id).label("count"))
            .where(AuditLog.tenant_id == tenant_id, AuditLog.created_at >= window_start)
            .group_by(func.date(AuditLog.created_at))
        )
        events_map = {str(row.date): row.count for row in daily.all()}

        recent = await db.execute(
            select(AuditLog)
            .where(AuditLog.tenant_id == tenant_id)
            .order_by(AuditLog.created_at.desc())
            .limit(20)
        )
        recent_events = [
            {
                "id": str(e.id),
                "action": e.action,
                "resource_type": e.resource_type,
                "result": e.result,
                "detail": e.detail,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in recent.scalars().all()
        ]

        return {
            "failed_logins": failed_logins,
            "auth_failures": auth_failures,
            "admin_actions": admin_actions,
            "events_by_action": events_by_action,
            "events_per_day": _fill_date_series(events_map, TREND_DAYS),
            "recent_events": recent_events,
        }

    # ----------------------------------------------------------------- #

    @staticmethod
    async def _scalar(db: AsyncSession, statement) -> float | int:
        """Run a scalar aggregate, treating NULL (no rows) as zero."""
        result = await db.execute(statement)
        return result.scalar() or 0
