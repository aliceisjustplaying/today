import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeSigned } from "hono/utils/cookie";
import app from "./index";
import { loadConfig } from "./config";
import { migrateDb, openDb } from "./db";
import { sessions } from "./db/schema";
import type { AppEnv } from "./env";

const root = mkdtempSync(join(tmpdir(), "today-test-"));
const staticDir = join(root, "client");
let env: AppEnv;

beforeAll(() => {
  mkdirSync(join(staticDir, "assets"), { recursive: true });
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>today</title>");
  writeFileSync(join(staticDir, "assets", "app.js"), "console.log('app')");

  const config = loadConfig({
    ALLOWED_EMAIL: "me@example.com",
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    SESSION_SECRET: "session-secret",
    STATIC_DIR: staticDir,
  });
  const db = openDb(":memory:");
  migrateDb(db, "drizzle/migrations");
  env = { ...config, db };
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

async function sessionCookie() {
  const now = new Date();
  await env.db.insert(sessions).values({
    id: "sid-1",
    userSub: "user-1",
    email: "me@example.com",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  });
  return serializeSigned("today_session", "sid-1", env.SESSION_SECRET);
}

describe("config", () => {
  test("fails fast on missing required env", () => {
    expect(() => loadConfig({ ALLOWED_EMAIL: "me@example.com" })).toThrow(
      "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, SESSION_SECRET",
    );
  });

  test("applies defaults", () => {
    expect(env.TIMEZONE).toBe("Europe/London");
    expect(env.BUFFER_MINUTES).toBe("10");
    expect(env.PORT).toBe(8788);
  });
});

describe("app", () => {
  test("ping", async () => {
    const res = await app.request("/api/ping", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  test("api routes need a session", async () => {
    const res = await app.request("/api/me", {}, env);
    expect(res.status).toBe(401);
  });

  test("unknown api routes are JSON 404s, not the SPA", async () => {
    const res = await app.request("/api/nope", {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  test("serves built assets", async () => {
    const res = await app.request("/assets/app.js", {}, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("console.log('app')");
  });

  test("falls back to index.html for client routes", async () => {
    for (const path of ["/", "/some/client/route"]) {
      const res = await app.request(path, {}, env);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>today</title>");
    }
  });

  test("session cookie authenticates and body state persists in SQLite", async () => {
    const cookie = await sessionCookie();

    const me = await app.request("/api/me", { headers: { cookie } }, env);
    expect(await me.json()).toEqual({ email: "me@example.com", userSub: "user-1" });

    const update = await app.request(
      "/api/body-state",
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ eaten: true, shaved: "yes" }),
      },
      env,
    );
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ id: 1, eaten: true, shaved: false });
  });
});
