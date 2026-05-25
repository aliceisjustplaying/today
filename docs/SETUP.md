# Setup checklist — prerequisites before scaffolding

You complete each section below before I write any code. When all of them are done, hand me back the values in the **What I need from you at the end** block and I'll wire them in.

Steps inside each section are intentionally unnumbered (they may change order).

---

## Cloudflare

- Confirm `example.com` is on Cloudflare. (You said it is.) If not, move it.
- Install Wrangler: `bun add -d wrangler` once we scaffold; for now you only need the CLI logged in. Run `bunx wrangler login` from the `today/` directory after I scaffold — *no rush yet*.
- Note your **Cloudflare Account ID**. Find it in the Cloudflare dashboard right sidebar of any domain's overview page.
- Decide on the **Worker name**. Suggest: `today` (the URL will end up `https://today.<your-workers-subdomain>.workers.dev` before we attach the custom domain).
- We will create the D1 database via `wrangler d1 create today` after scaffold — you don't need to do this now. Just be aware it will produce a `database_id` we paste into `wrangler.jsonc`.

## DNS

- In the Cloudflare dashboard for `example.com`, you do **not** need to pre-create a DNS record for `today`. When we attach the Worker as a Custom Domain via `wrangler.jsonc` + dashboard, Cloudflare creates the proxied record itself.
- Do confirm you can edit DNS for `example.com` (you should — it's your domain).

## Google Cloud (Calendar + Routes)

This is the longest section. All in https://console.cloud.google.com.

- Create (or reuse) a Google Cloud project. Suggest name: `today-app`.
- **Enable APIs** in the project (APIs & Services → Library):
  - **Google Calendar API**
  - **Routes API** (this is the modern replacement for the legacy Distance Matrix API — same use case, current SKU)
- **OAuth consent screen** (APIs & Services → OAuth consent screen):
  - User type: **External**
  - App name: `Today`
  - User support email + developer contact email: your email
  - Add scope: `https://www.googleapis.com/auth/calendar.readonly`
  - Add test user: `you@example.com`
  - You can leave it in "Testing" status — no need to publish, since you're the only user. Refresh tokens issued in Testing mode expire after 7 days, which is fine; we'll handle re-auth gracefully.
- **OAuth 2.0 Client ID** (APIs & Services → Credentials → Create credentials → OAuth client ID):
  - Application type: **Web application**
  - Name: `Today Web`
  - Authorized JavaScript origins: `https://today.example.com` and `http://localhost:8787` (for `wrangler dev`)
  - Authorized redirect URIs: `https://today.example.com/auth/google/callback` and `http://localhost:8787/auth/google/callback`
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

After you finish the above, I'll create `.dev.vars` and `wrangler.jsonc` in the repo. For now, just make sure:

- Bun is installed and `bun --version` works.
- You can run `bunx wrangler whoami` and it can find your CF account once you `wrangler login`.

---

## What I need from you at the end

Paste these back to me (or drop them into a `.dev.vars.local` file at the repo root that I'll consume):

- `CLOUDFLARE_ACCOUNT_ID`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_ROUTES_API_KEY`
- `TODOIST_API_TOKEN`
- Confirmation that the OAuth consent screen has `you@example.com` as a test user
- Confirmation that DNS for `example.com` is editable by you in Cloudflare

Once those are in, I scaffold the Worker, schema, OAuth flows, and the Now panel.
