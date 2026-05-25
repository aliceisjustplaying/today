# today

The Now layer above Todoist + Google Calendar + YNAB. See `docs/SPEC.md` for the product, `docs/SETUP.md` for the credential checklist.

## Stack

Cloudflare Workers · D1 (SQLite) · Hono · React 19 + Vite · Drizzle · Bun (local package manager only)

## Quick start

```bash
bun install
cp .dev.vars.example .dev.vars   # then fill in your secret values
bunx wrangler login              # one-time; auth Wrangler to your CF account
bunx wrangler d1 create today    # paste the database_id into wrangler.jsonc
bun run db:generate              # generate the initial Drizzle migration
bun run db:migrate:local         # apply it to local D1
bun run dev                      # vite dev, serves both API + SPA via Workers runtime
```

## Deploy

```bash
bunx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
bunx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
bunx wrangler secret put GOOGLE_API_KEY
bunx wrangler secret put TODOIST_API_TOKEN
bunx wrangler secret put SESSION_SECRET
bunx wrangler secret put ANTHROPIC_API_KEY
bun run db:migrate:remote
bun run deploy
```

Then in the Cloudflare dashboard: Workers → today → Settings → Custom Domains → add `today.example.com`.

## Layout

```
src/
  client/        React app (Vite entry: index.html → main.tsx → App.tsx)
  server/        Worker (Hono) entry + db schema
docs/            SPEC.md, SETUP.md
drizzle/         generated migrations
```
