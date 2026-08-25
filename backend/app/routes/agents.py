"""Agent routes — CRUD, publish, archive, test, builder."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.models.user import User
from app.schemas.common import RoleName
from app.schemas.agent import AgentCreate, AgentUpdate, AgentResponse, AgentDetail, AgentBuilderRequest, AgentBuilderResponse
from app.services.agent_service import AgentService
from app.services.agent_builder_service import AgentBuilderService
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/agents", tags=["agents"])
agent_svc = AgentService()
builder_svc = AgentBuilderService()


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = None,
):
    """List agents available to the user."""
    agents = await agent_svc.list_agents(db, user.tenant_id, status)
    versions = await agent_svc.get_current_versions(db, agents)
    return [
        AgentResponse(
            id=a.id,
            tenant_id=a.tenant_id,
            name=a.name,
            description=a.description,
            icon=a.icon,
            status=a.status,
            current_version=versions[a.id].version if a.id in versions else None,
            knowledge_sources=[
                {"id": str(l.knowledge_source_id), "name": l.knowledge_source.name}
                for l in a.knowledge_links
            ] if a.knowledge_links else [],
            created_at=a.created_at,
        )
        for a in agents
    ]


@router.get("/{agent_id}")
async def get_agent(
    agent_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get agent details including version info."""
    agent = await agent_svc.get_agent(db, user.tenant_id, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    versions = await agent_svc.get_agent_versions(db, agent_id)
    current_version = next((v for v in versions if v.id == agent.current_version_id), None)

    return {
        "id": str(agent.id),
        "tenant_id": str(agent.tenant_id),
        "name": agent.name,
        "description": agent.description,
        "icon": agent.icon,
        "status": agent.status,
        "instructions": current_version.instructions if current_version else None,
        "output_schema": current_version.output_schema if current_version else None,
        "ui_config": current_version.ui_config if current_version else None,
        "model_config": current_version.model_config_json if current_version else None,
        "suggested_prompts": current_version.suggested_prompts if current_version else None,
        "current_version": current_version.version if current_version else None,
        "knowledge_sources": [
            {"id": str(l.knowledge_source_id), "name": l.knowledge_source.name}
            for l in agent.knowledge_links
        ] if agent.knowledge_links else [],
        "versions": [
            {"version": v.version, "status": v.status, "created_at": v.created_at.isoformat()}
            for v in versions
        ],
        "created_at": agent.created_at.isoformat(),
    }


@router.post("", response_model=AgentResponse)
async def create_agent(
    data: AgentCreate,
    user: Annotated[User, Depends(require_role(RoleName.AGENT_MANAGER))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new agent."""
    agent = await agent_svc.create_agent(db, user.tenant_id, user.id, data)
    await AuditService.log(
        db, user.tenant_id, "agent_created",
        user_id=user.id, resource_type="agent", resource_id=str(agent.id),
    )
    return AgentResponse(
        id=agent.id, tenant_id=agent.tenant_id, name=agent.name,
        description=agent.description, icon=agent.icon, status=agent.status,
        created_at=agent.created_at,
    )


@router.patch("/{agent_id}")
async def update_agent(
    agent_id: uuid.UUID,
    data: AgentUpdate,
    user: Annotated[User, Depends(require_role(RoleName.AGENT_MANAGER))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update an agent (creates new version if instructions change)."""
    agent = await agent_svc.update_agent(db, user.tenant_id, agent_id, user.id, data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"message": "Agent updated", "id": str(agent.id)}


@router.post("/{agent_id}/publish")
async def publish_agent(
    agent_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(RoleName.ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Publish an agent — makes it available to users."""
    agent = await agent_svc.publish_agent(db, user.tenant_id, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await AuditService.log(
        db, user.tenant_id, "agent_published",
        user_id=user.id, resource_type="agent", resource_id=str(agent_id),
    )
    return {"message": "Agent published", "id": str(agent.id)}


@router.post("/{agent_id}/archive")
async def archive_agent(
    agent_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(RoleName.ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Archive an agent."""
    agent = await agent_svc.archive_agent(db, user.tenant_id, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"message": "Agent archived", "id": str(agent.id)}


# --- Agent Builder ---

builder_router = APIRouter(prefix="/api/agent-builder", tags=["agent-builder"])


@builder_router.post("/generate", response_model=AgentBuilderResponse)
async def generate_agent(
    data: AgentBuilderRequest,
    user: Annotated[User, Depends(require_role(RoleName.AGENT_MANAGER))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate agent configuration from natural language description."""
    try:
        result = await builder_svc.generate(db, user.tenant_id, data.description)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
