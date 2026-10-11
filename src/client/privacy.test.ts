import { describe, expect, test } from "bun:test";
import { redact, redactFigures, redactPlanDate } from "./privacy";

describe("privacy redaction", () => {
  test("hides emails and dollar amounts", () => {
    expect(redact("alice.work+x@example.co.uk")).toBe("•••@•••");
    expect(redact("Coffee with sam@example.com")).toBe("Coffee with •••@•••");
    expect(redact("$41.50 this month · ~14 days left at $4.15/day")).toBe("$••• this month · ~14 days left at $•••/day");
    expect(redact("-$0.12")).toBe("$•••");
    expect(redact("$1,240.00 left")).toBe("$••• left");
  });

  test("keeps percentages, times and durations", () => {
    expect(redact("94% · in 2h 12m · resets 15:10")).toBe("94% · in 2h 12m · resets 15:10");
    expect(redact("Credits 1,240 · 35/day")).toBe("Credits 1,240 · 35/day");
  });

  test("balance lines lose every figure", () => {
    expect(redactFigures("Credits 48,237 · 0/day")).toBe("Credits ••• · •••/day");
    expect(redactFigures("Credits 248 · 0/day")).toBe("Credits ••• · •••/day");
    expect(redactFigures("Credits unlimited")).toBe("Credits unlimited");
  });

  test("plan chips keep the plan, not the date", () => {
    expect(redactPlanDate("Lite · ends Oct 16")).toBe("Lite · ends •••");
    expect(redactPlanDate("Pro · renews Nov 1")).toBe("Pro · renews •••");
    expect(redactPlanDate("Max 20x")).toBe("Max 20x");
  });
});
