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
  mkdirSync(join(staticDir, "privacy"));
  writeFileSync(join(staticDir, "privacy", "index.html"), "<title>Privacy policy</title>");

  const config = loadConfig({
    ALLOWED_EMAIL: "me@example.com",
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    SESSION_SECRET: "session-secret",
    LINEAR_API_KEY: "lin_api_test",
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
  }).onConflictDoNothing();
  return serializeSigned("today_session", "sid-1", env.SESSION_SECRET);
}

describe("config", () => {
  test("fails fast on missing required env", () => {
    expect(() => loadConfig({ ALLOWED_EMAIL: "me@example.com" })).toThrow(
      "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, SESSION_SECRET, LINEAR_API_KEY or LINEAR_API_KEYS",
    );
  });

  test("collects Linear keys from LINEAR_API_KEY and LINEAR_API_KEYS", () => {
    const base = {
      ALLOWED_EMAIL: "me@example.com",
      GOOGLE_OAUTH_CLIENT_ID: "id",
      GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      SESSION_SECRET: "s",
    };
    expect(loadConfig({ ...base, LINEAR_API_KEY: "one" }).LINEAR_API_KEYS).toEqual(["one"]);
    expect(
      loadConfig({ ...base, LINEAR_API_KEY: "one", LINEAR_API_KEYS: "two\nthree, one" })
        .LINEAR_API_KEYS,
    ).toEqual(["one", "two", "three"]);
    expect(() => loadConfig(base)).toThrow("LINEAR_API_KEY or LINEAR_API_KEYS");
  });

  test("TIMEZONE defaults to the server's own zone", () => {
    const base = { ALLOWED_EMAIL: "me@example.com", GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "secret", SESSION_SECRET: "s", LINEAR_API_KEY: "k" };
    expect(loadConfig(base).TIMEZONE).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(loadConfig({ ...base, TIMEZONE: "Asia/Tokyo" }).TIMEZONE).toBe("Asia/Tokyo");
  });

  test("applies defaults", () => {
    expect(env.TIMEZONE).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(env.BUFFER_MINUTES).toBe("10");
    expect(env.PORT).toBe(8788);
    expect(env.LINEAR_RETURNS_LABEL).toBe("Returns");
    expect(env.LIMITS_URL).toBe("http://127.0.0.1:8790");
  });
});

describe("app", () => {
  test("ping", async () => {
    const res = await app.request("/api/ping", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  test("robots.txt is plain text that disallows everything, for GET and HEAD, with no session", async () => {
    const get = await app.request("/robots.txt", {}, env);
    expect(get.status).toBe(200);
    expect(get.headers.get("Content-Type")).toStartWith("text/plain");
    expect(await get.text()).toBe("User-agent: *\nDisallow: /\n");

    const head = await app.request("/robots.txt", { method: "HEAD" }, env);
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toStartWith("text/plain");
    expect(await head.text()).toBe("");

    const asJson = await app.request("/robots.txt", { headers: { Accept: "application/json" } }, env);
    expect(asJson.status).toBe(200);
    expect(asJson.headers.get("Content-Type")).toStartWith("text/plain");
  });

  test("every response says noindex, nofollow", async () => {
    for (const path of ["/robots.txt", "/", "/assets/app.js", "/api/me", "/api/nope", "/auth/google/start"]) {
      for (const method of ["GET", "HEAD"]) {
        const res = await app.request(path, { method }, env);
        expect(`${method} ${path} ${res.headers.get("X-Robots-Tag")}`).toBe(`${method} ${path} noindex, nofollow`);
      }
    }
  });

  test("api routes need a session", async () => {
    const res = await app.request("/api/me", {}, env);
    expect(res.status).toBe(401);
    expect((await app.request("/api/github", {}, env)).status).toBe(401);
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

  test("hashed assets are immutable and everything else revalidates", async () => {
    const asset = await app.request("/assets/app.js", {}, env);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    for (const path of ["/", "/index.html", "/some/client/route", "/privacy/"]) {
      const res = await app.request(path, {}, env);
      expect(res.headers.get("cache-control")).toBe("no-cache");
    }
  });

  test("a missing hashed asset is a 404, not index.html", async () => {
    const res = await app.request("/assets/index-old.js", {}, env);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).not.toContain("text/html");
  });

  test("serves the privacy page without a session", async () => {
    for (const path of ["/privacy", "/privacy/"]) {
      const res = await app.request(path, {}, env);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Privacy policy");
    }
  });

  test("falls back to index.html for client routes", async () => {
    for (const path of ["/", "/some/client/route"]) {
      const res = await app.request(path, {}, env);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>today</title>");
    }
  });

  test("completing routes to the workspace's key and rejects unknown workspaces", async () => {
    const cookie = await sessionCookie();
    const realFetch = globalThis.fetch;
    const auths: string[] = [];
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      auths.push(new Headers(init?.headers).get("authorization")!);
      const { query } = JSON.parse(String(init?.body));
      return Response.json(
        query.includes("issueUpdate")
          ? { data: { issueUpdate: { success: true } } }
          : { data: { issue: { team: { states: { nodes: [{ id: "done", position: 0 }] } } } } },
      );
    }) as typeof fetch;
    try {
      const multi = { ...env, LINEAR_API_KEYS: ["key-a", "key-b"] };
      const ok = await app.request("/api/tasks/1/uuid-9/close", { method: "POST", headers: { cookie } }, multi);
      expect(ok.status).toBe(200);
      expect(auths).toEqual(["key-b", "key-b"]);

      const bad = await app.request("/api/tasks/2/uuid-9/close", { method: "POST", headers: { cookie } }, multi);
      expect(bad.status).toBe(400);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("/api/limits proxies the limits summary behind the session", async () => {
    expect((await app.request("/api/limits", {}, env)).status).toBe(401);

    const cookie = await sessionCookie();
    const summary = { generatedAt: 1, accounts: [], errors: [] };
    const realFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return Response.json(summary);
    }) as typeof fetch;
    try {
      const ok = await app.request("/api/limits", { headers: { cookie } }, { ...env, LIMITS_URL: "http://limits.test:9", TIMEZONE: "America/New_York" });
      expect(ok.status).toBe(200);
      // The SPA formats reset times in the server's TIMEZONE, so the proxy adds it.
      expect(await ok.json()).toEqual({ ...summary, timezone: "America/New_York" });
      expect(urls).toEqual(["http://limits.test:9/api/summary"]);

      globalThis.fetch = (async () => {
        throw new TypeError("connection refused");
      }) as unknown as typeof fetch;
      const down = await app.request("/api/limits", { headers: { cookie } }, env);
      expect(down.status).toBe(502);
      expect(await down.json()).toEqual({ error: "limits unreachable: connection refused" });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("/api/limits/accounts/:id/balance forwards the balance to limits behind the session", async () => {
    const path = "/api/limits/accounts/capy%3Aalice/balance";
    const post = (body: unknown, cookie?: string) =>
      app.request(path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }, { ...env, LIMITS_URL: "http://limits.test:9" });
    expect((await post({ balanceUsd: 58.5 })).status).toBe(401);

    const cookie = await sessionCookie();
    const realFetch = globalThis.fetch;
    const calls: { url: string; init?: RequestInit }[] = [];
    let reply = Response.json({ account: { id: "capy:alice" } });
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return reply;
    }) as typeof fetch;
    try {
      expect((await post({ balanceUsd: "58.50" }, cookie)).status).toBe(400);
      expect(calls).toHaveLength(0);

      const ok = await post({ balanceUsd: 58.5, asOf: "ignored" }, cookie);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ account: { id: "capy:alice" } });
      expect(calls[0]!.url).toBe("http://limits.test:9/api/accounts/capy%3Aalice/balance");
      expect(new Headers(calls[0]!.init!.headers).get("X-Limits-Action")).toBe("balance");
      expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ balanceUsd: 58.5 });

      reply = Response.json({ error: "unknown account" }, { status: 404 });
      const missing = await post({ balanceUsd: 1 }, cookie);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: "unknown account" });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("session cookie authenticates and prep state persists in SQLite", async () => {
    const cookie = await sessionCookie();

    const me = await app.request("/api/me", { headers: { cookie } }, env);
    expect(await me.json()).toEqual({ email: "me@example.com", userSub: "user-1" });

    const update = await app.request(
      "/api/prep",
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stepId: 1, done: true, runningLate: "yes" }),
      },
      env,
    );
    expect(update.status).toBe(200);
    const prep = await update.json();
    expect(prep.runningLate).toBe(false);
    expect(prep.steps.map((s: { label: string; done: boolean }) => [s.label, s.done])).toEqual([
      ["ate", true],
      ["showered", false],
      ["shaved", false],
      ["dressed", false],
      ["packed", false],
    ]);
    expect(prep.remainingMinutes).toBe(40);

    const unknown = await app.request(
      "/api/prep",
      { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ stepId: 99, done: true }) },
      env,
    );
    expect(unknown.status).toBe(400);

    const badSteps = await app.request(
      "/api/prep/steps",
      { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ steps: [{ label: "", minutes: 5 }] }) },
      env,
    );
    expect(badSteps.status).toBe(400);

    const history = await app.request("/api/prep/history", { headers: { cookie } }, env);
    expect((await history.json()).days).toHaveLength(30);
  });
});
