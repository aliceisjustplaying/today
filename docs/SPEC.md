# Personal Control Panel — Spec

`today` is a personal **Now layer** above Todoist and Google Calendar. It answers the short-horizon question those tools do not answer together:

> Given the next real anchor event, current body/admin state, and travel/prep time, what is the next sane action?

It is not a general todo app, calendar app, or life dashboard. The default view is the present: what is next, what must happen today, and what pressure is close enough to matter.

## Current v0

Opening the deployed app in the morning should be more useful in ten seconds than opening Todoist + Calendar and doing the time math by hand.

The current app includes:

- Google sign-in with a single allowlisted email.
- Google Calendar read access for today and tomorrow.
- Todoist task read access through a personal API token.
- Todoist task completion from the app.
- A Now panel centered on the next calendar anchor.
- Body/prep state stored in D1 and used to calculate prep time.
- Google Routes travel estimates from a configured home address to the next anchor location.
- Today, Calendar, and Upcoming sections.
- Local client cache for fast first paint, refreshed on focus and on a one-minute Now interval.
- PWA manifest and static asset serving from the same Worker.

Not shipped yet:

- Candidate capture.
- Brain-dump extraction.
- Candidate approval into Todoist.
- YNAB integration.
- Email or messaging ingestion.
- Notifications.

## Data Sources

| Thing                                | Source / owner                                      |
| ------------------------------------ | --------------------------------------------------- |
| Durable tasks                        | Todoist                                             |
| Task completion                      | Todoist API                                         |
| Hard time commitments                | Google Calendar                                     |
| Travel time                          | Google Routes API                                   |
| "What am I doing now / what's next?" | This app                                            |
| Body/prep state                      | This app, in D1                                     |
| Money context                        | Future YNAB integration                             |
| Candidate tasks/replies              | Future candidate pipeline; schema exists but unused |

## Product Surface

### Now

The primary view. It shows:

- Current time and date.
- Next calendar anchor.
- Time remaining until the anchor.
- Anchor location, with virtual locations treated as no-travel events.
- Default travel mode and leave-by time when a route can be computed.
- Rescue travel mode and leave-by time when a route can be computed.
- Prep start time based on remaining prep steps and buffer minutes.
- Prep/body toggles: eaten, showered, shaved, dressed, packed, running late.

Prep durations are fixed in code for v0:

```ts
{
  eaten: 15,
  showered: 15,
  shaved: 10,
  dressed: 5,
  packed: 10,
}
```

`runningLate` is persisted as body state but does not currently change routing or timing logic.

### Calendar

The Calendar section lists today's events and optionally expands tomorrow's events. A calendar button opens the user's calendar app through the configured client URL.

### Today

The Today section lists Todoist tasks that are overdue or due today. Tasks can be completed from the app and opened in Todoist.

### Upcoming

The Upcoming section lists Todoist tasks due in the next seven days, grouped by due date. Tasks can be completed from the app and opened in Todoist.

## Runtime Behavior

The Worker serves both API routes and the React SPA.

API routes:

```txt
GET  /api/ping
GET  /api/me
GET  /api/tasks
GET  /api/events
GET  /api/now
POST /api/tasks/:id/close
POST /api/body-state
```

Auth routes:

```txt
GET  /auth/google/start
GET  /auth/google/callback
POST /auth/logout
```

All `/api/*` routes except `/api/ping` require a session. Unknown `/api/*` routes return JSON 404. Non-API routes fall through to static assets so the SPA can handle client routes.

## Configuration

Tracked `wrangler.jsonc` contains public-safe defaults. Private deployment config is read from `.env` / `.dev.vars` and generated into ignored `wrangler.local.jsonc`.

Required private values:

```txt
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_D1_DATABASE_ID
GOOGLE_OAUTH_REDIRECT_URI
ALLOWED_EMAIL
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_API_KEY
TODOIST_API_TOKEN
SESSION_SECRET
ANTHROPIC_API_KEY
```

Optional private values:

```txt
CLOUDFLARE_WORKER_NAME
CLOUDFLARE_D1_DATABASE_NAME
CLOUDFLARE_CUSTOM_DOMAIN
VITE_ALLOWED_HOSTS
HOME_ADDRESS
TIMEZONE
TRANSPORT_DEFAULT
TRANSPORT_RESCUE
BUFFER_MINUTES
```

`HOME_ADDRESS` is required for travel estimates. Without it, events still render, but travel rows do not.

## Domain Model

```ts
type NowState = {
  currentTime: string
  anchor: {
    id: string
    title: string
    location: string | null
    isVirtual: boolean
    start: string
    end: string | null
  } | null
  travel: {
    defaultMode: "TRANSIT" | "DRIVE" | "WALK" | "BICYCLE"
    defaultMinutes: number | null
    rescueMode: "TRANSIT" | "DRIVE" | "WALK" | "BICYCLE"
    rescueMinutes: number | null
  } | null
  timing: {
    timeRemainingMinutes: number
    leaveByDefault: string | null
    leaveByRescue: string | null
    prepStart: string | null
    prepRequiredMinutes: number
    bufferMinutes: number
  } | null
  bodyState: BodyState
  prepSteps: PrepStep[]
  travelError: string | null
}

type BodyState = {
  id: number
  eaten: boolean
  showered: boolean
  shaved: boolean
  dressed: boolean
  packed: boolean
  runningLate: boolean
  updatedAt: string
}

type PrepStep = {
  key: "eaten" | "showered" | "shaved" | "dressed" | "packed"
  minutes: number
  done: boolean
}
```

D1 tables:

- `sessions`
- `oauth_tokens`
- `body_state`
- `candidates` (reserved for future capture work)
- `prefs` (reserved for future preference UI)

## Hard Rules

- Show Now / Today first, not the whole backlog.
- Do not create manual fixture data for production behavior.
- Todoist remains the durable task source.
- Prep/body state stays app-local and does not become Todoist tasks.
- Google Calendar remains the source of hard time commitments.
- Do not moralize about money or travel tradeoffs in UI copy.
- AI can suggest, but the app records explicit user-approved actions.

## Future Work

- Candidate capture: brain dump → structured candidates.
- Candidate approval: approved todo candidates write to Todoist.
- Email and message scans for possible reply obligations.
- YNAB read-only context.
- Push notifications for event-imminent and must-not-rot cases.
- Object trial / return tracker.
- Daily shutdown / savepoint.
- Housing CRM as a separate project, not part of this app.
