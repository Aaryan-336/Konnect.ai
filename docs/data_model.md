# Data Model

## 1. Core Tables

```text
users
roles
user_roles

tenants
knowledge_sources
documents
document_versions
document_chunks

agents
agent_versions
agent_knowledge_sources

conversations
messages
queries

query_retrievals
query_citations

sync_jobs
sync_events

audit_logs

system_settings
```

---

# 2. Users

```text
id
tenant_id
entra_user_id
email
display_name
status
created_at
updated_at
```

---

# 3. Knowledge Sources

```text
id
tenant_id
name
provider
site_id
drive_id
folder_id
folder_path
status
delta_token
last_sync_at
created_at
updated_at
```

---

# 4. Documents

```text
id
tenant_id
source_id
external_file_id
name
path
mime_type
size
content_hash
sharepoint_modified_at
indexed_at
status
created_at
updated_at
```

---

# 5. Document Versions

```text
id
document_id
version
content_hash
modified_at
indexed_at
status
```

---

# 6. Document Chunks

```text
id
document_id
version_id
chunk_index
content
page
section
metadata
embedding
created_at
```

---

# 7. Agents

```text
id
tenant_id
name
description
status
current_version_id
created_by
created_at
updated_at
```

---

# 8. Agent Versions

```text
id
agent_id
version
instructions
output_schema
ui_config
model_config
status
created_by
created_at
```

---

# 9. Agent Knowledge Sources

```text
agent_id
knowledge_source_id
```

---

# 10. Conversations

```text
id
tenant_id
user_id
agent_id
created_at
updated_at
```

---

# 11. Messages

```text
id
conversation_id
role
content
created_at
```

---

# 12. Queries

```text
id
tenant_id
user_id
agent_id
conversation_id
query
trace_id
latency_ms
status
created_at
```

---

# 13. Query Retrievals

```text
id
query_id
chunk_id
rank
retrieval_score
rerank_score
created_at
```

---

# 14. Audit Logs

```text
id
tenant_id
user_id
action
resource_type
resource_id
result
trace_id
created_at
```

Sensitive payloads should not be stored unnecessarily.