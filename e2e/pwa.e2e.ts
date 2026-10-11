import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const build = (dir: "a" | "b") => JSON.parse(readFileSync(`e2e/.builds/${dir}/version.json`, "utf8")).build as string;

type ServerState = {
  dir?: string;
  swDir?: string | null;
  signedIn?: boolean;
  nowShape?: "current" | "bodyState" | "broken";
};

async function server(request: APIRequestContext, state: ServerState) {
  await request.post("/__e2e/state", { data: state });
}

/** What iOS does when a home-screen app comes back from the background. */
async function resume(page: Page) {
  await page.evaluate(() => {
    for (const state of ["hidden", "visible"]) {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
}

async function openControlled(page: Page) {
  await page.goto("/");
  await expect(page.locator(".now-anchor-title")).toHaveText("Dentist");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
}

const runningBuild = (page: Page) => page.locator('meta[name="today-build"]').getAttribute("content");

test.beforeEach(async ({ request }) => {
  await server(request, { dir: "e2e/.builds/a", swDir: null, signedIn: true, nowShape: "current" });
});

test("a deploy while the app is in the background reloads into the new build on resume", async ({ page, request }) => {
  await openControlled(page);
  expect(await runningBuild(page)).toBe(build("a"));

  await server(request, { dir: "e2e/.builds/b" });
  await resume(page);

  await expect.poll(() => runningBuild(page)).toBe(build("b"));
  await expect(page.locator(".now-anchor-title")).toHaveText("Dentist");
  const shells = await page.evaluate(async () => (await caches.keys()).filter((key) => key.startsWith("today-shell-")));
  expect(shells).toContain(`today-shell-${build("b")}`);
});

test("a deploy waits while the prep editor is open, then reloads on the next resume", async ({ page, request }) => {
  await openControlled(page);
  await page.getByRole("button", { name: "Edit prep steps" }).click();
  await expect(page.getByRole("dialog", { name: "Prep steps" })).toBeVisible();

  await server(request, { dir: "e2e/.builds/b" });
  await resume(page);
  await page.waitForTimeout(1500);
  expect(await runningBuild(page)).toBe(build("a"));
  await expect(page.getByRole("dialog", { name: "Prep steps" })).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(1100);
  await resume(page);
  await expect.poll(() => runningBuild(page)).toBe(build("b"));
});

test("a service worker stuck on an old build is dropped by the kill switch", async ({ page, request }) => {
  await openControlled(page);
  await server(request, { dir: "e2e/.builds/b", swDir: "e2e/.builds/a" });
  await resume(page);

  await expect.poll(() => runningBuild(page)).toBe(build("b"));
  await expect(page.locator(".now-anchor-title")).toHaveText("Dentist");
});

test("old code fed a newer API shape shows a Reload button, not a blank screen", async ({ page, request }) => {
  await server(request, { nowShape: "broken" });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Something went wrong");

  await server(request, { nowShape: "current" });
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.locator(".now-anchor-title")).toHaveText("Dentist");
});

test("a cold open with no network renders from the service worker cache", async ({ page, context }) => {
  await openControlled(page);
  await page.reload();
  await expect(page.locator(".now-anchor-title")).toHaveText("Dentist");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".now-anchor-title")).toHaveText("Dentist");
  await context.setOffline(false);
});

test("a shell whose assets are gone recovers with one reload", async ({ page }) => {
  const stale = readFileSync("e2e/.builds/a/index.html", "utf8").replaceAll(/\/assets\/index-[^"]+/g, "/assets/index-gone.js");
  await page.route("/", (route) => route.fulfill({ contentType: "text/html", body: stale }), { times: 1 });
  const missing = page.waitForResponse((r) => r.url().endsWith("/assets/index-gone.js"));
  await page.goto("/");
  expect((await missing).status()).toBe(404);
  await expect(page.locator(".now-anchor-title")).toHaveText("Dentist");
});

test("an expired session on resume goes to sign-in and leaves nothing private cached", async ({ page, request }) => {
  await page.clock.install();
  await openControlled(page);
  await server(request, { signedIn: false });
  // A resume within seconds of the last load doesn't refetch; this one comes back later.
  await page.clock.fastForward(20_000);
  await resume(page);
  await expect(page).toHaveURL(/\/auth\/google\/start$/);

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys()) {
      for (const req of await (await caches.open(key)).keys()) urls.push(new URL(req.url).pathname);
    }
    return urls;
  });
  expect(cached.filter((path) => path.startsWith("/api/") || path.startsWith("/auth/"))).toEqual([]);
});
