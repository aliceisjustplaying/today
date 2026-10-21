import type { GithubEvent } from "./types";

/** Three or more stars on one repo, one after another on the same day, collapse into one row. */
export const BURST_MIN = 3;

export type FeedRow = { type: "event"; event: GithubEvent } | { type: "burst"; repo: string; events: GithubEvent[] };
export type FeedDay = { key: string; label: string; rows: FeedRow[] };

function dayKey(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone });
}

/** "Today", "Yesterday", then "Oct 9", by the calendar in `timeZone`. */
export function dayLabel(key: string, now: number, timeZone: string): string {
  const today = dayKey(now, timeZone);
  if (key === today) return "Today";
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (key === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

/**
 * Buckets newest-first events into days in `timeZone`, and collapses each run of adjacent stars
 * on the same repo (no other event between them) of at least BURST_MIN into a burst.
 */
export function groupFeed(events: GithubEvent[], now: number, timeZone: string): FeedDay[] {
  const days: FeedDay[] = [];
  for (const event of events) {
    const key = dayKey(event.at, timeZone);
    let day = days[days.length - 1];
    if (!day || day.key !== key) days.push((day = { key, label: dayLabel(key, now, timeZone), rows: [] }));
    const last = day.rows[day.rows.length - 1];
    const lastRepo = last && (last.type === "burst" ? last.repo : last.event.kind === "star" ? last.event.repo : null);
    if (event.kind === "star" && last && lastRepo === event.repo) {
      if (last.type === "burst") last.events.push(event);
      else day.rows[day.rows.length - 1] = { type: "burst", repo: event.repo, events: [last.event, event] };
    } else {
      day.rows.push({ type: "event", event });
    }
  }
  for (const day of days) {
    day.rows = day.rows.flatMap((row) =>
      row.type === "burst" && row.events.length < BURST_MIN ? row.events.map((event) => ({ type: "event" as const, event })) : [row],
    );
  }
  return days;
}

/** Short age for a row: "now", "4m", "3h", "2d". */
export function ago(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (24 * 60))}d`;
}

/** Up to two initials for the avatar fallback: "Mira Okafor" → "MO", "@quietcoder" → "Q". */
export function initials(name: string | null, login: string): string {
  const words = (name ?? login).split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
