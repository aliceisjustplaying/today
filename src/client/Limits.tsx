import { useCallback, useEffect, useState } from "react";
import type { LimitsAccount, LimitsSummary, LimitsWindow } from "./types";
import { getCached, setCached } from "./cache";
import {
  clampPercent,
  projectionLabel,
  resetLabel,
  spendLines,
  statusLabel,
  updatedLabel,
  windowTone,
} from "./limits-format";

const PROVIDER_NAMES: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
  capy: "Capy",
  "opencode-go": "OpenCode Go",
  opencode: "OpenCode",
  openrouter: "OpenRouter",
};

export function Limits() {
  const [summary, setSummary] = useState<LimitsSummary | null>(() => getCached<LimitsSummary>("limits"));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/limits");
      if (r.status === 401) {
        window.location.href = "/auth/google/start";
        return;
      }
      const body = (await r.json().catch(() => null)) as (LimitsSummary & { error?: string }) | null;
      if (!r.ok || !body) throw new Error(body?.error ?? `limits ${r.status}`);
      setSummary(body);
      setCached("limits", body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  if (!summary) {
    if (loading) return <p className="tabs-empty">Loading limits…</p>;
    return (
      <section className="section limits-down" role="alert">
        <h2 className="section-title">Limits unavailable</h2>
        <p className="limits-down-text">{error ?? "No data from the limits service."}</p>
        <button type="button" className="limits-retry" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  const now = Date.now();
  return (
    <>
      {error && (
        <p className="limits-stale" role="status">
          Showing data from {new Date(summary.generatedAt).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}. {error}
        </p>
      )}
      {summary.errors?.map((e) => (
        <p key={e.providers.join(",")} className="limits-stale">
          {e.providers.join(", ")}: {e.message}
        </p>
      ))}
      {summary.accounts.length === 0 && <p className="tabs-empty">No accounts configured in limits.</p>}
      {summary.accounts.map((a) => (
        <AccountCard key={a.id} account={a} now={now} />
      ))}
    </>
  );
}

function AccountCard({ account: a, now }: { account: LimitsAccount; now: number }) {
  const spend = spendLines(a);
  return (
    <section className="section limits-card" data-status={a.status}>
      <div className="limits-head">
        <h2 className="section-title limits-name">{a.label}</h2>
        <span className="limits-provider">{PROVIDER_NAMES[a.provider] ?? a.provider}</span>
      </div>
      <div className="limits-meta">
        <span className={`limits-status limits-status--${a.status}`}>{statusLabel(a)}</span>
        <span>{updatedLabel(a, now)}</span>
      </div>
      {a.status === "error" && a.error && <p className="limits-error">{a.error}</p>}
      {a.status !== "error" && a.notice && <p className="limits-notice">{a.notice}</p>}
      {a.windows.length > 0 && (
        <ul className="limits-windows">
          {a.windows.map((w) => (
            <WindowRow key={w.window} w={w} now={now} />
          ))}
        </ul>
      )}
      {spend.length > 0 && (
        <ul className="limits-spend">
          {spend.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WindowRow({ w, now }: { w: LimitsWindow; now: number }) {
  const pct = clampPercent(w.usedPercent);
  const notes = [resetLabel(w, now), projectionLabel(w, now)].filter(Boolean);
  return (
    <li className="limits-window" data-tone={windowTone(w)}>
      <div className="limits-window-head">
        <span className="limits-window-name">{w.window}</span>
        <span className="limits-window-pct num">{pct == null ? "?" : `${Math.round(pct)}%`}</span>
      </div>
      <div
        className="limits-bar"
        role="progressbar"
        aria-label={`${w.window} used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        <i style={{ width: `${pct ?? 0}%` }} />
      </div>
      {notes.length > 0 && <div className="limits-window-note">{notes.join(" · ")}</div>}
    </li>
  );
}
