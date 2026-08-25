"""Knowledge source routes — CRUD + file upload + deletion."""

import os
import shutil
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.knowledge import KnowledgeSource, Document, DocumentVersion, DocumentChunk
from app.models.agent import AgentKnowledgeSource
from app.schemas.common import RoleName
from app.schemas.knowledge import KnowledgeSourceCreate, KnowledgeSourceResponse, DocumentResponse
from app.services.ingestion_service import IngestionService
from app.services.audit_service import AuditService
from app.config import get_settings

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])
ingestion = IngestionService()
settings = get_settings()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".xlsm", ".xltx", ".xltm", ".pptx", ".csv", ".txt", ".md", ".markdown"}


@router.get("/sources", response_model=list[KnowledgeSourceResponse])
async def list_sources(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List active knowledge sources for the tenant."""
    result = await db.execute(
        select(KnowledgeSource)
        .where(
            KnowledgeSource.tenant_id == user.tenant_id,
            KnowledgeSource.status != "disconnected",
        )
        .order_by(KnowledgeSource.created_at.desc())
    )
    sources = result.scalars().all()

    responses = []
    for s in sources:
        # Count documents
        doc_count = await db.execute(
            select(func.count(Document.id)).where(Document.source_id == s.id, Document.status != "deleted")
        )
        indexed_count = await db.execute(
            select(func.count(Document.id))
            .where(Document.source_id == s.id, Document.status == "indexed")
        )
        failed_count = await db.execute(
            select(func.count(Document.id))
            .where(Document.source_id == s.id, Document.status == "failed")
        )

        responses.append(KnowledgeSourceResponse(
            id=s.id,
            tenant_id=s.tenant_id,
            name=s.name,
            description=s.description,
            provider_type=s.provider_type,
            status=s.status,
            last_sync_at=s.last_sync_at,
            document_count=doc_count.scalar() or 0,
            indexed_count=indexed_count.scalar() or 0,
            failed_count=failed_count.scalar() or 0,
            created_at=s.created_at,
        ))

    return responses


@router.post("/sources", response_model=KnowledgeSourceResponse)
async def create_source(
    data: KnowledgeSourceCreate,
    user: Annotated[User, Depends(require_role(RoleName.KNOWLEDGE_ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new knowledge source."""
    source = KnowledgeSource(
        tenant_id=user.tenant_id,
        name=data.name,
        description=data.description,
        provider_type="local",
        status="active",
    )
    db.add(source)
    await db.flush()

    await AuditService.log(
        db, user.tenant_id, "source_created",
        user_id=user.id,
        resource_type="knowledge_source",
        resource_id=str(source.id),
    )

    return KnowledgeSourceResponse(
        id=source.id,
        tenant_id=source.tenant_id,
        name=source.name,
        description=source.description,
        provider_type=source.provider_type,
        status=source.status,
        last_sync_at=source.last_sync_at,
        created_at=source.created_at,
    )


@router.get("/sources/{source_id}")
async def get_source(
    source_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get source details with document list."""
    result = await db.execute(
        select(KnowledgeSource)
        .where(
            KnowledgeSource.id == source_id,
            KnowledgeSource.tenant_id == user.tenant_id,
            KnowledgeSource.status != "disconnected",
        )
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    docs = await db.execute(
        select(Document)
        .where(Document.source_id == source_id, Document.status != "deleted")
        .order_by(Document.created_at.desc())
    )

    documents = []
    for d in docs.scalars().all():
        chunk_count = await db.execute(
            select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == d.id)
        )
        documents.append(DocumentResponse(
            id=d.id,
            source_id=d.source_id,
            name=d.name,
            path=d.path,
            mime_type=d.mime_type,
            size_bytes=d.size_bytes,
            status=d.status,
            chunk_count=chunk_count.scalar() or 0,
            error_message=d.error_message,
            indexed_at=d.indexed_at,
            created_at=d.created_at,
        ))

    return {
        "source": KnowledgeSourceResponse(
            id=source.id,
            tenant_id=source.tenant_id,
            name=source.name,
            description=source.description,
            provider_type=source.provider_type,
            status=source.status,
            last_sync_at=source.last_sync_at,
            document_count=len(documents),
            indexed_count=sum(1 for d in documents if d.status == "indexed"),
            failed_count=sum(1 for d in documents if d.status == "failed"),
            created_at=source.created_at,
        ),
        "documents": documents,
    }


@router.post("/sources/{source_id}/upload")
async def upload_files(
    source_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(RoleName.KNOWLEDGE_ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
    files: list[UploadFile] = File(...),
):
    """Upload files to a knowledge source and trigger ingestion."""
    result = await db.execute(
        select(KnowledgeSource)
        .where(KnowledgeSource.id == source_id, KnowledgeSource.tenant_id == user.tenant_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    results = []
    for file in files:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            results.append({"filename": file.filename, "status": "unsupported", "error": f"Unsupported type: {ext}"})
            continue

        content = await file.read()
        try:
            doc = await ingestion.ingest_file(
                db, user.tenant_id, source_id, file.filename, content
            )
            results.append({
                "filename": file.filename,
                "document_id": str(doc.id),
                "status": doc.status,
                "error": doc.error_message,
            })
        except Exception as e:
            results.append({"filename": file.filename, "status": "failed", "error": str(e)[:200]})

    await AuditService.log(
        db, user.tenant_id, "files_uploaded",
        user_id=user.id,
        resource_type="knowledge_source",
        resource_id=str(source_id),
        detail=f"Uploaded {len(files)} files",
    )

    return {"results": results}


@router.delete("/sources/{source_id}")
async def delete_source(
    source_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(RoleName.KNOWLEDGE_ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a knowledge source and all its documents and vectors."""
    result = await db.execute(
        select(KnowledgeSource)
        .where(KnowledgeSource.id == source_id, KnowledgeSource.tenant_id == user.tenant_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    # 1. Delete agent links
    await db.execute(
        delete(AgentKnowledgeSource).where(AgentKnowledgeSource.knowledge_source_id == source_id)
    )

    # 2. Delete chunks
    await db.execute(
        delete(DocumentChunk).where(DocumentChunk.source_id == source_id)
    )

    # 3. Get documents to remove versions and files
    docs = await db.execute(select(Document).where(Document.source_id == source_id))
    doc_list = docs.scalars().all()
    doc_ids = [d.id for d in doc_list]

    if doc_ids:
        await db.execute(
            delete(DocumentVersion).where(DocumentVersion.document_id.in_(doc_ids))
        )
        await db.execute(
            delete(Document).where(Document.source_id == source_id)
        )

    # 4. Remove physical upload folder if exists
    upload_path = os.path.join(settings.upload_dir, str(user.tenant_id), str(source_id))
    if os.path.exists(upload_path):
        try:
            shutil.rmtree(upload_path)
        except Exception:
            pass

    # 5. Delete source record
    await db.delete(source)
    await db.commit()

    await AuditService.log(
        db, user.tenant_id, "source_deleted",
        user_id=user.id,
        resource_type="knowledge_source",
        resource_id=str(source_id),
    )

    return {"message": "Knowledge source and all associated documents deleted successfully"}


@router.delete("/sources/{source_id}/documents/{document_id}")
async def delete_document(
    source_id: uuid.UUID,
    document_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(RoleName.KNOWLEDGE_ADMIN))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete an individual document and its vector chunks."""
    result = await db.execute(
        select(Document)
        .where(
            Document.id == document_id,
            Document.source_id == source_id,
            Document.tenant_id == user.tenant_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete chunks
    await db.execute(
        delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
    )
    # Delete versions
    await db.execute(
        delete(DocumentVersion).where(DocumentVersion.document_id == document_id)
    )

    # Remove file from disk
    if doc.path and os.path.exists(doc.path):
        try:
            os.unlink(doc.path)
        except Exception:
            pass

    # Delete document record
    await db.delete(doc)
    await db.commit()

    await AuditService.log(
        db, user.tenant_id, "document_deleted",
        user_id=user.id,
        resource_type="document",
        resource_id=str(document_id),
        detail=f"Deleted file {doc.name}",
    )

    return {"message": f"Document '{doc.name}' deleted"}
