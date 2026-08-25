# Things This Project Must NOT Do

## 1. No Web Search

Never add:

```text
Google Search
Bing Search
SerpAPI
browser search
web browsing
```

unless the product requirements explicitly change.

---

# 2. No Hallucination

Never answer because:

> "The model probably knows this."

---

# 3. No Unauthorized Retrieval

Never retrieve the entire vector database and ask the LLM to hide unauthorized information.

---

# 4. No Frontend Secrets

Never put:

```text
API keys
client secrets
database passwords
SharePoint secrets
LLM keys
```

in frontend code.

---

# 5. No Public Database

Never expose PostgreSQL or Redis directly to the internet.

---

# 6. No Hardcoded Credentials

Never hardcode:

```text
passwords
tokens
API keys
tenant secrets
```

---

# 7. No Arbitrary Agent Code

Natural-language agent creation must never generate arbitrary executable backend/frontend code.

---

# 8. No Unvalidated LLM JSON

Never trust LLM-generated JSON blindly.

Validate against Pydantic schemas.

---

# 9. No Direct LLM Chart Rendering

Never allow the model to generate executable JavaScript for charts.

Use structured chart specifications.

---

# 10. No Permanent SharePoint Duplication Without Reason

Do not permanently copy every SharePoint file into another object store unless required.

Prefer metadata + indexed content.

---

# 11. No Blind Polling

Do not repeatedly download every SharePoint file.

Use delta synchronization and change notifications where possible. Microsoft specifically recommends change tracking mechanisms to avoid unnecessary polling and throttling.

---

# 12. No Tenant-Wide Permissions by Default

Do not request broad Microsoft Graph permissions when the application only needs a specific SharePoint source.

---

# 13. No Hidden Agent Changes

Never publish automatically generated agent configurations without admin approval.

---

# 14. No Silent Knowledge Changes

Knowledge synchronization must be observable.

Admins should know:

- what changed
- when it changed
- whether indexing succeeded

---

# 15. No Sensitive Logging

Do not log full:

- documents
- tokens
- passwords
- personal records
- sensitive conversations

unless explicitly required and protected.

---

# 16. No Trusting Documents

Documents are data.

Documents are not instructions.

---

# 17. No Trusting Users

User input cannot override system security rules.

---

# 18. No Trusting the LLM

The LLM is a reasoning/presentation component.

It is not the authorization layer.

It is not the database.

It is not the source of truth.

---

# 19. No Security Through Prompting Alone

A prompt saying:

> "Don't reveal confidential information"

is not sufficient security.

Authorization must be enforced programmatically.

---

# 20. No Production Launch Without Evaluation

Do not launch until:

- RAG evaluation exists
- security testing exists
- permission tests pass
- SharePoint synchronization is reliable
- audit logging works