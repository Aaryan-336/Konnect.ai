"""Agent schemas."""

import uuid
from datetime import datetime
from pydantic import BaseModel


class AgentCreate(BaseModel):
    name: str
    description: str | None = None
    instructions: str
    knowledge_source_ids: list[uuid.UUID] = []
    output_schema: dict | None = None
    ui_config: dict | None = None
    model_config_json: dict | None = None
    suggested_prompts: list[str] | None = None
    icon: str | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    instructions: str | None = None
    knowledge_source_ids: list[uuid.UUID] | None = None
    output_schema: dict | None = None
    ui_config: dict | None = None
    model_config_json: dict | None = None
    suggested_prompts: list[str] | None = None
    icon: str | None = None


class AgentResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    icon: str | None
    status: str
    current_version: int | None = None
    knowledge_sources: list[dict] = []
    created_at: datetime

    class Config:
        from_attributes = True


class AgentDetail(AgentResponse):
    instructions: str | None = None
    output_schema: dict | None = None
    ui_config: dict | None = None
    model_config_json: dict | None = None
    suggested_prompts: list[str] | None = None
    versions: list[dict] = []


class AgentBuilderRequest(BaseModel):
    description: str


class AgentBuilderResponse(BaseModel):
    draft_agent: AgentCreate
    warnings: list[str] = []
