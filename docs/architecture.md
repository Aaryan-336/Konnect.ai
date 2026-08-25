# System Architecture

## 1. Architecture Philosophy

The platform must be designed around a closed knowledge boundary.

```text
                    ┌──────────────────────┐
                    │      SharePoint      │
                    │ Authoritative Source │
                    └──────────┬───────────┘
                               │
                         Microsoft Graph
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Sync / Ingestion     │
                    │ Service              │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ Document Processing  │
                    │ Parse / Normalize    │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ Chunking + Metadata  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ Embedding Service    │
                    └──────────┬───────────┘
                               │
              ┌────────────────▼────────────────┐
              │       Retrieval Database        │
              │ Vector + Metadata + Documents  │
              └────────────────┬────────────────┘
                               │
                               ▼
                       ┌──────────────┐
                       │ API Backend  │
                       └──────┬───────┘
                              │
                    ┌─────────▼──────────┐
                    │ Authorization      │
                    │ + Agent Engine     │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Retrieval Engine   │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Grounding Engine   │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ LLM                │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Response Renderer  │
                    └─────────┬──────────┘
                              │
                              ▼
                         Web Client
```

---

# 2. Frontend

Use:

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
```

Frontend responsibilities:

* Authentication UI
* Agent selection
* Chat
* Voice
* Streaming responses
* Charts
* Tables
* Sources
* Admin dashboard

The frontend must never directly contain:

* LLM API keys
* SharePoint client secrets
* Database credentials
* Embedding API keys
* Administrative secrets

---

# 3. Backend

Use a Python API service.

Recommended:

```text
FastAPI
```

Responsibilities:

* Authentication verification
* Authorization
* Agent execution
* RAG orchestration
* SharePoint integration
* Ingestion
* Query processing
* Analytics
* Audit logging

---

# 4. Authentication

Use:

```text
Microsoft Entra ID
```

Authentication flow:

```text
Browser
   ↓
Entra ID
   ↓
Authorization Code + PKCE
   ↓
Application
   ↓
Backend
```

Microsoft recommends authorization-code flow with PKCE for SPAs.

---

# 5. SharePoint Integration

Use:

```text
Microsoft Graph API
```

The platform should store:

* tenant ID
* site ID
* drive ID
* root folder ID
* synchronization state
* delta token
* configuration metadata

Do not store unnecessary SharePoint content permanently.

Graph supports accessing SharePoint files through Drive and DriveItem resources.

---

# 6. Synchronization

Preferred architecture:

```text
SharePoint Change
       ↓
Notification
       ↓
Sync Worker
       ↓
Graph Delta
       ↓
Changed Files
       ↓
Process Only Changes
       ↓
Update Index
```

Graph delta queries return changes and provide a delta link for future synchronization. Deleted items are also represented in the change stream.

Fallback:

```text
Scheduled reconciliation
```

---

# 7. Ingestion

```text
File
 ↓
Download
 ↓
File type detection
 ↓
Parser
 ↓
Text extraction
 ↓
Table extraction
 ↓
Normalization
 ↓
Chunking
 ↓
Metadata enrichment
 ↓
Embedding
 ↓
Index
```

---

# 8. Metadata

Every chunk should contain:

```text
tenant_id
source_id
site_id
drive_id
folder_id
file_id
file_name
file_path
file_type
file_version
last_modified
page_number
section
chunk_id
access_scope
content_hash
embedding_model
created_at
updated_at
```

---

# 9. Retrieval

Use hybrid retrieval:

```text
Vector Search
+
Keyword Search
+
Metadata Filtering
+
Reranking
```

Retrieval must happen before generation.

---

# 10. Authorization-Aware Retrieval

Never retrieve all documents and filter after the LLM.

Correct:

```text
User
 ↓
Permissions
 ↓
Allowed Knowledge Sources
 ↓
Retriever
 ↓
Authorized Chunks
 ↓
LLM
```

Incorrect:

```text
All Documents
 ↓
LLM
 ↓
Try to hide sensitive information
```

The latter architecture is prohibited.

---

# 11. Grounding Layer

Before the LLM receives context:

```text
Retrieved Chunks
      ↓
Evidence Validator
      ↓
Context Builder
```

The context builder should produce:

```text
SOURCE 1
Document: employee_policy.pdf
Page: 12
Content:
...

SOURCE 2
Document: leave_rules.docx
Section: Annual Leave
Content:
...
```

---

# 12. LLM

The LLM must receive:

* System rules
* Agent instructions
* User question
* Retrieved evidence

It must NOT receive:

* Web search results
* Arbitrary internet content
* Unapproved external context

---

# 13. Structured Responses

The LLM should return structured output.

Conceptually:

```json
{
  "answer": "...",
  "confidence": "supported",
  "citations": [],
  "visualization": null,
  "table": null
}
```

The backend validates this schema before rendering.

---

# 14. Charts

Charts should be produced from structured data.

```text
Retrieved Evidence
       ↓
Data Extraction
       ↓
Structured Dataset
       ↓
Chart Specification
       ↓
Frontend Chart
```

Do not let the LLM directly generate executable JavaScript.

---

# 15. Agent Engine

```text
Agent
 ├── Instructions
 ├── Knowledge Sources
 ├── Permissions
 ├── Output Schema
 ├── UI Configuration
 └── Model Configuration
```

The agent engine merges:

```text
Global Security Rules
+
Global RAG Rules
+
Agent Rules
+
Retrieved Knowledge
+
User Query
```

Global rules always override agent instructions.

---

# 16. Admin Agent Builder

```text
Natural Language
       ↓
Agent Configuration Generator
       ↓
Validation
       ↓
Preview
       ↓
Admin Approval
       ↓
Version
       ↓
Publish
```

Agent generation must never directly modify production configuration without approval.

---

# 17. Database

Use PostgreSQL for:

* Users
* Roles
* Agents
* Agent versions
* Knowledge sources
* Documents
* Chunks metadata
* Queries
* Audit events
* Sync jobs
* System configuration

Vector storage can initially use PostgreSQL + pgvector.

---

# 18. Object Storage

Do not unnecessarily duplicate SharePoint files.

If temporary storage is required:

* Encrypt at rest
* Short TTL
* Delete after processing
* Do not expose public URLs

---

# 19. Async Workers

Use:

```text
Redis
+
Celery / Dramatiq / equivalent worker
```

Workers handle:

* SharePoint synchronization
* File parsing
* Embedding
* Re-indexing
* Cleanup
* Analytics aggregation

---

# 20. Deployment

Recommended production architecture:

```text
Cloud Load Balancer
        ↓
Next.js
        ↓
FastAPI
        ↓
Redis
        ↓
Workers
        ↓
PostgreSQL + pgvector
        ↓
Encrypted temporary storage
```

All services should communicate over private networking wherever possible.
