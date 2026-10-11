# Personal Control Panel — Spec

`today` is a personal **Now layer** above Google Tasks and Google Calendar. It answers the short-horizon question those tools do not answer together:

> Given the next real anchor event, current body/admin state, and travel/prep time, what is the next sane action?

It is not a general todo app, calendar app, or life dashboard. The default view is the present: what is next, what must happen today, and what pressure is close enough to matter.

## Current v0

Opening the deployed app in the morning should be more useful in ten seconds than opening Google Tasks + Calendar and doing the time math by hand.

The current app includes:

- Google sign-in with a single allowlisted email.
- Google Calendar read access for today and tomorrow.
- Google Tasks read and completion access through the existing Google OAuth flow.
- A Now panel centered on the next calendar anchor.
- Body/prep state stored in SQLite and used to calculate prep time.
- Google Routes travel estimates from a configured home address to the next anchor location.
- Today, Calendar, and Upcoming sections.
- Local client cache for fast first paint, refreshed on focus and on a one-minute Now interval.
- PWA manifest and static asset serving from the same server.

Not shipped yet:

- Candidate capture.
- Brain-dump extraction.
- Candidate approval into Google Tasks.
- YNAB integration.
- Email or messaging ingestion.
- Notifications.

## Data Sources

| Thing                                | Source / owner                                      |
| ------------------------------------ | --------------------------------------------------- |
| Durable tasks                        | Google Tasks                                        |
| Task completion                      | Google Tasks API                                    |
| Hard time commitments                | Google Calendar                                     |
| Travel time                          | Google Routes API                                   |
| "What am I doing now / what's next?" | This app                                            |
| Body/prep state                      | This app, in SQLite                                 |
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

The Today section lists Google Tasks that are overdue or due today across all task lists. Tasks can be completed from the app and opened in Google Tasks.

### Upcoming

The Upcoming section lists Google Tasks due in the next seven days, grouped by due date. Tasks can be completed from the app and opened in Google Tasks.

### Returns

The Returns section lists incomplete tasks from the Google Tasks list named `Returns`. Due dates determine urgency and tasks without dates remain visible at the end of the section.

## Runtime Behavior

One Bun process (Hono) serves both API routes and the React SPA, backed by a local SQLite file. Pending migrations are applied at startup.

API routes:

```txt
GET  /api/ping
GET  /api/me
GET  /api/tasks
GET  /api/events
GET  /api/now
POST /api/tasks/:taskListId/:id/close
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

Configuration is environment variables, read once at startup (`src/server/config.ts`). `.env.example` and the README list every name with its default.

Required:

```txt
ALLOWED_EMAIL
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
SESSION_SECRET
```

Optional:

```txt
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_API_KEY
HOME_ADDRESS
TIMEZONE
TRANSPORT_DEFAULT
TRANSPORT_RESCUE
BUFFER_MINUTES
HOST
PORT
DATABASE_PATH
MIGRATIONS_DIR
STATIC_DIR
VITE_ALLOWED_HOSTS
```

`HOME_ADDRESS` and `GOOGLE_API_KEY` are required for travel estimates. Without them, events still render, but travel rows do not.

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

SQLite tables:

- `sessions`
- `oauth_tokens`
- `body_state`
- `candidates` (reserved for future capture work)
- `prefs` (reserved for future preference UI)

## Hard Rules

- Show Now / Today first, not the whole backlog.
- Do not create manual fixture data for production behavior.
- Google Tasks remains the durable task source.
- Prep/body state stays app-local and does not become Google Tasks.
- Google Calendar remains the source of hard time commitments.
- Do not moralize about money or travel tradeoffs in UI copy.
- AI can suggest, but the app records explicit user-approved actions.

## Future Work

- Candidate capture: brain dump → structured candidates.
- Candidate approval: approved todo candidates write to Google Tasks.
- Email and message scans for possible reply obligations.
- YNAB read-only context.
- Push notifications for event-imminent and must-not-rot cases.
- Object trial / return tracker.
- Daily shutdown / savepoint.
- Housing CRM as a separate project, not part of this app.
