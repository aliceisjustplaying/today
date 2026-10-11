# Personal Control Panel — Spec

`today` is a personal **Now layer** above Linear and Google Calendar. It answers the short-horizon question those tools do not answer together:

> Given the next real anchor event, current body/admin state, and travel/prep time, what is the next sane action?

It is not a general todo app, calendar app, or life dashboard. The default view is the present: what is next, what must happen today, and what pressure is close enough to matter.

## Current v0

Opening the deployed app in the morning should be more useful in ten seconds than opening Linear + Calendar and doing the time math by hand.

The current app includes:

- Google sign-in with a single allowlisted email.
- Google Calendar read access for today and tomorrow.
- Linear issues assigned to you, read and completed through personal Linear API keys, one per workspace, merged into one view.
- A Now panel centered on the next calendar anchor.
- Body/prep state stored in SQLite and used to calculate prep time.
- Google Routes travel estimates from a configured home address to the next anchor location.
- Today, Calendar, and Upcoming sections.
- Local client cache for fast first paint, refreshed on focus and on a one-minute Now interval.
- PWA manifest and static asset serving from the same server.

Not shipped yet:

- Candidate capture.
- Brain-dump extraction.
- Candidate approval into Linear.
- YNAB integration.
- Email or messaging ingestion.
- Notifications.

## Data Sources

| Thing                                | Source / owner                                      |
| ------------------------------------ | --------------------------------------------------- |
| Durable tasks                        | Linear (issues assigned to you)                     |
| Task completion                      | Linear GraphQL `issueUpdate` → team's completed state |
| Returns                              | Linear issues carrying the `Returns` label          |
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

The Today section lists open Linear issues assigned to you (any state except completed or canceled) that are overdue or due today, across all teams. Each shows its project, or team key when it has no project. Issues can be completed from the app, which moves them to the team's first completed state using the key of the issue's workspace (`:workspace` is its index in the configured key list), and opened in Linear.

### Upcoming

The Upcoming section lists the same assigned issues due in the next seven days, grouped by due date. Issues can be completed from the app and opened in Linear.

The No date section lists the remaining open assigned issues with no due date, sorted by title, below Upcoming.

### Team tabs

Today, Upcoming and No date are split into tabs by Linear team. By default each team with open assigned issues gets its own tab (a team with none gets no tab), named after the team. `LINEAR_TABS` overrides this: `Name=TEAMKEY[,TEAMKEY…];Name=…` (for example `Life=HOME;Dev=DEV`). Configured tabs come first in the given order and are shown even when empty; any team not mapped still gets its own tab so nothing is hidden. The tab bar only appears with two or more tabs; each tab shows its overdue + due-today count, and the chosen tab is remembered on the device.

Calendar, Now and Returns stay outside the tabs: they are not Linear team views, and Returns is a single cross-team list.

### Returns

The Returns section lists open Linear issues carrying the label named by `LINEAR_RETURNS_LABEL` (default `Returns`, case-insensitive), whoever they are assigned to. It is merged across all configured workspaces. Due dates determine urgency and issues without dates remain visible at the end of the section.

## Runtime Behavior

One Bun process (Hono) serves both API routes and the React SPA, backed by a local SQLite file. Pending migrations are applied at startup.

API routes:

```txt
GET  /api/ping
GET  /api/me
GET  /api/tasks
GET  /api/events
GET  /api/returns
GET  /api/now
POST /api/tasks/:workspace/:id/close
GET  /api/prep
POST /api/prep
PUT  /api/prep/steps
GET  /api/prep/history
```

Auth routes:

```txt
GET  /auth/google/start
GET  /auth/google/callback
POST /auth/logout
```

Signed out, `/` shows a short description of the app, a Google sign-in link and a link to `/privacy`, a static privacy policy (`public/privacy/index.html`) that needs no session; both are required for Google OAuth app verification.

All `/api/*` routes except `/api/ping` require a session. Unknown `/api/*` routes return JSON 404. Non-API routes fall through to static assets so the SPA can handle client routes.

## Configuration

Configuration is environment variables, read once at startup (`src/server/config.ts`). `.env.example` and the README list every name with its default.

Required:

```txt
ALLOWED_EMAIL
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
SESSION_SECRET
LINEAR_API_KEY or LINEAR_API_KEYS
```

Optional:

```txt
GOOGLE_OAUTH_REDIRECT_URI
LINEAR_RETURNS_LABEL
LINEAR_TABS
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
  prep: PrepToday
  travelError: string | null
}

type PrepToday = {
  day: string // YYYY-MM-DD in TIMEZONE; checks and the late flag reset when it changes
  steps: { id: number; label: string; minutes: number; done: boolean; doneAt: string | null }[]
  runningLate: boolean
  remainingMinutes: number // minutes of unchecked steps, subtracted from the leave-by time
}
```

`POST /api/prep` takes `{ stepId, done }` and/or `{ runningLate }` for today. `PUT /api/prep/steps` replaces the ordered step list (`{ steps: [{ id?, label, minutes }] }`); steps left out are soft-removed so their history stays. `GET /api/prep/history` returns the last 30 days of checks with tick times, the late flag and each step's average tick time.

The prep pills only show when there is an anchor event. The day rolls over lazily: checks are stored per day, so nothing needs resetting.

SQLite tables:

- `sessions`
- `oauth_tokens`
- `prep_steps` (editable steps; `removed_at` marks removed ones)
- `prep_checks` (one row per day and step, with the tick time)
- `prep_days` (the per-day late flag)
- `candidates` (reserved for future capture work)
- `prefs` (reserved for future preference UI)

## Hard Rules

- Show Now / Today first, not the whole backlog.
- Do not create manual fixture data for production behavior.
- Linear remains the durable task source.
- Prep/body state stays app-local and does not become Linear issues.
- Google Calendar remains the source of hard time commitments.
- Do not moralize about money or travel tradeoffs in UI copy.
- AI can suggest, but the app records explicit user-approved actions.

## Future Work

- Candidate capture: brain dump → structured candidates.
- Candidate approval: approved todo candidates write to Linear (`issueCreate`).
- Email and message scans for possible reply obligations.
- YNAB read-only context.
- Push notifications for event-imminent and must-not-rot cases.
- Object trial / return tracker.
- Daily shutdown / savepoint.
- Housing CRM as a separate project, not part of this app.
