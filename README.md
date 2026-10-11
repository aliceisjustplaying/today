# today

The Now layer above Linear + Google Calendar + YNAB. See `docs/SPEC.md` for the product, `docs/SETUP.md` for the credential checklist.

## Stack

Bun · Hono · SQLite (`bun:sqlite`) · Drizzle · React 19 + Vite

## Quick start

```bash
bun install
cp .env.example .env   # then fill in the required values
bun run db:migrate     # creates data/today.sqlite and applies drizzle/migrations
bun run dev            # Hono API on :8788 (bun --watch) + Vite on :8787 proxying /api and /auth
```

Open http://localhost:8787.

## Production

```bash
bun install --frozen-lockfile
bun run build          # Vite → dist/client
bun run start          # bun src/server/main.ts: migrates, then serves API + SPA
```

The server applies pending migrations from `MIGRATIONS_DIR` at startup, serves `/api/*` and `/auth/*`, serves files from `STATIC_DIR`, and falls back to `index.html` for client routes. It binds `HOST:PORT` (default `127.0.0.1:8788`) and expects a TLS reverse proxy in front; set `GOOGLE_OAUTH_REDIRECT_URI` to the public callback URL so OAuth and secure cookies use the public origin.

## Environment

All configuration is environment variables, read once at startup by `src/server/config.ts`. `.env.example` lists every name.

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ALLOWED_EMAIL` | yes | | The single Google account allowed to sign in |
| `GOOGLE_OAUTH_CLIENT_ID` | yes | | Google OAuth web client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | yes (secret) | | Google OAuth web client |
| `SESSION_SECRET` | yes (secret) | | Signs the session cookie |
| `LINEAR_API_KEY` | one of these (secret) | | Personal Linear API key (tasks, completion, Returns) |
| `LINEAR_API_KEYS` | one of these (secret) | | Several personal keys, one per workspace, separated by newlines, spaces or commas; merged with `LINEAR_API_KEY` |
| `LINEAR_TABS` | no | one tab per team | Group teams into tabs: `Life=BEL;Dev=DEV` |
| `LINEAR_RETURNS_LABEL` | no | `Returns` | Linear label whose open issues fill the Returns section |
| `GOOGLE_OAUTH_REDIRECT_URI` | no | derived from the request | Public `/auth/google/callback` URL; set it behind a proxy |
| `GOOGLE_API_KEY` | no (secret) | | Routes API key for travel estimates |
| `HOME_ADDRESS` | no (private) | | Travel origin; without it travel rows are hidden |
| `TIMEZONE` | no | `Europe/London` | Day boundaries for Today/Upcoming |
| `TRANSPORT_DEFAULT` / `TRANSPORT_RESCUE` | no | `TRANSIT` / `DRIVE` | Routes travel modes |
| `BUFFER_MINUTES` | no | `10` | Buffer added to prep time |
| `HOST` / `PORT` | no | `127.0.0.1` / `8788` | Listen address |
| `DATABASE_PATH` | no | `data/today.sqlite` | SQLite file (WAL mode) |
| `MIGRATIONS_DIR` | no | `drizzle/migrations` | Drizzle SQL migrations |
| `STATIC_DIR` | no | `dist/client` | Built SPA |
| `VITE_ALLOWED_HOSTS` | no | | Extra Vite dev hosts (tunnels) |

## Migrating from Cloudflare D1

```bash
bunx wrangler d1 export today --remote --output today-d1.sql
DATABASE_PATH=/path/to/today.sqlite bun run db:migrate today-d1.sql
```

`db:migrate <file>` applies the first (D1-era) migration, loads the export into a scratch in-memory database, and copies the app tables (`sessions`, `oauth_tokens`, `candidates`, `body_state`, `prefs`) into the target. It refuses to import into a database that was already migrated. The remaining migrations then run, which carries `body_state` into the prep tables.

## Layout

```
src/
  client/        React app (Vite entry: index.html → main.tsx → App.tsx)
  server/        Hono app (index.ts), Bun entry (main.ts), config, db schema + migrator
docs/            SPEC.md, SETUP.md
drizzle/         generated migrations
```
