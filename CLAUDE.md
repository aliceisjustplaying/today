# Working in this repo

Read `docs/SPEC.md` first for what the product is. Read `docs/SETUP.md` for the credential checklist. This file is the contract for *how* code is written here.

## Stack at a glance

- Runtime: **Bun**. Hono app in `src/server/index.ts`; the process entry `src/server/main.ts` loads config, opens SQLite, runs migrations and calls `Bun.serve`. Production is a systemd service on Alice's NixOS VPS behind Caddy (packaged in the nixfiles repo).
- Config: environment variables parsed once by `src/server/config.ts` and passed to Hono as `c.env` together with the Drizzle handle (`c.env.db`). Add new settings there, not as ad-hoc `process.env` reads.
- DB: **SQLite** via `bun:sqlite` + Drizzle (`src/server/db/index.ts`); schema in `src/server/db/schema.ts`, migrations in `drizzle/migrations` applied at startup.
- Frontend: **React 19 + Vite**, built to `dist/client` and served by the same Hono app (`serveStatic`, SPA fallback to `index.html`).
- Auth: **Google OAuth** as the login. Allowlist is exactly one email (`ALLOWED_EMAIL`, read from `vars`); any other Google account that completes the flow gets a 403 and no session. Google Tasks and Google Calendar use the same stored OAuth grant.
- Travel time: **Google Routes API** (`computeRouteMatrix`). The legacy Distance Matrix API is deprecated — do not use it.
- Package manager: Bun. Run scripts with `bun run …`, install with `bun install`, never npm/yarn/pnpm. CLIs via `bunx`.

## Hard "don't"s

- **Do not** reach for `process.env` outside `config.ts`/`main.ts`, or open extra SQLite connections; route handlers get both via `c.env`.
- **Do not** introduce manual / fixture / hardcoded data paths as a v0 shortcut. Every data source is a real integration. (See `MEMORY.md → feedback-no-manual-data`.)
- **Do not** moralize about money in UI copy or AI outputs (e.g. Uber spend). Encode preferences neutrally in `prefs`.
- **Do not** mix prep / body-state ("eat", "shave", "leave by") into Google Tasks. Those are app-local state on the `body_state` and `prep_steps` tables.

## Conventions

- All API routes live under `/api/*` and are defined in `src/server/`. Unknown `/api/*` is a JSON 404; everything else is a static file or `index.html` so the SPA handles client routes.
- Secrets and private config locally: `.env` (see `.env.example`). In prod: sops secrets loaded through systemd `LoadCredential` by the nixfiles module; plain values in the unit's `Environment=`.
- All AI calls go through the Anthropic SDK (`@anthropic-ai/sdk`) with prompt caching on the system prompt — see [memory project_today_stack and feature implementations].
- Candidates are inserted with `status = "candidate"`. They become real tasks only when explicitly approved → Google Tasks write.
- Audit: every state-changing action should be loggable. v0 just `console.log`s; structured audit table comes later.

## Useful scripts

- `bun run dev` — Hono server (`bun --watch`, :8788) + Vite with HMR (:8787, proxies `/api` and `/auth`)
- `bun run build` — Vite build to `dist/client`
- `bun run start` — production server
- `bun run typecheck` — `tsgo --noEmit`
- `bun test` — server tests (in-memory SQLite, `app.request`)
- `bun run db:generate` — diff schema → generate migration
- `bun run db:migrate [d1-export.sql]` — apply migrations to `DATABASE_PATH`; with a file, import a `wrangler d1 export` dump
- Prod logs: `journalctl -u today` on the VPS

## When something is unclear

Re-read `docs/SPEC.md`. The product framing there ("the Now layer", "AI suggests, the app records") is load-bearing — if a proposed change drifts from it, push back.
