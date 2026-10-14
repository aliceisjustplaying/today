import type { LimitsAccount, LimitsWindow } from "./types";

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

function dayIn(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone });
}

/** Wall-clock time in `timeZone`: "16:40" today, "Wed 09:00" this week, "21 Oct 09:00" beyond. */
export function formatWallTime(at: number, now: number, timeZone: string): string {
  const time = new Date(at).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (dayIn(at, timeZone) === dayIn(now, timeZone)) return time;
  const day = new Date(at).toLocaleDateString(
    "en-GB",
    at - now < 6 * DAY ? { timeZone, weekday: "short" } : { timeZone, day: "numeric", month: "short" },
  );
  return `${day} ${time}`;
}

/** The short countdown shown on the row: "in 2h 12m". */
export function resetLabel(w: LimitsWindow, now: number): string | null {
  if (w.resetsAt == null) return null;
  if (w.resetsAt <= now) return "resetting";
  return `in ${formatDuration(w.resetsAt - now)}`;
}

/** The full reset time for the row's tooltip: "resets Thu 03:47". */
export function resetTitle(w: LimitsWindow, now: number, timeZone: string): string | undefined {
  if (w.resetsAt == null || w.resetsAt <= now) return undefined;
  return `resets ${formatWallTime(w.resetsAt, now, timeZone)}`;
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
  if (a.resetCredits) lines.push(`Banked resets ${a.resetCredits}`);
  return lines;
}

/** A token count as short as it reads clearly: 950, 12.3k, 1.43M. */
export function compactTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${Number((n / 1000).toPrecision(3))}k`;
  return `${Number((n / 1_000_000).toPrecision(3))}M`;
}

/** ACS token lines: totals only, the budgets are bars. */
export function tokenLines(a: LimitsAccount): string[] {
  const t = a.tokens;
  if (!t) return [];
  const lines = [`${compactTokens(t.totalTokens)} tokens this month`];
  if (t.todayTokens != null) lines.push(`${compactTokens(t.todayTokens)} today`);
  lines.push(`${t.requests.toLocaleString("en-US")} requests`);
  return lines;
}

/** Data older than this, from an account that should be fresh, reads "stale". */
export const STALE_AFTER_MS = 60 * MINUTE;

/** `observedAt` is the last successful poll (limits writes snapshots only on success). Inactive accounts aren't polled for fresh data, so they never go stale. */
export function isStale(a: LimitsAccount, now: number): boolean {
  return a.observedAt != null && a.status !== "inactive" && now - a.observedAt > STALE_AFTER_MS;
}

/** An inactive account whose latest poll brought no data (a Claude 429, a lapsed plan): what limits still holds is from before, so the card leaves it out. */
export function hidesOldData(a: LimitsAccount): boolean {
  return a.status === "inactive" && a.observedAt != null && a.lastAttemptAt != null && a.observedAt < a.lastAttemptAt;
}

/** Age of the latest data, as short as possible: "now", "1m", "3h", or "stale 3h" past an hour. */
export function ageLabel(a: LimitsAccount, now: number): string {
  if (a.observedAt == null) return a.status === "pending" ? "waiting" : "no data";
  const ago = now - a.observedAt;
  if (ago < MINUTE) return "now";
  if (ago < 60 * MINUTE) return formatDuration(ago);
  const age = ago < 2 * DAY ? `${Math.floor(ago / (60 * MINUTE))}h` : formatDuration(ago);
  return isStale(a, now) ? `stale ${age}` : age;
}

const USAGE_PAGES: Record<string, string> = {
  claude: "https://claude.ai/settings/usage",
  codex: "https://chatgpt.com/settings/usage",
  grok: "https://grok.com/?_s=usage",
  muse: "https://accountscenter.meta.com/muse_code/",
  opencode: "https://opencode.ai/auth",
  "opencode-go": "https://opencode.ai/auth",
  openrouter: "https://openrouter.ai/settings/credits",
  capy: "https://capy.ai",
  acs: "https://infra.acsresearch.org/usage",
};

/** The provider's own usage or billing page, or null when it has none worth opening. */
export function usageUrl(provider: string): string | null {
  return USAGE_PAGES[provider] ?? null;
}

/** Accounts with nothing but money to show (Zen, OpenRouter, Capy) go in the Balances card. */
export function isBalanceOnly(a: LimitsAccount): boolean {
  return a.windows.length === 0 && a.status !== "error" && Boolean(a.balanceUsd || a.spendUsd);
}

export function apiBalanceRow(balance: NonNullable<NonNullable<LimitsAccount["apiBalance"]>["balance"]>, now: number, timeZone: string): {
  amount: string;
  details: string[];
} | null {
  const grants = balance.grants.filter((g) => g.expiresAt == null || g.expiresAt > now);
  if (!grants.length) return null;
  const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, "")}`;
  const date = (at: number) => new Date(at).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
  const remaining = grants.reduce((sum, g) => sum + g.remainingUsd, 0);
  const granted = grants.reduce((sum, g) => sum + g.grantedUsd, 0);
  const latest = Math.max(...grants.map((g) => g.expiresAt ?? Infinity));
  const details = grants.length === 1
    ? (grants[0]!.expiresAt == null ? [] : [`resets ${date(grants[0]!.expiresAt)}`])
    : grants
      .filter((g) => g.expiresAt != null && g.expiresAt < latest)
      .sort((a, b) => a.expiresAt! - b.expiresAt!)
      .map((g) => `${dollars(g.remainingUsd)} expires ${date(g.expiresAt!)}`);
  return { amount: `${dollars(remaining)} of ${dollars(granted)} left`, details };
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

/** Providers that lead the page, in this order; every other provider follows in the order limits lists it. */
const PROVIDER_ORDER = ["claude", "codex", "muse", "grok", "acs"];

/** Plans from most to least expensive. A plan not listed goes after the listed paid ones; no plan counts as Free. */
const PLAN_ORDER: Record<string, string[]> = {
  claude: ["Max 20x", "Max 5x", "Max", "Pro", "Free"],
  codex: ["Pro", "Enterprise", "Business", "Team", "Plus", "Free"],
};

function planRank(a: LimitsAccount): number {
  const order = PLAN_ORDER[a.provider];
  if (!order) return 0;
  const free = order.indexOf("Free");
  if (!a.plan) return free;
  const i = order.indexOf(a.plan.name);
  return i === -1 ? free - 0.5 : i;
}

/**
 * A fixed display order that doesn't move with usage or with the order limits happens to list accounts in:
 * Claude, Codex, Muse, SuperGrok, ACS, then the rest by first appearance; within a provider the pricier plan first,
 * then email (accounts without one last), then id.
 */
export function sortAccounts(accounts: LimitsAccount[]): LimitsAccount[] {
  const seen = [...new Set(accounts.map((a) => a.provider))].filter((p) => !PROVIDER_ORDER.includes(p));
  const providerRank = (p: string) => (PROVIDER_ORDER.includes(p) ? PROVIDER_ORDER.indexOf(p) : PROVIDER_ORDER.length + seen.indexOf(p));
  const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...accounts].sort(
    (a, b) =>
      providerRank(a.provider) - providerRank(b.provider) ||
      planRank(a) - planRank(b) ||
      Number(!a.email) - Number(!b.email) ||
      text((a.email ?? "").toLowerCase(), (b.email ?? "").toLowerCase()) ||
      text(a.id, b.id),
  );
}

/**
 * A partial-data note on a working account. An inactive card's pill says it all, unless the upstream said when usage comes back
 * ("Out of usage · back 15:14") or the card hides its old data, where the line says why ("No usage available").
 */
export function cardNotice(a: LimitsAccount, now: number, timeZone: string): string | null {
  if (a.status === "ok") return a.notice ?? null;
  if (a.status !== "inactive") return null;
  if (a.availableAt != null && a.availableAt > now) return `Out of usage · back ${formatWallTime(a.availableAt, now, timeZone)}`;
  return hidesOldData(a) ? (a.notice ?? null) : null;
}

/** The status pill: a lapsed subscription or a signed-out login is neutral, not a red error. */
export function statusLabel(a: Pick<LimitsAccount, "status">): string {
  return a.status === "expired" ? "session expired" : a.status;
}

/** The provider's name at the front of its plan names ("Capy Lite", "Muse Code Power Usage"), dropped from the chip. */
const PLAN_PREFIXES: Record<string, RegExp> = { capy: /^Capy\s+/, muse: /^Muse Code\s+/ };

/**
 * The plan chip beside the name: "Max 20x", "Go inactive", "Lite · renews Oct 16", or "Lite · ends Oct 16" once canceled. Null when unknown or
 * when it would only repeat the name; an inactive card's pill already says the plan lapsed.
 */
export function planChip(a: LimitsAccount, timeZone: string): string | null {
  const plan = a.plan;
  // The OpenCode console's plan is the Go subscription, which has its own card; Zen is credits.
  if (!plan || a.provider === "opencode") return null;
  const prefix = PLAN_PREFIXES[a.provider];
  const name = prefix ? plan.name.replace(prefix, "") : plan.name;
  if (plan.status !== "active") return a.status === "inactive" ? name : `${name} ${plan.status}`;
  if (name === a.label) return null;
  if (plan.renewsAt == null) return name;
  // A canceled plan stays active until its period ends, so the date is when it ends, not a renewal.
  const verb = plan.canceledAt != null ? "ends" : "renews";
  return `${name} · ${verb} ${new Date(plan.renewsAt).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" })}`;
}
