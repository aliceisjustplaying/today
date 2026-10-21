import { afterEach, beforeAll, expect, setSystemTime, test } from "bun:test";
import { serializeSigned } from "hono/utils/cookie";
import app from "./index";
import { loadConfig } from "./config";
import { migrateDb, openDb } from "./db";
import { oauthTokens, sessions } from "./db/schema";
import type { AppEnv } from "./env";

const realFetch = globalThis.fetch;
let env: AppEnv;
let cookie: string;

beforeAll(async () => {
  const db = openDb(":memory:");
  migrateDb(db, "drizzle/migrations");
  env = {
    ...loadConfig({
      ALLOWED_EMAIL: "me@example.com",
      GOOGLE_OAUTH_CLIENT_ID: "client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
      SESSION_SECRET: "session-secret",
      LINEAR_API_KEY: "lin_api_test",
      TIMEZONE: "Europe/Stockholm",
    }),
    db,
  };
  await db.insert(sessions).values({
    id: "calendar-session",
    userSub: "user-1",
    email: "me@example.com",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2030-01-01T00:00:00Z"),
  });
  await db.insert(oauthTokens).values({
    provider: "google",
    userSub: "user-1",
    accessToken: "fixture-token",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  cookie = await serializeSigned("today_session", "calendar-session", env.SESSION_SECRET);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSystemTime();
});

for (const status of [403, 429, 503, 401]) {
  for (const partial of [false, true]) {
    test(`calendar ${status} fails both callers with ${partial ? "another successful calendar" : "no successful calendar"}`, async () => {
      setSystemTime(new Date("2026-10-21T10:00:00Z"));
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/calendarList")) {
          return Response.json({ items: [{ id: "failed" }, ...(partial ? [{ id: "healthy" }] : [])] });
        }
        if (url.pathname.endsWith("/failed/events")) {
          return new Response("fixture failure", { status });
        }
        return Response.json({ items: [{ id: "healthy-event", start: { dateTime: "2026-10-21T12:00:00Z" } }] });
      }) as typeof fetch;

      for (const path of ["/api/events", "/api/now"]) {
        const res = await app.request(path, { headers: { cookie } }, env);
        expect(res.status).toBe(status === 401 ? 401 : 500);
        if (status === 401) {
          expect(await res.json()).toEqual({ error: "google_reauth_needed" });
        } else {
          expect(await res.text()).toBe("Internal Server Error");
        }
      }
    });
  }
}

test.each([
  ["Europe/Stockholm", "2026-10-21T21:59:59Z", "2026-10-22T22:00:00.000Z"],
  ["Europe/Stockholm", "2026-10-21T22:00:00Z", "2026-10-23T22:00:00.000Z"],
  ["Europe/Stockholm", "2026-10-21T22:30:00Z", "2026-10-23T22:00:00.000Z"],
  ["Europe/Stockholm", "2026-03-28T11:00:00Z", "2026-03-29T22:00:00.000Z"],
  ["Europe/Stockholm", "2026-10-24T10:00:00Z", "2026-10-25T23:00:00.000Z"],
  ["America/New_York", "2026-03-07T17:00:00Z", "2026-03-09T04:00:00.000Z"],
  ["America/New_York", "2026-10-31T16:00:00Z", "2026-11-02T05:00:00.000Z"],
  ["America/Havana", "2026-03-06T17:00:00Z", "2026-03-08T05:00:00.000Z"],
  ["America/Havana", "2026-10-30T16:00:00Z", "2026-11-01T04:00:00.000Z"],
])("both callers end tomorrow in %s at %s", async (timezone, now, timeMax) => {
  setSystemTime(new Date(now));
  const requests: URL[] = [];
  const event = {
    id: "tomorrow-late",
    summary: "Tomorrow appointment",
    start: { dateTime: new Date(Date.parse(timeMax) - 3_600_000).toISOString() },
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/calendarList")) {
      return Response.json({ items: [{ id: "primary" }] });
    }
    requests.push(url);
    return Response.json({ items: Date.parse(event.start.dateTime) < Date.parse(url.searchParams.get("timeMax")!) ? [event] : [] });
  }) as typeof fetch;

  for (const path of ["/api/events", "/api/now"]) {
    const res = await app.request(path, { headers: { cookie } }, { ...env, TIMEZONE: timezone });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(path === "/api/events" ? body.nextAnchor?.id : body.anchor?.id).toBe(event.id);
    if (path === "/api/events") expect(body.events).toEqual([event]);
  }
  expect(requests).toHaveLength(2);
  for (const url of requests) {
    expect(url.searchParams.get("timeMin")).toBe(new Date(now).toISOString());
    expect(url.searchParams.get("timeMax")).toBe(timeMax);
  }
});
