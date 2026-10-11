import type { LimitsAccount, LimitsWindow } from "./types";

const TIMEZONE = "Europe/London";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function clampPercent(value: number | null): number | null {
  return value == null ? null : Math.max(0, Math.min(100, value));
}

export function windowTone(w: LimitsWindow): "bad" | "warn" | "ok" {
  const pct = clampPercent(w.usedPercent) ?? 0;
  if (pct >= 90 || w.projection?.hitsLimitAt) return "bad";
  if (pct >= 70 || (w.projection?.projectedAtReset ?? 0) >= 90) return "warn";
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

export function resetLabel(w: LimitsWindow, now: number): string | null {
  if (w.resetsAt == null) return null;
  if (w.resetsAt <= now) return "resetting";
  return `resets ${formatLondonTime(w.resetsAt, now)} · in ${formatDuration(w.resetsAt - now)}`;
}

export function projectionLabel(w: LimitsWindow, now: number): string | null {
  const p = w.projection;
  if (!p) return null;
  if (p.hitsLimitAt != null) return `hits 100% in ${formatDuration(p.hitsLimitAt - now)}`;
  if (p.projectedAtReset != null) return `~${Math.round(p.projectedAtReset)}% at reset`;
  return null;
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function spendLines(a: LimitsAccount): string[] {
  const lines: string[] = [];
  if (a.spendUsd) {
    const p = a.spendUsd.projection.credits;
    lines.push(`${money(a.spendUsd.credits)} credits this month`);
    if (p) lines.push(`${money(p.perDay)}/day · ~${money(p.projectedAtEnd)} by month end`);
    lines.push(`${money(a.spendUsd.total)} incl. subscriptions`);
  }
  if (a.balanceUsd) {
    const b = a.balanceUsd.burn;
    lines.push(
      `Balance ${money(a.balanceUsd.balance)}` +
        (b ? ` · ${money(b.perDay)}/day` + (b.daysLeft != null ? ` · ~${b.daysLeft.toFixed(1)} days left` : "") : ""),
    );
  }
  if (a.credits) {
    const c = a.credits;
    if (c.unlimited) lines.push("Credits unlimited");
    else if (c.balance != null)
      lines.push(
        `Credits ${Math.floor(c.balance).toLocaleString("en-GB")}` +
          (c.burn ? ` · ${Math.round(c.burn.perDay).toLocaleString("en-GB")}/day` : ""),
      );
  }
  return lines;
}

export function updatedLabel(a: LimitsAccount, now: number): string {
  if (a.observedAt == null) return a.status === "pending" ? "waiting for first poll" : "no data yet";
  const ago = now - a.observedAt;
  return ago < MINUTE ? "updated just now" : `updated ${formatDuration(ago)} ago`;
}

/** The status pill: a lapsed subscription is neutral and says what to do, not a red error. */
export function statusLabel(a: LimitsAccount): string {
  return a.status === "inactive" ? "inactive · renew" : a.status;
}
