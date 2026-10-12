import { useCallback, useEffect, useMemo, useState } from "react";
import type { GithubEvent, GithubFeed, GithubRepo } from "./types";
import { getCached, setCached } from "./cache";
import { ChevronIcon } from "./icons";
import { REFETCH_GAP_MS, onResume, signInAgain, throttle } from "./resume";
import { reloadIfStale, supersededByDeploy } from "./updates";
import { DECOYS, decoy, decoyEach, decoyHandle, usePrivacy } from "./privacy";
import { ago, groupFeed, initials, type FeedRow } from "./stars-feed";

const POLL_MS = 5 * 60_000;
const TOP_REPOS = 4;

/** What a row shows for a person and a repo; in privacy mode, decoys. Counts stay real either way (they're public). */
type Names = {
  person: (e: GithubEvent) => { name: string | null; login: string };
  repo: (name: string) => string;
  blank: boolean;
};

export function Stars() {
  const p = usePrivacy();
  const [feed, setFeed] = useState<GithubFeed | null>(() => getCached<GithubFeed>("github"));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allRepos, setAllRepos] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/github");
      if (r.status === 401) {
        signInAgain();
        return;
      }
      const body = (await r.json().catch(() => null)) as (GithubFeed & { error?: string }) | null;
      if (!r.ok || !body) throw new Error(body?.error ?? `github ${r.status}`);
      if (await supersededByDeploy()) return;
      setFeed(body);
      setCached("github", body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const refetch = throttle(load, REFETCH_GAP_MS);
    const interval = window.setInterval(load, POLL_MS);
    const stopResume = onResume(() => {
      reloadIfStale();
      refetch();
    });
    return () => {
      window.clearInterval(interval);
      stopResume();
    };
  }, [load]);

  const names = useMemo<Names>(() => {
    if (!p.on) return { person: (e) => ({ name: e.name, login: e.login }), repo: (n) => n, blank: false };
    // Decoy the repos on screen first (top totals, then the feed), so they get distinct names from the pool.
    const counted = feed?.repos.filter((r) => r.stars > 0 || r.forks > 0) ?? [];
    const real = [
      ...new Set([...counted.slice(0, TOP_REPOS).map((r) => r.name), ...(feed?.events.map((e) => e.repo) ?? []), ...counted.map((r) => r.name)]),
    ];
    const picks = decoyEach("repo", real);
    const decoys = new Map(real.map((name, i) => [name, i < DECOYS.repo.length ? picks[i]! : `${picks[i]}-${Math.floor(i / DECOYS.repo.length) + 1}`]));
    return {
      person: (e) => ({ name: e.name ? decoy("person", e.login) : null, login: decoyHandle(e.login) }),
      repo: (n) => decoys.get(n) ?? decoy("repo", n),
      blank: true,
    };
  }, [p.on, feed]);

  if (!feed) {
    if (loading) return <StarsSkeleton />;
    return (
      <section className="section limits-down" role="alert">
        <h2 className="section-title">Stars unavailable</h2>
        <p className="limits-down-text">{error ?? "No data from GitHub."}</p>
        <button type="button" className="limits-retry" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  const now = Date.now();
  const tz = feed.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const counted = feed.repos.filter((r) => r.stars > 0 || r.forks > 0);
  const shownRepos = allRepos ? counted : counted.slice(0, TOP_REPOS);
  const days = groupFeed(feed.events, now, tz);

  return (
    <section className="section stars">
      <h2 className="section-title">Stars</h2>
      {error && <p className="stars-note">{error}. Showing data from {new Date(feed.generatedAt).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}.</p>}
      {feed.starsUnavailable && <p className="stars-note">New stars are unavailable right now. Forks and totals are current.</p>}
      {counted.length > 0 && (
        <div className="stars-totals">
          {shownRepos.map((r) => (
            <RepoTotal key={r.name} repo={r} label={names.repo(r.name)} />
          ))}
          {counted.length > TOP_REPOS && (
            <button type="button" className="stars-total stars-total--more" onClick={() => setAllRepos(!allRepos)}>
              {allRepos ? "fewer" : `+${counted.length - TOP_REPOS} more`}
            </button>
          )}
        </div>
      )}
      {days.length === 0 ? (
        <StarsEmpty repos={feed.repos} />
      ) : (
        days.map((day) => (
          <div key={day.key}>
            <h3 className="day-label stars-day">{day.label}</h3>
            <ul className="stars-feed">
              {day.rows.map((row) => (
                <Row key={rowKey(row)} row={row} now={now} names={names} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

const rowKey = (row: FeedRow) =>
  row.type === "burst" ? `b:${row.repo}:${row.events[0]!.at}` : `${row.event.kind}:${row.event.repo}:${row.event.login}:${row.event.at}`;

function RepoTotal({ repo, label }: { repo: GithubRepo; label: string }) {
  return (
    <span className="stars-total">
      {label}
      <StarIcon />
      <b>{repo.stars.toLocaleString("en-US")}</b>
      {repo.forks > 0 && (
        <>
          <ForkIcon />
          <b>{repo.forks.toLocaleString("en-US")}</b>
        </>
      )}
    </span>
  );
}

function Row({ row, now, names }: { row: FeedRow; now: number; names: Names }) {
  const [open, setOpen] = useState(false);
  if (row.type === "event") return <EventRow e={row.event} now={now} names={names} />;
  const first = names.person(row.events[0]!);
  return (
    <li className="stars-burst-wrap">
      <button type="button" className="stars-item stars-burst" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="stars-avatar stars-avatar--burst" aria-hidden="true">
          <StarIcon />
        </span>
        <span className="stars-main">
          <span className="stars-who">
            {row.events.length} people starred <span className="stars-repo">{names.repo(row.repo)}</span>
          </span>
          <span className="stars-what">
            <span className="stars-stack" aria-hidden="true">
              {row.events.slice(0, 4).map((e) => (
                <Avatar key={e.login} e={e} names={names} small />
              ))}
            </span>
            <span className="stars-others">
              @{first.login} and {row.events.length - 1} others
            </span>
          </span>
        </span>
        <span className="stars-side">
          <span className="stars-time">{ago(row.events[0]!.at, now)}</span>
          <span className={`day-toggle-icon ${open ? "day-toggle-icon--open" : ""}`} aria-hidden="true">
            <ChevronIcon />
          </span>
        </span>
      </button>
      {open && (
        <ul className="stars-feed stars-burst-list">
          {row.events.map((e) => (
            <EventRow key={e.login} e={e} now={now} names={names} />
          ))}
        </ul>
      )}
    </li>
  );
}

function EventRow({ e, now, names }: { e: GithubEvent; now: number; names: Names }) {
  if (e.kind === "stars") {
    return (
      <li className="stars-item">
        <span className="stars-avatar stars-avatar--burst" aria-hidden="true">
          <StarIcon />
        </span>
        <span className="stars-main">
          <span className="stars-who">
            +{e.count} {e.count === 1 ? "star" : "stars"} on <span className="stars-repo">{names.repo(e.repo)}</span>
          </span>
          <span className="stars-what">GitHub doesn't say who</span>
        </span>
        <span className="stars-time">{ago(e.at, now)}</span>
      </li>
    );
  }
  const who = names.person(e);
  return (
    <li className="stars-item">
      <Avatar e={e} names={names} />
      <span className="stars-main">
        <span className="stars-who">
          {who.name ? (
            <>
              {who.name}
              <span className="stars-login">@{who.login}</span>
            </>
          ) : (
            `@${who.login}`
          )}
        </span>
        <span className="stars-what">
          {e.kind === "star" ? <StarIcon /> : <ForkIcon />}
          {e.kind === "star" ? "starred" : "forked"} <span className="stars-repo">{names.repo(e.repo)}</span>
        </span>
      </span>
      <span className="stars-time">{ago(e.at, now)}</span>
    </li>
  );
}

/** The GitHub avatar, the initials when it fails to load, or a blank circle in privacy mode. */
function Avatar({ e, names, small }: { e: GithubEvent; names: Names; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const cls = `stars-avatar${small ? " stars-avatar--small" : ""}`;
  if (names.blank) return <span className={`${cls} stars-avatar--blank`} aria-hidden="true" />;
  if (e.avatarUrl && !failed) {
    const src = `${e.avatarUrl}${e.avatarUrl.includes("?") ? "&" : "?"}s=${small ? 72 : 108}`;
    return <img className={cls} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  const label = initials(e.name, e.login);
  return (
    <span className={`${cls} stars-avatar--initials`} data-tint={e.login.length % 5} aria-hidden="true">
      {small ? label.slice(0, 1) : label}
    </span>
  );
}

function StarsEmpty({ repos }: { repos: GithubRepo[] }) {
  const stars = repos.reduce((n, r) => n + r.stars, 0);
  const forks = repos.reduce((n, r) => n + r.forks, 0);
  return (
    <div className="stars-empty">
      <span className="stars-empty-mark" aria-hidden="true">
        <StarIcon size={18} />
      </span>
      <p>No new stars or forks in the last 30 days.</p>
      <p>
        Your repos have <b>{stars.toLocaleString("en-US")} stars</b> and <b>{forks.toLocaleString("en-US")} forks</b> in all.
      </p>
    </div>
  );
}

function StarsSkeleton() {
  return (
    <section className="section stars" aria-busy="true" aria-label="Loading stars">
      <h2 className="section-title">Stars</h2>
      <div className="stars-totals">
        <span className="stars-skel" style={{ width: 90, height: 19 }} />
        <span className="stars-skel" style={{ width: 70, height: 19 }} />
      </div>
      <ul className="stars-feed">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="stars-item">
            <span className="stars-avatar stars-skel" />
            <span className="stars-main">
              <span className="stars-skel" style={{ height: 12, width: "60%", marginTop: 3 }} />
              <span className="stars-skel" style={{ height: 10, width: "44%", marginTop: 8 }} />
            </span>
            <span className="stars-skel" style={{ height: 10, width: 20, marginTop: 4 }} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="3.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="3.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="12.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 5.1v1.4c0 1 .8 1.8 1.8 1.8h3.4c1 0 1.8-.8 1.8-1.8V5.1M8 8.3v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
