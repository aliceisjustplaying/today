/**
 * Stars and forks on a GitHub user's public repos, as one feed.
 *
 * Budget: unauthenticated GitHub allows 60 requests an hour. Every refresh (at most one per
 * CACHE_MS) lists the repos, then refetches a repo's stargazers or forks only when its count
 * changed since the last refresh. Every request is conditional (If-None-Match), so an unchanged
 * page comes back as a 304. Display names are looked up once per login and kept for the life of
 * the process, a few per refresh.
 *
 * GitHub lists stargazers only to authenticated callers, so without GITHUB_TOKEN the feed has
 * forks only (and the repo totals, which still include stars).
 */

const API = "https://api.github.com";
const CACHE_MS = 10 * 60_000;
const WINDOW_MS = 30 * 24 * 60 * 60_000;
const MAX_EVENTS = 200;
const PER_PAGE = 100;
/** Stargazer pages read from the newest end, for repos with more than one page. */
const MAX_STAR_PAGES = 3;
const NAME_LOOKUPS_PER_REFRESH = { anonymous: 15, token: 80 };
const CONCURRENCY = 6;

export type GithubEvent = {
  kind: "star" | "fork";
  repo: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  /** Epoch ms. */
  at: number;
};

export type GithubRepo = { name: string; stars: number; forks: number; url: string };

export type GithubFeed = {
  user: string;
  repos: GithubRepo[];
  events: GithubEvent[];
  /** True when GitHub refused the stargazer lists for want of a token: the feed then holds forks only. */
  starsNeedToken: boolean;
  generatedAt: number;
};

export class GithubUnavailable extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;
type Actor = { login: string; avatarUrl: string; at: number };
type RepoState = { stars: number; forks: number; starEvents: Actor[]; forkEvents: Actor[] };

/** One feed per user and token; the server keeps a single instance. */
export class GithubSource {
  private etags = new Map<string, { etag: string; body: unknown }>();
  private repoState = new Map<string, RepoState>();
  private names = new Map<string, string | null>();
  /** GitHub only lists stargazers to signed-in callers; without a token, stop asking after the first 401. */
  private starsNeedToken = false;
  private feed: GithubFeed | null = null;
  private inflight: Promise<GithubFeed> | null = null;

  constructor(
    private user: string,
    private token: string | undefined,
    private fetchImpl: Fetch = fetch,
  ) {}

  /** The cached feed while it's fresh; otherwise refreshes, falling back to the last feed on error. */
  async get(now = Date.now()): Promise<GithubFeed> {
    if (this.feed && now - this.feed.generatedAt < CACHE_MS) return this.feed;
    this.inflight ??= this.refresh(now)
      .catch((e) => {
        if (this.feed) return this.feed;
        throw e;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async refresh(now: number): Promise<GithubFeed> {
    const repos = await this.listRepos();
    await pool(repos, CONCURRENCY, (repo) => this.refreshRepo(repo));
    for (const name of [...this.repoState.keys()]) {
      if (!repos.some((r) => r.name === name)) this.repoState.delete(name);
    }

    const since = now - WINDOW_MS;
    const events: GithubEvent[] = [];
    for (const [repo, state] of this.repoState) {
      for (const a of state.starEvents) if (a.at >= since) events.push({ kind: "star", repo, ...a, name: null });
      for (const a of state.forkEvents) if (a.at >= since) events.push({ kind: "fork", repo, ...a, name: null });
    }
    events.sort((a, b) => b.at - a.at);
    const kept = events.slice(0, MAX_EVENTS);

    const unnamed = [...new Set(kept.map((e) => e.login))].filter((login) => !this.names.has(login));
    const budget = this.token ? NAME_LOOKUPS_PER_REFRESH.token : NAME_LOOKUPS_PER_REFRESH.anonymous;
    await pool(unnamed.slice(0, budget), CONCURRENCY, async (login) => {
      try {
        const user = (await this.getJson(`/users/${encodeURIComponent(login)}`)) as { name?: string | null };
        this.names.set(login, user.name?.trim() || null);
      } catch {
        /* the row shows @login alone */
      }
    });
    for (const e of kept) e.name = this.names.get(e.login) ?? null;

    this.feed = {
      user: this.user,
      repos: repos
        .map((r) => ({ name: r.name, stars: r.stars, forks: r.forks, url: r.url }))
        .sort((a, b) => b.stars - a.stars || b.forks - a.forks || a.name.localeCompare(b.name)),
      events: kept,
      starsNeedToken: this.starsNeedToken,
      generatedAt: now,
    };
    return this.feed;
  }

  private async listRepos(): Promise<GithubRepo[]> {
    const repos: GithubRepo[] = [];
    for (let page = 1; page <= 10; page++) {
      const body = (await this.getJson(
        `/users/${encodeURIComponent(this.user)}/repos?type=owner&sort=full_name&per_page=${PER_PAGE}&page=${page}`,
      )) as { name: string; fork: boolean; private: boolean; stargazers_count: number; forks_count: number; html_url: string }[];
      for (const r of body) {
        if (!r.fork && !r.private) repos.push({ name: r.name, stars: r.stargazers_count, forks: r.forks_count, url: r.html_url });
      }
      if (body.length < PER_PAGE) break;
    }
    return repos;
  }

  /** Refetches a repo's stargazers or forks only when the count moved since the last refresh. */
  private async refreshRepo(repo: GithubRepo): Promise<void> {
    const prev = this.repoState.get(repo.name);
    const state: RepoState = prev ? { ...prev } : { stars: 0, forks: 0, starEvents: [], forkEvents: [] };
    if ((!prev || prev.stars !== repo.stars) && !this.starsNeedToken) {
      try {
        state.starEvents = repo.stars > 0 ? await this.stargazers(repo) : [];
        state.stars = repo.stars;
      } catch (e) {
        if (!(e instanceof GithubUnavailable && e.status === 401 && !this.token)) throw e;
        this.starsNeedToken = true;
      }
    }
    if (!prev || prev.forks !== repo.forks) {
      state.forkEvents = repo.forks > 0 ? await this.forks(repo) : [];
      state.forks = repo.forks;
    }
    this.repoState.set(repo.name, state);
  }

  /** Stargazers come oldest first, so read back from the last page until a page starts before the window. */
  private async stargazers(repo: GithubRepo): Promise<Actor[]> {
    const lastPage = Math.max(1, Math.ceil(repo.stars / PER_PAGE));
    const since = Date.now() - WINDOW_MS;
    const out: Actor[] = [];
    for (let page = lastPage; page >= 1 && page > lastPage - MAX_STAR_PAGES; page--) {
      const body = (await this.getJson(
        `/repos/${encodeURIComponent(this.user)}/${encodeURIComponent(repo.name)}/stargazers?per_page=${PER_PAGE}&page=${page}`,
        "application/vnd.github.star+json",
      )) as { starred_at: string; user: { login: string; avatar_url: string } | null }[];
      for (const s of body) if (s.user) out.push({ login: s.user.login, avatarUrl: s.user.avatar_url, at: Date.parse(s.starred_at) });
      const oldest = body[0] ? Date.parse(body[0].starred_at) : 0;
      if (oldest < since) break;
    }
    return out;
  }

  private async forks(repo: GithubRepo): Promise<Actor[]> {
    const body = (await this.getJson(
      `/repos/${encodeURIComponent(this.user)}/${encodeURIComponent(repo.name)}/forks?sort=newest&per_page=${PER_PAGE}`,
    )) as { created_at: string; owner: { login: string; avatar_url: string } }[];
    return body.map((f) => ({ login: f.owner.login, avatarUrl: f.owner.avatar_url, at: Date.parse(f.created_at) }));
  }

  private async getJson(path: string, accept = "application/vnd.github+json"): Promise<unknown> {
    const url = API + path;
    const cached = this.etags.get(url);
    const headers: Record<string, string> = {
      Accept: accept,
      "User-Agent": "today-dashboard",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (cached) headers["If-None-Match"] = cached.etag;

    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw new GithubUnavailable(`GitHub unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (res.status === 304 && cached) return cached.body;
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : null;
      throw new GithubUnavailable(`GitHub rate limit reached${mins ? `, resets in ${mins}m` : ""}`);
    }
    if (!res.ok) throw new GithubUnavailable(`GitHub ${res.status}`, res.status);
    const body: unknown = await res.json();
    const etag = res.headers.get("etag");
    if (etag) this.etags.set(url, { etag, body });
    return body;
  }
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

const sources = new Map<string, GithubSource>();

/** The process-wide source for this user and token, so the cache survives across requests. */
export function githubSource(user: string, token: string | undefined): GithubSource {
  const key = `${user}\n${token ?? ""}`;
  let source = sources.get(key);
  if (!source) sources.set(key, (source = new GithubSource(user, token)));
  return source;
}
