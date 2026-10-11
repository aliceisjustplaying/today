import { describe, expect, test } from "bun:test";
import {
  ageLabel,
  balanceRow,
  formatDuration,
  formatLondonTime,
  cardNotice,
  isBalanceOnly,
  money,
  parseDollars,
  planChip,
  projectionLabel,
  resetLabel,
  resetTitle,
  sortByUrgency,
  spendLines,
  statusLabel,
  windowTone,
} from "./limits-format";
import type { LimitsAccount, LimitsWindow } from "./types";

const now = Date.parse("2026-10-11T12:00:00Z");
const win = (over: Partial<LimitsWindow>): LimitsWindow => ({ window: "5h", usedPercent: 10, resetsAt: null, projection: null, ...over });

describe("limits formatting", () => {
  test("durations", () => {
    expect(formatDuration(-1)).toBe("now");
    expect(formatDuration(42 * 60_000)).toBe("42m");
    expect(formatDuration(3 * 3_600_000)).toBe("3h");
    expect(formatDuration(130 * 60_000)).toBe("2h 10m");
    expect(formatDuration(5 * 86_400_000)).toBe("5d");
  });

  test("reset times are Europe/London wall-clock", () => {
    expect(formatLondonTime(Date.parse("2026-10-11T15:40:00Z"), now)).toBe("16:40");
    expect(formatLondonTime(Date.parse("2026-10-14T08:00:00Z"), now)).toBe("Wed 09:00");
    expect(formatLondonTime(Date.parse("2026-11-02T09:00:00Z"), now)).toBe("2 Nov 09:00");
    const soon = win({ resetsAt: Date.parse("2026-10-11T14:10:00Z") });
    expect(resetLabel(soon, now)).toBe("in 2h 10m");
    expect(resetTitle(soon, now)).toBe("resets 15:10 London time");
    expect(resetLabel(win({ resetsAt: now - 1 }), now)).toBe("resetting");
    expect(resetLabel(win({}), now)).toBeNull();
    expect(resetTitle(win({}), now)).toBeUndefined();
  });

  test("bars are colored by headroom, bumped by the projection", () => {
    expect(windowTone(win({ usedPercent: 59 }))).toBe("ok");
    expect(windowTone(win({ usedPercent: 60 }))).toBe("warn");
    expect(windowTone(win({ usedPercent: 84 }))).toBe("warn");
    expect(windowTone(win({ usedPercent: 85 }))).toBe("bad");
    expect(windowTone(win({ usedPercent: null }))).toBe("ok");
    const hits = { percentPerHour: 30, projectedAtReset: 100, hitsLimitAt: now + 80 * 60_000, samples: 5 };
    expect(windowTone(win({ usedPercent: 40, projection: hits }))).toBe("bad");
    expect(windowTone(win({ usedPercent: 40, projection: { ...hits, hitsLimitAt: null, projectedAtReset: 88 } }))).toBe("warn");
    expect(windowTone(win({ usedPercent: 40, projection: { ...hits, hitsLimitAt: null, projectedAtReset: 70 } }))).toBe("ok");
  });

  test("projection only shows when heading for the limit", () => {
    const hits = { percentPerHour: 30, projectedAtReset: 100, hitsLimitAt: now + 80 * 60_000, samples: 5 };
    expect(projectionLabel(win({ projection: hits }), now)).toBe("hits 100% in 1h 20m");
    expect(projectionLabel(win({ projection: { ...hits, hitsLimitAt: null, projectedAtReset: 92.6 } }), now)).toBe("~93% at reset");
    expect(projectionLabel(win({ projection: { ...hits, hitsLimitAt: null, projectedAtReset: 84.9 } }), now)).toBeNull();
    expect(projectionLabel(win({}), now)).toBeNull();
  });

  test("Capy spend lines", () => {
    const capy = {
      spendUsd: {
        credits: 41.5,
        total: 241.5,
        periodEnd: null,
        projection: { credits: { perDay: 4.15, projectedAtEnd: 128.65 }, total: null },
      },
    } as LimitsAccount;
    expect(spendLines(capy)).toEqual(["$41.50 credits this month", "$4.15/day · ~$128.65 by month end", "$241.50 incl. subscriptions"]);
    expect(spendLines({} as LimitsAccount)).toEqual([]);
  });

  test("inactive is a plain pill with no message line; other statuses pass through", () => {
    const account = (status: LimitsAccount["status"]): LimitsAccount => ({
      id: "opencode-go:main",
      provider: "opencode-go",
      label: "Go",
      status,
      error: null,
      notice: status === "error" ? null : `Go ${status}`,
      lastAttemptAt: now,
      observedAt: null,
      windows: [],
    });
    expect(statusLabel(account("inactive"))).toBe("inactive");
    expect(statusLabel(account("ok"))).toBe("ok");
    expect(statusLabel(account("error"))).toBe("error");
    expect(cardNotice(account("inactive"))).toBeNull();
    expect(cardNotice(account("ok"))).toBe("Go ok");
  });

  const acct = (over: Partial<LimitsAccount>): LimitsAccount => ({
    id: "x",
    provider: "claude",
    label: "x",
    status: "ok",
    error: null,
    lastAttemptAt: now,
    observedAt: now,
    windows: [],
    ...over,
  });

  test("age is as short as possible", () => {
    expect(ageLabel(acct({ observedAt: now - 10_000 }), now)).toBe("now");
    expect(ageLabel(acct({ observedAt: now - 60_000 }), now)).toBe("1m");
    expect(ageLabel(acct({ observedAt: now - 26 * 3_600_000 - 60_000 }), now)).toBe("26h");
    expect(ageLabel(acct({ observedAt: now - 3 * 86_400_000 }), now)).toBe("3d");
    expect(ageLabel(acct({ observedAt: null, status: "pending" }), now)).toBe("waiting");
  });

  test("money-only accounts go to Balances unless they errored", () => {
    const zen = acct({ provider: "opencode", label: "Zen", balanceUsd: { balance: 4.2, burn: null } });
    expect(isBalanceOnly(zen)).toBe(true);
    expect(isBalanceOnly(acct({ status: "error", balanceUsd: { balance: 4.2, burn: null } }))).toBe(false);
    expect(isBalanceOnly(acct({ windows: [win({})], credits: { balance: 10, unlimited: false, burn: null } }))).toBe(false);
    expect(isBalanceOnly(acct({}))).toBe(false);

    expect(balanceRow(zen)).toEqual({ amount: "$4.20", detail: null });
    // A zero or negative balance is plain: no tone, just the number.
    expect(balanceRow(acct({ balanceUsd: { balance: 0, burn: null } }))).toStrictEqual({ amount: "$0.00", detail: null });
    expect(balanceRow(acct({ balanceUsd: { balance: -0.12451, burn: null } }))).toStrictEqual({ amount: "-$0.12", detail: null });
    expect(balanceRow(acct({ balanceUsd: { balance: -0.12, burn: { perDay: 0.5, daysLeft: 0 } } })).tone).toBeUndefined();
    expect(money(-0.001)).toBe("$0.00");
    expect(balanceRow(acct({ balanceUsd: { balance: 17.84, burn: { perDay: 0.62, daysLeft: 28.8 } } }))).toEqual({
      amount: "$17.84",
      detail: "$0.62/day · ~29 days left",
    });
    const capy = acct({
      provider: "capy",
      spendUsd: { credits: 41.5, total: 241.5, periodEnd: null, projection: { credits: { perDay: 4.15, projectedAtEnd: 128.65 }, total: null } },
    });
    expect(balanceRow(capy)).toEqual({ amount: "$41.50", detail: "this month · ~$128.65 by month end" });
  });

  test("Capy shows dollars left once a balance is set, and a set-balance target until then", () => {
    const spendUsd = { credits: 41.5, total: 241.5, periodEnd: null, projection: { credits: { perDay: 4.15, projectedAtEnd: 128.65 }, total: null } };
    const capy = (over: Partial<LimitsAccount>) => acct({ provider: "capy", balanceSettable: true, spendUsd, ...over });
    expect(balanceRow(capy({ balanceAnchor: null }))).toEqual({ amount: null, detail: "$41.50 this month · ~$128.65 by month end" });
    const left = (balance: number, daysLeft: number) =>
      balanceRow(capy({ balanceAnchor: { balanceUsd: 100, asOf: 0 }, balanceUsd: { balance, burn: { perDay: 4.15, daysLeft } } }));
    expect(left(58.5, 14.1)).toEqual({
      amount: "$58.50 left",
      detail: "$41.50 this month · ~14 days left at $4.15/day",
      tone: undefined,
      title: "~$128.65 by month end",
    });
    expect(left(29, 7).tone).toBe("low");
    expect(left(8.3, 2).tone).toBe("out");
    expect(left(-3, -0.7)).toMatchObject({ amount: "$0.00 left", detail: "$41.50 this month · ~0 days left at $4.15/day", tone: "out" });
  });

  test("Capy with a session: dollars left, days at $/day, grants on tap; no set balance", () => {
    const spendUsd = { credits: 29.2, total: 50, periodEnd: null, projection: { credits: { perDay: 2.75, projectedAtEnd: 85.25 }, total: null } };
    const plan = { name: "Capy Lite", status: "active", canceledAt: Date.parse("2026-10-09T19:36:23Z"), renewsAt: Date.parse("2026-10-16T18:55:08Z") };
    const capy = acct({
      provider: "capy",
      balanceSettable: false,
      spendUsd,
      plan,
      balanceUsd: { balance: 1090.79856, burn: { perDay: 2.75, daysLeft: 396.65 } },
      billing: {
        remainingUsd: 1090.79856,
        usedUsd: 29.20143,
        grantedUsd: 1120,
        unlimited: false,
        plan,
        sources: [
          { name: "Credit grant", kind: "grant", grantedUsd: 100, remainingUsd: 90.79856, resetsAt: null, expiresAt: null },
          { name: "Credit grant", kind: "grant", grantedUsd: 1000, remainingUsd: 1000, resetsAt: null, expiresAt: null },
        ],
      },
    });
    expect(balanceRow(capy)).toEqual({
      amount: "$1,090.80 left",
      detail: "~397 days at $2.75/day",
      tone: undefined,
      title: "$29.20 used of $1,120.00 · $29.20 this month · ~$85.25 by month end",
      sources: ["Credit grant · $90.80 of $100.00 left", "Credit grant · $1,000.00 of $1,000.00 left"],
    });
    expect(planChip(capy)).toBe("Lite · ends Oct 16");
    expect(planChip({ ...capy, plan: { ...plan, canceledAt: null } })).toBe("Lite · renews Oct 16");
  });

  test("plan chips use the upstream's name, flag a lapsed plan, and stay off when unknown", () => {
    const plan = (name: string, status = "active", renewsAt: number | null = null) => ({ name, status, renewsAt, canceledAt: null });
    expect(planChip(acct({ provider: "claude", plan: plan("Max 20x") }))).toBe("Max 20x");
    expect(planChip(acct({ provider: "grok", label: "Grok", plan: plan("SuperGrok") }))).toBe("SuperGrok");
    expect(planChip(acct({ provider: "grok", label: "SuperGrok", plan: plan("SuperGrok") }))).toBeNull();
    expect(planChip(acct({ provider: "opencode-go", status: "inactive", plan: plan("Go", "inactive") }))).toBe("Go");
    expect(planChip(acct({ provider: "opencode-go", plan: plan("Go", "inactive") }))).toBe("Go inactive");
    expect(planChip(acct({ provider: "opencode", plan: plan("Go", "active", Date.parse("2026-11-01T00:00:00Z")) }))).toBe("Go · renews Nov 1");
    expect(planChip(acct({ plan: null }))).toBeNull();
    expect(planChip(acct({}))).toBeNull();
  });

  test("typed balances parse as dollars", () => {
    expect(parseDollars("58.50")).toBe(58.5);
    expect(parseDollars(" $1,200 ")).toBe(1200);
    expect(parseDollars("0")).toBe(0);
    expect(parseDollars("-5")).toBeNull();
    expect(parseDollars("lots")).toBeNull();
    expect(parseDollars("")).toBeNull();
  });

  test("cards are ordered by their most used window, inactive last", () => {
    const sorted = sortByUrgency([
      acct({ id: "low", windows: [win({ usedPercent: 8 }), win({ window: "Week", usedPercent: 27 })] }),
      acct({ id: "lapsed", status: "inactive", windows: [win({ usedPercent: 99 })] }),
      acct({ id: "high", windows: [win({ usedPercent: 12 }), win({ window: "Week", usedPercent: 94 })] }),
      acct({ id: "unknown", windows: [win({ usedPercent: null })] }),
      acct({ id: "mid", windows: [win({ usedPercent: 62 })] }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["high", "mid", "low", "unknown", "lapsed"]);
  });
});
