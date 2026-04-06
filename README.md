# NewsFilter

Finance-first NewsFilter for macro, commodities, equities, and crypto intelligence.

## Stack
- React + Vite client
- Express + TypeScript API
- Postgres + Drizzle ORM
- Hourly scheduler with `node-cron`
- OpenAI summarization with top-k gating and cache reuse

## Core behavior
- Invite-only team onboarding
- Email/password login with roles (`admin`, `member`)
- Personal + shared topics with windows (`24h`, `7d`, `30d`)
- Google News RSS + custom RSS ingestion
- Precision-first vetting (`market impact + keyword match + freshness + source trust`)
- Top 15 vetted candidates/topic/run, summarize top 5
- In-app inbox only (no outbound email)

## Quick start
```powershell
npm install
Copy-Item .env.example .env
npm run db:push
npm run dev
```

Open `http://localhost:5173`.

## Seed admin
Set in `.env`:
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

On first startup, admin account is created automatically if missing.

## Required env vars
- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_BASE_URL`
- `OPENAI_SUMMARY_MODEL`
- `OPENAI_API_KEY` (optional; fallback extractive summaries if omitted)

## Scripts
- `npm run dev` - API + client in development
- `npm run check` - Typecheck
- `npm test` - Unit/integration test suite
- `npm run build` - Frontend build
- `npm run start` - Start server (tsx runtime)
- `npm run start:render` - Push DB schema, then start production server
- `npm run db:push` - Push Drizzle schema to Postgres

## Deploy on Render
1. Push this project to a GitHub repo/branch.
2. In Render, create a new Blueprint and point it at that repo (Render reads `render.yaml`).
3. After first deploy, set `APP_BASE_URL` to your live Render URL (`https://<your-service>.onrender.com`) and redeploy.
4. Log in with your seeded admin account, then create invites from **Admin**.

## API surfaces
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/invites/accept`
- Admin: `GET /api/admin/users`, `GET /api/admin/invites`, `POST /api/admin/invites`
- Topics: `GET/POST/PATCH/DELETE /api/topics`, `POST /api/topics/:id/backfill`
- Watch topics: `GET/POST/PATCH/DELETE /api/watch-topics`
- Feeds: `GET/POST/PATCH/DELETE /api/feeds`
- Inbox/jobs: `GET /api/inbox`, `POST /api/inbox/:itemId/read`, `GET /api/jobs/latest`
