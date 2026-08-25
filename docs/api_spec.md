# API Specification

## 1. Authentication

```text
GET /auth/me
POST /auth/logout
```

---

# 2. Agents

```text
GET    /api/agents
GET    /api/agents/{id}
POST   /api/agents
PATCH  /api/agents/{id}
DELETE /api/agents/{id}

POST   /api/agents/{id}/test
POST   /api/agents/{id}/publish
POST   /api/agents/{id}/archive
```

---

# 3. Natural Language Agent Builder

```text
POST /api/agent-builder/generate
```

Input:

```json
{
  "description": "Create an agent for HR policies"
}
```

Output:

```json
{
  "draft_agent": {},
  "warnings": []
}
```

---

# 4. Chat

```text
POST /api/chat
POST /api/chat/stream
```

Request:

```json
{
  "agent_id": "...",
  "conversation_id": "...",
  "message": "What is the leave policy?"
}
```

---

# 5. Voice

```text
POST /api/voice/transcribe
```

Returns:

```json
{
  "text": "What is the leave policy?"
}
```

---

# 6. Knowledge

```text
GET  /api/knowledge/sources
POST /api/knowledge/sources
GET  /api/knowledge/sources/{id}
PATCH /api/knowledge/sources/{id}
DELETE /api/knowledge/sources/{id}
POST /api/knowledge/sources/{id}/sync
POST /api/knowledge/sources/{id}/pause
POST /api/knowledge/sources/{id}/resume
```

---

# 7. SharePoint Browser

```text
GET /api/sharepoint/sites
GET /api/sharepoint/sites/{site_id}/drives
GET /api/sharepoint/drives/{drive_id}/items
GET /api/sharepoint/items/{item_id}/children
```

---

# 8. Analytics

```text
GET /api/admin/analytics/overview
GET /api/admin/analytics/queries
GET /api/admin/analytics/agents
GET /api/admin/analytics/knowledge
GET /api/admin/analytics/security
```

---

# 9. Audit

```text
GET /api/admin/audit
```

All admin APIs must enforce administrator authorization.