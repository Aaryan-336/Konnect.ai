# RAG Specification

## 1. Objective

Create a fast, deterministic, source-grounded retrieval system.

---

# 2. Pipeline

```text
Question
 ↓
Normalize
 ↓
Classify
 ↓
Generate retrieval queries
 ↓
Hybrid retrieval
 ↓
Metadata filtering
 ↓
Reranking
 ↓
Evidence validation
 ↓
Context construction
 ↓
LLM
 ↓
Citation validation
 ↓
Response
```

---

# 3. Query Processing

The query processor may:

* normalize spelling
* identify entities
* identify dates
* identify requested metrics
* identify filters
* generate search variants

It must not search the internet.

---

# 4. Retrieval

Use:

```text
Semantic Search
+
Keyword Search
+
Metadata Filtering
+
Reranking
```

---

# 5. Chunking

Chunks should preserve semantic boundaries.

Prefer:

```text
Document
 ↓
Section
 ↓
Paragraph
 ↓
Chunk
```

Avoid blindly splitting every document into fixed token lengths.

---

# 6. Chunk Metadata

Every chunk:

```text
chunk_id
document_id
tenant_id
source_id
page
section
file_name
file_path
content_hash
embedding
created_at
updated_at
```

---

# 7. Retrieval Filters

Before searching:

```text
tenant_id
agent_id
knowledge_source_id
user_permissions
```

must be applied.

---

# 8. Top K

Initial configuration:

```text
Candidate retrieval: 20–50
Reranked: 5–10
LLM context: 3–8
```

Tune based on evaluation.

---

# 9. Reranking

Reranking should consider:

* semantic relevance
* keyword relevance
* document authority
* recency when relevant
* section relevance

---

# 10. Context Construction

Context should contain:

```text
Document
Page
Section
Relevant content
Source ID
```

Avoid sending entire documents to the LLM.

---

# 11. Evidence Threshold

If retrieval confidence is below the configured threshold:

```text
NO_ANSWER
```

The threshold should be configurable per agent.

---

# 12. Answer Generation

The LLM must:

* answer only from context
* cite evidence
* distinguish inference
* refuse unsupported claims
* follow agent formatting instructions

---

# 13. Citation Validation

After generation:

```text
Answer
 ↓
Citation Validator
 ↓
Are citations valid?
 ↓
Yes → return
No → regenerate/fail safely
```

---

# 14. Structured Data

For analytical questions:

```text
Question
 ↓
Retrieve source data
 ↓
Extract values
 ↓
Validate values
 ↓
Perform deterministic calculations
 ↓
Generate visualization specification
 ↓
Render chart
```

---

# 15. No Fabricated Data

The LLM must never generate a value that is not:

* explicitly present
* or mathematically derived from source values

---

# 16. Numerical Questions

Use backend calculation for:

* totals
* averages
* percentages
* ratios
* growth
* differences
* ranking

---

# 17. Conversation Context

Conversation history may be used for conversational continuity.

However, previous model responses must never be treated as authoritative knowledge.

If the user asks:

> What was that number again?

the system should use conversation context only to resolve the reference, then verify the factual value against the knowledge source where necessary.

---

# 18. Knowledge Freshness

Every answer should be traceable to a document version.

When a document changes, old chunks must be replaced or versioned according to the configured policy.

---

# 19. Evaluation

Create a golden dataset containing:

* questions
* expected sources
* expected facts
* expected refusal cases

Measure:

```text
Retrieval Recall
Retrieval Precision
Citation Accuracy
Groundedness
No-answer Accuracy
Latency
```
