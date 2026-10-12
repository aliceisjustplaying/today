import { describe, expect, test } from "bun:test";
import { DECOYS, DECOY_DOLLARS, decoy, decoyEach, decoyEmail, decoyPlanDate, maskFigures, maskInline, privacyFor } from "./privacy";
import { money } from "./limits-format";

describe("privacy decoys", () => {
  test("a decoy depends on the id alone: stable per id, blind to the real value", () => {
    const on = privacyFor(true);
    const short = on.decoy("title", "evt-42", "Gym");
    expect(on.decoy("title", "evt-42", "Dinner with my sister at the place on Leather Lane")).toBe(short);
    expect(on.decoy("title", "evt-42", "")).toBe(short);
    expect(on.email(0, "hi@example.org")).toBe(on.email(0, "a.very.long.address@another-domain.co.uk"));
    expect(privacyFor(false).decoy("title", "evt-42", "Gym")).toBe("Gym");
    expect(privacyFor(false).email(0, "hi@example.org")).toBe("hi@example.org");
    for (const kind of Object.keys(DECOYS) as (keyof typeof DECOYS)[]) {
      const first = decoy(kind, "issue-uuid-1");
      expect(decoy(kind, "issue-uuid-1")).toBe(first);
      expect(DECOYS[kind] as readonly string[]).toContain(first);
    }
    expect(decoy("prep", 5)).toBe(decoy("prep", "5"));
  });

  test("different ids spread across the pool", () => {
    const picks = new Set(Array.from({ length: 50 }, (_, i) => decoy("title", `event-${i}`)));
    expect(picks.size).toBeGreaterThan(5);
  });

  test("text pools mix short and long values", () => {
    for (const pool of [DECOYS.title, DECOYS.location, DECOYS.prep, DECOYS.issue, DECOYS.label, DECOYS.identifier]) {
      const lengths = pool.map((v) => v.length);
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThanOrEqual(3);
    }
  });

  test("pills side by side never share a decoy, and keep their picks", () => {
    const seeds = [1, 2, 3, 4, 5, "late"];
    const picks = decoyEach("prep", seeds);
    expect(new Set(picks).size).toBe(seeds.length);
    expect(decoyEach("prep", seeds)).toEqual(picks);
  });

  test("account emails are numbered by position, not by address", () => {
    expect(decoyEmail(0)).toBe("alice@example.com");
    expect(decoyEmail(1)).toBe("alice2@example.com");
    expect(decoyEmail(4)).toBe("alice5@example.com");
  });

  test("every dollar amount is $67.00, whatever its size or sign", () => {
    for (const n of [0, -0.12, 4.2, 58.4, 1090.79856, 1_000_000]) {
      expect(maskInline(money(n))).toBe(DECOY_DOLLARS);
      expect(maskInline(`${money(n)} left`)).toBe("$67.00 left");
    }
    expect(maskInline("$29.20 used of $1,120.00 · $29.20 this month")).toBe("$67.00 used of $67.00 · $67.00 this month");
  });

  test("credits are always 67, and dollars stay $67.00 next to them", () => {
    expect(maskFigures("Credits 48,237")).toBe("Credits 67");
    expect(maskFigures("Credits 248")).toBe("Credits 67");
    expect(maskFigures("Credits 0")).toBe("Credits 67");
    expect(maskFigures("$41.50 credits this month · $241.50 incl. subscriptions")).toBe("$67.00 credits this month · $67.00 incl. subscriptions");
    expect(maskFigures("Credits unlimited")).toBe("Credits unlimited");
    expect(maskFigures("Credits 48,237 · Banked resets 2")).toBe("Credits 67 · Banked resets 67");
  });

  test("inline text keeps percentages and times and swaps emails", () => {
    expect(maskInline("94% · in 2h 12m · resets 15:10")).toBe("94% · in 2h 12m · resets 15:10");
    expect(maskInline("token for hi@example.org expired")).toBe("token for alice@example.com expired");
  });

  test("plan chips keep the plan and swap the date", () => {
    const chip = decoyPlanDate("Lite · ends Oct 16", "capy:org");
    expect(chip).toBe(`Lite · ends ${decoy("date", "capy:org")}`);
    expect(decoyPlanDate("Pro · renews Nov 1", "capy:org")).toBe(`Pro · renews ${decoy("date", "capy:org")}`);
    expect(decoyPlanDate("Max 20x", "claude:max")).toBe("Max 20x");
  });
});
