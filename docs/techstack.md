# Technology Stack

## 1. Frontend

### Framework

Next.js

### Language

TypeScript

### UI

Tailwind CSS

### Component Library

shadcn/ui

### Charts

Apache ECharts or Recharts

Preferred:

```text
Apache ECharts
```

Reason:

* Excellent enterprise charts
* Large dataset support
* Interactive visualizations
* Flexible configuration

---

# 2. Backend

```text
Python
FastAPI
Pydantic
Uvicorn
```

FastAPI is preferred because the platform contains:

* RAG
* document processing
* Python AI ecosystem
* asynchronous workloads

---

# 3. Authentication

```text
Microsoft Entra ID
MSAL
OAuth 2.0
OpenID Connect
Authorization Code + PKCE
```

Microsoft recommends authorization-code/PKCE for SPA authentication.

---

# 4. SharePoint

```text
Microsoft Graph API
Microsoft Graph SDK
```

Use Graph to:

* discover sites
* discover libraries
* navigate folders
* retrieve files
* monitor changes
* synchronize documents

Graph supports downloading SharePoint DriveItem content and listing folder children.

---

# 5. Database

```text
PostgreSQL
pgvector
```

Use PostgreSQL as the primary application database.

Use pgvector for initial vector retrieval.

This avoids introducing an unnecessary second database.

---

# 6. Cache

```text
Redis
```

Use for:

* response caching
* session-related ephemeral data
* rate limiting
* job queues
* temporary retrieval state

Never cache sensitive information without an explicit retention policy.

---

# 7. Background Jobs

Recommended:

```text
Celery
Redis
```

Alternative:

```text
Dramatiq
```

---

# 8. Document Processing

Recommended libraries:

```text
PyMuPDF
python-docx
openpyxl
python-pptx
pandas
BeautifulSoup
```

Each parser should be isolated behind a common interface.

Example:

```text
DocumentParser
 ├── PDFParser
 ├── DOCXParser
 ├── XLSXParser
 ├── PPTXParser
 ├── CSVParser
 └── TXTParser
```

---

# 9. Embeddings

Use a high-quality embedding model that can be deployed through an approved enterprise provider.

The embedding provider must be configurable.

Do not hard-code the provider into the application architecture.

---

# 10. LLM

Use a production LLM provider that supports:

* Structured outputs
* Streaming
* Enterprise privacy requirements
* Low latency

The provider must be configurable.

The application must support model abstraction:

```text
LLMProvider
 ├── ProviderA
 ├── ProviderB
 └── LocalModel
```

---

# 11. Reranking

Use a configurable reranker.

Pipeline:

```text
Vector Search
+
Keyword Search
 ↓
Candidate Pool
 ↓
Reranker
 ↓
Top K
```

---

# 12. Retrieval

Use:

```text
pgvector
+
PostgreSQL full-text search
```

This provides:

* semantic retrieval
* lexical retrieval
* metadata filtering
* one primary datastore

---

# 13. Voice

Use a configurable speech-to-text provider.

Requirements:

* streaming if available
* English support
* multilingual support
* enterprise privacy
* low latency

Browser microphone access should be handled using secure browser APIs.

---

# 14. Observability

Use:

```text
OpenTelemetry
Prometheus
Grafana
Structured JSON logs
```

Track:

* request latency
* retrieval latency
* LLM latency
* token usage
* ingestion failures
* synchronization failures
* authorization failures
* model errors

---

# 15. Error Tracking

Use:

```text
Sentry
```

Do not send raw sensitive document contents to error tracking.

---

# 16. Infrastructure

Recommended cloud-neutral architecture:

```text
Next.js
FastAPI
PostgreSQL
Redis
Worker
Object Storage
```

Can be deployed on:

* Azure
* AWS
* GCP
* private infrastructure

For an organization already using Microsoft 365, Azure is the natural production option.

---

# 17. Azure Option

Recommended Azure services:

```text
Azure Container Apps / AKS
Azure Database for PostgreSQL
Azure Cache for Redis
Azure Blob Storage
Microsoft Entra ID
Azure Key Vault
Azure Monitor
Application Insights
```

---

# 18. Secrets

Use:

```text
Azure Key Vault
```

Never store:

* client secrets
* API keys
* database passwords
* encryption keys

inside source code or frontend environment variables.

---

# 19. CI/CD

Use:

```text
GitHub
GitHub Actions
Docker
```

Production deployments should require:

* tests
* linting
* type checking
* security scanning
* dependency scanning
* migration checks

---

# 20. Recommended Final Stack

```text
Frontend
Next.js + TypeScript + Tailwind + shadcn/ui

Backend
FastAPI + Python

Auth
Microsoft Entra ID + MSAL

SharePoint
Microsoft Graph

Database
PostgreSQL + pgvector

Cache
Redis

Workers
Celery

Documents
PyMuPDF + python-docx + openpyxl + python-pptx + pandas

Retrieval
Hybrid Vector + PostgreSQL FTS + Reranker

LLM
Configurable enterprise LLM provider

Voice
Configurable enterprise STT provider

Charts
Apache ECharts

Observability
OpenTelemetry + Grafana + Prometheus

Security
Azure Key Vault + Entra ID

Deployment
Azure Container Apps / AKS
```
