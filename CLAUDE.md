# Working in this repo

Read `docs/SPEC.md` first for what the product is. Read `docs/SETUP.md` for the credential checklist. This file is the contract for *how* code is written here.

## Stack at a glance

- Runtime: **Bun**. Hono app in `src/server/index.ts`; the process entry `src/server/main.ts` loads config, opens SQLite, runs migrations and calls `Bun.serve`. Production is a systemd service on Alice's NixOS VPS behind Caddy (packaged in the nixfiles repo).
- Config: environment variables parsed once by `src/server/config.ts` and passed to Hono as `c.env` together with the Drizzle handle (`c.env.db`). Add new settings there, not as ad-hoc `process.env` reads.
- DB: **SQLite** via `bun:sqlite` + Drizzle (`src/server/db/index.ts`); schema in `src/server/db/schema.ts`, migrations in `drizzle/migrations` applied at startup.
- Frontend: **React 19 + Vite**, built to `dist/client` and served by the same Hono app (`src/server/static.ts`: `serveStatic`, SPA fallback to `index.html`, `/assets/*` immutable, everything else `no-cache`, a missing asset is a 404). The build stamps one id into `index.html`, `version.json` and the service worker `sw.js` (`scripts/stamp-build.ts`, worker source in `src/sw.js`). The page compares its id with `version.json` on open and on resume (never on a timer) and reloads into a new deploy before rendering any new API data, unless an editor is open (`[data-editing]` or a focused field), in which case it waits for the next resume (`src/client/updates.ts`). A resume also refetches every API, at most once per 15 s (`src/client/resume.ts`).
- Auth: **Google OAuth** as the login. Allowlist is exactly one email (`ALLOWED_EMAIL`, read from `vars`); any other Google account that completes the flow gets a 403 and no session. Google Calendar uses the stored OAuth grant.
- Tasks: **Linear** via GraphQL with personal API keys, one per workspace (`LINEAR_API_KEY` / `LINEAR_API_KEYS` → `c.env.LINEAR_API_KEYS`, `src/server/linear.ts`). Every list query fans out across keys and tags each task with its `workspace` index; completion uses that index to pick the key. `/api/tasks` returns `tabs` (one per team, or grouped by `LINEAR_TABS`), each with overdue/today/upcoming/undated buckets. Today/Upcoming are `viewer.assignedIssues` (open states, by `dueDate`); Returns are issues with the `LINEAR_RETURNS_LABEL` label regardless of assignee; completing is `issueUpdate` to the team's completed state.
- Limits: `/api/limits` proxies the `limits` service's `/api/summary` (`LIMITS_URL`, default `http://127.0.0.1:8790`, 5 s timeout) and returns a 502 `{error}` when it's down; the SPA shows it as a Limits tab next to the Linear team tabs (`src/client/Limits.tsx`).
- Stars tab: `/api/github` (`src/server/github.ts`) polls the public non-fork repos of `GITHUB_USER` every 10 minutes (also from `main.ts` in the background) with conditional requests. Stars are `WatchEvent`s from each repo's events and forks come from the forks API, stored in `github_events` keyed by GitHub id so history outlives GitHub's 300-event window. `/stargazers/history` per-day counts fill in stars no event names as anonymous "+N stars" rows. The stargazers list endpoint is collaborator-only now, so don't use it. GITHUB_USER's own events never show. Any failing source degrades, never breaking forks or totals.
- Privacy mode: the header eye toggles it (localStorage `today.privacy`). Personal text goes through `usePrivacy()` from `src/client/privacy.tsx`, which shows decoys rather than masks. `decoy(kind, id, real)` picks a stand-in from a pool by a hash of the item's id, never its content: titles, places, prep labels, Linear titles, labels and ids. `email(position, real)` numbers account emails alice@, alice2@ and so on by display order. `text()` and `figures()` swap inline emails, every dollar amount (`$67.00`) and plain figures (`67`). Tooltips and aria labels get the same treatment. Times, durations, bars and percentages stay real.
- Travel time: **Google Routes API** (`computeRouteMatrix`). The legacy Distance Matrix API is deprecated — do not use it.
- Package manager: Bun. Run scripts with `bun run …`, install with `bun install`, never npm/yarn/pnpm. CLIs via `bunx`.

## Hard "don't"s

- **Do not** reach for `process.env` outside `config.ts`/`main.ts`, or open extra SQLite connections; route handlers get both via `c.env`.
- **Do not** introduce manual / fixture / hardcoded data paths as a v0 shortcut. Every data source is a real integration. (See `MEMORY.md → feedback-no-manual-data`.)
- **Do not** moralize about money in UI copy or AI outputs (e.g. Uber spend). Encode preferences neutrally in `prefs`.
- **Do not** mix prep / body-state ("eat", "shave", "leave by") into Linear. Those are app-local state on the `prep_steps`, `prep_checks` and `prep_days` tables.

## Conventions

- All API routes live under `/api/*` and are defined in `src/server/`. Unknown `/api/*` is a JSON 404; everything else is a static file or `index.html` so the SPA handles client routes.
- Secrets and private config locally: `.env` (see `.env.example`). In prod: sops secrets loaded through systemd `LoadCredential` by the nixfiles module; plain values in the unit's `Environment=`.
- All AI calls go through the Anthropic SDK (`@anthropic-ai/sdk`) with prompt caching on the system prompt — see [memory project_today_stack and feature implementations].
- Candidates are inserted with `status = "candidate"`. They become real tasks only when explicitly approved → Linear `issueCreate`.
- Audit: every state-changing action should be loggable. v0 just `console.log`s; structured audit table comes later.

## Useful scripts

- `bun run dev` — Hono server (`bun --watch`, :8788) + Vite with HMR (:8787, proxies `/api` and `/auth`)
- `bun run build` — Vite build to `dist/client`
- `bun run start` — production server
- `bun run typecheck` — `tsgo --noEmit`
- `bun test` — server tests (in-memory SQLite, `app.request`)
- `bun run test:e2e` — Playwright WebKit tests for the PWA lifecycle (resume, redeploy, service worker, offline) against `e2e/server.ts`, a harness with canned API responses; run `bun run build` first
- `bun run db:generate` — diff schema → generate migration
- `bun run db:migrate [d1-export.sql]` — apply migrations to `DATABASE_PATH`; with a file, import a `wrangler d1 export` dump
- Prod logs: `journalctl -u today` on the VPS

## When something is unclear

Re-read `docs/SPEC.md`. The product framing there ("the Now layer", "AI suggests, the app records") is load-bearing — if a proposed change drifts from it, push back.
