# Deploy watch parties (Supabase + Render + Vercel)

Use this checklist after the repo builds locally (`npm run build`).

## 1. Supabase database

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Paste and run the full file [`supabase/migrations/setup_all.sql`](../supabase/migrations/setup_all.sql)  
   (safe to re-run; creates `custom_*` and `collab_*` tables).
3. Copy **Project URL** and **service_role** key into `backend/.env`:

   ```env
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

4. Verify from the repo root:

   ```powershell
   npm run check:collab-schema --workspace backend
   ```

   Exit code `0` means `collab_sessions`, `collab_members`, and `collab_item_progress` are reachable.

## 2. Backend (Render)

1. Push this repo to `https://github.com/shubhamr31/MCU_watchlist.git` (includes restored `package.json`, utils, `main.jsx`, `render.yaml`).
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** or **Web Service**:
   - Root directory: `backend`
   - Build: `npm install`
   - Start: `npm start`
3. Environment variables (same as `backend/.env.example`):
   - `OMDB_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. After deploy, open `https://<your-service>.onrender.com/health` → should return `{ "ok": true }`.
5. Confirm session routes exist (401 without auth is OK):

   ```text
   GET  /api/session/mine
   POST /api/session
   POST /api/session/join
   ```

## 3. Frontend (Vercel)

Project: **thesacredtimeline** (see `frontend/.vercel/project.json`).

1. **Settings → Environment Variables**:
   - `VITE_API_BASE_URL` = your Render backend URL (no trailing slash)
   - `VITE_GOOGLE_CLIENT_ID` = same OAuth client as backend
2. Redeploy production (push to `main` or **Redeploy** in Vercel).
3. Optional: point custom domain `thesacredtimeline.vercel.app` at the latest deployment.

## 4. Smoke test watch parties

1. Open the Vercel URL → **Sign in** (Google or username/passkey).
2. **Watch party** → create party → copy invite link (`?join=XXXXXX`).
3. Second browser/incognito → sign in as another user → open invite link → join.
4. Mark one title **Completed** in party A → within ~10s party B should show the same status.

## Local dev

```powershell
npm install
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:5173` · Backend: `http://localhost:4000`

Copy `frontend/.env.example` → `frontend/.env` and set `VITE_API_BASE_URL=http://localhost:4000` when testing parties locally.
