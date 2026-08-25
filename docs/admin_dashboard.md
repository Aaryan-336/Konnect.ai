# Admin Dashboard Specification

## 1. Overview

The admin dashboard is the operational control center.

---

# 2. Overview Cards

Display:

```text
Total Users
Active Users
Total Queries
Average Response Time
Documents
Indexed Documents
Agents
Knowledge Sources
```

---

# 3. Query Analytics

Charts:

- queries/day
- queries/hour
- queries by agent
- queries by user
- no-answer percentage
- average latency

---

# 4. Knowledge Analytics

Display:

```text
Total Files
Indexed
Processing
Failed
Deleted
Unsupported
```

---

# 5. Synchronization

For each source:

```text
Last successful sync
Last attempted sync
Files added
Files modified
Files deleted
Failures
Current status
```

---

# 6. Agent Analytics

Show:

```text
Agent
Queries
Users
Average latency
No-answer rate
User rating
```

---

# 7. Security Analytics

Show:

```text
Failed logins
Authorization failures
Admin actions
Permission changes
Suspicious events
```

---

# 8. Query Explorer

Admin can inspect:

```text
Query
User
Agent
Timestamp
Latency
Retrieved documents
Citations
Result
```

Raw sensitive content should be hidden by default.

---

# 9. Knowledge Explorer

Admin can browse:

```text
Source
 └── Folder
      └── File
           └── Chunks
```

Show indexing health.

---

# 10. Agent Manager

Admin can:

- create
- test
- publish
- version
- rollback
- archive

agents.

---

# 11. System Health

Show:

```text
API
Database
Redis
Workers
SharePoint Sync
LLM
Embedding Service
Voice Service
```

---

# 12. Alerts

Alert on:

- sync failures
- repeated LLM failures
- database problems
- abnormal latency
- unusual authentication failures
- indexing failures