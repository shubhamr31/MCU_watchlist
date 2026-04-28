# MCU Watchlist V1

React + Express app for tracking MCU rewatch progress without login.

## What V1 includes

- Arc-based MCU schedule loaded from your source HTML.
- Film/show filtering and title search.
- Three-state progress per item: `Not started`, `Watching`, `Completed`.
- Local persistence via browser storage (refresh-safe on same browser/profile).
- Backend scaffold with `/health` and `/api/schema`.

## Project structure

- `frontend`: React/Vite UI.
- `backend`: Express API scaffold.
- `shared/contracts.js`: shared schema and future collaboration model contracts.

## V2 collaboration path (planned)

V1 is local-only. To enable friend collaboration through share links in V2:

1. Create a `ShareSession` record with `sessionId` and join code.
2. Store canonical progress in backend DB keyed by `sessionId + itemId`.
3. Add endpoints:
   - `POST /api/session`
   - `POST /api/session/:id/join`
   - `GET /api/session/:id/progress`
   - `PATCH /api/session/:id/progress/:itemId`
4. Migrate local progress by prompting user to import local state into a selected session.
5. Add conflict policy based on `updatedAt` (last-write-wins for V2 baseline).

## Run notes

Node.js/npm are required to run this app. If not installed, install Node LTS first, then:

```bash
npm install
npm run dev:frontend
npm run dev:backend
```

## IMDb-aware poster API setup

The app now uses the backend `/api/poster` endpoint backed by OMDb (includes IMDb IDs and poster URLs).

1. Get a free OMDb API key from [https://www.omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx).
2. Start backend with `OMDB_API_KEY` set.

PowerShell example:

```powershell
$env:OMDB_API_KEY=\"your_key_here\"
npm run dev:backend
```

When no API key or no poster match is found, UI falls back to local static posters for movies.

## One-click launch package (Windows)

Use files in `oneclick` to start the app next time with a single click:

- `oneclick/Open-MCU-Watchlist.bat`: double-click to launch backend + frontend and open browser.
- `oneclick/Install-Desktop-Shortcut.ps1`: run once to create a desktop shortcut named `MCU Watchlist`.

PowerShell command to create shortcut:

```powershell
powershell -ExecutionPolicy Bypass -File .\oneclick\Install-Desktop-Shortcut.ps1
```

## Free hosting to share with friends

Recommended free setup:

- **Backend (Express):** Render (free web service)
- **Frontend (React/Vite):** Vercel (free static hosting)

### 1) Backend on Render

1. Push project to GitHub.
2. In Render, create a **Web Service** from this repo.
3. Settings:
   - Root directory: `backend`
   - Build command: `npm install`
   - Start command: `npm start`
4. Add environment variable:
   - `OMDB_API_KEY=<your_key>`
5. Deploy and copy backend URL (example: `https://your-backend.onrender.com`).

### 2) Frontend on Vercel

1. In Vercel, import the same repo.
2. Set project root to `frontend`.
3. Build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Add environment variable:
   - `VITE_API_BASE_URL=https://your-backend.onrender.com`
5. Deploy and open generated Vercel URL.

### 3) Share

- Share your Vercel link with friends.
- They can use the app directly in browser (mobile + desktop).

### Notes

- Frontend now reads API URL from `VITE_API_BASE_URL` (see `frontend/.env.example`).
- On free plans, Render may sleep when idle; first API request can take a short time to wake up.

