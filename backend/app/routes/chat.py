"""Chat routes — query and streaming endpoints."""

import json
import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import ChatRequest
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/chat", tags=["chat"])
chat_svc = ChatService()


class _JSONEncoder(json.JSONEncoder):
    """Serializes the UUIDs and datetimes carried in structured RAG payloads."""

    def default(self, o):
        if isinstance(o, uuid.UUID):
            return str(o)
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        return super().default(o)


def _encode(data) -> str:
    """Encode one SSE payload. Always JSON, so the client parses uniformly."""
    return json.dumps(data, cls=_JSONEncoder, ensure_ascii=False)


@router.post("")
async def chat(
    data: ChatRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Non-streaming chat query."""
    try:
        return await chat_svc.chat(
            db=db,
            tenant_id=user.tenant_id,
            user_id=user.id,
            agent_id=data.agent_id,
            message=data.message,
            conversation_id=data.conversation_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/stream")
async def chat_stream(
    data: ChatRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Streaming chat query via Server-Sent Events.

    Event types: meta, stage, source, token, structured, done, error.
    Every payload is JSON — `token` carries {"text": "..."} rather than a bare
    string so that whitespace and newlines survive SSE line framing intact.
    """

    async def event_generator():
        try:
            async for chunk in chat_svc.chat_stream(
                db=db,
                tenant_id=user.tenant_id,
                user_id=user.id,
                agent_id=data.agent_id,
                message=data.message,
                conversation_id=data.conversation_id,
            ):
                payload = chunk["data"]
                if chunk["type"] in ("token", "error") and isinstance(payload, str):
                    payload = {"text": payload}
                yield {"event": chunk["type"], "data": _encode(payload)}
        except ValueError as e:
            yield {"event": "error", "data": _encode({"text": str(e)})}
        except Exception:  # noqa: BLE001 - never leak internals to the client
            yield {
                "event": "error",
                "data": _encode({"text": "An unexpected error occurred. Please try again."}),
            }

    return EventSourceResponse(event_generator())


# --- Conversations ---

conversations_router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@conversations_router.get("")
async def list_conversations(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List the user's conversations."""
    convs = await chat_svc.get_conversations(db, user.tenant_id, user.id)
    return [
        {
            "id": str(c.id),
            "agent_id": str(c.agent_id),
            "agent_name": c.agent.name if c.agent else None,
            "title": c.title,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
        }
        for c in convs
    ]


@conversations_router.get("/{conversation_id}/messages")
async def get_messages(
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get messages in a conversation.

    Assistant turns carry their stored structured blocks so reopening a
    conversation re-renders charts, tables, and citations rather than plain text.
    """
    messages = await chat_svc.get_conversation_messages(
        db, conversation_id, user.tenant_id, user.id
    )
    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "response": m.response_metadata,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]
