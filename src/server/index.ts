import { Hono } from "hono";
import auth from "./auth";
import { sessionMiddleware, requireSession } from "./session";
import { fetchTasksByFilter, bucketTasks, closeTask } from "./todoist";
import { todayKeyInTz, addDaysToKey } from "./dates";
import {
  getValidGoogleAccessToken,
  listAllCalendarEvents,
  findNextAnchor,
  GoogleReauthNeeded,
} from "./google";
import { computeNowState, updateBodyState } from "./now";
import type { Env } from "./env";

const DEFAULT_TZ = "Europe/London";

const app = new Hono<Env>();

app.use("*", sessionMiddleware);

app.route("/auth", auth);

app.get("/api/ping", (c) => c.json({ ok: true, now: new Date().toISOString() }));

app.get("/api/me", requireSession, (c) => {
  const s = c.get("session")!;
  return c.json({ email: s.email, userSub: s.userSub });
});

app.get("/api/tasks", requireSession, async (c) => {
  const tasks = await fetchTasksByFilter(
    c.env.TODOIST_API_TOKEN,
    "overdue | today | 7 days",
  );
  const today = todayKeyInTz(DEFAULT_TZ);
  const sevenDay = addDaysToKey(today, 7);
  const buckets = bucketTasks(tasks, today, sevenDay);
  return c.json({ ...buckets, todayKey: today });
});

app.get("/api/events", requireSession, async (c) => {
  const s = c.get("session")!;
  try {
    const accessToken = await getValidGoogleAccessToken(c.env, s.userSub);
    const now = new Date();
    const endOfTomorrow = new Date(now);
    endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 2);
    endOfTomorrow.setUTCHours(0, 0, 0, 0);
    const events = await listAllCalendarEvents(accessToken, {
      timeMin: now,
      timeMax: endOfTomorrow,
    });
    const nextAnchor = findNextAnchor(events, now);
    return c.json({ events, nextAnchor });
  } catch (e) {
    if (e instanceof GoogleReauthNeeded) {
      return c.json({ error: "google_reauth_needed" }, 401);
    }
    throw e;
  }
});

app.get("/api/now", requireSession, async (c) => {
  const s = c.get("session")!;
  try {
    const state = await computeNowState(c.env, s.userSub);
    return c.json(state);
  } catch (e) {
    if (e instanceof GoogleReauthNeeded) {
      return c.json({ error: "google_reauth_needed" }, 401);
    }
    throw e;
  }
});

app.post("/api/tasks/:id/close", requireSession, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing_id" }, 400);
  try {
    await closeTask(c.env.TODOIST_API_TOKEN, id);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.post("/api/body-state", requireSession, async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>;
  const updates: Record<string, boolean> = {};
  for (const k of ["eaten", "showered", "shaved", "dressed", "packed", "runningLate"]) {
    if (typeof body[k] === "boolean") updates[k] = body[k] as boolean;
  }
  const row = await updateBodyState(c.env, updates);
  return c.json(row);
});

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
