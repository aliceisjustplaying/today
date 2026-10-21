import { clearCached } from "./cache";

/**
 * Runs `callback` when the app comes back to the foreground. iOS home-screen apps report a
 * resume through visibilitychange or a bfcache pageshow more reliably than through focus, and
 * one resume can fire all three, so calls within a second collapse into one.
 */
export function onResume(callback: () => void): () => void {
  let last = 0;
  const fire = () => {
    if (document.visibilityState !== "visible" || Date.now() - last < 1000) return;
    last = Date.now();
    callback();
  };
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) fire();
  };
  document.addEventListener("visibilitychange", fire);
  window.addEventListener("focus", fire);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    document.removeEventListener("visibilitychange", fire);
    window.removeEventListener("focus", fire);
    window.removeEventListener("pageshow", onPageShow);
  };
}

/** Gap under which a resume skips refetching: a quick app switch shouldn't hit every API again. */
export const REFETCH_GAP_MS = 15_000;

/**
 * Wraps a refetch so it runs at most once per `gapMs`. The clock starts at creation, because
 * the caller has just loaded everything.
 */
export function throttle(fn: () => void, gapMs: number, now: () => number = Date.now): () => void {
  let last = now();
  return () => {
    const t = now();
    if (t - last < gapMs) return;
    last = t;
    fn();
  };
}

/** The session or the Google grant expired: go through login, without leaving this page in history. */
export function signInAgain(): void {
  clearCached();
  window.location.replace("/auth/google/start");
}
