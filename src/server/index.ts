import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import auth from "./auth";
import { sessionMiddleware, requireSession } from "./session";
import { todayKeyInTz, addDaysToKey } from "./dates";
import {
  getValidGoogleAccessToken,
  listAllCalendarEvents,
  findNextAnchor,
  GoogleReauthNeeded,
} from "./google";
import { computeNowState, updateBodyState } from "./now";
import { getReturns } from "./returns";
import { completeIssue, LinearError, listAssignedIssues, tabTasks } from "./linear";
import type { Env } from "./env";

const app = new Hono<Env>();

app.use("*", sessionMiddleware);

app.route("/auth", auth);

app.get("/api/ping", (c) => c.json({ ok: true, now: new Date().toISOString() }));

app.get("/api/me", requireSession, (c) => {
  const s = c.get("session")!;
  return c.json({ email: s.email, userSub: s.userSub });
});

app.get("/api/tasks", requireSession, async (c) => {
  try {
    const tasks = await listAssignedIssues(c.env.LINEAR_API_KEYS);
    const today = todayKeyInTz(c.env.TIMEZONE);
    const sevenDay = addDaysToKey(today, 7);
    const tabs = tabTasks(tasks, c.env.LINEAR_TABS, today, sevenDay);
    return c.json({ tabs, todayKey: today });
  } catch (e) {
    if (e instanceof LinearError) return c.json({ error: e.message }, 502);
    throw e;
  }
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

app.get("/api/returns", requireSession, async (c) => {
  try {
    return c.json(
      await getReturns({
        apiKeys: c.env.LINEAR_API_KEYS,
        label: c.env.LINEAR_RETURNS_LABEL,
        timezone: c.env.TIMEZONE,
      }),
    );
  } catch (e) {
    if (e instanceof LinearError) return c.json({ error: e.message }, 502);
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

app.post("/api/tasks/:workspace/:id/close", requireSession, async (c) => {
  const id = c.req.param("id");
  const apiKey = c.env.LINEAR_API_KEYS[Number(c.req.param("workspace"))];
  if (!apiKey) return c.json({ error: "unknown_workspace" }, 400);
  try {
    await completeIssue(apiKey, id);
    console.log(`completed Linear issue ${id} (workspace ${c.req.param("workspace")})`);
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

app.use("*", (c, next) => serveStatic({ root: c.env.STATIC_DIR })(c, next));
app.get("*", (c, next) =>
  serveStatic({ root: c.env.STATIC_DIR, path: "index.html" })(c, next),
);

export default app;
