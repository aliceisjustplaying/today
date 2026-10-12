/**
 * Stars and forks on a GitHub user's public repos, as one feed for the Stars tab.
 *
 * Only stars (WatchEvent) and forks are ever stored, and never GITHUB_USER's own.
 *
 * GitHub no longer lists stargazers to anyone but collaborators, so stars come from the public
 * WatchEvents in each repo's events. Those only reach back 300 events / 90 days, so every star
 * and fork seen is kept in SQLite (github_events, keyed by GitHub's id) and the feed reads from
 * there. Forks come from the forks API. Stars we never saw as an event (a busy repo's events
 * roll over between polls) still show as an anonymous "+N stars" row, from the per-day counts
 * of /stargazers/history.
 *
 * Budget: a refresh at most every POLL_MS. Every request is conditional (If-None-Match), and a
 * 304 is free. A repo's events are polled no sooner than its X-Poll-Interval allows, and its
 * forks and star history are only refetched when its fork or star count moved. Any failure on
 * one repo's source is skipped and never breaks the rest of the feed.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "./db";
import { githubEvents, githubUsers } from "./db/schema";

const API = "https://api.github.com";
const POLL_MS = 10 * 60_000;
const WINDOW_MS = 30 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const MAX_EVENTS = 200;
const PER_PAGE = 100;
/** Event pages read on a repo's first poll, and at most after that when a whole page is new. */
const EVENT_PAGES = 3;
const NAME_LOOKUPS_PER_REFRESH = { anonymous: 10, token: 80 };
const CONCURRENCY = 6;

export type GithubEvent = {
  kind: "star" | "fork" | "stars";
  repo: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  /** Epoch ms. */
  at: number;
  /** "stars" rows only: stars that day with no event to name them. */
  count?: number;
};

export type GithubRepo = { name: string; stars: number; forks: number; url: string };

export type GithubFeed = {
  user: string;
  repos: GithubRepo[];
  events: GithubEvent[];
  /** True when no repo's events could be read on the last refresh: the feed has forks and stored stars only. */
  starsUnavailable: boolean;
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
type Page = { body: unknown; pollSeconds: number | null; changed: boolean };
export type RepoMemo = { stars: number; forks: number; pollAfter: number; starDays: Map<number, number> | null };

/** One feed per user and token; the server keeps a single instance. */
export class GithubSource {
  private etags = new Map<string, { etag: string; body: unknown }>();
  private memo = new Map<string, RepoMemo>();
  private repos: GithubRepo[] | null = null;
  private starsUnavailable = false;
  private refreshedAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(
    private db: DB,
    private user: string,
    private token: string | undefined,
    private fetchImpl: Fetch = fetch,
  ) {}

  /** The feed from the database, after a refresh from GitHub when the last one is older than POLL_MS. */
  async get(now = Date.now()): Promise<GithubFeed> {
    if (now - this.refreshedAt >= POLL_MS) {
      this.inflight ??= this.refresh(now).finally(() => {
        this.inflight = null;
      });
      try {
        await this.inflight;
      } catch (e) {
        if (!this.repos) throw e;
      }
    }
    return this.read(now);
  }

  private async refresh(now: number): Promise<void> {
    const repos = await this.listRepos();
    this.repos = repos;
    this.refreshedAt = now;
    let read = 0;
    let failed = 0;
    await pool(repos, CONCURRENCY, async (repo) => {
      const memo = this.memo.get(repo.name) ?? { stars: -1, forks: -1, pollAfter: 0, starDays: null };
      this.memo.set(repo.name, memo);
      if (now >= memo.pollAfter) {
        try {
          memo.pollAfter = now + (await this.pollEvents(repo, memo.stars < 0)) * 1000;
          read++;
        } catch {
          failed++;
        }
      }
      if (memo.forks !== repo.forks) {
        try {
          if (repo.forks > 0) await this.pollForks(repo);
          memo.forks = repo.forks;
        } catch {
          /* forks stay as stored */
        }
      }
      if (memo.stars !== repo.stars) {
        try {
          memo.starDays = repo.stars > 0 ? await this.starHistory(repo) : null;
          memo.stars = repo.stars;
        } catch {
          memo.starDays = null;
        }
      }
    });
    if (read + failed > 0) this.starsUnavailable = read === 0;
    await this.lookUpNames(now);
  }

  private async read(now: number): Promise<GithubFeed> {
    const since = now - WINDOW_MS;
    const rows = await this.db.select().from(githubEvents).where(gte(githubEvents.at, since)).orderBy(desc(githubEvents.at)).limit(MAX_EVENTS);
    const logins = [...new Set(rows.map((r) => r.login))];
    const names = new Map(
      logins.length ? (await this.db.select().from(githubUsers).where(inArray(githubUsers.login, logins))).map((u) => [u.login, u.name]) : [],
    );
    const events: GithubEvent[] = rows.filter((r) => !this.isOwner(r.login)).map((r) => ({
      kind: r.kind,
      repo: r.repo,
      login: r.login,
      name: names.get(r.login) ?? null,
      avatarUrl: r.avatarUrl,
      at: r.at,
    }));
    const stars = await this.db
      .select({ kind: githubEvents.kind, repo: githubEvents.repo, at: githubEvents.at })
      .from(githubEvents)
      .where(and(eq(githubEvents.kind, "star"), gte(githubEvents.at, since - DAY_MS)));
    events.push(...unseenStars(this.memo, stars, since, now));
    events.sort((a, b) => b.at - a.at);
    const repos = this.repos ?? [];
    return {
      user: this.user,
      repos: [...repos].sort((a, b) => b.stars - a.stars || b.forks - a.forks || a.name.localeCompare(b.name)),
      events,
      starsUnavailable: this.starsUnavailable,
      generatedAt: this.refreshedAt,
    };
  }

  /** GITHUB_USER's own stars and forks of her repos never show. */
  private isOwner(login: string): boolean {
    return login.toLowerCase() === this.user.toLowerCase();
  }

  private async listRepos(): Promise<GithubRepo[]> {
    const repos: GithubRepo[] = [];
    for (let page = 1; page <= 10; page++) {
      const { body } = await this.get_(`/users/${encodeURIComponent(this.user)}/repos?type=owner&sort=full_name&per_page=${PER_PAGE}&page=${page}`);
      const list = body as { name: string; fork: boolean; private: boolean; stargazers_count: number; forks_count: number; html_url: string }[];
      for (const r of list) {
        if (!r.fork && !r.private) repos.push({ name: r.name, stars: r.stargazers_count, forks: r.forks_count, url: r.html_url });
      }
      if (list.length < PER_PAGE) break;
    }
    return repos;
  }

  /**
   * Stores the repo's new WatchEvents (stars). Reads page 1, and further pages (up to EVENT_PAGES)
   * on the first poll or while every event on a page is new to us. Returns the poll interval in seconds.
   */
  private async pollEvents(repo: GithubRepo, first: boolean): Promise<number> {
    let interval = 60;
    for (let page = 1; page <= EVENT_PAGES; page++) {
      const res = await this.get_(`/repos/${encodeURIComponent(this.user)}/${encodeURIComponent(repo.name)}/events?per_page=${PER_PAGE}&page=${page}`);
      if (page === 1) interval = res.pollSeconds ?? interval;
      if (!res.changed) break;
      const events = res.body as { id: string; type: string; created_at: string; actor: { login: string; avatar_url: string } }[];
      // The owner's own stars are stored (the star history counts them) but never shown.
      const stars = events.filter((e) => e.type === "WatchEvent");
      const known = stars.length
        ? new Set((await this.db.select({ id: githubEvents.id }).from(githubEvents).where(inArray(githubEvents.id, stars.map((e) => e.id)))).map((r) => r.id))
        : new Set<string>();
      const fresh = stars.filter((e) => !known.has(e.id));
      if (fresh.length) {
        await this.db
          .insert(githubEvents)
          .values(fresh.map((e) => ({ id: e.id, kind: "star" as const, repo: repo.name, login: e.actor.login, avatarUrl: e.actor.avatar_url, at: Date.parse(e.created_at) })))
          .onConflictDoNothing();
      }
      const reachedKnown = known.size > 0;
      if (events.length < PER_PAGE || (!first && reachedKnown) || (!first && stars.length === 0)) break;
    }
    return interval;
  }

  private async pollForks(repo: GithubRepo): Promise<void> {
    const { body, changed } = await this.get_(`/repos/${encodeURIComponent(this.user)}/${encodeURIComponent(repo.name)}/forks?sort=newest&per_page=${PER_PAGE}`);
    if (!changed) return;
    const forks = (body as { id: number; created_at: string; owner: { login: string; avatar_url: string } }[]).filter((f) => !this.isOwner(f.owner.login));
    if (!forks.length) return;
    await this.db
      .insert(githubEvents)
      .values(forks.map((f) => ({ id: `fork:${f.id}`, kind: "fork" as const, repo: repo.name, login: f.owner.login, avatarUrl: f.owner.avatar_url, at: Date.parse(f.created_at) })))
      .onConflictDoNothing();
  }

  /** Stars per UTC day (keyed by the day's start, epoch ms) from /stargazers/history's weekly rows. */
  private async starHistory(repo: GithubRepo): Promise<Map<number, number>> {
    const { body } = await this.get_(`/repos/${encodeURIComponent(this.user)}/${encodeURIComponent(repo.name)}/stargazers/history`);
    const days = new Map<number, number>();
    for (const week of body as { week: number; days: number[] }[]) {
      week.days.forEach((n, i) => n > 0 && days.set(week.week * 1000 + i * DAY_MS, n));
    }
    return days;
  }

  private async lookUpNames(now: number): Promise<void> {
    const since = now - WINDOW_MS;
    const recent = await this.db.selectDistinct({ login: githubEvents.login }).from(githubEvents).where(gte(githubEvents.at, since));
    const logins = recent.map((r) => r.login);
    if (!logins.length) return;
    const known = new Set((await this.db.select({ login: githubUsers.login }).from(githubUsers).where(inArray(githubUsers.login, logins))).map((u) => u.login));
    const budget = this.token ? NAME_LOOKUPS_PER_REFRESH.token : NAME_LOOKUPS_PER_REFRESH.anonymous;
    await pool(logins.filter((l) => !known.has(l)).slice(0, budget), CONCURRENCY, async (login) => {
      try {
        const { body } = await this.get_(`/users/${encodeURIComponent(login)}`);
        const name = (body as { name?: string | null }).name?.trim() || null;
        await this.db.insert(githubUsers).values({ login, name, fetchedAt: now }).onConflictDoNothing();
      } catch {
        /* the row shows @login alone */
      }
    });
  }

  private async get_(path: string): Promise<Page> {
    const url = API + path;
    const cached = this.etags.get(url);
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
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
    const pollSeconds = Number(res.headers.get("x-poll-interval")) || null;
    if (res.status === 304 && cached) return { body: cached.body, pollSeconds, changed: false };
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : null;
      throw new GithubUnavailable(`GitHub rate limit reached${mins ? `, resets in ${mins}m` : ""}`, res.status);
    }
    if (!res.ok) throw new GithubUnavailable(`GitHub ${res.status}`, res.status);
    const body: unknown = await res.json();
    const etag = res.headers.get("etag");
    if (etag) this.etags.set(url, { etag, body });
    return { body, pollSeconds, changed: true };
  }
}

/**
 * Anonymous rows for stars the history counts but no stored event names: per repo and UTC day,
 * the history's count minus the WatchEvents we have, shown at noon that day (or now, if sooner).
 */
export function unseenStars(memo: Map<string, RepoMemo>, rows: { kind: string; repo: string; at: number }[], since: number, now: number): GithubEvent[] {
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== "star") continue;
    const key = `${r.repo}\n${r.at - (r.at % DAY_MS)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const out: GithubEvent[] = [];
  for (const [repo, m] of memo) {
    for (const [day, count] of m.starDays ?? []) {
      if (day + DAY_MS <= since || day > now) continue;
      const missing = count - (seen.get(`${repo}\n${day}`) ?? 0);
      if (missing > 0) out.push({ kind: "stars", repo, login: "", name: null, avatarUrl: "", at: Math.min(day + DAY_MS / 2, now), count: missing });
    }
  }
  return out;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

let shared: { key: string; source: GithubSource } | null = null;

/** The process-wide source, so the poll state and ETags survive across requests. */
export function githubSource(db: DB, user: string, token: string | undefined): GithubSource {
  const key = `${user}\n${token ?? ""}`;
  if (shared?.key !== key) shared = { key, source: new GithubSource(db, user, token) };
  return shared.source;
}
