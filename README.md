# KnowledgeHub — Enterprise Knowledge Intelligence Platform

A controlled knowledge system: users ask questions in natural language and get
**structured, cited answers built only from authorized private documents**.
No web search, no model knowledge presented as fact.

Answers come back as a document, not a paragraph — a headline, markdown prose,
key points, KPI cards, tables, charts, flow diagrams, timelines, and validated
citations. See **[docs/response_contract.md](docs/response_contract.md)**.

---

## Proof-of-concept scope

The product vision in [docs/prd.md](docs/prd.md) targets Microsoft Entra ID and
SharePoint. **This build deliberately runs on neither.** Both sit behind
provider interfaces, so they can be added without touching the RAG pipeline,
the agents, or the UI:

| Interface | This build | Planned |
|---|---|---|
| `AuthenticationProvider` | `LocalAuthProvider` — email + password, bcrypt, JWT | `EntraIDProvider` |
| `KnowledgeSourceProvider` | `LocalProvider` — direct file upload to disk | `SharePointProvider` via Microsoft Graph |
| `LLMProvider` | `GroqProvider` (default) or `OpenAIProvider` | any OpenAI-compatible endpoint |
| `EmbeddingProvider` | `FastEmbedEmbedder` — local ONNX, no API key | `OpenAIEmbedder` |
| `STTProvider` | `OpenAISTTProvider` | — |

Consequences worth knowing before a demo:

- **Users are created in-app**, not synced from a directory. Roles are assigned
  on creation (`USER`, `AGENT_MANAGER`, `KNOWLEDGE_ADMIN`, `ADMIN`, `SUPER_ADMIN`).
- **Documents are uploaded, not synchronized.** There is no delta sync, webhook,
  or reconciliation job — those belong to the SharePoint provider. Deleting a
  document removes its chunks and vectors immediately.
- **Permissions are enforced at the knowledge-source level**, not per-file
  inherited ACLs.

Everything else in the PRD — strict grounding, citation validation, agents,
natural-language agent creation, voice input, query tracing, the admin
dashboard, and the audit trail — is implemented and working.

---

## Quick start

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 16+ with the `pgvector` extension
- Redis 7+

### 1. Database

```bash
brew install postgresql@16 pgvector redis
brew services start postgresql@16
brew services start redis

createdb knowledgehub
psql knowledgehub -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Tables are created automatically on first boot.

### 2. Backend

```bash
cd backend
cp ../.env.example .env      # then edit — see Configuration below
./run.sh                     # creates .venv, installs deps, serves on :8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                  # http://localhost:3000
```

### 4. Sign in

The default super admin is seeded from `.env` on first run
(`DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`). **Change the password
immediately.**

### 5. First run checklist

1. **Knowledge → New source**, then upload documents
   (PDF, DOCX, XLSX/XLSM, PPTX, CSV, TXT, MD).
2. Wait for each document to reach **Indexed**.
3. **Agents → New agent** — or describe one in plain English and let the
   agent builder draft the configuration for you to approve.
4. Assign the knowledge source, then **Publish**.
5. Ask a question. **Admin → System Intelligence** fills in from the query log.

---

## Configuration

Settings load from `backend/.env` (see `.env.example`). The ones that matter:

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `groq` | `groq` or `openai` |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | |
| `LLM_MAX_OUTPUT_TOKENS` | `2500` | Raising this requires lowering `RAG_CONTEXT_K` — see below |
| `EMBEDDING_PROVIDER` | `fastembed` | Local ONNX, no API key needed |
| `EMBEDDING_DIMENSIONS` | `384` | Must match the `Vector(384)` column; changing it needs a migration |
| `RAG_CANDIDATE_K` | `30` | Chunks retrieved before reranking |
| `RAG_RERANK_K` | `8` | Chunks kept after reranking |
| `RAG_CONTEXT_K` | `5` | Chunks sent to the model |
| `RAG_MAX_CONTEXT_CHARS` | `1100` | Per-chunk cap in the prompt |
| `RAG_EVIDENCE_THRESHOLD` | `0.3` | Below this, the system refuses to answer |

### Token budget

Providers count **prompt + `max_tokens` against a single per-request budget**.
The defaults above produce roughly a 5,200-token request.

Groq's free tier allows **8,000 tokens per minute**, which is about one query
per minute. Sustained use returns a clear "currently rate limited" message
rather than failing silently, and the pipeline retries once automatically. For
a live demo, use a paid Groq tier or set `LLM_PROVIDER=openai` with a real
`OPENAI_API_KEY`.

---

## Architecture

```
Next.js (App Router)  →  FastAPI  →  PostgreSQL + pgvector
                                  →  Redis
```

RAG pipeline (`backend/app/rag/`):

```
Query → hybrid retrieval (pgvector + full-text)
      → rerank
      → evidence threshold        ─── below threshold ──→ refuse to answer
      → grounded context (documents wrapped as inert data)
      → LLM (JSON mode)
      → structured parse + repair
      → citation validation
      → chart / table / KPI validation
      → response
```

Grounding rules and the output contract live in `app/rag/grounding.py`.
Documents are wrapped in `<source_document>` tags and the model is told
explicitly that their content is evidence, never instruction — so a prompt
injection inside an uploaded file is treated as quoted text.

---

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a user |
| `POST` | `/api/auth/login` | Log in |
| `GET` | `/api/auth/me` | Current user |
| `GET`/`POST` | `/api/knowledge/sources` | List / create knowledge sources |
| `POST` | `/api/knowledge/sources/{id}/upload` | Upload and ingest files |
| `DELETE` | `/api/knowledge/sources/{id}` | Delete a source, its documents and vectors |
| `GET`/`POST` | `/api/agents` | List / create agents |
| `POST` | `/api/agents/{id}/publish` | Publish an agent |
| `POST` | `/api/agent-builder/generate` | Draft an agent from a description |
| `POST` | `/api/chat` | Query (single response) |
| `POST` | `/api/chat/stream` | Query (Server-Sent Events) |
| `GET` | `/api/conversations` | Conversation history |
| `POST` | `/api/voice/transcribe` | Voice transcription |
| `GET` | `/api/admin/analytics/*` | `overview`, `queries`, `knowledge`, `security` |
| `GET` | `/api/admin/audit` | Audit log |

Interactive docs: `http://localhost:8000/docs`.

---

## Re-indexing

Chunks are a product of the code that ran when the file was uploaded. Nothing
refreshes them afterwards, so **any change to a parser, the chunker, or the
embedding model leaves the existing index describing a pipeline that no longer
exists** — and the mismatch is invisible in the UI, which only reports
`indexed`.

Rebuild in place (document ids, and therefore agent and source links, survive):

```python
from app.services.ingestion_service import IngestionService
await IngestionService().reindex_document(db, doc)
```

Changing `EMBEDDING_MODEL` or `EMBEDDING_DIMENSIONS` additionally requires
dropping and recreating the `document_chunks.embedding` column, since its width
is fixed at table-creation time from settings.

Verify afterwards — every chunk of a document marked `indexed` must carry a
vector:

```sql
SELECT d.name, count(*) chunks, count(dc.embedding) embedded
FROM document_chunks dc JOIN documents d ON d.id = dc.document_id
WHERE d.status = 'indexed' GROUP BY d.name;
```

Ingestion refuses a document it cannot embed completely, so a row where these
two counts differ means the chunks predate that guard and the document needs
re-indexing.

---

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
cd frontend && npx tsc --noEmit && npm run build
```

---

## Documentation

| Document | Contents |
|---|---|
| [prd.md](docs/prd.md) | Product requirements (full vision, including Entra ID and SharePoint) |
| [response_contract.md](docs/response_contract.md) | **Structured answer format, streaming protocol, chart validation** |
| [architecture.md](docs/architecture.md) | System architecture |
| [rag_specifications.md](docs/rag_specifications.md) | Retrieval and grounding specification |
| [agent_system.md](docs/agent_system.md) | Agent model and versioning |
| [data_model.md](docs/data_model.md) | Database schema |
| [security.md](docs/security.md) | Security model and threat handling |
| [admin_dashboard.md](docs/admin_dashboard.md) | Dashboard metrics |
| [sharepoint_integration.md](docs/sharepoint_integration.md) | SharePoint design (not implemented in this build) |
