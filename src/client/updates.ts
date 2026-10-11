const running = document.querySelector<HTMLMetaElement>('meta[name="today-build"]')?.content;
const ATTEMPT_KEY = "today.updateAttempt";

let inflight: Promise<boolean> | null = null;
let reloading = false;

export function registerServiceWorker(): void {
  if (!running || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
}

/**
 * Compares the running build with the deployed one and, when a deploy landed since this page
 * loaded, reloads into it. Resolves true when a reload is underway.
 */
export function reloadIfStale(): Promise<boolean> {
  inflight ??= check().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Resolves true when this page is about to be replaced by a newer build. Data loaders await it
 * before rendering a response, so old code never renders a newer API's shapes.
 */
export function supersededByDeploy(): Promise<boolean> {
  return inflight ?? Promise.resolve(reloading);
}

async function check(): Promise<boolean> {
  if (!running) return false;
  let latest: string;
  try {
    const r = await fetch("/version.json", { cache: "no-store" });
    if (!r.ok) return false;
    latest = ((await r.json()) as { build: string }).build;
  } catch {
    return false;
  }
  if (latest === running) {
    sessionStorage.removeItem(ATTEMPT_KEY);
    return false;
  }

  const [attemptedBuild, attempts] = (sessionStorage.getItem(ATTEMPT_KEY) ?? "").split(":");
  const tries = attemptedBuild === latest ? Number(attempts) : 0;
  if (tries >= 2) return false;
  sessionStorage.setItem(ATTEMPT_KEY, `${latest}:${tries + 1}`);

  if (tries === 0) {
    await activateLatestWorker();
  } else {
    await resetServiceWorker();
  }
  reloading = true;
  window.location.reload();
  return true;
}

async function activateLatestWorker(): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return;
  await registration.update().catch(() => {});
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    const settle = () => {
      if (worker.state === "activated" || worker.state === "redundant") resolve();
    };
    worker.addEventListener("statechange", settle);
    settle();
    window.setTimeout(resolve, 10_000);
  });
}

/** The kill switch: a reload that still lands on an old build means the worker is stuck. */
async function resetServiceWorker(): Promise<void> {
  const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
  await Promise.all(registrations.map((r) => r.unregister()));
  if ("caches" in window) {
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  }
}
