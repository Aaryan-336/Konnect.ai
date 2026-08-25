"""User management schemas."""

import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    role: str = "USER"


class UserUpdate(BaseModel):
    display_name: str | None = None
    status: str | None = None
    role: str | None = None


class UserDetail(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    display_name: str
    status: str
    roles: list[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
