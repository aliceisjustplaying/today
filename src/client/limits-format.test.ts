import { describe, expect, test } from "bun:test";
import { formatDuration, formatLondonTime, projectionLabel, resetLabel, spendLines, statusLabel, windowTone } from "./limits-format";
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
    expect(resetLabel(win({ resetsAt: Date.parse("2026-10-11T14:10:00Z") }), now)).toBe("resets 15:10 · in 2h 10m");
    expect(resetLabel(win({ resetsAt: now - 1 }), now)).toBe("resetting");
    expect(resetLabel(win({}), now)).toBeNull();
  });

  test("tone and projection", () => {
    expect(windowTone(win({ usedPercent: 20 }))).toBe("ok");
    expect(windowTone(win({ usedPercent: 75 }))).toBe("warn");
    expect(windowTone(win({ usedPercent: 95 }))).toBe("bad");
    const hits = { percentPerHour: 30, projectedAtReset: 100, hitsLimitAt: now + 80 * 60_000, samples: 5 };
    expect(windowTone(win({ usedPercent: 40, projection: hits }))).toBe("bad");
    expect(projectionLabel(win({ projection: hits }), now)).toBe("hits 100% in 1h 20m");
    expect(projectionLabel(win({ projection: { ...hits, hitsLimitAt: null, projectedAtReset: 64.6 } }), now)).toBe("~65% at reset");
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

  test("inactive is a neutral renew pill, other statuses pass through", () => {
    const account = (status: LimitsAccount["status"]): LimitsAccount => ({
      id: "opencode-go:main",
      provider: "opencode-go",
      label: "Go",
      status,
      error: null,
      notice: status === "inactive" ? "Go subscription inactive, renew to use" : null,
      lastAttemptAt: now,
      observedAt: null,
      windows: [],
    });
    expect(statusLabel(account("inactive"))).toBe("inactive · renew");
    expect(statusLabel(account("ok"))).toBe("ok");
    expect(statusLabel(account("error"))).toBe("error");
  });
});
