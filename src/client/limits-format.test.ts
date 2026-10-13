import { describe, expect, test } from "bun:test";
import {
  ageLabel,
  balanceRow,
  formatDuration,
  formatWallTime,
  cardNotice,
  hidesOldData,
  isBalanceOnly,
  isStale,
  money,
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
import type { LimitsAccount, LimitsWindow } from "./types";

const now = Date.parse("2026-10-11T12:00:00Z");
const TZ = "Europe/London";
const win = (over: Partial<LimitsWindow>): LimitsWindow => ({ window: "5h", usedPercent: 10, resetsAt: null, projection: null, ...over });

describe("limits formatting", () => {
  test("durations", () => {
    expect(formatDuration(-1)).toBe("now");
    expect(formatDuration(42 * 60_000)).toBe("42m");
    expect(formatDuration(3 * 3_600_000)).toBe("3h");
    expect(formatDuration(130 * 60_000)).toBe("2h 10m");
    expect(formatDuration(5 * 86_400_000)).toBe("5d");
  });

  test("reset times are wall-clock in the given time zone", () => {
    expect(formatWallTime(Date.parse("2026-10-11T15:40:00Z"), now, TZ)).toBe("16:40");
    expect(formatWallTime(Date.parse("2026-10-14T08:00:00Z"), now, TZ)).toBe("Wed 09:00");
    expect(formatWallTime(Date.parse("2026-11-02T09:00:00Z"), now, TZ)).toBe("2 Nov 09:00");
    expect(formatWallTime(Date.parse("2026-10-11T15:40:00Z"), now, "America/New_York")).toBe("11:40");
    // 23:30 UTC is still the 11th in New York but already the 12th in Tokyo.
    expect(formatWallTime(Date.parse("2026-10-11T23:30:00Z"), now, "America/New_York")).toBe("19:30");
    expect(formatWallTime(Date.parse("2026-10-11T23:30:00Z"), now, "Asia/Tokyo")).toBe("Mon 08:30");
    const soon = win({ resetsAt: Date.parse("2026-10-11T14:10:00Z") });
    expect(resetLabel(soon, now)).toBe("in 2h 10m");
    expect(resetTitle(soon, now, TZ)).toBe("resets 15:10");
    expect(resetLabel(win({ resetsAt: now - 1 }), now)).toBe("resetting");
    expect(resetLabel(win({}), now)).toBeNull();
    expect(resetTitle(win({}), now, TZ)).toBeUndefined();
  });

  test("bars are colored by headroom alone; a forecast never colors them", () => {
    expect(windowTone(win({ usedPercent: 59 }))).toBe("ok");
    expect(windowTone(win({ usedPercent: 60 }))).toBe("warn");
    expect(windowTone(win({ usedPercent: 84 }))).toBe("warn");
    expect(windowTone(win({ usedPercent: 85 }))).toBe("bad");
    expect(windowTone(win({ usedPercent: null }))).toBe("ok");
    const hits = { percentPerHour: 30, projectedAtReset: 100, hitsLimitAt: now + 80 * 60_000, samples: 5 };
    expect(windowTone(win({ usedPercent: 9, projection: hits }))).toBe("ok");
    expect(windowTone(win({ usedPercent: 40, projection: { ...hits, hitsLimitAt: null, projectedAtReset: 88 } }))).toBe("ok");
  });

  test("card money lines are amounts only", () => {
    const capy = {
      spendUsd: {
        credits: 41.5,
        total: 241.5,
        periodEnd: null,
        projection: { credits: { perDay: 4.15, projectedAtEnd: 128.65 }, total: null },
      },
    } as LimitsAccount;
    expect(spendLines(capy)).toEqual(["$41.50 credits this month", "$241.50 incl. subscriptions"]);
    expect(spendLines({ credits: { balance: 48237, unlimited: false, burn: { perDay: 0, daysLeft: null } } } as LimitsAccount)).toEqual([
      "Credits 48,237",
    ]);
    expect(spendLines({} as LimitsAccount)).toEqual([]);
  });

  test("a Codex card counts its banked resets beside its credits, and says nothing when there are none or limits doesn't know", () => {
    const credits = { balance: 48237, unlimited: false, burn: null };
    expect(spendLines({ credits, resetCredits: 2 } as LimitsAccount)).toEqual(["Credits 48,237", "Banked resets 2"]);
    expect(spendLines({ resetCredits: 1 } as LimitsAccount)).toEqual(["Banked resets 1"]);
    expect(spendLines({ credits, resetCredits: 0 } as LimitsAccount)).toEqual(["Credits 48,237"]);
    expect(spendLines({ credits, resetCredits: null } as LimitsAccount)).toEqual(["Credits 48,237"]);
    expect(spendLines({ credits } as LimitsAccount)).toEqual(["Credits 48,237"]);
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
    expect(cardNotice(account("inactive"), now, TZ)).toBeNull();
    expect(cardNotice(account("ok"), now, TZ)).toBe("Go ok");
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

  test("a Claude 429 (inactive, no data since) drops the old bars and says when usage comes back, or that there is none", () => {
    const hour = 3_600_000;
    const outOfUsage = acct({
      status: "inactive",
      notice: "No usage available",
      availableAt: Date.parse("2026-10-11T13:14:00Z"),
      observedAt: now - hour,
      lastAttemptAt: now - 2 * 60_000,
      windows: [win({ usedPercent: 100 }), win({ window: "Week", usedPercent: 58 })],
    });
    expect(hidesOldData(outOfUsage)).toBe(true);
    expect(cardNotice(outOfUsage, now, TZ)).toBe("Out of usage · back 14:14");
    expect(statusLabel(outOfUsage)).toBe("inactive");
    expect(isStale(outOfUsage, now)).toBe(false);
    expect(ageLabel(outOfUsage, now)).toBe("1h");
    // No Retry-After, or one that has passed: the notice from limits.
    expect(cardNotice({ ...outOfUsage, availableAt: null }, now, TZ)).toBe("No usage available");
    expect(cardNotice({ ...outOfUsage, availableAt: now - 1 }, now, TZ)).toBe("No usage available");
    // Fresh data on an inactive account (the poll itself said so) stays on the card.
    expect(hidesOldData({ ...outOfUsage, observedAt: outOfUsage.lastAttemptAt })).toBe(false);
    // Lapsed with no data ever (Go) is unchanged: a pill, no line.
    expect(hidesOldData({ ...outOfUsage, observedAt: null, availableAt: null })).toBe(false);
    expect(cardNotice({ ...outOfUsage, observedAt: null, availableAt: null }, now, TZ)).toBeNull();
  });

  test("age is as short as possible", () => {
    expect(ageLabel(acct({ observedAt: now - 10_000 }), now)).toBe("now");
    expect(ageLabel(acct({ observedAt: now - 60_000 }), now)).toBe("1m");
    expect(ageLabel(acct({ observedAt: now - 26 * 3_600_000 - 60_000 }), now)).toBe("stale 26h");
    expect(ageLabel(acct({ observedAt: now - 3 * 86_400_000 }), now)).toBe("stale 3d");
    expect(ageLabel(acct({ observedAt: null, status: "pending" }), now)).toBe("waiting");
  });

  test("data goes stale after an hour since the last successful poll, except on inactive accounts", () => {
    const hour = 3_600_000;
    expect(isStale(acct({ observedAt: now - hour }), now)).toBe(false);
    expect(ageLabel(acct({ observedAt: now - 59 * 60_000 }), now)).toBe("59m");
    expect(isStale(acct({ observedAt: now - hour - 1 }), now)).toBe(true);
    expect(ageLabel(acct({ observedAt: now - 3 * hour }), now)).toBe("stale 3h");
    // A failing poll keeps the old snapshot, so an errored account goes stale on observedAt, not lastAttemptAt.
    expect(ageLabel(acct({ status: "error", observedAt: now - 3 * hour, lastAttemptAt: now }), now)).toBe("stale 3h");
    expect(isStale(acct({ status: "inactive", observedAt: now - 30 * hour }), now)).toBe(false);
    expect(ageLabel(acct({ status: "inactive", observedAt: now - 3 * hour }), now)).toBe("3h");
    expect(isStale(acct({ observedAt: null, status: "pending" }), now)).toBe(false);
  });

  test("each provider links to its own usage or billing page", () => {
    expect(usageUrl("claude")).toBe("https://claude.ai/settings/usage");
    expect(usageUrl("codex")).toBe("https://chatgpt.com/settings/usage");
    expect(usageUrl("grok")).toBe("https://grok.com/?_s=usage");
    expect(usageUrl("muse")).toBe("https://accountscenter.meta.com/muse_code/");
    expect(usageUrl("opencode")).toBe("https://opencode.ai/auth");
    expect(usageUrl("opencode-go")).toBe("https://opencode.ai/auth");
    expect(usageUrl("openrouter")).toBe("https://openrouter.ai/settings/credits");
    expect(usageUrl("capy")).toBe("https://capy.ai");
    expect(usageUrl("somethingelse")).toBeNull();
  });

  test("money-only accounts go to Balances unless they errored", () => {
    const zen = acct({ provider: "opencode", label: "Zen", balanceUsd: { balance: 4.2, burn: null } });
    expect(isBalanceOnly(zen)).toBe(true);
    expect(isBalanceOnly(acct({ status: "error", balanceUsd: { balance: 4.2, burn: null } }))).toBe(false);
    expect(isBalanceOnly(acct({ windows: [win({})], credits: { balance: 10, unlimited: false, burn: null } }))).toBe(false);
    expect(isBalanceOnly(acct({}))).toBe(false);

    expect(balanceRow(zen)).toEqual({ amount: "$4.20", detail: null });
    // A zero or negative balance is plain, and a burn rate never turns into a forecast.
    expect(balanceRow(acct({ balanceUsd: { balance: 0, burn: null } }))).toStrictEqual({ amount: "$0.00", detail: null });
    expect(balanceRow(acct({ balanceUsd: { balance: -0.12451, burn: null } }))).toStrictEqual({ amount: "-$0.12", detail: null });
    expect(money(-0.001)).toBe("$0.00");
    expect(balanceRow(acct({ balanceUsd: { balance: 17.84, burn: { perDay: 0.62, daysLeft: 28.8 } } }))).toStrictEqual({
      amount: "$17.84",
      detail: null,
    });
    const capy = acct({
      provider: "capy",
      spendUsd: { credits: 41.5, total: 241.5, periodEnd: null, projection: { credits: { perDay: 4.15, projectedAtEnd: 128.65 }, total: null } },
    });
    expect(balanceRow(capy)).toEqual({ amount: "$41.50", detail: "this month" });
  });

  test("Capy shows dollars left once a balance is set, and a set-balance target until then", () => {
    const spendUsd = { credits: 41.5, total: 241.5, periodEnd: null, projection: { credits: { perDay: 4.15, projectedAtEnd: 128.65 }, total: null } };
    const capy = (over: Partial<LimitsAccount>) => acct({ provider: "capy", balanceSettable: true, spendUsd, ...over });
    expect(balanceRow(capy({ balanceAnchor: null }))).toEqual({ amount: null, detail: "$41.50 this month" });
    const left = (balance: number, daysLeft: number) =>
      balanceRow(capy({ balanceAnchor: { balanceUsd: 100, asOf: 0 }, balanceUsd: { balance, burn: { perDay: 4.15, daysLeft } } }));
    expect(left(58.5, 14.1)).toStrictEqual({ amount: "$58.50 left", detail: null, title: "$41.50 this month" });
    expect(left(-3, -0.7)).toStrictEqual({ amount: "$0.00 left", detail: null, title: "$41.50 this month" });
  });

  test("Capy with a session: dollars left and grants on tap, no forecast; no set balance", () => {
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
    expect(balanceRow(capy)).toStrictEqual({
      amount: "$1,090.80 left",
      detail: null,
      title: "$29.20 used of $1,120.00 · $29.20 this month",
      sources: ["Credit grant · $90.80 of $100.00 left", "Credit grant · $1,000.00 of $1,000.00 left"],
    });
    expect(planChip(capy, TZ)).toBe("Lite · ends Oct 16");
    expect(planChip({ ...capy, plan: { ...plan, canceledAt: null } }, TZ)).toBe("Lite · renews Oct 16");
  });

  test("plan chips use the upstream's name, flag a lapsed plan, and stay off when unknown", () => {
    const plan = (name: string, status = "active", renewsAt: number | null = null) => ({ name, status, renewsAt, canceledAt: null });
    expect(planChip(acct({ provider: "claude", plan: plan("Max 20x") }), TZ)).toBe("Max 20x");
    expect(planChip(acct({ provider: "grok", label: "Grok", plan: plan("SuperGrok") }), TZ)).toBe("SuperGrok");
    expect(planChip(acct({ provider: "grok", label: "SuperGrok", plan: plan("SuperGrok") }), TZ)).toBeNull();
    expect(planChip(acct({ provider: "muse", label: "Muse", plan: plan("Muse Code Power Usage") }), TZ)).toBe("Power Usage");
    expect(planChip(acct({ provider: "claude", plan: plan("Muse Code Power Usage") }), TZ)).toBe("Muse Code Power Usage");
    expect(planChip(acct({ provider: "opencode-go", status: "inactive", plan: plan("Go", "inactive") }), TZ)).toBe("Go");
    expect(planChip(acct({ provider: "opencode-go", plan: plan("Go", "inactive") }), TZ)).toBe("Go inactive");
    // Zen's row never wears the Go subscription's chip; Go has its own card.
    expect(planChip(acct({ provider: "opencode", plan: plan("Go", "active", Date.parse("2026-11-01T00:00:00Z")) }), TZ)).toBeNull();
    expect(planChip(acct({ provider: "opencode", plan: plan("Go", "inactive") }), TZ)).toBeNull();
    expect(planChip(acct({ plan: null }), TZ)).toBeNull();
    expect(planChip(acct({}), TZ)).toBeNull();
  });

  test("typed balances parse as dollars", () => {
    expect(parseDollars("58.50")).toBe(58.5);
    expect(parseDollars(" $1,200 ")).toBe(1200);
    expect(parseDollars("0")).toBe(0);
    expect(parseDollars("-5")).toBeNull();
    expect(parseDollars("lots")).toBeNull();
    expect(parseDollars("")).toBeNull();
  });

  const plan = (name: string) => ({ name, status: "active", renewsAt: null, canceledAt: null });
  const ids = (accounts: LimitsAccount[]) => sortAccounts(accounts).map((a) => a.id);

  test("cards go Claude, Codex, Muse, SuperGrok, then other providers in the order limits lists them", () => {
    const listed = [
      acct({ id: "openrouter:main", provider: "openrouter" }),
      acct({ id: "grok:g", provider: "grok" }),
      acct({ id: "opencode-go:a", provider: "opencode-go" }),
      acct({ id: "codex:c", provider: "codex" }),
      acct({ id: "muse:m", provider: "muse" }),
      acct({ id: "capy:main", provider: "capy" }),
      acct({ id: "claude:a", provider: "claude" }),
      acct({ id: "opencode-go:b", provider: "opencode-go" }),
    ];
    expect(ids(listed)).toEqual([
      "claude:a",
      "codex:c",
      "muse:m",
      "grok:g",
      "openrouter:main",
      "opencode-go:a",
      "opencode-go:b",
      "capy:main",
    ]);
  });

  test("the order ignores usage, status and the order limits lists accounts in", () => {
    const listed = [
      acct({ id: "codex:busy", provider: "codex", email: "b@x.com", windows: [win({ usedPercent: 99 })] }),
      acct({ id: "claude:lapsed", provider: "claude", email: "z@x.com", status: "inactive" }),
      acct({ id: "claude:idle", provider: "claude", email: "a@x.com", windows: [win({ usedPercent: 0 })] }),
      acct({ id: "muse:err", provider: "muse", status: "error" }),
    ];
    const expected = ["claude:idle", "claude:lapsed", "codex:busy", "muse:err"];
    expect(ids(listed)).toEqual(expected);
    expect(ids([...listed].reverse())).toEqual(expected);
  });

  test("Claude accounts go Max 20x, Max 5x, Pro, Free, then by email", () => {
    const listed = [
      acct({ id: "claude:free", email: "f@x.com" }),
      acct({ id: "claude:pro-b", email: "b@x.com", plan: plan("Pro") }),
      acct({ id: "claude:max5", email: "a@x.com", plan: plan("Max 5x") }),
      acct({ id: "claude:pro-a", email: "A@x.com", plan: plan("Pro") }),
      acct({ id: "claude:max20", email: "z@x.com", plan: plan("Max 20x") }),
    ];
    expect(ids(listed)).toEqual(["claude:max20", "claude:max5", "claude:pro-a", "claude:pro-b", "claude:free"]);
    expect(ids([...listed].reverse())).toEqual(["claude:max20", "claude:max5", "claude:pro-a", "claude:pro-b", "claude:free"]);
  });

  test("Codex accounts go Pro, Team/Business/Enterprise, Plus, Free, then by email", () => {
    const codex = (id: string, email: string, name?: string) => acct({ id, provider: "codex", email, ...(name ? { plan: plan(name) } : {}) });
    const listed = [
      codex("codex:free", "a@x.com", "Free"),
      codex("codex:plus-b", "b@x.com", "Plus"),
      codex("codex:team", "t@x.com", "Team"),
      codex("codex:plus-a", "a@x.com", "Plus"),
      codex("codex:unknown", "u@x.com"),
      codex("codex:pro", "z@x.com", "Pro"),
    ];
    expect(ids(listed)).toEqual(["codex:pro", "codex:team", "codex:plus-a", "codex:plus-b", "codex:free", "codex:unknown"]);
  });

  test("a plan the order doesn't list goes after the listed paid plans but before Free", () => {
    const listed = [
      acct({ id: "claude:free", email: "a@x.com", plan: plan("Free") }),
      acct({ id: "claude:team", email: "b@x.com", plan: plan("Team") }),
      acct({ id: "claude:pro", email: "c@x.com", plan: plan("Pro") }),
    ];
    expect(ids(listed)).toEqual(["claude:pro", "claude:team", "claude:free"]);
  });

  test("same plan and no email falls back to id, with emailless accounts last", () => {
    const listed = [
      acct({ id: "grok:c", provider: "grok" }),
      acct({ id: "grok:b", provider: "grok", email: null }),
      acct({ id: "grok:a", provider: "grok", email: "z@x.com" }),
    ];
    expect(ids(listed)).toEqual(["grok:a", "grok:b", "grok:c"]);
  });

  test("ACS sorts right after SuperGrok", () => {
    const listed = [
      acct({ id: "openrouter:main", provider: "openrouter" }),
      acct({ id: "acs:main", provider: "acs" }),
      acct({ id: "grok:g", provider: "grok" }),
      acct({ id: "claude:a", provider: "claude" }),
    ];
    expect(ids(listed)).toEqual(["claude:a", "grok:g", "acs:main", "openrouter:main"]);
  });

  test("ACS: token totals as short figures, budgets stay bars, and a signed-out login is a neutral pill", () => {
    const tokens = {
      totalTokens: 1_432_625,
      inputTokens: 1_250_000,
      outputTokens: 182_625,
      requests: 4321,
      todayTokens: 20_500,
      budgets: [{ name: "Month", usedTokens: 1_432_625, limitTokens: 5_000_000, resetsAt: now + 86_400_000 }],
    };
    const a = acct({ id: "acs:main", provider: "acs", tokens, windows: [win({ window: "Month", usedPercent: 28.65 })] });
    expect(tokenLines(a)).toEqual(["1.43M tokens this month", "20.5k today", "4,321 requests"]);
    expect(tokenLines({ ...a, tokens: { ...tokens, totalTokens: 950, todayTokens: null } })).toEqual(["950 tokens this month", "4,321 requests"]);
    expect(tokenLines(acct({ id: "claude:a", provider: "claude" }))).toEqual([]);
    expect(isBalanceOnly(a)).toBe(false);
    expect(usageUrl("acs")).toBe("https://infra.acsresearch.org/usage");
    const expired = { ...a, status: "expired" as const, notice: "ACS session expired, sign in again" };
    expect(statusLabel(expired)).toBe("session expired");
    expect(cardNotice(expired, now, TZ)).toBeNull();
    expect(hidesOldData(expired)).toBe(false);
  });
});
