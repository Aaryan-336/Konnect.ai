"""Admin routes — analytics, audit logs, user management."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.dependencies import require_role, get_user_roles
from app.models.user import User, Role, UserRole
from app.models.audit import AuditLog
from app.schemas.common import RoleName
from app.services.analytics_service import AnalyticsService
from app.services.audit_service import AuditService
from app.auth.local_provider import LocalAuthProvider

router = APIRouter(prefix="/api/admin", tags=["admin"])
analytics = AnalyticsService()
auth = LocalAuthProvider()


@router.get("/analytics/overview")
async def get_overview(
    user: Annotated[User, Depends(require_role(RoleName.ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get dashboard overview statistics."""
    return await analytics.get_overview(db, user.tenant_id)


@router.get("/analytics/queries")
async def get_query_analytics(
    user: Annotated[User, Depends(require_role(RoleName.ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get query analytics."""
    return await analytics.get_query_analytics(db, user.tenant_id)


@router.get("/analytics/knowledge")
async def get_knowledge_analytics(
    user: Annotated[User, Depends(require_role(RoleName.ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get knowledge/document analytics."""
    return await analytics.get_knowledge_analytics(db, user.tenant_id)


@router.get("/analytics/security")
async def get_security_analytics(
    user: Annotated[User, Depends(require_role(RoleName.ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get security analytics from audit logs."""
    return await analytics.get_security_analytics(db, user.tenant_id)


@router.get("/audit")
async def get_audit_logs(
    user: Annotated[User, Depends(require_role(RoleName.ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    """Get audit logs with pagination."""
    offset = (page - 1) * page_size

    total = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.tenant_id == user.tenant_id)
    )

    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.tenant_id == user.tenant_id)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": str(l.id),
                "user_id": str(l.user_id) if l.user_id else None,
                "action": l.action,
                "resource_type": l.resource_type,
                "resource_id": l.resource_id,
                "result": l.result,
                "detail": l.detail,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
        "total": total.scalar() or 0,
        "page": page,
        "page_size": page_size,
    }


# --- User Management ---

@router.get("/users")
async def list_users(
    user: Annotated[User, Depends(require_role(RoleName.ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all users in the tenant."""
    result = await db.execute(
        select(User)
        .where(User.tenant_id == user.tenant_id)
        .order_by(User.created_at.desc())
    )
    users = result.scalars().all()

    user_list = []
    for u in users:
        roles = await get_user_roles(u, db)
        user_list.append({
            "id": str(u.id),
            "email": u.email,
            "display_name": u.display_name,
            "status": u.status,
            "roles": roles,
            "created_at": u.created_at.isoformat(),
        })

    return user_list


@router.post("/users")
async def create_user(
    data: dict,
    user: Annotated[User, Depends(require_role(RoleName.ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new user (admin only)."""
    try:
        result = await auth.register(
            db, user.tenant_id,
            data["email"], data["password"], data["display_name"],
            role_name=data.get("role", "USER"),
        )
        await AuditService.log(
            db, user.tenant_id, "user_created",
            user_id=user.id, resource_type="user", resource_id=result["id"],
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
