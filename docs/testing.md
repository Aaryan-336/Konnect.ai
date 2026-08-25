# Testing Strategy

## 1. Unit Tests

Test:

- parsers
- chunking
- hashing
- calculations
- permission logic
- metadata filters
- API validation

---

# 2. Integration Tests

Test:

```text
Entra ID
SharePoint
Graph
PostgreSQL
Redis
LLM
Embedding
```

---

# 3. RAG Tests

Create a golden dataset.

Each test contains:

```text
Question
Expected document
Expected answer facts
Expected citation
Expected refusal
```

---

# 4. Grounding Tests

Test questions where:

- answer exists
- answer partially exists
- answer does not exist
- conflicting documents exist
- outdated document exists

---

# 5. Security Tests

Test:

- unauthorized document access
- cross-tenant access
- role escalation
- prompt injection
- malicious documents
- XSS
- CSRF
- token theft
- rate limiting

---

# 6. SharePoint Tests

Test:

- new file
- modified file
- deleted file
- renamed file
- moved file
- nested folder
- unsupported file
- corrupted file
- expired delta token
- Graph throttling

---

# 7. Agent Tests

Test:

- agent creation
- agent editing
- publishing
- rollback
- knowledge assignment
- permission enforcement

---

# 8. Performance Tests

Test:

```text
1 user
10 users
100 users
500 users
1000 users
```

Measure:

- P50 latency
- P95 latency
- P99 latency
- throughput
- retrieval latency

---

# 9. Voice Tests

Test:

- quiet environment
- noisy environment
- accents
- long queries
- short queries
- multilingual input

---

# 10. Acceptance Criteria

A release is acceptable only when:

- unauthorized data cannot be retrieved
- unsupported answers are refused
- citations are accurate
- SharePoint synchronization works
- deleted files disappear from retrieval
- agent permissions work
- admin audit logs work
- response latency meets target