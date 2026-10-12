# today

today is a small web app for your phone. It shows what is next on your calendar, when to leave and what you still need to do to get ready. It also lists your Linear tasks for today and the week ahead. A Limits tab shows how much of each AI plan you have used. Only one Google account can sign in. You add it to your home screen, and it works like an app.

## What it needs

- **Bun** to run it.
- **A Google OAuth client** for sign-in. It also reads your Google Calendar (read only).
- **A Google Routes API key** and a home address, if you want travel times. This part is optional.
- **A Linear API key** for each Linear workspace you use.
- **GitHub** for the Stars tab. A read-only token is optional but keeps it well under the rate limit.
- **The limits service** (in its own repo) for the Limits tab. limits reads Claude, Codex and Grok through CLIProxyAPI. This part is optional.

`docs/SETUP.md` walks through each account step by step.

## Settings

Put these in `.env` (copy `.env.example`). Only the first five are required.

| Name | Default | What it does |
| --- | --- | --- |
| `ALLOWED_EMAIL` | | The one Google account that can sign in |
| `GOOGLE_OAUTH_CLIENT_ID` | | Google sign-in client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | | Google sign-in secret |
| `SESSION_SECRET` | | Any long random string; signs the login cookie |
| `LINEAR_API_KEY` | | Your Linear key |
| `LINEAR_API_KEYS` | | More Linear keys, one per workspace |
| `LINEAR_TABS` | one tab per team | Group teams into tabs, like `Life=HOME;Dev=DEV` |
| `LINEAR_RETURNS_LABEL` | `Returns` | Tasks with this label show up under Returns |
| `GOOGLE_OAUTH_REDIRECT_URI` | from the request | The public login callback URL; set it when behind a proxy |
| `GOOGLE_API_KEY` | | Routes API key for travel times |
| `HOME_ADDRESS` | | Where trips start; no address means no travel times |
| `TRANSPORT_DEFAULT` | `TRANSIT` | Your usual way to travel |
| `TRANSPORT_RESCUE` | `DRIVE` | The faster backup when you are late |
| `BUFFER_MINUTES` | `10` | Extra minutes added before you leave |
| `TIMEZONE` | the server's zone | Your time zone, like `America/New_York`; sets when a day starts |
| `LIMITS_URL` | `http://127.0.0.1:8790` | Where the limits service runs |
| `GITHUB_USER` | `aliceisjustplaying` | Whose public repos fill the Stars tab |
| `GITHUB_TOKEN` | | Optional GitHub token (read-only, public repos, no permissions). It raises the rate limit from 60 to 5,000 calls an hour |
| `HOST` | `127.0.0.1` | Address to listen on |
| `PORT` | `8788` | Port to listen on |
| `DATABASE_PATH` | `data/today.sqlite` | The SQLite file |
| `MIGRATIONS_DIR` | `drizzle/migrations` | Database migrations |
| `STATIC_DIR` | `dist/client` | The built web app |
| `VITE_ALLOWED_HOSTS` | | Extra hosts for the dev server |

The Capy balance on the Limits tab is unofficial and optional. limits reads it with a capy.ai web session, not a public API.

## Run it

For local dev:

```sh
bun install
cp .env.example .env   # fill in the required values
bun run db:migrate
bun run dev            # open http://localhost:8787
```

For production:

```sh
bun install --frozen-lockfile
bun run build
bun run start          # serves the app on HOST:PORT
```

Put a TLS proxy (like Caddy) in front and set `GOOGLE_OAUTH_REDIRECT_URI`. To run the checks, use `bun run typecheck`, `bun test` and `bun run test:e2e`.

## License

MIT. See `LICENSE`.

Easiest way to set it up: point your coding agent at this README.
