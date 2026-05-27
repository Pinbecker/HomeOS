# CLAUDE.md — Instructions for Claude Code

## What this project is

HomeApp ("HomeOS") is a **private family life hub** for two users: Dan and Imogen.
It is a shared brain for household admin, planning, entertainment, and memories.

It is NOT a generic productivity app. It should feel warm and personal, like a shared home rather than a work tool.

**The most important users:** Dan (technical, primary developer) and Imogen (non-technical, iPhone primary, uses iOS shared calendar heavily). Every UI decision should pass the "would Imogen find this obvious?" test.

## Tech stack

- **Frontend:** Vite React PWA, TypeScript
- **Backend:** Fastify API in `apps/server`
- **Database:** SQLite via Drizzle ORM (WAL mode, file at `/data/db/homeapp.db`)
- **Styling:** Tailwind CSS
- **Auth:** better-auth (email/password for Dan, magic link for Imogen)
- **Migrations:** drizzle-kit (run automatically at container start)
- **Background jobs:** timers within the API process
- **File storage:** Local disk at `/data/files/` (Docker volume)
- **Reverse proxy:** Caddy (production)
- **Package manager:** pnpm

## Current repo rule

This repo no longer contains the old root Next.js application. The live app is only the Vite/Fastify workspace under `apps/`.

Do not recreate or edit root `app/`, root `components/`, `next.config.ts`, `next-env.d.ts`, or root `public/`. UI work belongs in `apps/web`. API, sync, auth routing, weather, and background jobs belong in `apps/server` or shared packages.

## Project structure

```
/
├── apps/
│   ├── web/                # Vite React PWA and client-side routes
│   └── server/             # Fastify API, sync, weather, jobs
├── packages/
│   ├── auth/               # Shared better-auth setup
│   └── db/                 # Drizzle schema and database client
├── lib/db/migrations/      # SQL migrations applied by scripts/migrate.cjs
├── design/                 # HTML design mockups (not part of the app)
├── scripts/                # Operational scripts, including migrations and backups
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── Caddyfile
├── .env.example
└── drizzle.config.ts
```

## Key commands

```bash
pnpm dev                    # Start dev server
pnpm build                  # Production build
pnpm lint                   # TypeScript + ESLint
pnpm db:generate            # Generate Drizzle migration from schema changes
pnpm db:migrate             # Apply pending migrations
pnpm db:studio              # Open Drizzle Studio (DB GUI)
```

## Core architectural decisions

### Database
- SQLite with WAL mode. Never use Postgres/MySQL — this is a private 2-user app.
- Drizzle ORM only. Never write raw SQL for CRUD. Raw SQL is acceptable for complex queries.
- All schema changes go through Drizzle migrations. Never hand-edit the DB.
- Use ULIDs for all primary keys (sortable, client-generatable, avoids sequential enumeration).

### Items model
Everything is an `item` with a `type` discriminator. This is intentional — it allows cross-entity links, unified search, and tagging without schema changes per feature. See `packages/db/src/schema.ts` for the full model. The key types are:
`task | note | inbox | shopping_item | watchlist_film | watchlist_tv | place | gift_idea | meal_idea | memory | document | idea`

### Entity linking
The `entity_links` table links any two items. Always use this for relationships between items rather than adding foreign key columns. Link types: `prep_for | related_to | mentioned_in | grouped_with`.

### Auth
Two users only. Dan uses email/password. Imogen uses magic links (email → tap → logged in). Sessions via HTTP-only secure cookies. Never store session data in localStorage. Use better-auth's built-in session management.

### Frontend
The PWA routes and screens live in `apps/web/src`. The bottom navigation and More menu are in `apps/web/src/screens/bottom-nav.tsx`. Static assets, manifest, service worker, app icons, and weather icons live under `apps/web/public`.

The production Docker image builds the Vite app and serves the built assets from the Fastify server. There is no Next.js runtime in production.

### Files
File uploads are stored at `/data/files/{year}/{month}/{ulid}.{ext}`. File metadata (path, MIME type, size, linked entity) is stored in the `files` table. Never store binary data in SQLite.

### Background jobs
Scheduled jobs live in `apps/server/src/notification-jobs.ts` and are registered from the Fastify server startup path in `apps/server/src/index.ts`. Keep jobs idempotent — they must be safe to run multiple times.

### Real-time sync
Two users, same household. Use Server-Sent Events (SSE) or 30-second polling. No WebSockets. No Redis. No external pub/sub.

## Navigation structure

Five bottom-nav tabs (mobile) / sidebar sections (desktop):
1. **Home** — dashboard, today view, bin day, quick overview
2. **Household** — shopping, tasks, chores, bins, meals
3. **+** (capture) — quick capture button, always visible
4. **Watch** — films, TV, going out, date nights
5. **Life** — plans, people, insurance/admin, documents, memories

## Feature phases

| Phase | Focus |
|-------|-------|
| 0 | Infra, auth, DB, migrations, backup, health check |
| 1 | Dashboard, capture inbox, shopping list, shared tasks, simple notes |
| 2 | Bin tracker, meal plan, multiple lists, tags, search |
| 3 | Insurance/subscriptions/renewals tracker, vehicles, warranties |
| 4 | Film watchlist + TMDB + OneDrive library integration |
| 5 | TV tracking, going out lists, birthdays, gift ideas |
| 6 | Trip planning, household reference, documents |
| 7 | CalDAV read-only integration for iOS shared calendar |
| 8 | Recurring tasks, reminders, email digest |
| 9 | AI capture, Whisper voice transcription, routing |

## What not to do

- Do not add features beyond the current phase without discussing first
- Do not use a different database (no Postgres, no MongoDB)
- Do not use Redux or Zustand — use TanStack Query for server state
- Do not store sensitive data (session tokens, passwords) in localStorage or cookies that aren't HTTP-only
- Do not skip migrations — always use drizzle-kit
- Do not make the UI feel like enterprise software
- Do not add CalDAV write operations without explicit discussion — Imogen relies on her iOS calendar
- Do not expose stack traces or internal errors to the client
- Do not add AI features without implementing the `ai_jobs` confirmation flow

## UX rules

- Every action must be reachable in ≤ 2 taps on mobile
- Quick capture must open in < 200ms
- The shopping list must work offline (service worker + optimistic updates)
- Never show jargon. "Lists" not "collections". "Save idea" not "create entity".
- Error messages must say what to do, not what went wrong technically.
- The "pass the Imogen test": if a non-technical person would be confused, simplify it.
