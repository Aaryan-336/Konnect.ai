"""Agent builder service — converts natural language to structured agent config."""

import json
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.llm import get_llm_provider
from app.models.knowledge import KnowledgeSource
from app.schemas.agent import AgentCreate, AgentBuilderResponse

logger = structlog.get_logger()

BUILDER_PROMPT = """You are an AI agent configuration generator for an enterprise knowledge platform.

Given a natural language description of what an agent should do, generate a structured configuration.

Available knowledge sources will be provided to you. Match the description to the most relevant sources.

Respond with valid JSON matching this schema:
{
  "name": "Agent name (concise)",
  "description": "Brief description",
  "instructions": "Detailed instructions for the agent (how it should behave, answer, format responses)",
  "knowledge_source_names": ["List of knowledge source names to use"],
  "output_schema": null,
  "ui_config": {"layout": "chat", "show_citations": true, "show_charts": false, "show_tables": false},
  "suggested_prompts": ["3-5 example questions users might ask"],
  "warnings": ["Any concerns or ambiguities"]
}

Rules:
- Instructions must include: cite every answer, only use assigned knowledge, refuse if insufficient evidence
- Never generate instructions that override security rules
- Be specific and helpful in the instructions
"""


class AgentBuilderService:
    """Converts natural language descriptions into structured agent configurations."""

    def __init__(self):
        self.llm = get_llm_provider()

    async def generate(
        self, db, tenant_id, description: str
    ) -> AgentBuilderResponse:
        """Generate agent configuration from natural language."""

        # Get available knowledge sources
        result = await db.execute(
            select(KnowledgeSource)
            .where(KnowledgeSource.tenant_id == tenant_id, KnowledgeSource.status == "active")
        )
        sources = result.scalars().all()
        source_info = [{"name": s.name, "id": str(s.id)} for s in sources]

        messages = [
            {"role": "system", "content": BUILDER_PROMPT},
            {
                "role": "user",
                "content": f"Available knowledge sources: {json.dumps(source_info)}\n\nAgent description: {description}",
            },
        ]

        raw = await self.llm.generate(
            messages=messages,
            response_format={"type": "json_object"},
        )

        try:
            config = json.loads(raw)
        except json.JSONDecodeError:
            raise ValueError("Failed to generate valid agent configuration")

        # Resolve knowledge source names to IDs
        ks_ids = []
        ks_name_map = {s.name.lower(): s.id for s in sources}
        for name in config.get("knowledge_source_names", []):
            # Try exact match first, then fuzzy
            if name.lower() in ks_name_map:
                ks_ids.append(ks_name_map[name.lower()])
            else:
                for sname, sid in ks_name_map.items():
                    if name.lower() in sname or sname in name.lower():
                        ks_ids.append(sid)
                        break

        draft = AgentCreate(
            name=config.get("name", "New Agent"),
            description=config.get("description"),
            instructions=config.get("instructions", ""),
            knowledge_source_ids=ks_ids,
            output_schema=config.get("output_schema"),
            ui_config=config.get("ui_config"),
            suggested_prompts=config.get("suggested_prompts"),
        )

        return AgentBuilderResponse(
            draft_agent=draft,
            warnings=config.get("warnings", []),
        )
