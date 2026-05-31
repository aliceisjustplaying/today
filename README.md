# today

The Now layer above Todoist + Google Calendar + YNAB. See `docs/SPEC.md` for the product, `docs/SETUP.md` for the credential checklist.

## Stack

Cloudflare Workers · D1 (SQLite) · Hono · React 19 + Vite · Drizzle · Bun

## Quick start

```bash
bun install
cp .dev.vars.example .dev.vars   # then fill in local/private values
bunx wrangler login              # one-time; auth Wrangler to your CF account
bunx wrangler d1 create today    # paste the database_id into .dev.vars
bun run wrangler:config          # writes gitignored wrangler.local.jsonc
bun run db:migrate:local         # apply it to local D1
bun run dev                      # vite dev, serves both API + SPA via Workers runtime
```

`wrangler.jsonc` is public-safe. Real deployment values live in `.env` / `.dev.vars` and are copied into `wrangler.local.jsonc` by `bun run wrangler:config`.

Required local/private values:

```
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_D1_DATABASE_ID=
GOOGLE_OAUTH_REDIRECT_URI=
ALLOWED_EMAIL=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_API_KEY=
TODOIST_API_TOKEN=
SESSION_SECRET=
ANTHROPIC_API_KEY=
```

## Deploy

```bash
bun run wrangler:config
bunx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
bunx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
bunx wrangler secret put GOOGLE_API_KEY
bunx wrangler secret put TODOIST_API_TOKEN
bunx wrangler secret put SESSION_SECRET
bunx wrangler secret put ANTHROPIC_API_KEY
bun run db:migrate:remote
bun run deploy
```

Set `CLOUDFLARE_CUSTOM_DOMAIN` in `.env` / `.dev.vars` before `bun run wrangler:config` when deploying to a custom domain. Set `VITE_ALLOWED_HOSTS` to a comma-separated list of extra dev hosts when using tunnels or custom local domains.

`ALLOWED_EMAIL`, `GOOGLE_OAUTH_REDIRECT_URI`, timezone, transport mode, and buffer minutes are plain Worker vars generated into `wrangler.local.jsonc`; API tokens and secrets should be set with `wrangler secret put`.

## Layout

```
src/
  client/        React app (Vite entry: index.html → main.tsx → App.tsx)
  server/        Worker (Hono) entry + db schema
docs/            SPEC.md, SETUP.md
drizzle/         generated migrations
```
