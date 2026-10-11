// today's service worker. `vite build` writes it to dist/client/sw.js with BUILD and PRECACHE
// filled in (scripts/stamp-build.ts), so every deploy ships a byte-different worker.

const BUILD = "__BUILD__";
const PRECACHE = ["__PRECACHE__"];
const SHELL_PREFIX = "today-shell-";
const SHELL = SHELL_PREFIX + BUILD;
const RUNTIME = "today-runtime";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL);
        const shell = await fetch("/", { cache: "reload" });
        // A deploy that landed mid-install would pair this worker with another build's shell.
        if (!shell.ok || !(await shell.clone().text()).includes(`content="${BUILD}"`)) {
          throw new Error(`shell is not build ${BUILD}`);
        }
        await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
        await cache.put("/", shell);
      } catch (error) {
        await caches.delete(SHELL);
        throw error;
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Keep the previous shell too: a page that just opened on it may still be loading its assets.
      const shells = (await caches.keys()).filter((key) => key.startsWith(SHELL_PREFIX) && key !== SHELL);
      await Promise.all(shells.slice(0, -1).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (request.method === "GET" && FONT_HOSTS.includes(url.hostname)) {
      event.respondWith(staleWhileRevalidate(event));
    }
    return;
  }
  if (url.pathname === "/auth/logout") {
    event.waitUntil(caches.delete(RUNTIME));
    return;
  }
  if (request.method !== "GET" || url.pathname.startsWith("/auth/")) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
  } else if (request.mode === "navigate") {
    if (url.pathname === "/") event.respondWith(shell(request));
  } else if (url.pathname.startsWith("/assets/") || PRECACHE.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function shell(request) {
  const cached = await (await caches.open(SHELL)).match("/");
  return cached ?? fetch(request);
}

async function cacheFirst(request) {
  return (await caches.match(request)) ?? fetch(request);
}

// The page already paints from its localStorage cache and revalidates; this keeps the last
// good response so a cold open with no network still has data.
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    if (response.status === 401) await caches.delete(RUNTIME);
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(event.request);
  const fresh = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  });
  if (!cached) return fresh;
  event.waitUntil(fresh.catch(() => {}));
  return cached;
}
