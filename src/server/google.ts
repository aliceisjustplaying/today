import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { oauthTokens } from "./db/schema";
import type { Env } from "./env";

type RefreshResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

export class GoogleReauthNeeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleReauthNeeded";
  }
}

async function loadTokenRow(env: Cloudflare.Env, userSub: string) {
  const rows = await db(env.DB)
    .select()
    .from(oauthTokens)
    .where(
      and(eq(oauthTokens.provider, "google"), eq(oauthTokens.userSub, userSub)),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function refreshAccessToken(
  env: Cloudflare.Env,
  refreshToken: string,
  userSub: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 || res.status === 401) {
      throw new GoogleReauthNeeded(`refresh failed: ${text}`);
    }
    throw new Error(`Google refresh ${res.status}: ${text}`);
  }

  const data = (await res.json()) as RefreshResponse;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + data.expires_in * 1000);

  await db(env.DB)
    .update(oauthTokens)
    .set({
      accessToken: data.access_token,
      expiresAt,
      updatedAt: now,
    })
    .where(
      and(eq(oauthTokens.provider, "google"), eq(oauthTokens.userSub, userSub)),
    );

  return data.access_token;
}

export async function getValidGoogleAccessToken(
  env: Cloudflare.Env,
  userSub: string,
): Promise<string> {
  const row = await loadTokenRow(env, userSub);
  if (!row) throw new GoogleReauthNeeded("no stored token");

  const skewMs = 60 * 1000;
  if (row.expiresAt && row.expiresAt.getTime() - skewMs > Date.now()) {
    return row.accessToken;
  }

  if (!row.refreshToken) throw new GoogleReauthNeeded("no refresh token");
  return refreshAccessToken(env, row.refreshToken, userSub);
}

export type CalendarEventTime = { dateTime: string; timeZone?: string } | { date: string };

export type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: CalendarEventTime;
  end?: CalendarEventTime;
  status?: "confirmed" | "tentative" | "cancelled";
  transparency?: "opaque" | "transparent";
  htmlLink?: string;
};

type EventsListResponse = {
  items: CalendarEvent[];
  nextPageToken?: string;
  timeZone?: string;
};

export async function listCalendarEvents(
  accessToken: string,
  opts: { timeMin: Date; timeMax: Date; calendarId?: string },
): Promise<CalendarEvent[]> {
  const calId = encodeURIComponent(opts.calendarId ?? "primary");
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`);
  url.searchParams.set("timeMin", opts.timeMin.toISOString());
  url.searchParams.set("timeMax", opts.timeMax.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "100");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) throw new GoogleReauthNeeded("calendar 401");
  if (!res.ok) {
    throw new Error(`Calendar ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as EventsListResponse;
  return data.items.filter(
    (e) => e.status !== "cancelled" && e.transparency !== "transparent",
  );
}

type CalendarListItem = {
  id: string;
  summary?: string;
  selected?: boolean;
  primary?: boolean;
  hidden?: boolean;
  deleted?: boolean;
  accessRole?: string;
};

type CalendarListResponse = { items?: CalendarListItem[] };

export async function listCalendars(accessToken: string): Promise<CalendarListItem[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.status === 401) throw new GoogleReauthNeeded("calendarList 401");
  if (!res.ok) {
    throw new Error(`CalendarList ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as CalendarListResponse;
  return data.items ?? [];
}

export async function listAllCalendarEvents(
  accessToken: string,
  opts: { timeMin: Date; timeMax: Date },
): Promise<CalendarEvent[]> {
  const calendars = await listCalendars(accessToken);
  const visible = calendars.filter(
    (c) => !c.hidden && !c.deleted && c.selected !== false,
  );

  const results = await Promise.all(
    visible.map((c) =>
      listCalendarEvents(accessToken, { ...opts, calendarId: c.id }).catch(
        (err: unknown) => {
          if (err instanceof GoogleReauthNeeded) throw err;
          return [] as CalendarEvent[];
        },
      ),
    ),
  );

  const merged = results.flat();
  merged.sort((a, b) => {
    const aMs = eventStartMs(a) ?? 0;
    const bMs = eventStartMs(b) ?? 0;
    return aMs - bMs;
  });
  return merged;
}

export function eventStartMs(e: CalendarEvent): number | null {
  if (!e.start) return null;
  if ("dateTime" in e.start) return new Date(e.start.dateTime).getTime();
  if ("date" in e.start) return new Date(`${e.start.date}T00:00:00`).getTime();
  return null;
}

export function findNextAnchor(events: CalendarEvent[], now: Date): CalendarEvent | null {
  const nowMs = now.getTime();
  for (const e of events) {
    const startMs = eventStartMs(e);
    if (startMs != null && startMs > nowMs) return e;
  }
  return null;
}
