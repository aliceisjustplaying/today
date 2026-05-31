# Setup checklist

Complete each section before deploying the app.

Steps inside each section are intentionally unnumbered (they may change order).

---

## Cloudflare

- Confirm your domain is on Cloudflare if you want a custom domain.
- Install Wrangler dependencies with `bun install`, then run `bunx wrangler login` from the repo.
- Note your **Cloudflare Account ID**. Find it in the Cloudflare dashboard right sidebar of any domain's overview page.
- Decide on the **Worker name**. Default: `today`.
- Create the D1 database with `bunx wrangler d1 create today`, then put its `database_id` in `.dev.vars` / `.env` as `CLOUDFLARE_D1_DATABASE_ID`.

## DNS

- For a custom domain, set `CLOUDFLARE_CUSTOM_DOMAIN` in `.dev.vars` / `.env`.
- Confirm you can edit DNS for the domain in Cloudflare.

## Google Cloud (Calendar + Routes)

This is the longest section. All in https://console.cloud.google.com.

- Create (or reuse) a Google Cloud project.
- **Enable APIs** in the project (APIs & Services → Library):
  - **Google Calendar API**
  - **Routes API** (this is the modern replacement for the legacy Distance Matrix API — same use case, current SKU)
- **OAuth consent screen** (APIs & Services → OAuth consent screen):
  - User type: **External**
  - App name: `Today`
  - User support email + developer contact email: your email
  - Add scope: `https://www.googleapis.com/auth/calendar.readonly`
  - Add the same account you will put in `ALLOWED_EMAIL` as a test user.
  - You can leave it in "Testing" status — no need to publish, since you're the only user. Refresh tokens issued in Testing mode expire after 7 days, which is fine; we'll handle re-auth gracefully.
- **OAuth 2.0 Client ID** (APIs & Services → Credentials → Create credentials → OAuth client ID):
  - Application type: **Web application**
  - Name: `Today Web`
  - Authorized JavaScript origins: your deployed origin and `http://localhost:8787`
  - Authorized redirect URIs: your deployed `/auth/google/callback` URL and `http://localhost:8787/auth/google/callback`
  - Save and copy the **Client ID** and **Client Secret**.
- **Routes API key** (APIs & Services → Credentials → Create credentials → API key):
  - Name: `Today Routes`
  - Click **Edit API key** → API restrictions → **Restrict key** → select only **Routes API**
  - Application restrictions: leave **None** for v0 (Workers don't have stable IPs to allowlist, and we'll be calling from the Worker server-side). We can lock it down later by switching to a Cloudflare Worker IP range allowlist if abuse becomes a concern.
  - Save and copy the **API key**.
- **Billing**: Google Cloud requires a billing account on the project for Routes API even though there's a $200/month free credit. Attach a card. Set a budget alert at $5/month so you get a warning long before anything real happens.

## Todoist

Single-user → personal API token, **no OAuth flow needed**.

- Go to Todoist → Settings → Integrations → Developer.
- Copy the **API token** (one long string).
- Drop it in `.env` / `.dev.vars` as `TODOIST_API_TOKEN`.
- That's it. No app registration, no redirect URL.

## (Optional now, required later) Apple developer for iOS PWA install

- v0 will be installable as a PWA from Safari without needing an Apple Developer account. No action needed.

## Local environment

After you finish the above, make sure:

- Bun is installed and `bun --version` works.
- You can run `bunx wrangler whoami` and it can find your CF account once you `wrangler login`.
- `.dev.vars` contains the values from `.dev.vars.example`.
- `bun run wrangler:config` writes `wrangler.local.jsonc`.

---

## What I need from you at the end

Put these in `.dev.vars` or `.env`:

- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_CUSTOM_DOMAIN` (optional)
- `GOOGLE_OAUTH_REDIRECT_URI`
- `ALLOWED_EMAIL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_API_KEY`
- `TODOIST_API_TOKEN`
- `SESSION_SECRET`
- `ANTHROPIC_API_KEY`

Run `bun run wrangler:config` after changing deployment config.
