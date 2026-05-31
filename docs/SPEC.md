# Personal Control Panel — Spec

The `today` project is not a todo app. It is a personal **Now layer** sitting above Todoist, Google Calendar, and YNAB, doing the synthesis those tools won't do together.

## Core product sentence

> Given the next real anchor event, current body/admin state, and travel/prep time, what is the next sane action?

## Bar for v0

Opening the deployed app in the morning gives a better answer in ten seconds than opening Todoist + Calendar + email + brain.

It is **not** comprehensive. It reduces one specific friction: the executive-function math of "what does this calendar + task + body situation mean in time?"

## What the app does that the others don't

Existing tools each hold a slice; the head is the volatile RAM joining them.

| Thing                                | Where it belongs                                |
| ------------------------------------ | ----------------------------------------------- |
| Durable tasks                        | Todoist                                         |
| Hard time commitments                | Google Calendar                                 |
| Money context                        | YNAB (read-only, contextual)                    |
| "What am I doing now / what's next?" | This app                                        |
| Body/leaving state                   | This app (local state, not Todoist)             |
| Message reply obligations            | This app (Candidate queue)                      |
| AI-extracted possible tasks          | Candidates — not real tasks until approved      |

## v0 sections

### Now

The killer feature. Centred on the next anchor.

Example output:

```
NOW
Monday 1:47pm

Next event:
Co-living / coding / social thing at 6:30pm
Location: X

Time remaining: 4h 43m

Default travel:
Public transport: 40m
Leave by: 5:40pm
Start getting ready by: 4:50pm

Uber rescue:
Uber: 20m
Leave by: 6:00pm
Use only if running late / low capacity
```

Body-state buttons that recalculate Now:

- I haven't eaten
- I need to shower
- I need to shave
- I am not dressed
- I need to pack
- I am running late
- I am skipping this event
- I left

Tapping a state moves the relevant prep step to the top and shrinks the available work block.

### Today

- Todoist tasks due today
- Overdue
- Manually pinned "must not rot" tasks

### Upcoming pressure

- Tomorrow
- Next 7 days
- Return windows / appointments / deadlines
- Grouped (admin / health / housing / money / work)

### Capture

- Text box: brain dump → extract Candidates
- Approve → write to Todoist
- No fancy editing in v0

## Domain model (v0)

```ts
type Anchor = {
  source: "google_calendar"
  externalId: string
  startsAt: string
  endsAt: string
  title: string
  location?: string
  travelHints?: { mode: string; minutes: number }[]
}

type PrepStep = {
  id: string
  label: string
  estimateMinutes: number
  required: boolean
  satisfied: boolean
}

type BodyState = {
  eaten: boolean
  showered: boolean
  shaved: boolean
  dressed: boolean
  packed: boolean
  runningLate: boolean
  updatedAt: string
}

type Candidate = {
  id: string
  kind: "todo" | "reply" | "calendar" | "waiting" | "note"
  source: {
    app: "email" | "telegram" | "discord" | "manual" | "brain_dump"
    account?: string
    url?: string
    sender?: string
    timestamp?: string
  }
  summary: string
  proposedAction: string
  urgency: "now" | "today" | "this_week" | "later" | "unknown"
  confidence: "high" | "medium" | "low"
  status: "candidate" | "approved" | "ignored" | "snoozed" | "done"
}

type TransportPreference = {
  defaultMode: "transit" | "walk" | "cycle" | "drive"
  rescueMode?: "uber" | "drive" | "taxi"
  rescueRule?: string  // human-readable, surfaced as neutral context, never moralizing
}
```

## Hard rules

- AI can suggest. The app records.
- AI outputs Candidates, not real tasks, unless approved.
- Every Candidate has a source.
- Every action has an audit log.
- The default view hides the backlog.
- The app shows Now / Today first, not "all of life."
- No moralising about money. Encode preferences neutrally.
- No manual/fixture data. Only real integrations.

## Out of scope for v0

- WhatsApp / Signal ingestion
- Discord general scraping (bot-only and only specific channels later)
- Push notifications (only event-imminent + must-not-rot, added after v0)
- YNAB integration (v0.5 — encode money preferences as static config first)
- Email scanning (post-v0)
- Object trial / return tracker (post-v0)
- Daily shutdown / savepoint (post-v0)
- Housing CRM (separate project; do not bolt onto v0)

## v0 build milestones

- Hosted Worker with Google sign-in allowlisted to one configured email
- Todoist OAuth + read Today / Overdue / Next-7
- Google Calendar OAuth + read today + tomorrow events
- Routes API integration for travel time on the next anchor
- Now panel: anchor + leave-by + prep-start + body-state buttons
- Today / Upcoming panels
- Brain-dump → Candidate extraction
- Approve Candidate → Todoist write
- PWA manifest + installable on iOS

After v0 ships, the order is: email scan, Telegram capture, YNAB context, object/return tracker, daily savepoint.
