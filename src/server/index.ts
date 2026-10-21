import { Hono } from "hono";
import auth from "./auth";
import client from "./static";
import { sessionMiddleware, requireSession } from "./session";
import { todayKeyInTz, addDaysToKey, endOfTomorrowInTz } from "./dates";
import {
  getValidGoogleAccessToken,
  listAllCalendarEvents,
  findNextAnchor,
  GoogleReauthNeeded,
} from "./google";
import { computeNowState } from "./now";
import { getPrepHistory, getPrepToday, parseStepInputs, PrepInputError, saveSteps, updatePrepToday } from "./prep";
import { getReturns } from "./returns";
import { fetchLimitsSummary, LimitsUnavailable, postLimitsBalance } from "./limits";
import { GithubUnavailable, githubSource } from "./github";
import { completeIssue, LinearError, listAssignedIssues, tabTasks } from "./linear";
import type { Env } from "./env";

const app = new Hono<Env>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
});

// Before the session and the SPA fallback, which would answer with the HTML shell.
app.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n", 200, { "Cache-Control": "public, max-age=86400" }));

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
    const events = await listAllCalendarEvents(accessToken, {
      timeMin: now,
      timeMax: endOfTomorrowInTz(c.env.TIMEZONE, now),
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

app.get("/api/limits", requireSession, async (c) => {
  try {
    return c.json({ ...(await fetchLimitsSummary(c.env.LIMITS_URL)), timezone: c.env.TIMEZONE });
  } catch (e) {
    if (e instanceof LimitsUnavailable) return c.json({ error: e.message }, 502);
    throw e;
  }
});

app.get("/api/github", requireSession, async (c) => {
  try {
    const feed = await githubSource(c.env.db, c.env.GITHUB_USER, c.env.GITHUB_TOKEN).get();
    return c.json({ ...feed, timezone: c.env.TIMEZONE });
  } catch (e) {
    if (e instanceof GithubUnavailable) return c.json({ error: e.message }, 502);
    throw e;
  }
});

app.post("/api/limits/accounts/:id/balance", requireSession, async (c) => {
  const body = (await c.req.json().catch(() => null)) as { balanceUsd?: unknown } | null;
  if (typeof body?.balanceUsd !== "number") return c.json({ error: "balanceUsd must be a number" }, 400);
  try {
    const r = await postLimitsBalance(c.env.LIMITS_URL, c.req.param("id"), body.balanceUsd);
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof LimitsUnavailable) return c.json({ error: e.message }, 502);
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

app.get("/api/prep", requireSession, async (c) =>
  c.json(await getPrepToday(c.env.db, c.env.TIMEZONE)),
);

app.post("/api/prep", requireSession, async (c) => {
  try {
    return c.json(await updatePrepToday(c.env.db, c.env.TIMEZONE, await c.req.json()));
  } catch (e) {
    if (e instanceof PrepInputError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

app.put("/api/prep/steps", requireSession, async (c) => {
  try {
    await saveSteps(c.env.db, parseStepInputs(await c.req.json()));
    return c.json(await getPrepToday(c.env.db, c.env.TIMEZONE));
  } catch (e) {
    if (e instanceof PrepInputError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

app.get("/api/prep/history", requireSession, async (c) =>
  c.json(await getPrepHistory(c.env.db, c.env.TIMEZONE)),
);

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.route("/", client);

export default app;
