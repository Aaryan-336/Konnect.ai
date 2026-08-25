"""
Local authentication provider — email/password + bcrypt + JWT.

This is the MVP authentication provider. It will be replaced by EntraIDProvider
when Microsoft Entra ID integration is implemented.
"""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.provider import AuthenticationProvider
from app.config import get_settings
from app.models.user import User, Role, UserRole

settings = get_settings()


class LocalAuthProvider(AuthenticationProvider):
    """Email/password authentication with bcrypt hashing and JWT tokens."""

    def _hash_password(self, password: str) -> str:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    def _verify_password(self, plain: str, hashed: str) -> bool:
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False

    async def register(
        self, db: AsyncSession, tenant_id: uuid.UUID,
        email: str, password: str, display_name: str,
        role_name: str = "USER"
    ) -> dict:
        # Check if user exists
        result = await db.execute(
            select(User).where(User.tenant_id == tenant_id, User.email == email)
        )
        existing = result.scalar_one_or_none()
        if existing:
            raise ValueError("User with this email already exists")

        # Create user
        user = User(
            tenant_id=tenant_id,
            email=email,
            password_hash=self._hash_password(password),
            display_name=display_name,
            status="active",
        )
        db.add(user)
        await db.flush()

        # Assign role
        role_result = await db.execute(select(Role).where(Role.name == role_name))
        role = role_result.scalar_one_or_none()
        if role:
            user_role = UserRole(user_id=user.id, role_id=role.id)
            db.add(user_role)
            await db.flush()

        return {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "tenant_id": str(user.tenant_id),
            "roles": [role_name],
        }

    async def authenticate(
        self, db: AsyncSession, tenant_id: uuid.UUID, email: str, password: str
    ) -> dict | None:
        result = await db.execute(
            select(User).where(User.tenant_id == tenant_id, User.email == email)
        )
        user = result.scalar_one_or_none()

        if not user or not user.password_hash:
            return None
        if not self._verify_password(password, user.password_hash):
            return None
        if user.status != "active":
            return None

        # Get roles
        role_result = await db.execute(
            select(Role.name)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id)
        )
        roles = [r[0] for r in role_result.all()]

        return {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "tenant_id": str(user.tenant_id),
            "roles": roles,
        }

    def create_tokens(self, user_id: str, tenant_id: str, roles: list[str]) -> dict:
        now = datetime.now(timezone.utc)

        access_payload = {
            "sub": user_id,
            "tenant_id": tenant_id,
            "roles": roles,
            "type": "access",
            "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
            "iat": now,
        }
        access_token = jwt.encode(access_payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

        refresh_payload = {
            "sub": user_id,
            "tenant_id": tenant_id,
            "type": "refresh",
            "exp": now + timedelta(days=settings.refresh_token_expire_days),
            "iat": now,
        }
        refresh_token = jwt.encode(refresh_payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.access_token_expire_minutes * 60,
        }

    def verify_token(self, token: str) -> dict | None:
        try:
            payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
            return payload
        except JWTError:
            return None

    async def get_user_by_id(self, db: AsyncSession, user_id: uuid.UUID) -> User | None:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()
