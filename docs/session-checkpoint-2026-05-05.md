# Session checkpoint — 5 May 2026

Permanent record of project state and outcomes from this development session (code + deployment). This file is versioned in git; the full Cursor conversation remains in the Cursor app (history / starred chats).

## Production

- **Live site:** [https://thesacredtimeline.vercel.app](https://thesacredtimeline.vercel.app)
- **Vercel project name:** `thesacredtimeline` (scope: `shubham-raskonda-s-projects`)
- Production alias was pointed at the latest deployment after the TVA theme; stray `frontend-ten-beta-13.vercel.app` alias was removed.

## Git milestones (newest first)

| Commit     | Summary |
|-----------|---------|
| `9236799` | TVA theme: IBM Plex Sans/Mono, orange–cream–teal palette (`frontend/index.html`, `frontend/src/styles.css`, `frontend/src/App.jsx`). |
| `52fd616` | Ignore local Vercel link folder: `frontend/.gitignore` → `.vercel`. |
| `49ff97e` | **V2 schedule:** Pre Endgame / Post Endgame timelines, Spider-Man support filter + marks, Brand New Day labeling removed from UI copy. |

**Tag:** `V2` — points at `49ff97e` (V2 schedule checkpoint). TVA + infra commits came after; see table above.

## Product changes (concise)

1. **Schedule:** First merged arc split renamed to **Pre Endgame** and **Post Endgame**; `Avengers: Endgame` remains end of Pre Endgame; Doomsday arc unchanged in data.
2. **Spider-Man path:** No separate “Brand New Day” arc; spider icon on support picks; filter **Spider-Man support only**.
3. **Theme:** TVA-inspired global styling and fonts (see `frontend/src/styles.css`).

## Remote backup

Repository remote: `origin` → `https://github.com/shubhamr31/MCU_watchlist.git`  
After this checkpoint, `main` and tags were pushed so GitHub holds the same history.

## Preserving the chat itself

- Cursor retains chat threads in the product UI; **star** or **export** the conversation from Cursor if you want a personal archive outside the repo.
- This document intentionally does **not** duplicate the full transcript; it anchors **what shipped** and **where** it lives.
