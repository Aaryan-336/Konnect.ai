# Deployment Specification

## 1. Environment

Maintain:

```text
development
staging
production
```

Never use production SharePoint data for development unless explicitly approved and protected.

---

# 2. Production Architecture

```text
Internet
   ↓
WAF / Load Balancer
   ↓
Next.js
   ↓
FastAPI
   ↓
Private Services
 ├── PostgreSQL
 ├── Redis
 └── Workers
```

---

# 3. Azure Deployment

Preferred for Microsoft 365 environments:

```text
Azure Container Apps
Azure Database for PostgreSQL
Azure Cache for Redis
Azure Key Vault
Azure Blob Storage
Microsoft Entra ID
Azure Monitor
```

---

# 4. Secrets

Secrets are stored in:

```text
Azure Key Vault
```

Applications receive secrets through managed identity where possible.

---

# 5. Database

Database must:

- use TLS
- require authentication
- restrict network access
- use backups
- use point-in-time recovery where available

---

# 6. CI/CD

Pipeline:

```text
Commit
 ↓
Lint
 ↓
Unit Tests
 ↓
Security Scan
 ↓
Build
 ↓
Integration Tests
 ↓
Deploy Staging
 ↓
Smoke Test
 ↓
Production Approval
 ↓
Deploy Production
```

---

# 7. Database Migrations

Use controlled migrations.

Never automatically destroy production tables.

---

# 8. Rollback

Every deployment must support rollback.

Agent versions must also support rollback.

---

# 9. Monitoring

Production deployment is incomplete until monitoring and alerts are configured.