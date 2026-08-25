"""Unit tests for authentication provider, tokens, and role hierarchies."""

import pytest
from app.auth.local_provider import LocalAuthProvider
from app.schemas.common import RoleName, ROLE_HIERARCHY


def test_password_hashing():
    provider = LocalAuthProvider()
    password = "SuperSecretPassword123!"
    hashed = provider._hash_password(password)

    assert hashed != password
    assert provider._verify_password(password, hashed)
    assert not provider._verify_password("WrongPassword", hashed)


def test_jwt_token_creation_and_verification():
    provider = LocalAuthProvider()
    user_id = "11111111-1111-1111-1111-111111111111"
    tenant_id = "22222222-2222-2222-2222-222222222222"
    roles = ["USER", "AGENT_MANAGER"]

    tokens = provider.create_tokens(user_id, tenant_id, roles)

    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["token_type"] == "bearer"
    assert tokens["expires_in"] > 0

    # Verify access token
    payload = provider.verify_token(tokens["access_token"])
    assert payload is not None
    assert payload["sub"] == user_id
    assert payload["tenant_id"] == tenant_id
    assert payload["roles"] == roles
    assert payload["type"] == "access"

    # Verify refresh token
    refresh_payload = provider.verify_token(tokens["refresh_token"])
    assert refresh_payload is not None
    assert refresh_payload["sub"] == user_id
    assert refresh_payload["type"] == "refresh"

    # Invalid token returns None
    assert provider.verify_token("invalid.token.payload") is None


def test_role_hierarchy_ordering():
    assert ROLE_HIERARCHY[RoleName.SUPER_ADMIN] > ROLE_HIERARCHY[RoleName.ADMIN]
    assert ROLE_HIERARCHY[RoleName.ADMIN] > ROLE_HIERARCHY[RoleName.KNOWLEDGE_ADMIN]
    assert ROLE_HIERARCHY[RoleName.KNOWLEDGE_ADMIN] > ROLE_HIERARCHY[RoleName.AGENT_MANAGER]
    assert ROLE_HIERARCHY[RoleName.AGENT_MANAGER] > ROLE_HIERARCHY[RoleName.USER]
