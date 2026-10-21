import type { NowState, ReturnsResponse, Task, TasksResponse } from "../src/client/types";
import { expect, test } from "./fixtures";

test.use({ serviceWorkers: "block", reducedMotion: "reduce" });

const time = Date.parse("2026-10-21T12:00:00Z");
const task: Task = {
  id: "issue-1",
  workspace: 0,
  identifier: "HOME-1",
  content: "Return headphones",
  description: "",
  due: { date: "2026-10-21" },
  context: "Home",
  team: { key: "HOME", name: "Home" },
  url: "https://linear.app/fixture/issue/HOME-1",
};
const tasks = (closed = false): TasksResponse => ({
  todayKey: "2026-10-21",
  tabs: [{ name: "Home", overdue: [], today: closed ? [] : [task], upcoming: [], undated: [] }],
});
const returns = (closed = false): ReturnsResponse => ({
  todayKey: "2026-10-21",
  items: closed ? [] : [{ ...task, urgency: "due_today", daysUntilDue: 0 }],
});
const now = (title = "Appointment"): NowState => ({
  currentTime: new Date(time).toISOString(),
  anchor: { id: "event-1", title, location: null, isVirtual: true, start: "2026-10-21T15:00:00Z", end: null },
  travel: null,
  timing: null,
  prep: { day: "2026-10-21", steps: [{ id: 1, label: "eat", minutes: 15, done: false, doneAt: null }], runningLate: false, remainingMinutes: 15 },
  travelError: null,
});

test.beforeEach(async ({ page, request }) => {
  await request.post("/__e2e/state", { data: { dir: "e2e/.builds/a", swDir: null, signedIn: true, nowShape: "current", latencyMs: 0 } });
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.route("**/api/tasks", (route) => route.fulfill({ json: tasks() }));
  await page.route("**/api/returns", (route) => route.fulfill({ json: returns() }));
  await page.route("**/api/now", (route) => route.fulfill({ json: now() }));
});

for (const source of ["tasks", "returns"] as const) {
  test(`a delayed Now success preserves the ${source} failure`, async ({ page }, testInfo) => {
    const gate = Promise.withResolvers<void>();
    await page.route(`**/api/${source}`, (route) => route.fulfill({ status: 502, json: { error: "unavailable" } }));
    await page.route("**/api/now", async (route) => {
      await gate.promise;
      await route.fulfill({ json: now() });
    });
    await page.goto("/");
    await expect(page.locator(".error-toast")).toHaveText(`Error: ${source} 502`);
    gate.resolve();
    await expect(page.locator(".now-anchor-title")).toHaveText("Appointment");
    if (source === "tasks") await page.screenshot({ path: testInfo.outputPath("f5-delayed-now.png"), fullPage: true });
    await expect(page.locator(".error-toast")).toHaveText(`Error: ${source} 502`);
    await page.clock.fastForward(60_000);
    await expect(page.locator(".error-toast")).toHaveText(`Error: ${source} 502`);
  });
}

for (const source of ["now", "tasks", "returns"] as const) {
  test(`a successful ${source} retry clears only its own error`, async ({ page }) => {
    let recovered = false;
    const sources = ["now", "tasks", "returns"] as const;
    for (const name of sources) {
      await page.route(`**/api/${name}`, (route) => recovered && source === name
        ? route.fulfill({ json: name === "now" ? now() : name === "tasks" ? tasks() : returns() })
        : route.fulfill({ status: 502, json: { error: "unavailable" } }));
    }
    await page.goto("/");
    for (const name of sources) await expect(page.locator(".error-toast")).toContainText(`Error: ${name} 502`);
    recovered = true;
    await page.clock.fastForward(15_001);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".error-toast")).not.toContainText(`Error: ${source} 502`);
    for (const name of sources.filter((name) => name !== source)) {
      await expect(page.locator(".error-toast")).toContainText(`Error: ${name} 502`);
    }
  });
}

for (const mutation of ["prep", "close"] as const) {
  test(`successful loaders preserve a failed ${mutation} mutation`, async ({ page }) => {
    await page.route(mutation === "prep" ? "**/api/prep" : "**/api/tasks/0/issue-1/close", (route) =>
      route.fulfill({ status: 502, json: { error: "unavailable" } }));
    await page.goto("/");
    await expect(page.locator(".now-anchor-title")).toHaveText("Appointment");
    const gate = Promise.withResolvers<void>();
    await page.route("**/api/now", async (route) => {
      await gate.promise;
      await route.fulfill({ json: now("Next appointment") });
    });
    await page.getByRole("button", { name: mutation === "prep" ? "eat 15m" : 'mark "Return headphones" as done', exact: true }).click();
    await expect(page.locator(".error-toast")).toHaveText(`Error: ${mutation} 502`);
    await page.clock.fastForward(15_001);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    gate.resolve();
    await expect(page.locator(".now-anchor-title")).toHaveText("Next appointment");
    await expect(page.locator(".error-toast")).toHaveText(`Error: ${mutation} 502`);
  });
}

test("completing a task refreshes its Returns entry and both caches", async ({ page }, testInfo) => {
  let closed = false;
  let returnsRequests = 0;
  await page.route("**/api/tasks", (route) => route.fulfill({ json: tasks(closed) }));
  await page.route("**/api/returns", (route) => {
    returnsRequests++;
    return route.fulfill({ json: returns(closed) });
  });
  await page.route("**/api/tasks/0/issue-1/close", (route) => {
    closed = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await expect(page.locator(".task")).toHaveCount(1);
  await expect(page.locator(".return-item")).toHaveCount(1);
  await page.getByRole("button", { name: 'mark "Return headphones" as done' }).click();
  await expect(page.locator(".task")).toHaveCount(0);
  await expect(page.locator(".return-item")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("f10-completed-return.png"), fullPage: true });
  expect(returnsRequests).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("today.cache.returns.linear")!).items)).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("today.cache.tasks.linear.v2")!).tabs[0].today)).toEqual([]);
});
