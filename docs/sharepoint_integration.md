# SharePoint Integration Specification

## 1. Objective

SharePoint is the primary and authoritative knowledge repository.

The application must allow an administrator to connect a specific SharePoint location and continuously synchronize it.

---

# 2. Integration

Use:

```text
Microsoft Graph API
```

Microsoft Graph supports files in SharePoint document libraries through Drive and DriveItem resources.

---

# 3. Admin Flow

```text
Admin
 ↓
Connect Microsoft 365
 ↓
Authenticate with Entra ID
 ↓
Select Site
 ↓
Select Document Library
 ↓
Select Folder
 ↓
Configure Sync
 ↓
Confirm
 ↓
Initial Index
```

---

# 4. Source Configuration

Store:

```text
source_id
tenant_id
site_id
drive_id
folder_id
folder_path
display_name
sync_status
delta_token
last_sync_at
created_at
updated_at
```

---

# 5. Folder Browser

The admin UI should display:

```text
SharePoint Site

Finance
 ├── Reports
 │    ├── 2025
 │    └── 2026
 ├── Policies
 └── Presentations
```

Admin chooses the folder that becomes the knowledge source.

---

# 6. Initial Synchronization

Process:

```text
Selected Folder
 ↓
Discover files
 ↓
Download files
 ↓
Parse
 ↓
Chunk
 ↓
Embed
 ↓
Index
```

Graph supports listing children of folders and downloading DriveItem content.

---

# 7. Incremental Synchronization

Use Microsoft Graph delta.

```text
Initial Sync
 ↓
Save deltaLink
 ↓
Change Notification
 ↓
Call deltaLink
 ↓
Receive changes
 ↓
Process changes
 ↓
Save new deltaLink
```

Graph's DriveItem delta API is designed to track created, modified and deleted items.

---

# 8. Deleted Files

If a file is deleted:

```text
deleted event
 ↓
mark document deleted
 ↓
remove/deactivate chunks
 ↓
remove vector
```

The deleted document must no longer be retrievable.

---

# 9. Modified Files

Use content hash.

```text
File changed
 ↓
Compare hash
 ↓
If changed:
    Reprocess
Else:
    Skip
```

---

# 10. Sync Reliability

Handle:

- pagination
- retries
- 429
- 503
- expired delta tokens
- authentication errors
- malformed files
- unsupported formats

Microsoft Graph recommends honoring `Retry-After` on throttling and using backoff strategies.

---

# 11. Sync Status

Possible states:

```text
CONNECTED
SYNCING
HEALTHY
PARTIAL_FAILURE
FAILED
PAUSED
DISCONNECTED
```

---

# 12. File Status

```text
DISCOVERED
DOWNLOADING
PROCESSING
INDEXED
UPDATED
FAILED
DELETED
UNSUPPORTED
```

---

# 13. Admin File View

Show:

```text
File
Type
Size
Modified
Status
Last Indexed
Chunks
Error
```

---

# 14. Knowledge Source Permissions

A knowledge source must be explicitly assigned to agents.

An agent should not automatically gain access to every SharePoint source.

---

# 15. Access Control

The integration must use the least-privilege permissions possible.

Do not use tenant-wide permissions unnecessarily.

---

# 16. Source Removal

When an admin removes a source:

```text
Disable retrieval
 ↓
Stop synchronization
 ↓
Remove/deactivate indexed chunks
 ↓
Remove source configuration
```

Use a safe deletion workflow with confirmation.