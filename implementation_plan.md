# Enterprise RAG Platform — MVP Implementation Plan

## Background

Building KnowledgeHub, an enterprise knowledge intelligence platform, as defined across 16 specification documents in `/docs`. The MVP swaps Entra ID / SharePoint for local auth and local document upload while keeping provider-based interfaces so those integrations can be added later without rewriting core systems.

---

## User Review Required

> [!IMPORTANT]
> **MVP Scope Deviations from Docs**: The docs specify Entra ID + SharePoint as primary auth/knowledge. Per your instructions, the MVP uses `LocalAuthProvider` and `LocalKnowledgeProvider` instead. The architecture wraps both behind abstract interfaces (`AuthenticationProvider`, `KnowledgeSourceProvider`) so Entra/SharePoint can be plugged in later.

> [!IMPORTANT]
> **LLM / Embedding / STT Provider**: The MVP will use OpenAI-compatible providers as default (configurable via env vars). The code will be behind `LLMProvider`, `EmbeddingProvider`, and `STTProvider` interfaces. You'll need an `OPENAI_API_KEY` (or compatible) to run the system. Please confirm this is acceptable, or specify a different default provider.

> [!WARNING]
> **Database Setup**: The MVP requires PostgreSQL with pgvector extension and Redis running locally. Docker Compose will be provided for one-command setup.

---

## Proposed Changes

The project will be a monorepo with two main directories:

```
Konnect_2.0/
├── docs/                    ← existing (untouched)
├── backend/                 ← FastAPI + Python
├── frontend/                ← Next.js + TypeScript + Tailwind + shadcn/ui
├── docker-compose.yml       ← PostgreSQL + Redis + pgvector
├── .env.example
└── README.md
```

---

### Phase 1 — Project Scaffolding & Infrastructure

#### [NEW] `.env.example`
All configuration variables (DB, Redis, LLM API key, JWT secret, etc.)

#### [NEW] `README.md`
Setup instructions. PostgreSQL (with pgvector) and Redis must be installed and running locally.

---

### Phase 2 — Backend Foundation

#### [NEW] `backend/` Python package

```
backend/
├── pyproject.toml
├── alembic.ini
├── alembic/                   ← migrations
├── app/
│   ├── main.py                ← FastAPI app + middleware
│   ├── config.py              ← Pydantic settings
│   ├── database.py            ← async SQLAlchemy engine + sessions
│   │
│   ├── models/                ← SQLAlchemy ORM models
│   │   ├── user.py            ← users, roles, user_roles
│   │   ├── tenant.py
│   │   ├── knowledge.py       ← knowledge_sources, documents, document_versions, document_chunks
│   │   ├── agent.py           ← agents, agent_versions, agent_knowledge_sources
│   │   ├── conversation.py    ← conversations, messages
│   │   ├── query.py           ← queries, query_retrievals, query_citations
│   │   ├── audit.py           ← audit_logs
│   │   └── sync.py            ← sync_jobs, sync_events
│   │
│   ├── schemas/               ← Pydantic request/response schemas
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── knowledge.py
│   │   ├── agent.py
│   │   ├── chat.py
│   │   ├── admin.py
│   │   └── common.py
│   │
│   ├── auth/                  ← Authentication provider interface
│   │   ├── provider.py        ← abstract AuthenticationProvider
│   │   ├── local_provider.py  ← email/password + bcrypt + JWT
│   │   └── dependencies.py    ← FastAPI dependency: get_current_user, require_role
│   │
│   ├── services/              ← Business logic
│   │   ├── user_service.py
│   │   ├── knowledge_service.py
│   │   ├── document_service.py
│   │   ├── ingestion_service.py
│   │   ├── rag_service.py
│   │   ├── chat_service.py
│   │   ├── agent_service.py
│   │   ├── agent_builder_service.py
│   │   ├── analytics_service.py
│   │   └── audit_service.py
│   │
│   ├── knowledge/             ← Knowledge source provider interface
│   │   ├── provider.py        ← abstract KnowledgeSourceProvider
│   │   └── local_provider.py  ← file upload + local storage
│   │
│   ├── rag/                   ← RAG pipeline components
│   │   ├── pipeline.py        ← orchestrator
│   │   ├── query_processor.py
│   │   ├── retriever.py       ← hybrid: pgvector + FTS
│   │   ├── reranker.py
│   │   ├── grounding.py       ← evidence validation + context builder
│   │   ├── citation.py        ← citation validation
│   │   └── structured_output.py ← Pydantic schemas for LLM output
│   │
│   ├── ingestion/             ← Document processing pipeline
│   │   ├── parser.py          ← abstract DocumentParser
│   │   ├── parsers/
│   │   │   ├── pdf_parser.py      ← PyMuPDF
│   │   │   ├── docx_parser.py     ← python-docx
│   │   │   ├── xlsx_parser.py     ← openpyxl
│   │   │   ├── pptx_parser.py     ← python-pptx
│   │   │   ├── csv_parser.py      ← pandas
│   │   │   ├── txt_parser.py
│   │   │   └── markdown_parser.py
│   │   ├── chunker.py         ← semantic-boundary chunking
│   │   └── embedder.py        ← EmbeddingProvider interface
│   │
│   ├── llm/                   ← LLM provider interface
│   │   ├── provider.py        ← abstract LLMProvider
│   │   └── openai_provider.py ← OpenAI-compatible default
│   │
│   ├── voice/                 ← STT provider interface
│   │   ├── provider.py        ← abstract STTProvider
│   │   └── openai_provider.py ← Whisper API default
│   │
│   ├── routes/                ← API route handlers (thin)
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── knowledge.py
│   │   ├── agents.py
│   │   ├── chat.py
│   │   ├── voice.py
│   │   ├── admin.py
│   │   └── health.py
│   │
│   ├── middleware/
│   │   ├── rate_limit.py
│   │   ├── tenant.py
│   │   └── logging.py
│   │
│   ├── tasks/                 ← Celery tasks
│   │   ├── celery_app.py
│   │   ├── ingestion_tasks.py
│   │   └── analytics_tasks.py
│   │
│   └── utils/
│       ├── security.py        ← input sanitization, prompt-injection guards
│       └── hashing.py         ← content hashing
```

Key design decisions:
- **All business logic in `services/`**, not in route handlers
- **Provider interfaces** for auth, knowledge, LLM, embedding, STT — all swappable
- **RBAC via dependencies**: `require_role(Role.ADMIN)` etc.
- **Tenant isolation**: every query includes `tenant_id` filter
- **Authorization before retrieval**: knowledge source access checked before vector search

---

### Phase 3 — Database Schema (Alembic Migrations)

Tables per [data_model.md](file:///Users/aaryankhanna/Downloads/Konnect_2.0/docs/data_model.md):

| Table | Key Fields |
|-------|-----------|
| `tenants` | id, name, status |
| `users` | id, tenant_id, email, password_hash, display_name, status |
| `roles` | id, name |
| `user_roles` | user_id, role_id |
| `knowledge_sources` | id, tenant_id, name, provider_type, config, status |
| `documents` | id, tenant_id, source_id, name, path, mime_type, content_hash, status |
| `document_versions` | id, document_id, version, content_hash |
| `document_chunks` | id, document_id, chunk_index, content, page, section, metadata, embedding(vector), tenant_id, source_id |
| `agents` | id, tenant_id, name, description, status, current_version_id |
| `agent_versions` | id, agent_id, version, instructions, output_schema, ui_config, model_config |
| `agent_knowledge_sources` | agent_id, knowledge_source_id |
| `conversations` | id, tenant_id, user_id, agent_id |
| `messages` | id, conversation_id, role, content |
| `queries` | id, tenant_id, user_id, agent_id, conversation_id, query, trace_id, latency_ms, status |
| `query_retrievals` | id, query_id, chunk_id, rank, retrieval_score, rerank_score |
| `query_citations` | id, query_id, document_id, page, section, snippet |
| `audit_logs` | id, tenant_id, user_id, action, resource_type, resource_id, result, trace_id |
| `sync_jobs` | id, source_id, status, started_at, completed_at |
| `sync_events` | id, job_id, document_id, event_type |

The `document_chunks.embedding` column uses pgvector's `vector(1536)` type (configurable dimension).

---

### Phase 4 — Authentication & RBAC

- `LocalAuthProvider`: bcrypt password hashing, JWT access+refresh tokens
- Roles: `USER`, `AGENT_MANAGER`, `KNOWLEDGE_ADMIN`, `ADMIN`, `SUPER_ADMIN`
- Seed a default tenant + `SUPER_ADMIN` user on first run
- FastAPI dependencies: `get_current_user`, `require_role(min_role)`
- Rate limiting on login endpoint

API:
```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
POST /api/auth/refresh
```

---

### Phase 5 — Knowledge Upload & Ingestion

- `LocalKnowledgeProvider`: file upload via multipart form, stores files on disk under `uploads/{tenant_id}/{source_id}/`
- Document parsers: PDF (PyMuPDF), DOCX (python-docx), XLSX (openpyxl), PPTX (python-pptx), CSV (pandas), TXT, Markdown
- Semantic chunking with section/paragraph boundaries, metadata enrichment
- Embedding via `EmbeddingProvider` interface (OpenAI `text-embedding-3-small` default)
- Celery tasks for async ingestion
- Content hashing for change detection

API:
```
POST   /api/knowledge/sources                    ← create source
POST   /api/knowledge/sources/{id}/upload        ← upload files
GET    /api/knowledge/sources                    ← list sources
GET    /api/knowledge/sources/{id}               ← source details + file list
DELETE /api/knowledge/sources/{id}               ← remove source
GET    /api/knowledge/documents/{id}             ← document detail + chunks
```

---

### Phase 6 — RAG Pipeline

Pipeline per [rag_specifications.md](file:///Users/aaryankhanna/Downloads/Konnect_2.0/docs/rag_specifications.md):

```
Query → Normalize → Classify → Generate retrieval queries
     → Hybrid retrieval (pgvector cosine + pg FTS)
     → Metadata filtering (tenant_id, source_ids from agent)
     → Reranking (cross-encoder or score fusion)
     → Evidence validation (confidence threshold)
     → Context construction (structured SOURCE blocks)
     → LLM (with system rules + agent instructions + evidence)
     → Citation validation
     → Structured response
```

- Authorization-aware: only search chunks from knowledge sources the agent+user can access
- Top-K: 30 candidates → rerank to 8 → LLM context 5
- Evidence threshold: configurable per agent, below → NO_ANSWER
- Prompt injection defense: documents wrapped in `<source_document>` tags with explicit system instruction

---

### Phase 7 — Chat & Streaming

- `POST /api/chat` (non-streaming) and `POST /api/chat/stream` (SSE streaming)
- Conversation history stored in `conversations` + `messages`
- Follow-up question resolution using conversation context
- Query logging with trace_id, latency, retrieved chunks, citations
- Structured LLM output validated via Pydantic:

```python
class RAGResponse(BaseModel):
    answer: str
    confidence: Literal["supported", "partial", "insufficient"]
    citations: list[Citation]
    visualization: Optional[VisualizationSpec]
    table: Optional[TableData]
```

---

### Phase 8 — Citations, Tables, Charts

- Citations: document name, page, section, snippet — validated against actual retrieved chunks
- Tables: structured data extracted from source, returned as JSON for frontend rendering
- Charts: backend produces `VisualizationSpec` (type, labels, datasets, units) — frontend renders via Apache ECharts
- Deterministic calculations for totals/averages/percentages done in Python, not by LLM

---

### Phase 9 — Voice

- `POST /api/voice/transcribe` accepts audio blob
- `STTProvider` interface with OpenAI Whisper default
- Frontend: browser `MediaRecorder` API → send audio → display transcript → user edits → submit as query
- Voice input goes through same RAG pipeline (no bypass)

---

### Phase 10 — Agents

- Full CRUD for agents with versioning
- Agent lifecycle: DRAFT → TESTING → PUBLISHED → ARCHIVED
- Each agent version: instructions, knowledge_sources, output_schema, ui_config, model_config
- Publishing creates immutable version (never overwrite published)
- Agent-level knowledge source scoping for retrieval filtering

API per [api_spec.md](file:///Users/aaryankhanna/Downloads/Konnect_2.0/docs/api_spec.md):
```
GET/POST    /api/agents
GET/PATCH   /api/agents/{id}
POST        /api/agents/{id}/test
POST        /api/agents/{id}/publish
POST        /api/agents/{id}/archive
```

---

### Phase 11 — Natural-Language Agent Builder

- `POST /api/agent-builder/generate` accepts natural language description
- Uses LLM to generate structured agent config (name, instructions, knowledge sources, output schema, UI config)
- Returns draft for admin preview — no auto-publish
- Validated via Pydantic before returning

---

### Phase 12 — Frontend

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx              ← root layout + sidebar nav
│   │   ├── page.tsx                ← home page
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── agents/
│   │   │   ├── page.tsx            ← agent list
│   │   │   └── [id]/page.tsx       ← agent chat interface
│   │   ├── conversations/page.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx            ← dashboard overview
│   │   │   ├── users/page.tsx
│   │   │   ├── knowledge/page.tsx
│   │   │   ├── agents/page.tsx     ← agent manager
│   │   │   ├── agents/builder/page.tsx
│   │   │   ├── queries/page.tsx
│   │   │   ├── audit/page.tsx
│   │   │   └── health/page.tsx
│   │   └── settings/page.tsx
│   │
│   ├── components/
│   │   ├── ui/                     ← shadcn/ui components
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── CitationCard.tsx
│   │   │   ├── StreamingText.tsx
│   │   │   └── VoiceInput.tsx
│   │   ├── data-viz/
│   │   │   ├── ChartRenderer.tsx   ← Apache ECharts wrapper
│   │   │   ├── DataTable.tsx
│   │   │   └── KPICard.tsx
│   │   ├── agents/
│   │   │   ├── AgentCard.tsx
│   │   │   └── AgentBuilder.tsx
│   │   ├── knowledge/
│   │   │   ├── FileUploader.tsx
│   │   │   └── SourceBrowser.tsx
│   │   ├── admin/
│   │   │   ├── OverviewCards.tsx
│   │   │   ├── QueryChart.tsx
│   │   │   └── AuditTable.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       └── Header.tsx
│   │
│   ├── lib/
│   │   ├── api.ts                  ← API client
│   │   ├── auth.ts                 ← auth context + token management
│   │   └── types.ts                ← TypeScript types
│   │
│   └── styles/
│       └── globals.css
```

Design per [design.md](file:///Users/aaryankhanna/Downloads/Konnect_2.0/docs/design.md):
- Enterprise, premium, calm aesthetic — neutral backgrounds, high contrast text, restrained accent
- Desktop-first responsive layout with collapsible sidebar
- Streaming chat with typing animation
- Citation cards with document/page/excerpt on click
- ECharts for all visualizations
- Voice input with visual states (idle → listening → processing → complete)
- Admin dashboard with KPI cards, line/bar charts, data tables

---

### Phase 13 — Admin Dashboard

Per [admin_dashboard.md](file:///Users/aaryankhanna/Downloads/Konnect_2.0/docs/admin_dashboard.md):
- Overview cards: users, queries, documents, agents, avg response time
- Query analytics: queries/day chart, queries by agent, no-answer rate, latency
- Knowledge analytics: files by status, sync status per source
- Agent analytics: usage, latency, failure rate
- Security: failed logins, auth failures, admin actions
- Query explorer: inspect query → retrieved sources → answer → citations
- System health: API, DB, Redis, Workers, LLM, Embedding

API:
```
GET /api/admin/analytics/overview
GET /api/admin/analytics/queries
GET /api/admin/analytics/agents
GET /api/admin/analytics/knowledge
GET /api/admin/analytics/security
GET /api/admin/audit
```

---

### Phase 14 — Observability & Security

- **Structured JSON logging** throughout backend
- **Trace ID** on every request (UUID), propagated through all pipeline stages
- **Audit logging**: login, agent CRUD, knowledge CRUD, permission changes, admin actions
- **Rate limiting** via Redis (login, query, voice, admin endpoints)
- **Input sanitization**: XSS prevention on all user/document content before rendering
- **Prompt injection guards**: documents wrapped as data, system prompt explicit about evidence vs instructions
- **CORS** configured for frontend origin only
- **CSRF** protection for cookie-based flows
- **Tenant isolation** enforced on every DB query

---

## Verification Plan

### Automated Tests
```bash
# Backend unit tests
cd backend && pytest tests/ -v

# Type checking
cd frontend && npx tsc --noEmit

# Lint
cd backend && ruff check .
cd frontend && npx eslint .
```

### Manual Verification
- Register user → login → see home page with agents
- Create knowledge source → upload documents → verify indexing
- Create agent → assign knowledge source → test chat
- Verify citations link to correct document/page
- Verify NO_ANSWER when knowledge is insufficient
- Verify streaming responses
- Verify voice input → transcription → query
- Verify admin dashboard shows real metrics
- Verify RBAC: regular user cannot access admin routes
- Verify tenant isolation: data doesn't leak across tenants

---

## Open Questions

> [!IMPORTANT]
> 1. **LLM Provider**: Should the default be OpenAI (`gpt-4o`), or do you prefer Azure OpenAI, Anthropic, or another provider? The code will be provider-agnostic, but I need a default for the MVP.

> [!IMPORTANT]
> 2. **Embedding Model**: Default to `text-embedding-3-small` (1536 dims) from OpenAI? Or a different model?

> [!NOTE]
> 3. **Default Tenant**: The MVP will auto-create a default tenant + super admin on first database migration. Credentials will be printed to console and should be changed immediately.
