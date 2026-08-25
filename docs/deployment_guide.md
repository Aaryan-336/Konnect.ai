# 100% Free-Tier Deployment Plan (No Docker Needed)

This guide shows you how to deploy the entire Konnect 2.0 application directly using **native managed runtimes** (Python on Render + Next.js on Vercel + Managed Postgres on Supabase) — **without touching Docker or containers**.

---

## 🏗️ Architecture & Services

```mermaid
flowchart TD
    User([User / RM Browser]) -->|HTTPS / Next.js| Vercel[Vercel Free Tier\nFrontend Hosting (Native Next.js)]
    Vercel -->|REST & SSE Streams| Render[Render.com Free Tier\nNative Python 3 Web Service]
    Render -->|pgvector SQL Queries| Supabase[Supabase Free Tier\nManaged PostgreSQL + pgvector]
    Render -->|AI Inference| Groq[Groq API Free Tier\ngpt-oss-120b + Whisper]
```

| Component | Platform | Deployment Method | Free Tier Allowance | Cost |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | **[Vercel](https://vercel.com)** | Native Next.js git push | Unlimited personal projects, Global Edge CDN | **$0 / mo** |
| **Backend API** | **[Render.com](https://render.com)** | Native Python 3 runtime | 512 MB RAM, free HTTPS domain | **$0 / mo** |
| **Database** | **[Supabase](https://supabase.com)** | Managed PostgreSQL | 500 MB DB, native pgvector extension | **$0 / mo** |
| **AI (LLM & STT)**| **[Groq Cloud](https://console.groq.com)** | API Key | Free daily request quota | **$0 / mo** |

---

## 📋 Simple 4-Step Setup

### Step 1: Create Free Vector Database (Supabase)
1. Go to [supabase.com](https://supabase.com) and create a free project named `konnect-db`.
2. Go to the **SQL Editor** tab in the Supabase dashboard and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Go to **Project Settings** → **Database** → **Connection String** → Select **URI** (choose Session/Transaction Pooler, port 6543) and copy it.

---

### Step 2: Deploy Backend to Render (Native Python)
1. Push your code to your **GitHub** repository.
2. Sign in to [render.com](https://render.com) and click **"New +"** → **"Web Service"**.
3. Connect your GitHub repository.
4. Fill in the service settings:
   - **Name:** `konnect-backend`
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`  *(No Docker)*
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** `Free`
5. Under **Environment Variables**, add:
   - `DATABASE_URL`: `postgresql+asyncpg://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres`
   - `DATABASE_URL_SYNC`: `postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres`
   - `GROQ_API_KEY`: `gsk_your_groq_api_key_here`
   - `GROQ_MODEL`: `openai/gpt-oss-120b`
   - `JWT_SECRET_KEY`: *(generate any 32-character random string)*
   - `CORS_ORIGINS`: `https://your-frontend.vercel.app,http://localhost:3000`
   - `EMBEDDING_PROVIDER`: `fastembed`
   - `EMBEDDING_MODEL`: `BAAI/bge-small-en-v1.5`
   - `STT_PROVIDER`: `groq`
   - `APP_ENV`: `production`
6. Click **"Create Web Service"**. Render will install the packages and give you a public URL (e.g. `https://konnect-backend.onrender.com`).

---

### Step 3: Deploy Frontend to Vercel (Native Next.js)
1. Sign in to [vercel.com](https://vercel.com) and click **"Add New..."** → **"Project"**.
2. Select your GitHub repository.
3. Settings:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `frontend`
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL`: `https://konnect-backend.onrender.com` (from Step 2)
5. Click **"Deploy"**. Vercel will build the Next.js app in ~1 minute.

---

### Step 4: Initialize the Database
1. Run the database seed once from your local computer pointing to Supabase:
   ```bash
   DATABASE_URL="postgresql+asyncpg://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres" python backend/scripts/init_db.py
   ```
2. Open your Vercel URL, log in with `admin@knowledgehub.ai` / `ASK30`, and upload your knowledge sources in the Knowledge tab.
