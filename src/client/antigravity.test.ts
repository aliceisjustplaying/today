import { expect, test } from "bun:test";
import { ageLabel, isBalanceOnly, isStale, sortAccounts } from "./limits-format";
import type { LimitsAccount } from "./types";

const now = Date.parse("2026-10-15T12:45:00Z");
const google: LimitsAccount = {
  id: "antigravity:mac", provider: "antigravity", label: "Google AI Ultra", status: "ok", error: null,
  lastAttemptAt: now - 16 * 60_000, observedAt: now - 16 * 60_000, stale: true,
  windows: [
    { window: "Gemini Models · 5h", usedPercent: 0.880748, resetsAt: now + 3_600_000, projection: null },
    { window: "Gemini Models · weekly", usedPercent: 0.22018, resetsAt: now + 7 * 86_400_000, projection: null },
    { window: "Claude and GPT models · 5h", usedPercent: 0, resetsAt: now + 3_600_000, projection: null },
    { window: "Claude and GPT models · weekly", usedPercent: 0, resetsAt: now + 7 * 86_400_000, projection: null },
  ],
};

test("Google quotas stay in account cards with the other providers", () => {
  expect(isBalanceOnly(google)).toBe(false);
  expect(sortAccounts([google, { ...google, id: "codex:a", provider: "codex" }]).map((a) => a.id)).toEqual([
    "codex:a", "antigravity:mac",
  ]);
});

test("source staleness is visible before the fallback one-hour threshold", () => {
  expect(isStale(google, now)).toBe(true);
  expect(ageLabel(google, now)).toBe("stale 16m");
  const fresh = { ...google, observedAt: now - 5 * 60_000, stale: false };
  expect(isStale(fresh, now)).toBe(false);
  expect(ageLabel(fresh, now)).toBe("5m");
  expect(ageLabel({ ...google, stale: undefined }, now)).toBe("16m");
});
