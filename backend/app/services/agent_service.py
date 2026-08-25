"""Agent service — CRUD, versioning, knowledge source linking."""

import uuid
import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent, AgentVersion, AgentKnowledgeSource
from app.models.knowledge import KnowledgeSource
from app.schemas.agent import AgentCreate, AgentUpdate

logger = structlog.get_logger()


class AgentService:
    """Manages agent lifecycle: create, update, publish, archive, version."""

    async def list_agents(
        self, db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None
    ) -> list[Agent]:
        """List agents for a tenant, optionally filtered by status."""
        query = select(Agent).where(Agent.tenant_id == tenant_id)
        if status:
            query = query.where(Agent.status == status)
        query = query.order_by(Agent.created_at.desc())
        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_current_versions(
        self, db: AsyncSession, agents: list[Agent]
    ) -> dict[uuid.UUID, AgentVersion]:
        """
        Map agent id to its active version in one query.

        Used by the list endpoint so it can report the live version number
        without an N+1 lookup per agent.
        """
        version_ids = [a.current_version_id for a in agents if a.current_version_id]
        if not version_ids:
            return {}

        result = await db.execute(
            select(AgentVersion).where(AgentVersion.id.in_(version_ids))
        )
        by_id = {v.id: v for v in result.scalars().all()}
        return {
            a.id: by_id[a.current_version_id]
            for a in agents
            if a.current_version_id and a.current_version_id in by_id
        }

    async def get_agent(
        self, db: AsyncSession, tenant_id: uuid.UUID, agent_id: uuid.UUID
    ) -> Agent | None:
        """Get a single agent."""
        result = await db.execute(
            select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def create_agent(
        self, db: AsyncSession, tenant_id: uuid.UUID,
        user_id: uuid.UUID, data: AgentCreate
    ) -> Agent:
        """Create a new agent with initial version."""
        agent = Agent(
            tenant_id=tenant_id,
            name=data.name,
            description=data.description,
            icon=data.icon,
            status="draft",
            created_by=user_id,
        )
        db.add(agent)
        await db.flush()

        # Create initial version
        version = AgentVersion(
            agent_id=agent.id,
            version=1,
            instructions=data.instructions,
            output_schema=data.output_schema,
            ui_config=data.ui_config,
            model_config_json=data.model_config_json,
            suggested_prompts=data.suggested_prompts,
            status="draft",
            created_by=user_id,
        )
        db.add(version)
        await db.flush()

        agent.current_version_id = version.id

        # Link knowledge sources
        for ks_id in data.knowledge_source_ids:
            link = AgentKnowledgeSource(
                agent_id=agent.id,
                knowledge_source_id=ks_id,
            )
            db.add(link)

        await db.flush()
        logger.info("agent_created", agent_id=str(agent.id), name=data.name)
        return agent

    async def update_agent(
        self, db: AsyncSession, tenant_id: uuid.UUID,
        agent_id: uuid.UUID, user_id: uuid.UUID, data: AgentUpdate
    ) -> Agent | None:
        """Update agent metadata. Creates a new version if instructions change."""
        agent = await self.get_agent(db, tenant_id, agent_id)
        if not agent:
            return None

        if data.name is not None:
            agent.name = data.name
        if data.description is not None:
            agent.description = data.description
        if data.icon is not None:
            agent.icon = data.icon

        # Fields that live on AgentVersion rather than on the agent row.
        version_scoped = (
            data.output_schema,
            data.ui_config,
            data.model_config_json,
            data.suggested_prompts,
        )

        # If instructions changed, create new version
        if data.instructions is not None:
            # Get current max version
            ver_result = await db.execute(
                select(func.max(AgentVersion.version))
                .where(AgentVersion.agent_id == agent_id)
            )
            max_ver = ver_result.scalar() or 0

            version = AgentVersion(
                agent_id=agent.id,
                version=max_ver + 1,
                instructions=data.instructions,
                output_schema=data.output_schema,
                ui_config=data.ui_config,
                model_config_json=data.model_config_json,
                suggested_prompts=data.suggested_prompts,
                status="draft",
                created_by=user_id,
            )
            db.add(version)
            await db.flush()
            agent.current_version_id = version.id

        elif any(field is not None for field in version_scoped) and agent.current_version_id:
            # Version-scoped edits without an instruction change amend the
            # current version in place. Cutting a new version for a tweak to
            # the suggested prompts would leave a published agent pointing at
            # a draft, and previously these fields were simply dropped.
            current_result = await db.execute(
                select(AgentVersion).where(AgentVersion.id == agent.current_version_id)
            )
            current_version = current_result.scalar_one_or_none()
            if current_version:
                if data.suggested_prompts is not None:
                    current_version.suggested_prompts = data.suggested_prompts
                if data.output_schema is not None:
                    current_version.output_schema = data.output_schema
                if data.ui_config is not None:
                    current_version.ui_config = data.ui_config
                if data.model_config_json is not None:
                    current_version.model_config_json = data.model_config_json

        # Update knowledge source links.
        #
        # Diffed rather than cleared-and-rebuilt: deleting a link and inserting
        # an identical one in the same flush let SQLAlchemy order the INSERT
        # first, which collided with the row still pending deletion and failed
        # the whole request. Re-saving an agent without changing its sources is
        # the common case, so that path has to be a no-op.
        if data.knowledge_source_ids is not None:
            desired = set(data.knowledge_source_ids)

            existing = await db.execute(
                select(AgentKnowledgeSource)
                .where(AgentKnowledgeSource.agent_id == agent_id)
            )
            current_links = existing.scalars().all()
            current = {link.knowledge_source_id for link in current_links}

            for link in current_links:
                if link.knowledge_source_id not in desired:
                    await db.delete(link)

            for ks_id in desired - current:
                db.add(
                    AgentKnowledgeSource(
                        agent_id=agent.id,
                        knowledge_source_id=ks_id,
                    )
                )

        await db.flush()
        return agent

    async def publish_agent(
        self, db: AsyncSession, tenant_id: uuid.UUID, agent_id: uuid.UUID
    ) -> Agent | None:
        """Publish an agent — makes it available to users."""
        agent = await self.get_agent(db, tenant_id, agent_id)
        if not agent:
            return None

        agent.status = "published"

        # Mark current version as published
        if agent.current_version_id:
            ver_result = await db.execute(
                select(AgentVersion).where(AgentVersion.id == agent.current_version_id)
            )
            version = ver_result.scalar_one_or_none()
            if version:
                version.status = "published"

        await db.flush()
        logger.info("agent_published", agent_id=str(agent_id))
        return agent

    async def archive_agent(
        self, db: AsyncSession, tenant_id: uuid.UUID, agent_id: uuid.UUID
    ) -> Agent | None:
        """Archive an agent — hides from users."""
        agent = await self.get_agent(db, tenant_id, agent_id)
        if not agent:
            return None

        agent.status = "archived"
        await db.flush()
        logger.info("agent_archived", agent_id=str(agent_id))
        return agent

    async def get_agent_versions(
        self, db: AsyncSession, agent_id: uuid.UUID
    ) -> list[AgentVersion]:
        """Get all versions of an agent."""
        result = await db.execute(
            select(AgentVersion)
            .where(AgentVersion.agent_id == agent_id)
            .order_by(AgentVersion.version.desc())
        )
        return list(result.scalars().all())
