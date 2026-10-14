import type { Page } from "@playwright/test";
import type { LimitsAccount, LimitsSummary } from "../src/client/types";
import { expect, test } from "./fixtures";

test.use({ serviceWorkers: "block", reducedMotion: "reduce" });

const now = Date.parse("2026-10-14T12:00:00Z");
const early = Date.parse("2026-10-16T22:30:00Z");
const late = Date.parse("2026-11-17T12:00:00Z");
type ApiBalance = NonNullable<LimitsAccount["apiBalance"]>;

function apiBalance(grants: NonNullable<ApiBalance["balance"]>["grants"], over: Partial<ApiBalance> = {}): ApiBalance {
  return {
    status: "ok",
    notice: null,
    observedAt: now,
    balance: {
      remainingUsd: grants.reduce((sum, g) => sum + g.remainingUsd, 0),
      grantedUsd: grants.reduce((sum, g) => sum + g.grantedUsd, 0),
      expiresAt: late,
      grants,
    },
    ...over,
  };
}

const multiple = () => apiBalance([
  { remainingUsd: 199.35, grantedUsd: 200, expiresAt: early },
  { remainingUsd: 200, grantedUsd: 200, expiresAt: late },
]);
const single = () => apiBalance([{ remainingUsd: 200, grantedUsd: 200, expiresAt: late }]);
const account = (id: string, over: Partial<LimitsAccount> = {}): LimitsAccount => ({
  id,
  provider: "claude",
  label: "Claude",
  email: `${id}@example.com`,
  status: "ok",
  error: null,
  lastAttemptAt: now,
  observedAt: now,
  windows: [{ window: "5h", usedPercent: 25, resetsAt: now + 3600_000, projection: null }],
  ...over,
});

async function openLimits(page: Page, accounts: LimitsAccount[]) {
  const summary: LimitsSummary = { generatedAt: now, timezone: "Europe/Stockholm", accounts };
  await page.route("**/api/limits", (route) => route.fulfill({ json: summary }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Limits" }).click();
  await expect(page.locator(".limits-card")).toHaveCount(accounts.length);
}

test.beforeEach(async ({ page, request }) => {
  await request.post("/__e2e/state", { data: { dir: "e2e/.builds/a", swDir: null, signedIn: true, nowShape: "current" } });
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
});

test("each Claude account renders its own API balance below its usage", async ({ page }, testInfo) => {
  await openLimits(page, [
    account("main", { apiBalance: multiple(), plan: { name: "Max 20x", status: "active", renewsAt: null, canceledAt: null } }),
    account("cloud", { email: "a-cloud@example.com" }),
    account("single", { email: "b@example.com", apiBalance: single() }),
    account("expired", { email: "c@example.com", apiBalance: { ...multiple(), status: "expired" } }),
    account("error", { email: "d@example.com", apiBalance: { ...single(), status: "error", notice: "Could not fetch API balance" } }),
  ]);
  const cards = page.locator(".limits-card");
  await expect(cards.nth(0).locator(".limits-api-balance")).toHaveText("API balance$399.35 of $400 left$199.35 expires Oct 17");
  await expect(cards.nth(1).locator(".limits-email")).toHaveText("a-cloud@example.com");
  await expect(cards.nth(1).locator(".limits-api-balance")).toHaveCount(0);
  await expect(cards.nth(2).locator(".limits-api-balance")).toHaveText("API balance$200 of $200 leftresets Nov 17");
  await expect(cards.nth(3).locator(".limits-api-balance")).toHaveText("API balancesession expired");
  await expect(cards.nth(4).locator(".limits-api-balance")).toHaveText("API balancestale $200 of $200 leftresets Nov 17Could not fetch API balance");
  for (const card of await cards.all()) await expect(card.getByRole("progressbar", { name: "5h used" })).toHaveAttribute("aria-valuenow", "25");
  await expect(cards.nth(4).locator(".limits-api-balance .limits-error")).toHaveText("Could not fetch API balance");
  const screenshot = testInfo.outputPath("api-balances.png");
  await page.clock.resume();
  await expect(page.locator(".limits")).toHaveCSS("opacity", "1");
  await page.locator(".limits").screenshot({ path: screenshot });
  await testInfo.attach("Claude API balances", { path: screenshot, contentType: "image/png" });
});

test("missing, null and empty successful balances render nothing", async ({ page }) => {
  await openLimits(page, [
    account("missing"),
    account("null", { apiBalance: null }),
    account("empty", { apiBalance: { ...single(), balance: null } }),
    account("elapsed", { apiBalance: apiBalance([{ remainingUsd: 200, grantedUsd: 200, expiresAt: now }]) }),
  ]);
  await expect(page.locator(".limits-api-balance")).toHaveCount(0);
});

test("an API-only Claude account stays on its own card and equal expirations keep the full total", async ({ page }) => {
  await openLimits(page, [account("same-expiry", {
    windows: [],
    apiBalance: apiBalance([
      { remainingUsd: 199.35, grantedUsd: 200, expiresAt: late },
      { remainingUsd: 200, grantedUsd: 200, expiresAt: late },
    ]),
  })]);
  await expect(page.locator(".limits-balances")).toHaveCount(0);
  await expect(page.locator(".limits-api-balance")).toHaveText("API balance$399.35 of $400 left");
});

test("API balance status is independent of OAuth account status", async ({ page }) => {
  await openLimits(page, [
    account("inactive", { status: "inactive", observedAt: now - 1000, notice: "No usage available", apiBalance: single() }),
    account("expired", { status: "expired", apiBalance: single() }),
    account("error", { apiBalance: { ...single(), status: "error", balance: null, notice: "Could not fetch API balance" } }),
  ]);
  await expect(page.locator('.limits-card[data-status="inactive"] .limits-windows')).toHaveCount(0);
  await expect(page.locator('.limits-card[data-status="inactive"] .limits-api-balance')).toContainText("$200 of $200 left");
  await expect(page.locator('.limits-card[data-status="expired"] .limits-api-balance')).toContainText("$200 of $200 left");
  await expect(page.locator('.limits-api-balance[data-status="error"]')).toHaveText("API balanceCould not fetch API balance");
});

test("privacy hides every API money string including notices and accessible attributes", async ({ page }) => {
  await openLimits(page, [account("private", { apiBalance: { ...multiple(), status: "error", notice: "Could not fetch $399.35 for private@example.com" } })]);
  await page.getByRole("button", { name: "Hide emails and amounts for screenshots" }).click();
  const balance = page.locator(".limits-api-balance");
  await expect(balance).toContainText("$67.00 of $67.00 left");
  await expect(balance).toContainText("$67.00 expires Oct 17");
  await expect(balance.locator(".limits-error")).toHaveText("Could not fetch $67.00 for alice@example.com");
  expect(await balance.innerHTML()).not.toMatch(/399\.35|199\.35|\$400|private@example\.com/);
  expect(await balance.ariaSnapshot()).not.toMatch(/399\.35|199\.35|\$400|private@example\.com/);
});

test("a grant expiring between refreshes disappears and totals recompute immediately", async ({ page }) => {
  const firstExpiry = now + 5000;
  await openLimits(page, [account("rolling", { apiBalance: apiBalance([
    { remainingUsd: 199.35, grantedUsd: 200, expiresAt: firstExpiry },
    { remainingUsd: 200, grantedUsd: 200, expiresAt: now + 10_000 },
  ]) })]);
  const balance = page.locator(".limits-api-balance");
  await expect(balance).toContainText("$399.35 of $400 left");
  await page.clock.fastForward(5000);
  await expect(balance).toHaveText("API balance$200 of $200 leftresets Oct 14");
  await page.clock.fastForward(5000);
  await expect(balance).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "5h used" })).toBeVisible();
});
