import { expect, test } from "./fixtures";

test.use({ serviceWorkers: "block", reducedMotion: "reduce" });

const steps = [
  { id: 1, label: "fixture medication", minutes: 15, done: false, doneAt: null },
  { id: 2, label: "fixture breakfast", minutes: 10, done: false, doneAt: null },
];

test.beforeEach(async ({ page, request }) => {
  await request.post("/__e2e/state", { data: { dir: "e2e/.builds/a", swDir: null, signedIn: true, nowShape: "current" } });
  await page.route("**/api/now", async (route) => {
    const response = await route.fetch();
    const now = await response.json();
    await route.fulfill({ json: { ...now, prep: { ...now.prep, steps } } });
  });
  await page.route("**/api/prep/history", (route) => route.fulfill({ json: { steps: [], days: [] } }));
});

test("privacy keeps prep steps read-only without exposing real labels", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("today.privacy", "1"));
  await page.goto("/");
  await page.getByRole("button", { name: "Edit prep steps" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.locator(".prep-edit-row, .prep-avg tr")).toHaveCount(2);
  const screenshot = testInfo.outputPath("f8-prep-privacy.png");
  await page.screenshot({ path: screenshot });
  await testInfo.attach("Prep steps in privacy mode", { path: screenshot, contentType: "image/png" });
  await expect(sheet.locator("input")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "+ add step", exact: true })).toHaveCount(0);
  expect(await sheet.innerHTML()).not.toContain("fixture");
  expect(await sheet.ariaSnapshot()).not.toContain("fixture");
  await page.locator(".privacy-toggle").dispatchEvent("click");
  await sheet.getByRole("textbox", { name: "Step name" }).first().fill("fixture draft");
  await page.locator(".privacy-toggle").dispatchEvent("click");
  await expect(sheet.locator("input")).toHaveCount(0);
  expect(await sheet.innerHTML()).not.toContain("fixture");
  expect(await sheet.ariaSnapshot()).not.toContain("fixture");
  await page.locator(".privacy-toggle").dispatchEvent("click");
  await expect(sheet.getByRole("textbox", { name: "Step name" }).first()).toHaveValue("fixture draft");
});

test("prep draft survives History until saved or the sheet closes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit prep steps" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "Step name" }).first().fill("changed draft");
  await sheet.getByRole("spinbutton").first().fill("7");
  await sheet.getByRole("button", { name: "+ add step", exact: true }).click();
  await sheet.getByRole("textbox", { name: "Step name" }).last().fill("new draft");
  await sheet.getByRole("tab", { name: "History", exact: true }).click();
  await sheet.getByRole("tab", { name: "Steps", exact: true }).click();
  await expect(sheet.getByRole("textbox", { name: "Step name" })).toHaveCount(3);
  await expect(sheet.getByRole("textbox", { name: "Step name" }).first()).toHaveValue("changed draft");
  await expect(sheet.getByRole("spinbutton").first()).toHaveValue("7");
  await expect(sheet.getByRole("textbox", { name: "Step name" }).last()).toHaveValue("new draft");
  await page.route("**/api/prep/steps", (route) => route.fulfill({ json: { day: "2026-10-21", steps, runningLate: false, remainingMinutes: 25 } }));
  const saved = page.waitForRequest((request) => request.url().endsWith("/api/prep/steps") && request.method() === "PUT");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).postDataJSON()).toEqual({ steps: [
    { id: 1, label: "changed draft", minutes: 7 },
    { id: 2, label: "fixture breakfast", minutes: 10 },
    { label: "new draft", minutes: 5 },
  ] });
  await expect(sheet).toHaveCount(0);
  await page.getByRole("button", { name: "Edit prep steps" }).click();
  await sheet.getByRole("textbox", { name: "Step name" }).first().fill("discarded draft");
  await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit prep steps" }).click();
  await expect(sheet.getByRole("textbox", { name: "Step name" }).first()).toHaveValue("fixture medication");
});
