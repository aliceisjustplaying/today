import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { LimitsAccount, LimitsSummary, LimitsWindow } from "./types";
import { getCached, setCached } from "./cache";
import { ProviderLogo } from "./logos";
import { onResume, signInAgain } from "./resume";
import { reloadIfStale, supersededByDeploy } from "./updates";
import {
  ageLabel,
  balanceRow,
  cardNotice,
  clampPercent,
  isBalanceOnly,
  parseDollars,
  projectionLabel,
  resetLabel,
  resetTitle,
  sortByUrgency,
  spendLines,
  statusLabel,
  windowTone,
} from "./limits-format";

export function Limits() {
  const [summary, setSummary] = useState<LimitsSummary | null>(() => getCached<LimitsSummary>("limits"));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/limits");
      if (r.status === 401) {
        signInAgain();
        return;
      }
      const body = (await r.json().catch(() => null)) as (LimitsSummary & { error?: string }) | null;
      if (!r.ok || !body) throw new Error(body?.error ?? `limits ${r.status}`);
      if (await supersededByDeploy()) return;
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
    const refresh = () => {
      reloadIfStale();
      load();
    };
    load();
    const interval = window.setInterval(refresh, 60_000);
    const stopResume = onResume(refresh);
    return () => {
      window.clearInterval(interval);
      stopResume();
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
      {balances.length > 0 && <Balances accounts={sortByUrgency(balances)} onChanged={load} />}
    </div>
  );
}

function AccountCard({ account: a, now }: { account: LimitsAccount; now: number }) {
  const spend = spendLines(a);
  return (
    <section className="section limits-card" data-provider={a.provider} data-status={a.status}>
      <div className="limits-head">
        <ProviderLogo provider={a.provider} />
        <AccountTitle account={a} heading />
        {a.status === "ok" || a.status === "pending" ? (
          <span className={`limits-dot limits-dot--${a.status}`} role="img" aria-label={a.status} />
        ) : (
          <span className={`limits-status limits-status--${a.status}`}>{statusLabel(a)}</span>
        )}
        <span className="limits-age num" title="last updated">
          {ageLabel(a, now)}
        </span>
      </div>
      {a.status === "error" && a.error && <p className="limits-error">{a.error}</p>}
      {cardNotice(a) && <p className="limits-notice">{cardNotice(a)}</p>}
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

/** The account's name with its email underneath, both cut with an ellipsis rather than wrapping. */
function AccountTitle({ account: a, heading }: { account: LimitsAccount; heading?: boolean }) {
  return (
    <div className="limits-title">
      {heading ? <h2 className="limits-name">{a.label}</h2> : <span className="limits-balance-name">{a.label}</span>}
      {a.email && (
        <span className="limits-email" title={a.email}>
          {a.email}
        </span>
      )}
    </div>
  );
}

function BalanceEdit({ account: a, onDone }: { account: LimitsAccount; onDone: (saved: boolean) => Promise<void> }) {
  const [value, setValue] = useState(a.balanceUsd ? Math.max(0, a.balanceUsd.balance).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const balanceUsd = parseDollars(value);
    if (balanceUsd == null) return setError("Enter dollars, like 58.50");
    setSaving(true);
    try {
      const r = await fetch(`/api/limits/accounts/${encodeURIComponent(a.id)}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balanceUsd }),
      });
      const body = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(body?.error ?? `limits ${r.status}`);
      await onDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <form className="limits-balance-form" onSubmit={submit}>
      <span aria-hidden="true">$</span>
      <input
        className="num"
        inputMode="decimal"
        autoFocus
        aria-label={`${a.label} credits left, from Settings → Billing`}
        placeholder="58.50"
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone(false)}
      />
      <button type="submit" disabled={saving}>
        Save
      </button>
      <button type="button" onClick={() => onDone(false)}>
        Cancel
      </button>
      {error && <span className="limits-balance-error">{error}</span>}
    </form>
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

function Balances({ accounts, onChanged }: { accounts: LimitsAccount[]; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="section limits-card limits-balances">
      <h2 className="limits-name limits-balances-title">Balances</h2>
      <ul className="limits-balance-list">
        {accounts.map((a) => {
          const { amount, detail, tone, title } = balanceRow(a);
          return (
            <li key={a.id} className="limits-balance" data-provider={a.provider} data-status={a.status} data-tone={tone}>
              <ProviderLogo provider={a.provider} />
              <AccountTitle account={a} />
              {editing === a.id ? (
                <BalanceEdit
                  account={a}
                  onDone={async (saved) => {
                    if (saved) await onChanged();
                    setEditing(null);
                  }}
                />
              ) : a.balanceSettable ? (
                <button
                  type="button"
                  className={amount ? "limits-balance-amount limits-balance-edit num" : "limits-balance-set"}
                  title={amount ? `${title ? `${title} · ` : ""}tap to update the balance` : "Enter the credits left on Settings → Billing"}
                  onClick={() => setEditing(a.id)}
                >
                  {amount ?? "set balance"}
                </button>
              ) : (
                <span className="limits-balance-amount num" title={title}>
                  {amount}
                </span>
              )}
              {detail && <span className="limits-balance-detail num">{detail}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
