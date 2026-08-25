"""
FastAPI authentication dependencies.

Provides: get_current_user, require_role, get_current_tenant_id
"""

import uuid
from functools import wraps
from typing import Annotated

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.auth.local_provider import LocalAuthProvider
from app.models.user import User, Role, UserRole
from app.schemas.common import RoleName, ROLE_HIERARCHY

security = HTTPBearer()
auth_provider = LocalAuthProvider()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Verify JWT token and return the current user."""
    payload = auth_provider.verify_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = uuid.UUID(payload["sub"])
    user = await auth_provider.get_user_by_id(db, user_id)
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


async def get_user_roles(user: User, db: AsyncSession) -> list[str]:
    """Get role names for a user."""
    result = await db.execute(
        select(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id)
    )
    return [r[0] for r in result.all()]


def require_role(minimum_role: RoleName):
    """Dependency factory: require at least the specified role level."""

    async def role_checker(
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> User:
        roles = await get_user_roles(user, db)
        user_max_level = max(
            (ROLE_HIERARCHY.get(RoleName(r), 0) for r in roles),
            default=0,
        )
        required_level = ROLE_HIERARCHY[minimum_role]

        if user_max_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires at least {minimum_role.value} role",
            )

        # Attach roles to user object for convenience
        user._roles = roles
        return user

    return role_checker


async def get_current_tenant_id(
    user: Annotated[User, Depends(get_current_user)],
) -> uuid.UUID:
    """Extract tenant_id from current user."""
    return user.tenant_id
