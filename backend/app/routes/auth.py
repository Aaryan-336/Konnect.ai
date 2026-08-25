"""Auth routes — register, login, me, logout, refresh."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.auth.local_provider import LocalAuthProvider
from app.auth.dependencies import get_current_user, get_user_roles
from app.models.user import User, Role
from app.models.tenant import Tenant
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest, UserResponse
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/auth", tags=["auth"])
auth = LocalAuthProvider()


@router.post("/register", response_model=UserResponse)
async def register(
    data: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Register a new user in the default tenant."""
    # Get default tenant
    result = await db.execute(select(Tenant).limit(1))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant configured")

    try:
        user_data = await auth.register(
            db, tenant.id, data.email, data.password, data.display_name
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await AuditService.log(
        db, tenant.id, "user_registered",
        user_id=uuid.UUID(user_data["id"]),
        resource_type="user",
        resource_id=user_data["id"],
    )

    return UserResponse(
        id=uuid.UUID(user_data["id"]),
        tenant_id=uuid.UUID(user_data["tenant_id"]),
        email=user_data["email"],
        display_name=user_data["display_name"],
        status="active",
        roles=user_data["roles"],
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    """Authenticate and return tokens."""
    result = await db.execute(select(Tenant).limit(1))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant configured")

    user_data = await auth.authenticate(db, tenant.id, data.email, data.password)
    if not user_data:
        await AuditService.log(
            db, tenant.id, "login_failed",
            detail=f"Failed login for {data.email}",
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    tokens = auth.create_tokens(user_data["id"], user_data["tenant_id"], user_data["roles"])

    await AuditService.log(
        db, tenant.id, "login_success",
        user_id=uuid.UUID(user_data["id"]),
        ip_address=request.client.host if request.client else None,
    )

    return TokenResponse(**tokens)


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get current user info."""
    roles = await get_user_roles(user, db)
    return UserResponse(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        roles=roles,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Refresh access token."""
    payload = auth.verify_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user = await auth.get_user_by_id(db, uuid.UUID(payload["sub"]))
    if not user or user.status != "active":
        raise HTTPException(status_code=401, detail="User not found or inactive")

    roles = await get_user_roles(user, db)
    tokens = auth.create_tokens(str(user.id), str(user.tenant_id), roles)
    return TokenResponse(**tokens)


@router.post("/logout")
async def logout():
    """Logout (client-side token discard)."""
    return {"message": "Logged out successfully"}
