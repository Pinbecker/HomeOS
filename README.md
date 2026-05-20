# HomeApp — Private Family Life Hub

A private, self-hosted shared brain for two people. Household admin, planning, entertainment, and memories — all in one place.

**Status:** Phase 0 (infrastructure setup)  
**Stack:** Next.js · TypeScript · SQLite · Drizzle ORM · Tailwind · Docker · Caddy

---

## What this is

Not a task manager. Not a productivity tool. A private shared hub for the practical and enjoyable parts of life together:

- Shared tasks, shopping lists, and household admin
- Bin day reminders, meal planning, chore tracking
- Film and TV watchlist with local library integration
- Insurance, subscriptions, MOT, and renewal tracking  
- Trip planning, date night ideas, places to go
- Birthdays, gift ideas, and occasion planning
- Family memories, notes, and documents
- Eventually: AI-assisted voice capture and routing

The guiding principle: **reduce cognitive load, not increase it.**

---

## Design concepts

See the [`design/`](./design/) folder for HTML mockups of three visual directions:

- [`concept-1-clean.html`](./design/concept-1-clean.html) — Clean, iOS-inspired, white and minimal
- [`concept-2-warm.html`](./design/concept-2-warm.html) — Warm tones, personal and home-like
- [`concept-3-dark.html`](./design/concept-3-dark.html) — Dark mode, rich and OLED-friendly

Open these in a browser to review before committing to a direction.

---

## Tech stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 14+ (App Router) | Full-stack, excellent PWA support, strong ecosystem |
| Language | TypeScript | Maintainability over years |
| Database | SQLite (WAL mode) | Perfect for 2 users, trivial backup, no server |
| ORM | Drizzle ORM | Lightweight, TypeScript-first, excellent SQLite support |
| Styling | Tailwind CSS + shadcn/ui | Mobile-first, accessible, composable |
| Auth | better-auth | Sessions, magic links, secure cookies out of the box |
| Reverse proxy | Caddy | Auto-HTTPS, zero SSL config |
| Containers | Docker + Docker Compose | Consistent deployment on personal VM |
| Package manager | pnpm | Faster, better disk efficiency |

---

## Getting started (local development)

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker (optional, for testing production setup)

### Bootstrap the Next.js app

The Next.js app hasn't been scaffolded yet. Run this once:

```bash
pnpm create next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"
```

Then install additional dependencies:

```bash
pnpm add drizzle-orm better-sqlite3 better-auth @auth/core
pnpm add node-cron ulid
pnpm add -D drizzle-kit @types/better-sqlite3 @types/node-cron
```

### Set up environment

```bash
cp .env.example .env
# Edit .env with your values
```

### Run locally

```bash
pnpm dev
```

### Run migrations

```bash
pnpm db:migrate
```

---

## Deployment

See [`AGENTS.md`](./AGENTS.md) for the complete VM deployment checklist.

Quick summary:
1. Clone repo on VM
2. Copy `.env.example` to `.env`, fill in values
3. Update domain in `Caddyfile`
4. `docker compose build && docker compose up -d`

---

## Navigation structure

Five sections, accessible via bottom nav (mobile) or sidebar (desktop):

| Tab | Contents |
|-----|---------|
| **Home** | Daily dashboard: today, events, bins, shopping preview, tonight's film pick |
| **Household** | Shopping lists, shared tasks, bin tracker, meal planner, chores |
| **+ (Capture)** | Quick-add anything to the inbox — always one tap away |
| **Watch** | Films (with TMDB metadata + OneDrive library), TV shows, going out, date nights |
| **Life** | Insurance, subscriptions, renewals, vehicles, plans, birthdays, documents, memories |

---

## Feature roadmap

| Phase | Goal | Key features |
|-------|------|-------------|
| **0** | Infrastructure | Docker, auth, SQLite, migrations, backup, health check |
| **1** | Useful MVP | Dashboard, capture inbox, shopping list, shared tasks, notes |
| **2** | Daily utility | Bin day tracker, meal planner, multiple lists, tags, search |
| **3** | Admin layer | Insurance/subscriptions tracker, MOT/renewals, warranties, vehicles |
| **4** | Entertainment | Film watchlist + TMDB metadata + OneDrive library scan |
| **5** | Social layer | TV tracking, going out lists, birthdays, gift ideas, Christmas planner |
| **6** | Plans & reference | Trip planning, household reference, document store |
| **7** | Calendar | CalDAV read-only sync from iOS shared calendar |
| **8** | Reminders | Recurring tasks, email reminders, daily digest |
| **9** | AI capture | Voice input, Whisper transcription, AI routing, confirmation flow |

---

## Data model overview

Everything is an `item` with a type discriminator. This enables cross-entity linking, unified search, and tagging without schema changes per feature.

Core item types: `task · note · inbox · shopping_item · watchlist_film · watchlist_tv · place · gift_idea · meal_idea · memory · document · idea`

Supporting tables: `lists · list_items · calendar_events · reminders · entity_links · files · tags · item_tags · notifications · ai_jobs · activity_log`

See `lib/db/schema.ts` for the full schema.

---

## Production reliability

This app is used daily and we may become dependent on it. These are non-negotiable from day one:

- **Hourly SQLite backups** (hot backup, safe during writes) — stored locally + optionally off-site
- **Daily file backups** via rsync
- **Restore testing** — verify backups are actually restorable, not just that they exist
- **Data export** — one-click full JSON + CSV export of all data
- **Health check** endpoint at `/api/health`
- **Migrations** — all schema changes versioned and applied automatically at startup
- **Soft deletes** — items are never hard-deleted without a grace period
- **Audit log** — all state changes recorded with who, what, when

---

## Key decisions

**Why SQLite?** Two users. The concurrency concerns about SQLite don't apply here. WAL mode handles simultaneous reads easily. A single file is trivial to backup, inspect, and restore. No database server to manage.

**Why not two-way CalDAV sync?** Imogen relies heavily on her iOS calendar. A bug in sync logic could corrupt or duplicate events she depends on. We read from CalDAV but never write to it, eliminating this risk.

**Why Caddy?** Auto-HTTPS with zero configuration. One Caddyfile replaces pages of nginx SSL config.

**Why a PWA and not a native app?** No App Store submissions. No separate native codebase. iOS 16.4+ supports PWA push notifications when installed via Add to Home Screen. The app works on any device with a browser.

---

## Repository structure

```
/
├── CLAUDE.md           # Instructions for Claude Code
├── AGENTS.md           # Instructions for Codex/other AI agents (VM deployment)
├── README.md           # This file
├── Dockerfile          # Multi-stage Next.js build
├── docker-compose.yml  # Production stack
├── docker-compose.dev.yml  # Development override
├── Caddyfile           # Reverse proxy config
├── .env.example        # Environment variable template
├── .gitignore
├── scripts/
│   └── backup.sh       # SQLite backup script (runs in backup container)
├── design/             # HTML design mockups (open in browser)
│   ├── concept-1-clean.html
│   ├── concept-2-warm.html
│   └── concept-3-dark.html
├── app/                # Next.js app (created after bootstrapping)
├── components/         # Shared UI components
├── lib/                # DB schema, auth, services, jobs
└── public/             # Static assets
```
