import { describe, expect, test } from "bun:test";
import { redact } from "./privacy";

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
});
