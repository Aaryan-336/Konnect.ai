"""Audit service — logs security and admin events."""

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog


class AuditService:
    """Logs audit events for security tracking."""

    @staticmethod
    async def log(
        db: AsyncSession,
        tenant_id: uuid.UUID,
        action: str,
        user_id: uuid.UUID | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        result: str = "success",
        detail: str | None = None,
        ip_address: str | None = None,
        trace_id: str | None = None,
    ):
        """Create an audit log entry."""
        entry = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            result=result,
            detail=detail,
            ip_address=ip_address,
            trace_id=trace_id,
        )
        db.add(entry)
        await db.flush()
        return entry
