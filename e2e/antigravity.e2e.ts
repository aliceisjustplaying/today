import type { LimitsAccount, LimitsSummary } from "../src/client/types";
import { expect, test } from "./fixtures";

test.use({ serviceWorkers: "block", reducedMotion: "reduce" });

test("Google AI Ultra renders four quotas beside other providers and marks old Mac data stale", async ({ page }, testInfo) => {
  const now = Date.parse("2026-10-15T12:45:00Z");
  const observedAt = now - 16 * 60_000;
  const google: LimitsAccount = {
    id: "antigravity:mac", provider: "antigravity", label: "Google AI Ultra", status: "ok", error: null,
    lastAttemptAt: observedAt, observedAt, stale: true,
    windows: [
      { window: "Gemini Models · 5h", usedPercent: 0.880748, resetsAt: Date.parse("2026-10-15T17:12:25Z"), projection: null },
      { window: "Gemini Models · weekly", usedPercent: 0.22018, resetsAt: Date.parse("2026-10-22T12:12:25Z"), projection: null },
      { window: "Claude and GPT models · 5h", usedPercent: 0, resetsAt: Date.parse("2026-10-15T17:41:03Z"), projection: null },
      { window: "Claude and GPT models · weekly", usedPercent: 0, resetsAt: Date.parse("2026-10-22T12:41:03Z"), projection: null },
    ],
  };
  let fresh = false;
  await page.clock.install({ time: now });
  await page.route("**/api/limits", (route) => {
    const summary: LimitsSummary = {
      generatedAt: now, timezone: "Europe/Stockholm",
      accounts: [
        { ...google, id: "codex:example", provider: "codex", label: "Codex", stale: false, observedAt: now,
          windows: [{ window: "5h", usedPercent: 25, resetsAt: now + 3_600_000, projection: null }] },
        { ...google, ...(fresh ? { stale: false, observedAt: now } : {}) },
      ],
    };
    return route.fulfill({ json: summary });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Limits" }).click();
  const card = page.locator('.limits-card[data-provider="antigravity"]');
  await expect(card.getByRole("heading")).toHaveText("Google AI Ultra");
  await expect(page.locator(".limits-card").first().getByRole("heading")).toHaveText("Codex");
  await expect(card.getByRole("progressbar")).toHaveCount(4);
  for (const label of await card.locator(".limits-window-name").all()) {
    expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(label).toHaveCSS("white-space", "normal");
  }
  await expect(card.getByRole("progressbar", { name: "Gemini Models · 5h used", exact: true })).toHaveAttribute("aria-valuenow", "0.880748");
  await expect(card.locator(".limits-age")).toHaveText("stale 16m");
  await expect(card.locator(".limits-age")).toHaveClass(/limits-age--stale/);
  await expect(page.locator(".limits")).toHaveCSS("opacity", "1");
  const screenshot = testInfo.outputPath("google-ai-ultra.png");
  await page.locator(".limits").screenshot({ path: screenshot });
  await testInfo.attach("Google AI Ultra quotas", { path: screenshot, contentType: "image/png" });
  fresh = true;
  await page.reload();
  await expect(card.locator(".limits-age")).not.toContainText("stale");
});
