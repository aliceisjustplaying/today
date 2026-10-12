import { describe, expect, test } from "bun:test";
import { GithubSource, GithubUnavailable } from "./github";

const DAY = 86_400_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

type Call = { url: string; headers: Record<string, string> };

function fakeGithub(stars: number) {
  const calls: Call[] = [];
  const repos = [
    { name: "paint", fork: false, private: false, stargazers_count: stars, forks_count: 1, html_url: "https://github.com/me/paint" },
    { name: "copied", fork: true, private: false, stargazers_count: 9, forks_count: 0, html_url: "x" },
    { name: "quiet", fork: false, private: false, stargazers_count: 0, forks_count: 0, html_url: "https://github.com/me/quiet" },
  ];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, headers });
    if (headers["If-None-Match"] === '"same"') return new Response(null, { status: 304 });
    const path = url.replace("https://api.github.com", "");
    if (path.startsWith("/users/me/repos")) return Response.json(repos, { headers: { etag: '"same"' } });
    if (path.startsWith("/repos/me/paint/stargazers")) {
      const page = Number(new URL(url).searchParams.get("page"));
      // Page 2 holds the newest stars; page 1 starts 40 days ago, before the window.
      const base = page === 2 ? now - 5 * DAY : now - 40 * DAY;
      return Response.json(
        Array.from({ length: page === 2 ? stars - 100 : 100 }, (_, i) => ({ starred_at: iso(base + i * 1000), user: { login: `u${page}-${i}`, avatar_url: "a" } })),
      );
    }
    if (path.startsWith("/repos/me/paint/forks")) return Response.json([{ created_at: iso(now - DAY), owner: { login: "forker", avatar_url: "f" } }]);
    if (path.startsWith("/users/")) return Response.json({ name: path === "/users/forker" ? "Fran Forker" : null });
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("GithubSource", () => {
  test("without a token, a 401 on stargazers leaves a forks-only feed and stops asking", async () => {
    const gh = fakeGithub(103);
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).includes("/stargazers") ? Response.json({ message: "Requires authentication" }, { status: 401 }) : gh.fetchImpl(input, init)) as typeof fetch;
    const source = new GithubSource("me", undefined, fetchImpl);
    const feed = await source.get(now);
    expect(feed.starsNeedToken).toBe(true);
    expect(feed.events.map((e) => e.kind)).toEqual(["fork"]);
    expect(feed.repos[0]!.stars).toBe(103);

    const before = gh.calls.length;
    await source.get(now + 11 * 60_000);
    expect(gh.calls.length - before).toBe(1);
  });

  test("reads the newest stargazer pages and forks of public non-fork repos, within 30 days", async () => {
    const gh = fakeGithub(103);
    const feed = await new GithubSource("me", undefined, gh.fetchImpl).get(now);

    expect(feed.repos.map((r) => r.name)).toEqual(["paint", "quiet"]);
    const starPages = gh.calls.filter((c) => c.url.includes("/stargazers")).map((c) => new URL(c.url).searchParams.get("page"));
    expect(starPages).toEqual(["2", "1"]);
    expect(gh.calls.find((c) => c.url.includes("/stargazers"))!.headers.Accept).toBe("application/vnd.github.star+json");
    expect(gh.calls.some((c) => c.url.includes("/quiet/"))).toBe(false);
    expect(gh.calls.some((c) => "Authorization" in c.headers)).toBe(false);

    // Page 1's stars are 40 days old, so only page 2's three stars and the fork remain.
    expect(feed.events.map((e) => `${e.kind} ${e.login}`)).toEqual(["fork forker", "star u2-2", "star u2-1", "star u2-0"]);
    expect(feed.events[0]!.name).toBe("Fran Forker");
    expect(feed.events[1]!.name).toBeNull();
    expect(feed.starsNeedToken).toBe(false);
  });

  test("caches for ten minutes, then refetches only repos whose counts moved, with ETags", async () => {
    const gh = fakeGithub(103);
    const source = new GithubSource("me", "tok", gh.fetchImpl);
    await source.get(now);
    const first = gh.calls.length;

    await source.get(now + 5 * 60_000);
    expect(gh.calls.length).toBe(first);

    await source.get(now + 11 * 60_000);
    const second = gh.calls.slice(first);
    expect(second.map((c) => c.url.replace("https://api.github.com", "").split("?")[0])).toEqual(["/users/me/repos"]);
    expect(second[0]!.headers["If-None-Match"]).toBe('"same"');
    expect(second[0]!.headers.Authorization).toBe("Bearer tok");
  });

  test("serves the last feed when GitHub fails, and a clear error when there is none", async () => {
    const gh = fakeGithub(103);
    const source = new GithubSource("me", undefined, gh.fetchImpl);
    const feed = await source.get(now);

    const limited = (async () =>
      new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor((now + 30 * 60_000) / 1000)) } })) as unknown as typeof fetch;
    (source as unknown as { fetchImpl: typeof fetch }).fetchImpl = limited;
    expect(await source.get(now + 11 * 60_000)).toBe(feed);

    const fresh = new GithubSource("me", undefined, limited);
    const error = await fresh.get(now).catch((e) => e);
    expect(error).toBeInstanceOf(GithubUnavailable);
    expect(error.message).toStartWith("GitHub rate limit reached, resets in");
  });
});
