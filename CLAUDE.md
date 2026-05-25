# Working in this repo

Read `docs/SPEC.md` first for what the product is. Read `docs/SETUP.md` for the credential checklist. This file is the contract for *how* code is written here.

## Stack at a glance

- Runtime: **Cloudflare Workers** (not Bun, not Node). Worker entry: `src/server/index.ts`. Hono is the router.
- DB: **Cloudflare D1** via the `DB` binding. Access through Drizzle (`src/server/db/index.ts`); schema in `src/server/db/schema.ts`.
- Frontend: **React 19 + Vite**, bundled by `@cloudflare/vite-plugin` and served via the `ASSETS` Workers Static Assets binding from the same Worker.
- Auth: **Google OAuth** as the login. Allowlist is exactly one email (`ALLOWED_EMAIL`, read from `vars`); any other Google account that completes the flow gets a 403 and no session. Todoist uses a **personal API token** in env, *not* OAuth.
- Travel time: **Google Routes API** (`computeRouteMatrix`). The legacy Distance Matrix API is deprecated — do not use it.
- Local package manager: Bun. Run scripts with `bun run …`, install with `bun install`, never npm/yarn/pnpm. CLIs via `bunx`. The runtime *target* of the code is still Workers, not Bun.

## Hard "don't"s

- **Do not use** `Bun.serve`, `bun:sqlite`, `Bun.sql`, `Bun.redis`, `Bun.file`, or any other Bun-runtime API in code under `src/server/`. That code runs in workerd, not Bun.
- **Do not** introduce manual / fixture / hardcoded data paths as a v0 shortcut. Every data source is a real integration. (See `MEMORY.md → feedback-no-manual-data`.)
- **Do not** add a Todoist OAuth flow — single-user, personal token only.
- **Do not** moralize about money in UI copy or AI outputs (e.g. Uber spend). Encode preferences neutrally in `prefs`.
- **Do not** mix prep / body-state ("eat", "shave", "leave by") into Todoist. Those are app-local state on the `body_state` and `prep_steps` tables.

## Conventions

- All API routes live under `/api/*` and are defined in `src/server/`. Catch-all forwards to `ASSETS` so the SPA handles client routes (`app.notFound((c) => c.env.ASSETS.fetch(c.req.raw))`).
- Secrets locally: `.dev.vars`. Secrets in prod: `bunx wrangler secret put NAME`. `.dev.vars` and `.dev.vars.local` are gitignored.
- Non-secret config (redirect URI, allowed email): `vars` block in `wrangler.jsonc`.
- All AI calls go through the Anthropic SDK (`@anthropic-ai/sdk`) with prompt caching on the system prompt — see [memory project_today_stack and feature implementations].
- Candidates are inserted with `status = "candidate"`. They become real tasks only when explicitly approved → Todoist write.
- Audit: every state-changing action should be loggable. v0 just `console.log`s; structured audit table comes later.

## Useful scripts

- `bun run dev` — vite dev with Workers runtime + HMR
- `bun run typecheck` — `tsc --noEmit`
- `bun run db:generate` — diff schema → generate migration
- `bun run db:migrate:local` — apply to local D1
- `bun run db:migrate:remote` — apply to prod D1
- `bun run deploy` — vite build then `wrangler deploy`
- `bunx wrangler tail` — stream prod logs

## When something is unclear

Re-read `docs/SPEC.md`. The product framing there ("the Now layer", "AI suggests, the app records") is load-bearing — if a proposed change drifts from it, push back.
