import { useCallback, useEffect, useState } from "react";
import type { LimitsAccount, LimitsSummary, LimitsWindow } from "./types";
import { getCached, setCached } from "./cache";
import { ProviderLogo } from "./logos";
import {
  ageLabel,
  balanceRow,
  clampPercent,
  isBalanceOnly,
  projectionLabel,
  resetLabel,
  resetTitle,
  sortByUrgency,
  spendLines,
  statusLabel,
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
  const balances = summary.accounts.filter(isBalanceOnly);
  const cards = sortByUrgency(summary.accounts.filter((a) => !isBalanceOnly(a)));
  return (
    <div className="limits">
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
      {cards.map((a) => (
        <AccountCard key={a.id} account={a} now={now} />
      ))}
      {balances.length > 0 && <Balances accounts={sortByUrgency(balances)} />}
    </div>
  );
}

function providerName(provider: string): string {
  return PROVIDER_NAMES[provider] ?? provider;
}

function AccountCard({ account: a, now }: { account: LimitsAccount; now: number }) {
  const spend = spendLines(a);
  return (
    <section className="section limits-card" data-provider={a.provider} data-status={a.status}>
      <div className="limits-head">
        <ProviderLogo provider={a.provider} />
        <h2 className="limits-name">{a.label}</h2>
        {a.status === "ok" || a.status === "pending" ? (
          <span className={`limits-dot limits-dot--${a.status}`} role="img" aria-label={a.status} />
        ) : (
          <span className={`limits-status limits-status--${a.status}`}>{statusLabel(a)}</span>
        )}
        <span className="limits-provider">{providerName(a.provider)}</span>
        <span className="limits-age num" title="last updated">
          {ageLabel(a, now)}
        </span>
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
      {spend.length > 0 && <p className="limits-spend">{spend.join(" · ")}</p>}
    </section>
  );
}

function WindowRow({ w, now }: { w: LimitsWindow; now: number }) {
  const pct = clampPercent(w.usedPercent);
  const projection = projectionLabel(w, now);
  return (
    <li className="limits-window" data-tone={windowTone(w)}>
      <span className="limits-window-name">{w.window}</span>
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
      <span className="limits-window-pct num">{pct == null ? "?" : `${Math.round(pct)}%`}</span>
      <span className="limits-window-reset num" title={resetTitle(w, now)}>
        {resetLabel(w, now)}
      </span>
      {projection && <span className="limits-window-note">{projection}</span>}
    </li>
  );
}

function Balances({ accounts }: { accounts: LimitsAccount[] }) {
  return (
    <section className="section limits-card limits-balances">
      <h2 className="limits-name limits-balances-title">Balances</h2>
      <ul className="limits-balance-list">
        {accounts.map((a) => {
          const { amount, detail } = balanceRow(a);
          return (
            <li key={a.id} className="limits-balance" data-provider={a.provider} data-status={a.status}>
              <ProviderLogo provider={a.provider} />
              <span className="limits-balance-name">{a.label}</span>
              <span className="limits-balance-amount num">{amount}</span>
              {a.status === "inactive" && <span className="limits-status limits-status--inactive">{statusLabel(a)}</span>}
              {detail && <span className="limits-balance-detail num">{detail}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
