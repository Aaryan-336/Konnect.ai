"""
Abstract authentication provider interface.

Concrete implementations:
- LocalAuthProvider (email/password + JWT) ← MVP
- EntraIDProvider (Microsoft Entra ID) ← Future
"""

from abc import ABC, abstractmethod
from typing import Any
import uuid

from sqlalchemy.ext.asyncio import AsyncSession


class AuthenticationProvider(ABC):
    """Base class for authentication providers."""

    @abstractmethod
    async def register(
        self, db: AsyncSession, tenant_id: uuid.UUID,
        email: str, password: str, display_name: str
    ) -> dict:
        """Register a new user. Returns user data."""
        ...

    @abstractmethod
    async def authenticate(
        self, db: AsyncSession, tenant_id: uuid.UUID, email: str, password: str
    ) -> dict | None:
        """Authenticate user. Returns user data or None."""
        ...

    @abstractmethod
    def create_tokens(self, user_id: str, tenant_id: str, roles: list[str]) -> dict:
        """Create access + refresh tokens."""
        ...

    @abstractmethod
    def verify_token(self, token: str) -> dict | None:
        """Verify and decode a token. Returns payload or None."""
        ...

    @abstractmethod
    async def get_user_by_id(self, db: AsyncSession, user_id: uuid.UUID) -> Any | None:
        """Get user by ID."""
        ...
