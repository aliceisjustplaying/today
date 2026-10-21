import { describe, expect, test } from "bun:test";
import { openDb, migrateDb } from "./db";
import { githubEvents } from "./db/schema";
import { GithubSource, GithubUnavailable } from "./github";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.parse("2026-10-12T15:00:00Z");
const today = now - (now % DAY);
const iso = (ms: number) => new Date(ms).toISOString();
const sunday = Date.parse("2026-10-11T00:00:00Z");

function freshDb() {
  const db = openDb(":memory:");
  migrateDb(db, "drizzle/migrations");
  return db;
}

type Call = { path: string; headers: Record<string, string> };
type Reply = Response | ((call: Call) => Response);

/** A fake GitHub: routes by path prefix, records calls, answers 304 to a matching If-None-Match. */
function fakeGithub(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace("https://api.github.com", "");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call = { path, headers };
    calls.push(call);
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => path.startsWith(k));
    if (!key) return Response.json({ message: "Not Found" }, { status: 404 });
    const reply = routes[key]!;
    const res = typeof reply === "function" ? reply(call) : reply.clone();
    const etag = res.headers.get("etag");
    if (etag && headers["If-None-Match"] === etag) return new Response(null, { status: 304, headers: res.headers });
    return res;
  }) as typeof fetch;
  return { calls, fetchImpl, paths: () => calls.map((c) => c.path.split("?")[0]) };
}

const json = (body: unknown, headers: Record<string, string> = {}) => Response.json(body, { headers });
const watch = (id: string, login: string, at: number) => ({ id, type: "WatchEvent", created_at: iso(at), actor: { login, avatar_url: `https://avatars/${login}` } });

function routes(overrides: Record<string, Reply> = {}): Record<string, Reply> {
  return {
    "/users/me/repos": json(
      [
        { name: "paint", fork: false, private: false, stargazers_count: 3, forks_count: 1, html_url: "https://github.com/me/paint" },
        { name: "copied", fork: true, private: false, stargazers_count: 9, forks_count: 0, html_url: "x" },
        { name: "quiet", fork: false, private: false, stargazers_count: 0, forks_count: 0, html_url: "https://github.com/me/quiet" },
      ],
      { etag: '"repos"' },
    ),
    "/repos/me/paint/events": json(
      [
        watch("30", "uma", now - 60_000),
        { id: "29", type: "PushEvent", created_at: iso(now - 120_000), actor: { login: "me", avatar_url: "a" } },
        { id: "28", type: "PullRequestEvent", created_at: iso(now - 180_000), actor: { login: "someone", avatar_url: "a" } },
        watch("27", "me", now - 240_000),
        watch("26", "vic", now - 2 * DAY),
      ],
      { etag: '"paint-events"', "x-poll-interval": "60" },
    ),
    "/repos/me/quiet/events": json([], { etag: '"quiet-events"' }),
    "/repos/me/paint/forks": json([{ id: 77, created_at: iso(now - DAY), owner: { login: "forker", avatar_url: "https://avatars/forker" } }], { etag: '"forks"' }),
    "/repos/me/paint/stargazers/history": json([{ week: sunday / 1000, total: 2, days: [0, 2, 0, 0, 0, 0, 0] }]),
    "/users/uma": json({ name: "Uma Ray" }),
    "/users/": json({ name: null }),
    ...overrides,
  };
}

describe("GithubSource", () => {
  test("stars come from WatchEvents and forks from the forks API; pushes, PRs and the owner's own stars never show", async () => {
    const gh = fakeGithub(routes());
    const feed = await new GithubSource(freshDb(), "me", "tok", gh.fetchImpl).get(now);

    expect(feed.repos.map((r) => r.name)).toEqual(["paint", "quiet"]);
    expect(feed.events.map((e) => `${e.kind} ${e.login}`)).toEqual(["star uma", "fork forker", "star vic"]);
    expect(feed.events[0]!.name).toBe("Uma Ray");
    expect(feed.starsUnavailable).toBe(false);
    expect(gh.paths().some((p) => p!.endsWith("/stargazers"))).toBe(false);
    expect(gh.calls.every((c) => c.headers.Authorization === "Bearer tok")).toBe(true);
  });

  test("events are stored once by GitHub id and outlive the repo events window", async () => {
    const db = freshDb();
    let events = [watch("30", "uma", now - 60_000), watch("26", "vic", now - 2 * DAY)];
    const gh = fakeGithub(routes({ "/repos/me/paint/events": () => json(events) }));
    const source = new GithubSource(db, "me", "tok", gh.fetchImpl);
    await source.get(now);

    // Ten minutes on, GitHub's window has rolled: only a new star is listed. A restarted server re-reads it all.
    events = [watch("31", "wes", now + 5 * 60_000), watch("30", "uma", now - 60_000)];
    await source.get(now + 11 * 60_000);
    await new GithubSource(db, "me", "tok", gh.fetchImpl).get(now + 22 * 60_000);

    const stored = await db.select().from(githubEvents);
    expect(stored.map((e) => e.id).sort()).toEqual(["26", "30", "31", "fork:77"]);
    expect(new Set(stored.map((e) => e.id)).size).toBe(stored.length);
    const feed = await source.get(now + 23 * 60_000);
    expect(feed.events.filter((e) => e.kind === "star").map((e) => e.login)).toEqual(["wes", "uma", "vic"]);
  });

  test("fork pagination reads past 100 recent forks and stops at the count, time or known-history boundary", async () => {
    for (const boundary of ["short", "count", "time", "known"]) {
      const db = freshDb();
      const forks = Array.from({ length: 100 }, (_, i) => ({ id: i, created_at: iso(now - i * 60_000), owner: { login: `forker${i}`, avatar_url: "" } }));
      if (boundary === "time") forks[99]!.created_at = iso(now - 31 * DAY);
      if (boundary === "known") {
        await db.insert(githubEvents).values({ id: "fork:99", kind: "fork", repo: "paint", login: "forker99", avatarUrl: "", at: now - 99 * 60_000 });
      }
      const gh = fakeGithub(routes({
        "/repos/me/paint/forks": ({ path }) => json(path.includes("page=2") ? [
          { id: 100, created_at: iso(now - 100 * 60_000), owner: { login: "last-forker", avatar_url: "" } },
          ...(boundary === "count" ? Array.from({ length: 99 }, (_, i) => ({ id: 101 + i, created_at: iso(now - (101 + i) * 60_000), owner: { login: `extra${i}`, avatar_url: "" } })) : []),
        ] : forks, { link: '</repos/me/paint/forks?sort=newest&per_page=100&page=2>; rel="next"' }),
      }));
      const feed = await new GithubSource(db, "me", "tok", gh.fetchImpl).get(now);
      const requests = gh.calls.filter((c) => c.path.startsWith("/repos/me/paint/forks"));
      expect(requests.length).toBe(boundary === "time" || boundary === "known" ? 1 : 2);
      expect(feed.events.some((e) => e.login === "last-forker")).toBe(boundary === "short" || boundary === "count");
      expect((await db.select().from(githubEvents)).filter((e) => e.kind === "fork").length).toBe(boundary === "count" ? 200 : boundary === "short" ? 101 : boundary === "time" ? 99 : 100);
    }
  });

  test("forks are conditionally polled even when a deleted fork is replaced at the same total", async () => {
    let login = "first-forker";
    const gh = fakeGithub(routes({
      "/repos/me/paint/forks": () => json([{ id: login === "first-forker" ? 1 : 2, created_at: iso(now), owner: { login, avatar_url: "" } }], { etag: `"${login}"` }),
    }));
    const source = new GithubSource(freshDb(), "me", "tok", gh.fetchImpl);
    await source.get(now);
    login = "replacement-forker";
    const second = await source.get(now + 11 * 60_000);
    const third = await source.get(now + 22 * 60_000);
    expect(second.events.filter((e) => e.kind === "fork").map((e) => e.login).sort()).toEqual(["first-forker", "replacement-forker"]);
    expect(third.events).toEqual(second.events);
    expect(gh.calls.filter((c) => c.path.startsWith("/repos/me/paint/forks")).map((c) => c.headers["If-None-Match"])).toEqual([undefined, '"first-forker"', '"replacement-forker"']);
  });

  test("a full new page without stars does not hide stars on the following page", async () => {
    let initial = true;
    const gh = fakeGithub(routes({
      "/repos/me/paint/events": ({ path }) => json(initial ? [watch("known", "known-person", now - DAY)] : path.endsWith("&page=1")
        ? Array.from({ length: 100 }, (_, i) => ({ ...watch(`push${i}`, "me", now), type: "PushEvent" }))
        : [watch("new", "new-person", now), watch("known", "known-person", now - DAY), ...Array.from({ length: 98 }, (_, i) => ({ ...watch(`older-push${i}`, "me", now - DAY), type: "PushEvent" }))]),
    }));
    const source = new GithubSource(freshDb(), "me", "tok", gh.fetchImpl);
    await source.get(now);
    initial = false;
    const before = gh.calls.length;
    const feed = await source.get(now + 11 * 60_000);
    expect(feed.events.filter((e) => e.kind === "star").map((e) => e.login)).toEqual(["new-person", "known-person"]);
    expect(gh.calls.slice(before).filter((c) => c.path.startsWith("/repos/me/paint/events")).map((c) => c.path)).toEqual([
      "/repos/me/paint/events?per_page=100&page=1",
      "/repos/me/paint/events?per_page=100&page=2",
    ]);
  });

  test("a later re-star is stored by event id even for an existing login or legacy backfill", async () => {
    const db = freshDb();
    await db.insert(githubEvents).values([
      { id: "old", kind: "star", repo: "paint", login: "returning", avatarUrl: "", at: now - 31 * DAY },
      { id: "web:paint:legacy", kind: "star", repo: "paint", login: "legacy", avatarUrl: "", at: now - 31 * DAY },
    ]);
    const gh = fakeGithub(routes({ "/repos/me/paint/events": json([watch("new", "returning", now), watch("new-legacy", "legacy", now), watch("same-day", "returning", now - 60_000)]) }));
    const source = new GithubSource(db, "me", "tok", gh.fetchImpl);
    const feed = await source.get(now);
    await source.get(now + 11 * 60_000);
    expect(feed.events.filter((e) => e.kind === "star").map((e) => e.login).sort()).toEqual(["legacy", "returning", "returning"]);
    expect((await db.select().from(githubEvents)).map((e) => e.id).sort()).toEqual(["fork:77", "new", "new-legacy", "old", "same-day", "web:paint:legacy"]);
  });

  test("polls are conditional: a 304 changes nothing, and X-Poll-Interval holds a repo's events back", async () => {
    const gh = fakeGithub(
      routes({
        "/repos/me/paint/events": json([watch("30", "uma", now - 60_000)], { etag: '"paint-events"', "x-poll-interval": "1800" }),
      }),
    );
    const source = new GithubSource(freshDb(), "me", "tok", gh.fetchImpl);
    const first = await source.get(now);
    const before = gh.calls.length;

    expect((await source.get(now + 5 * 60_000)).events).toEqual(first.events);
    expect(gh.calls.length).toBe(before);

    const second = await source.get(now + 11 * 60_000);
    const later = gh.calls.slice(before);
    expect(later.map((c) => c.path.split("?")[0])).toEqual(["/users/me/repos", "/repos/me/paint/forks", "/repos/me/quiet/events"]);
    expect(later[1]!.headers["If-None-Match"]).toBe('"forks"');
    expect(later[0]!.headers["If-None-Match"]).toBe('"repos"');
    expect(later[0]!.headers.Authorization).toBe("Bearer tok");
    expect(second.events).toEqual(first.events);

    await source.get(now + 31 * 60_000);
    const paint = gh.calls.slice(before).filter((c) => c.path.startsWith("/repos/me/paint/events"));
    expect(paint.map((c) => c.headers["If-None-Match"])).toEqual(['"paint-events"']);
  });

  test("a 403 or 404 on any star source degrades to stars unavailable and keeps forks and totals", async () => {
    const denied = () => json({ message: "Resource not accessible by personal access token" }, { "x-accepted-github-permissions": "contents=write" });
    const gh = fakeGithub(
      routes({
        "/repos/me/paint/events": () => new Response(JSON.stringify({ message: "Resource not accessible by personal access token" }), { status: 403 }),
        "/repos/me/quiet/events": () => new Response("{}", { status: 404 }),
        "/repos/me/paint/stargazers/history": () => new Response(denied().body, { status: 403 }),
      }),
    );
    const feed = await new GithubSource(freshDb(), "me", "tok", gh.fetchImpl).get(now);
    expect(feed.starsUnavailable).toBe(true);
    expect(feed.events.map((e) => `${e.kind} ${e.login}`)).toEqual(["fork forker"]);
    expect(feed.repos[0]).toMatchObject({ name: "paint", stars: 3, forks: 1 });
  });

  test("stars the history counts but no event names show as one anonymous row per repo and day", async () => {
    const gh = fakeGithub(
      routes({
        "/repos/me/paint/events": json([watch("30", "uma", now - 60_000)]),
        "/repos/me/paint/stargazers/history": json([{ week: sunday / 1000, total: 4, days: [1, 3, 0, 0, 0, 0, 0] }]),
      }),
    );
    const feed = await new GithubSource(freshDb(), "me", "tok", gh.fetchImpl).get(now);
    const anon = feed.events.filter((e) => e.kind === "stars");
    expect(anon.map((e) => [e.repo, e.count, e.at])).toEqual([
      ["paint", 2, now],
      ["paint", 1, sunday + 19 * HOUR],
    ]);
  });

  test("the history counts stars by US Pacific date, so a 02:00Z star belongs to the day before", async () => {
    const gh = fakeGithub(
      routes({
        "/repos/me/paint/events": json([watch("30", "uma", today + 2 * HOUR)]),
        "/repos/me/paint/stargazers/history": json([{ week: sunday / 1000, total: 1, days: [1, 0, 0, 0, 0, 0, 0] }]),
      }),
    );
    const feed = await new GithubSource(freshDb(), "me", "tok", gh.fetchImpl).get(now);
    expect(feed.events.map((e) => `${e.kind} ${e.login}`)).toEqual(["star uma", "fork forker"]);
  });

  test("backfilled web stars keep their id and avatar form, get names looked up and are not doubled by a later WatchEvent", async () => {
    const db = freshDb();
    await db.insert(githubEvents).values({
      id: "web:paint:zed",
      kind: "star",
      repo: "paint",
      login: "zed",
      avatarUrl: "https://avatars.githubusercontent.com/zed?",
      at: sunday + 19 * HOUR,
    });
    const gh = fakeGithub(
      routes({
        "/repos/me/paint/events": json([watch("40", "zed", sunday + 20 * HOUR)]),
        "/repos/me/paint/stargazers/history": json([{ week: sunday / 1000, total: 1, days: [1, 0, 0, 0, 0, 0, 0] }]),
        "/users/zed": json({ name: "Zed Ash" }),
      }),
    );
    const feed = await new GithubSource(db, "me", "tok", gh.fetchImpl).get(now);
    expect((await db.select().from(githubEvents)).map((e) => e.id).sort()).toEqual(["fork:77", "web:paint:zed"]);
    const stars = feed.events.filter((e) => e.kind !== "fork");
    expect(stars).toEqual([
      { kind: "star", repo: "paint", login: "zed", name: "Zed Ash", avatarUrl: "https://avatars.githubusercontent.com/zed?", at: sunday + 19 * HOUR },
    ]);
  });

  test("without a feed yet, a rate limit is a clear error; with one, the stored feed is served", async () => {
    const limited = (() =>
      new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor((Date.now() + 30 * 60_000) / 1000)) } })) as Reply;
    const error = await new GithubSource(freshDb(), "me", "tok", fakeGithub({ "/": limited }).fetchImpl).get(now).catch((e) => e);
    expect(error).toBeInstanceOf(GithubUnavailable);
    expect(error.message).toStartWith("GitHub rate limit reached, resets in");

    const db = freshDb();
    const gh = fakeGithub(routes());
    const source = new GithubSource(db, "me", "tok", gh.fetchImpl);
    const feed = await source.get(now);
    (source as unknown as { fetchImpl: typeof fetch }).fetchImpl = fakeGithub({ "/": limited }).fetchImpl;
    expect((await source.get(now + 11 * 60_000)).events).toEqual(feed.events);
  });
});
