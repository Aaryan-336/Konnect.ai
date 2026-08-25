# Observability Specification

## 1. Goal

The system must make it possible to understand:

- what happened
- when it happened
- why it happened
- how long it took
- where it failed

---

# 2. Trace ID

Every request receives:

```text
trace_id
```

Example:

```text
User Query
 ↓
API
 ↓
Retriever
 ↓
Reranker
 ↓
LLM
 ↓
Renderer
```

All stages share the trace.

---

# 3. Metrics

Track:

```text
request_count
request_latency
retrieval_latency
reranking_latency
llm_latency
embedding_latency
voice_latency
sync_latency
error_rate
no_answer_rate
citation_failure_rate
```

---

# 4. RAG Metrics

Track:

```text
retrieval_recall
retrieval_precision
average_retrieval_score
average_rerank_score
groundedness
citation_accuracy
```

---

# 5. Infrastructure

Monitor:

```text
CPU
RAM
disk
database connections
Redis memory
worker queue
API throughput
```

---

# 6. Logging

Use structured JSON.

Example:

```json
{
  "timestamp": "...",
  "level": "INFO",
  "service": "rag-api",
  "trace_id": "...",
  "event": "retrieval_complete",
  "latency_ms": 184
}
```

Never include sensitive document content unnecessarily.

---

# 7. Alerts

Create alerts for:

```text
API error rate > threshold
Database unavailable
SharePoint sync failed
Worker queue growing
LLM unavailable
Embedding service unavailable
High authorization failure rate
```