import { expect, test } from "./fixtures";

test.use({ serviceWorkers: "block", reducedMotion: "reduce", timezoneId: "America/Los_Angeles" });

test("all-day dates stay on their calendar day while timed events use the local time zone", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-10-21T12:00:00Z") });
  await page.route("**/api/events", (route) => route.fulfill({ json: {
    events: [
      { id: "today", summary: "Today holiday", start: { date: "2026-10-21" } },
      { id: "tomorrow", summary: "Tomorrow holiday", start: { date: "2026-10-22" } },
      { id: "timed-today", summary: "Today meeting", start: { dateTime: "2026-10-22T00:30:00Z" } },
      { id: "timed-tomorrow", summary: "Tomorrow meeting", start: { dateTime: "2026-10-22T18:30:00Z" } },
      { id: "timed-yesterday", summary: "Yesterday meeting", start: { dateTime: "2026-10-21T01:00:00Z" } },
    ],
    nextAnchor: null,
  } }));
  await page.goto("/");
  const calendar = page.locator(".section--events");
  await calendar.getByRole("button", { name: "Tomorrow" }).click();
  const screenshot = testInfo.outputPath("f3-calendar-dates.png");
  await calendar.screenshot({ path: screenshot });
  await testInfo.attach("Calendar dates", { path: screenshot, contentType: "image/png" });
  const days = calendar.locator(".day-group");
  await expect(days.nth(0).locator(".event-title")).toHaveText(["Today holiday", "Today meeting"]);
  await expect(days.nth(0).locator(".event-time")).toHaveText(["all day", "17:30"]);
  await expect(days.nth(1).locator(".event-title")).toHaveText(["Tomorrow holiday", "Tomorrow meeting"]);
  await expect(days.nth(1).locator(".event-time")).toHaveText(["all day", "11:30"]);
  await expect(calendar).not.toContainText("Yesterday meeting");
});

test("Stars labels the previous local date Yesterday after Stockholm's DST fallback", async ({ page }, testInfo) => {
  const now = Date.parse("2026-10-25T23:30:00+01:00");
  await page.clock.install({ time: now });
  await page.route("**/api/github", (route) => route.fulfill({ json: {
    user: "fixture",
    timezone: "Europe/Stockholm",
    generatedAt: now,
    repos: [{ name: "calendar-demo", stars: 1, forks: 0, url: "https://example.com/calendar-demo" }],
    events: [{ kind: "star", repo: "calendar-demo", login: "fixture", name: null, avatarUrl: "", at: Date.parse("2026-10-24T12:00:00Z") }],
  } }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Stars" }).click();
  const stars = page.locator(".stars");
  await expect(stars.locator(".stars-day")).toHaveCount(1);
  const screenshot = testInfo.outputPath("f18-stockholm-yesterday.png");
  await stars.screenshot({ path: screenshot });
  await testInfo.attach("Stockholm Yesterday label", { path: screenshot, contentType: "image/png" });
  await expect(stars.locator(".stars-day")).toHaveText("Yesterday");
});
