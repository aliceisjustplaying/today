import type { LimitsAccount, LimitsWindow } from "./types";

const TIMEZONE = "Europe/London";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function clampPercent(value: number | null): number | null {
  return value == null ? null : Math.max(0, Math.min(100, value));
}

/** Headroom only: green below 60%, amber to 85%, coral above. No forecast colors the bar. */
export function windowTone(w: LimitsWindow): "bad" | "warn" | "ok" {
  const pct = clampPercent(w.usedPercent) ?? 0;
  if (pct >= 85) return "bad";
  if (pct >= 60) return "warn";
  return "ok";
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) {
    const m = minutes % 60;
    return m === 0 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 60)}h ${m}m`;
  }
  return `${Math.round(minutes / (24 * 60))}d`;
}

function londonDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/** Wall-clock time in Europe/London: "16:40" today, "Wed 09:00" this week, "21 Oct 09:00" beyond. */
export function formatLondonTime(at: number, now: number): string {
  const time = new Date(at).toLocaleTimeString("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (londonDay(at) === londonDay(now)) return time;
  const day = new Date(at).toLocaleDateString(
    "en-GB",
    at - now < 6 * DAY ? { timeZone: TIMEZONE, weekday: "short" } : { timeZone: TIMEZONE, day: "numeric", month: "short" },
  );
  return `${day} ${time}`;
}

/** The short countdown shown on the row: "in 2h 12m". */
export function resetLabel(w: LimitsWindow, now: number): string | null {
  if (w.resetsAt == null) return null;
  if (w.resetsAt <= now) return "resetting";
  return `in ${formatDuration(w.resetsAt - now)}`;
}

/** The full reset time for the row's tooltip: "resets Thu 03:47 London time". */
export function resetTitle(w: LimitsWindow, now: number): string | undefined {
  if (w.resetsAt == null || w.resetsAt <= now) return undefined;
  return `resets ${formatLondonTime(w.resetsAt, now)} London time`;
}

export function money(n: number): string {
  const digits = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n <= -0.005 ? "-" : ""}$${digits}`;
}

/** A card's money lines: amounts only, no burn rates or projections. */
export function spendLines(a: LimitsAccount): string[] {
  const lines: string[] = [];
  if (a.spendUsd) {
    lines.push(`${money(a.spendUsd.credits)} credits this month`);
    lines.push(`${money(a.spendUsd.total)} incl. subscriptions`);
  }
  if (a.balanceUsd) lines.push(`Balance ${money(a.balanceUsd.balance)}`);
  if (a.credits) {
    const c = a.credits;
    if (c.unlimited) lines.push("Credits unlimited");
    else if (c.balance != null) lines.push(`Credits ${Math.floor(c.balance).toLocaleString("en-US")}`);
  }
  return lines;
}

/** Age of the latest data, as short as possible: "now", "1m", "3h". */
export function ageLabel(a: LimitsAccount, now: number): string {
  if (a.observedAt == null) return a.status === "pending" ? "waiting" : "no data";
  const ago = now - a.observedAt;
  if (ago < MINUTE) return "now";
  if (ago < 60 * MINUTE) return formatDuration(ago);
  return ago < 2 * DAY ? `${Math.floor(ago / (60 * MINUTE))}h` : formatDuration(ago);
}

/** Accounts with nothing but money to show (Zen, OpenRouter, Capy) go in the Balances card. */
export function isBalanceOnly(a: LimitsAccount): boolean {
  return a.windows.length === 0 && a.status !== "error" && Boolean(a.balanceUsd || a.spendUsd);
}

export type BalanceRow = {
  /** Null when the balance can be set but hasn't been: the row shows "set balance" instead. */
  amount: string | null;
  detail: string | null;
  title?: string;
  /** Capy's credit sources, shown when the amount is tapped: "Credit grant · $90.80 of $100.00 left". */
  sources?: string[];
};

/** A Balances row: what's there, never a forecast (no $/day, days left or month-end projection). */
export function balanceRow(a: LimitsAccount): BalanceRow {
  if (a.spendUsd) {
    const thisMonth = `${money(a.spendUsd.credits)} this month`;
    if (a.billing && a.balanceUsd) {
      return {
        amount: `${money(a.balanceUsd.balance)} left`,
        detail: null,
        title: `${money(a.billing.usedUsd)} used of ${money(a.billing.grantedUsd)} · ${thisMonth}`,
        sources: a.billing.sources.map((s) => `${s.name} · ${money(s.remainingUsd)} of ${money(s.grantedUsd)} left`),
      };
    }
    if (a.balanceUsd) return { amount: `${money(Math.max(0, a.balanceUsd.balance))} left`, detail: null, title: thisMonth };
    if (a.balanceSettable) return { amount: null, detail: thisMonth };
    return { amount: money(a.spendUsd.credits), detail: "this month" };
  }
  return { amount: money(a.balanceUsd?.balance ?? 0), detail: null };
}

/** Parses a typed dollar amount ("58.50", "$1,200"); null when it isn't one. */
export function parseDollars(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Most used window first; inactive accounts sink to the bottom. */
export function sortByUrgency(accounts: LimitsAccount[]): LimitsAccount[] {
  const peak = (a: LimitsAccount) =>
    a.status === "inactive" ? -1 : Math.max(0, ...a.windows.map((w) => clampPercent(w.usedPercent) ?? 0));
  return [...accounts].sort((a, b) => peak(b) - peak(a));
}

/** A partial-data note on a working account; an inactive card's pill says it all, so it gets no line. */
export function cardNotice(a: LimitsAccount): string | null {
  return a.status === "ok" ? (a.notice ?? null) : null;
}

/** The status pill: a lapsed subscription is neutral, not a red error. */
export function statusLabel(a: LimitsAccount): string {
  return a.status;
}

/**
 * The plan chip beside the name: "Max 20x", "Go inactive", "Lite · renews Oct 16", or "Lite · ends Oct 16" once canceled. Null when unknown or
 * when it would only repeat the name; an inactive card's pill already says the plan lapsed.
 */
export function planChip(a: LimitsAccount): string | null {
  const plan = a.plan;
  // The OpenCode console's plan is the Go subscription, which has its own card; Zen is credits.
  if (!plan || a.provider === "opencode") return null;
  const name = a.provider === "capy" ? plan.name.replace(/^Capy\s+/, "") : plan.name;
  if (plan.status !== "active") return a.status === "inactive" ? name : `${name} ${plan.status}`;
  if (name === a.label) return null;
  if (plan.renewsAt == null) return name;
  // A canceled plan stays active until its period ends, so the date is when it ends, not a renewal.
  const verb = plan.canceledAt != null ? "ends" : "renews";
  return `${name} · ${verb} ${new Date(plan.renewsAt).toLocaleDateString("en-US", { timeZone: TIMEZONE, month: "short", day: "numeric" })}`;
}
