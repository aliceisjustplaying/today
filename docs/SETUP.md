# Setup checklist

Complete each section before deploying the app.

Steps inside each section are intentionally unnumbered (they may change order).

---

## Server

- today runs as a Bun process (`bun run start`) behind a TLS reverse proxy. The production host is the NixOS VPS; its package, systemd unit and Caddy vhost live in the nixfiles repo.
- Pick the public hostname and point a DNS A record at the host before the first deploy, so the proxy can get a certificate.

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
  - Application restrictions: **IP addresses**, set to the server's public IP (calls are server-side), or **None** while developing locally.
  - Save and copy the **API key**.
- **Billing**: Google Cloud requires a billing account on the project for Routes API even though there's a $200/month free credit. Attach a card. Set a budget alert at $5/month so you get a warning long before anything real happens.

## Linear

- Create a **personal API key**: Linear → Settings → Security & access → Personal API keys. Give it read and write access to the teams that hold your todos. Set it as `LINEAR_API_KEY`; the app sends it as the raw `Authorization` header.
- **Several workspaces:** a personal key belongs to one workspace. Create one key per workspace and list them in `LINEAR_API_KEYS` (separated by newlines, spaces or commas; `LINEAR_API_KEY` is also included if set). Issues from every workspace are merged, and completing one uses the key of the workspace it came from.
- Today and Upcoming show open issues assigned to you with a due date. Completing one moves it to its team's first "completed" workflow state.
- For the Returns section, create a label named **Returns** in each workspace that holds returns (or set `LINEAR_RETURNS_LABEL` to another name) and put it on return issues. They need not be assigned to you; their due dates control urgency and ordering.
- The Google Tasks scope is no longer requested. The Google Tasks API can be disabled in the Cloud project.

## (Optional now, required later) Apple developer for iOS PWA install

- v0 will be installable as a PWA from Safari without needing an Apple Developer account. No action needed.

## Local environment

After you finish the above, make sure:

- Bun is installed and `bun --version` works.
- `.env` contains the required values from `.env.example`.
- `bun run db:migrate` creates `data/today.sqlite`.

---

## What I need from you at the end

Put these in `.env` locally, or in the server's environment / credentials in production:

- `ALLOWED_EMAIL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `SESSION_SECRET`
- `LINEAR_API_KEY`, or `LINEAR_API_KEYS` for several workspaces
- `LINEAR_RETURNS_LABEL` (optional, default `Returns`)
- `GOOGLE_OAUTH_REDIRECT_URI` (production)
- `GOOGLE_API_KEY` and `HOME_ADDRESS` (travel estimates)
