import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import type { LimitsAccount, LimitsSummary, LimitsWindow } from "./types";
import { getCached, setCached } from "./cache";
import { ProviderLogo } from "./logos";
import { OpenIcon } from "./icons";
import { REFETCH_GAP_MS, onResume, signInAgain, throttle } from "./resume";
import { reloadIfStale, supersededByDeploy } from "./updates";
import { decoyPlanDate, usePrivacy } from "./privacy";
import {
  ageLabel,
  apiBalanceRow,
  balanceRow,
  cardNotice,
  hidesOldData,
  clampPercent,
  isBalanceOnly,
  isStale,
  parseDollars,
  planChip,
  resetLabel,
  resetTitle,
  sortAccounts,
  spendLines,
  statusLabel,
  tokenLines,
  usageUrl,
  windowTone,
} from "./limits-format";

export function Limits() {
  const p = usePrivacy();
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
    load();
    const refetch = throttle(load, REFETCH_GAP_MS);
    const interval = window.setInterval(load, 60_000);
    const stopResume = onResume(() => {
      reloadIfStale();
      refetch();
    });
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
        <p className="limits-down-text">{error ? p.text(error) : "No data from the limits service."}</p>
        <button type="button" className="limits-retry" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  const now = Date.now();
  const tz = summary.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const balances = summary.accounts.filter((a) => isBalanceOnly(a) && a.status === "ok" && (a.balanceSettable || !isStale(a, now)));
  const cards = sortAccounts(summary.accounts.filter((a) => !balances.includes(a)));
  const sortedBalances = sortAccounts(balances);
  return (
    <div className="limits">
      {error && (
        <p className="limits-stale" role="status">
          Showing data from {new Date(summary.generatedAt).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}. {p.text(error)}
        </p>
      )}
      {summary.errors?.map((e) => (
        <p key={e.providers.join(",")} className="limits-stale">
          {e.providers.join(", ")}: {p.text(e.message)}
        </p>
      ))}
      {summary.accounts.length === 0 && <p className="tabs-empty">No accounts configured in limits.</p>}
      {cards.map((a, i) => (
        <AccountCard key={a.id} account={a} position={i} now={now} tz={tz} />
      ))}
      {balances.length > 0 && <Balances accounts={sortedBalances} firstPosition={cards.length} onChanged={load} now={now} tz={tz} />}
    </div>
  );
}

/** `position` is the account's place in display order; privacy mode numbers decoy emails by it. */
function AccountCard({ account: a, position, now, tz }: { account: LimitsAccount; position: number; now: number; tz: string }) {
  const p = usePrivacy();
  const spend = [...tokenLines(a), ...spendLines(a)];
  const notice = cardNotice(a, now, tz);
  const oldData = hidesOldData(a);
  return (
    <section className="section limits-card" data-provider={a.provider} data-status={a.status}>
      <div className="limits-head">
        <UsageLink provider={a.provider} label={a.label} logo>
          <ProviderLogo provider={a.provider} />
        </UsageLink>
        <div className="limits-nameline">
          <UsageLink provider={a.provider} label={a.label}>
            <h2 className="limits-name">{a.label}</h2>
          </UsageLink>
          <PlanChip account={a} now={now} tz={tz} />
          {a.status === "ok" || a.status === "pending" ? (
            <span className={`limits-dot limits-dot--${a.status}`} role="img" aria-label={a.status} />
          ) : (
            <span className={`limits-status limits-status--${a.status}`}>{statusLabel(a)}</span>
          )}
        </div>
        <span className={`limits-age num${isStale(a, now) ? " limits-age--stale" : ""}`} title="last updated">
          {ageLabel(a, now)}
        </span>
        {a.email && <AccountEmail email={a.email} position={position} />}
      </div>
      {a.status === "error" && a.error && <p className="limits-error">{p.text(a.error)}</p>}
      {notice && <p className="limits-notice">{p.text(notice)}</p>}
      {!oldData && a.windows.length > 0 && (
        <ul className="limits-windows">
          {a.windows.map((w) => (
            <WindowRow key={w.window} w={w} now={now} tz={tz} />
          ))}
        </ul>
      )}
      {!oldData && spend.length > 0 && <p className="limits-spend">{p.figures(spend.join(" · "))}</p>}
      {a.provider === "claude" && a.apiBalance && <ApiBalance api={a.apiBalance} now={now} tz={tz} />}
    </section>
  );
}

function ApiBalance({ api, now, tz }: { api: NonNullable<LimitsAccount["apiBalance"]>; now: number; tz: string }) {
  const p = usePrivacy();
  const [clock, setClock] = useState(now);
  const currentNow = Math.max(now, clock, Date.now());
  useEffect(() => {
    if (api.status === "expired" || !api.balance) return;
    const next = Math.min(...api.balance.grants.flatMap((g) => g.expiresAt != null && g.expiresAt > currentNow ? [g.expiresAt] : []));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(next - currentNow, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [api, currentNow]);

  const row = api.status === "expired" || !api.balance ? null : apiBalanceRow(api.balance, currentNow, tz);
  if (api.status === "ok" && !row) return null;
  return (
    <div className="limits-api-balance" data-status={api.status}>
      <span className="limits-name-row">
        <span className="limits-balance-name">API balance</span>
        {api.status === "expired" && <span className="limits-status limits-status--expired">{statusLabel(api)}</span>}
      </span>
      {row && (
        <span className="limits-balance-amount num">
          {api.status === "error" && <span className="limits-age limits-age--stale">stale </span>}
          {p.text(row.amount)}
        </span>
      )}
      {row?.details.map((detail, i) => <span key={i} className="limits-balance-detail num">{p.text(detail)}</span>)}
      {api.status === "error" && api.notice && <p className="limits-error">{p.text(api.notice)}</p>}
    </div>
  );
}

/**
 * Opens the provider's usage page outside the app. The logo and the name are two links to the
 * same page so both are tap targets without restructuring the card grid; the logo's copy stays
 * out of the tab order and the accessibility tree.
 */
function UsageLink({ provider, label, logo, children }: { provider: string; label: string; logo?: boolean; children: ReactNode }) {
  const href = usageUrl(provider);
  if (!href) return <>{children}</>;
  if (logo) {
    return (
      <a className="limits-link limits-link--logo" href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
        {children}
      </a>
    );
  }
  return (
    <a className="limits-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} usage page`}>
      {children}
      <span className="limits-link-icon">
        <OpenIcon />
      </span>
    </a>
  );
}

function PlanChip({ account, now, tz }: { account: LimitsAccount; now: number; tz: string }) {
  const p = usePrivacy();
  const chip = planChip(account, now, tz);
  return chip ? <span className="limits-plan">{p.on ? decoyPlanDate(chip, account.id) : chip}</span> : null;
}

/** The account's email on its own line under the name, cut with an ellipsis rather than wrapping. */
function AccountEmail({ email, position }: { email: string; position: number }) {
  const p = usePrivacy();
  const shown = p.email(position, email);
  return (
    <span className="limits-email" title={shown}>
      {shown}
    </span>
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
    <form className="limits-balance-form" onSubmit={submit} data-editing>
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

function WindowRow({ w, now, tz }: { w: LimitsWindow; now: number; tz: string }) {
  const pct = clampPercent(w.usedPercent);
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
      <span className="limits-window-reset num" title={resetTitle(w, now, tz)}>
        {resetLabel(w, now)}
      </span>
    </li>
  );
}

function Balances({
  accounts,
  firstPosition,
  onChanged,
  now,
  tz,
}: {
  accounts: LimitsAccount[];
  firstPosition: number;
  onChanged: () => Promise<void>;
  now: number;
  tz: string;
}) {
  const p = usePrivacy();
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <section className="section limits-card limits-balances">
      <h2 className="limits-name limits-balances-title">Balances</h2>
      <ul className="limits-balance-list">
        {accounts.map((a, i) => {
          const { amount, detail, title, sources } = balanceRow(a);
          const notice = cardNotice(a, now, tz);
          return (
            <li key={a.id} className="limits-balance" data-provider={a.provider} data-status={a.status}>
              <UsageLink provider={a.provider} label={a.label} logo>
                <ProviderLogo provider={a.provider} />
              </UsageLink>
              <span className="limits-name-row">
                <UsageLink provider={a.provider} label={a.label}>
                  <span className="limits-balance-name">{a.label}</span>
                </UsageLink>
                <PlanChip account={a} now={now} tz={tz} />
                <span className="limits-dot limits-dot--ok" role="img" aria-label={a.status} />
              </span>
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
                  title={amount ? p.text(`${title ? `${title} · ` : ""}tap to update the balance`) : "Enter the credits left on Settings → Billing"}
                  onClick={() => setEditing(a.id)}
                >
                  {amount ? p.text(amount) : "set balance"}
                </button>
              ) : sources?.length ? (
                <button
                  type="button"
                  className="limits-balance-amount limits-balance-edit num"
                  title={title && p.text(title)}
                  aria-expanded={expanded === a.id}
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                >
                  {amount && p.text(amount)}
                </button>
              ) : (
                <span className="limits-balance-amount num" title={title && p.text(title)}>
                  {amount && p.text(amount)}
                </span>
              )}
              {a.email && <AccountEmail email={a.email} position={firstPosition + i} />}
              <span className={`limits-age num${isStale(a, now) ? " limits-age--stale" : ""}`} title="last updated">{ageLabel(a, now)}</span>
              {detail && <span className="limits-balance-detail num">{p.text(detail)}</span>}
              {notice && <p className="limits-notice">{p.text(notice)}</p>}
              {expanded === a.id && sources && (
                <ul className="limits-balance-sources">
                  {title && <li>{p.text(title)}</li>}
                  {sources.map((s, i) => (
                    <li key={i}>{p.text(s)}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
