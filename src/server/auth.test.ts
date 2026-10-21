import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import app from "./index";
import { loadConfig } from "./config";
import { migrateDb, openDb } from "./db";
import { oauthTokens, sessions } from "./db/schema";
import type { AppEnv } from "./env";

const realFetch = globalThis.fetch;
let env: AppEnv;
let upstreamCalls: string[];

beforeEach(() => {
  const db = openDb(":memory:");
  migrateDb(db, "drizzle/migrations");
  env = {
    ...loadConfig({
      ALLOWED_EMAIL: "me@example.com",
      GOOGLE_OAUTH_CLIENT_ID: "fixture-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "fixture-secret",
      SESSION_SECRET: "fixture-session-secret",
      LINEAR_API_KEY: "fixture-linear-key",
    }),
    db,
  };
  upstreamCalls = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const endpoint = String(url);
    upstreamCalls.push(endpoint);
    if (endpoint === "https://oauth2.googleapis.com/token") {
      return Response.json({
        access_token: "fixture-access-token",
        refresh_token: "fixture-refresh-token",
        expires_in: 3600,
        scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
      });
    }
    if (endpoint === "https://www.googleapis.com/oauth2/v2/userinfo") {
      return Response.json({ id: "fixture-user", email: "me@example.com" });
    }
    throw new Error(`Unexpected upstream request: ${endpoint}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  env.db.$client.close();
});

describe("Google OAuth state", () => {
  test.each([
    ["missing query and cookie", "", ""],
    ["missing query", "", "state=fixture-state"],
    ["missing cookie", "&state=fixture-state", ""],
    ["empty query and cookie", "&state=", "state="],
    ["mismatched state", "&state=other-state", "state=fixture-state"],
  ])("rejects %s before contacting Google", async (_name, query, cookie) => {
    const res = await app.request(
      `/auth/google/callback?code=fixture-code${query}`,
      { headers: { cookie } },
      env,
    );

    expect(res.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await env.db.select().from(sessions)).toEqual([]);
    expect(await env.db.select().from(oauthTokens)).toEqual([]);
  });

  test("matching state signs in and consumes the state cookie", async () => {
    const start = await app.request("/auth/google/callback", {}, env);
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    expect(state).toBeTruthy();
    const stateCookie = start.headers.getSetCookie()[0]!.split(";")[0]!;
    expect(stateCookie).toBe(`state=${state}`);
    expect(upstreamCalls).toEqual([]);

    const callback = `/auth/google/callback?code=fixture-code&state=${state}`;
    const res = await app.request(callback, { headers: { cookie: stateCookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(upstreamCalls).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://www.googleapis.com/oauth2/v2/userinfo",
    ]);
    expect(res.headers.getSetCookie()).toContain("state=; Max-Age=0; Path=/");
    const sessionCookie = res.headers.getSetCookie()
      .find((cookie) => cookie.startsWith("today_session="))!.split(";")[0]!;
    const me = await app.request("/api/me", { headers: { cookie: sessionCookie } }, env);
    expect(await me.json()).toEqual({ email: "me@example.com", userSub: "fixture-user" });
    expect(await env.db.select().from(oauthTokens)).toMatchObject([
      { accessToken: "fixture-access-token", refreshToken: "fixture-refresh-token" },
    ]);

    upstreamCalls = [];
    const replay = await app.request(callback, { headers: { cookie: sessionCookie } }, env);
    expect(replay.status).toBe(401);
    expect(upstreamCalls).toEqual([]);
    expect(await env.db.select().from(sessions)).toHaveLength(1);
  });
});
