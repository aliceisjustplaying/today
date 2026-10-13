import { Hono } from "hono";
import client from "../src/server/static";
import type { Env } from "../src/server/env";

type State = {
  dir: string;
  swDir: string | null;
  signedIn: boolean;
  nowShape: "current" | "bodyState" | "broken";
  latencyMs: number;
};

const port = Number(Bun.argv[2] ?? 4173);
const state: State = { dir: Bun.argv[3] ?? "dist/client", swDir: null, signedIn: true, nowShape: "current", latencyMs: 0 };

const prep = {
  day: "2026-10-11",
  steps: [
    { id: 1, label: "eat", minutes: 15, done: false, doneAt: null },
    { id: 2, label: "dress", minutes: 10, done: true, doneAt: "2026-10-11T08:00:00Z" },
  ],
  runningLate: false,
  remainingMinutes: 15,
};

function nowState() {
  const base = {
    currentTime: new Date().toISOString(),
    anchor: {
      id: "evt-1",
      title: "Dentist",
      location: "1 High Street",
      isVirtual: false,
      start: new Date(Date.now() + 3 * 3600_000).toISOString(),
      end: null,
    },
    travel: null,
    timing: null,
    travelError: null,
  };
  if (state.nowShape === "broken") return { ...base, prep: { day: prep.day } };
  if (state.nowShape === "bodyState") {
    return {
      ...base,
      bodyState: { id: 1, eaten: false, showered: false, shaved: false, dressed: true, packed: false, runningLate: false, updatedAt: base.currentTime },
      prepSteps: [{ key: "eaten", minutes: 15, done: false }],
    };
  }
  return { ...base, prep };
}

const api = new Hono<Env>();

api.use("*", async (c, next) => {
  if (state.latencyMs) await Bun.sleep(state.latencyMs);
  await next();
});

api.post("/__e2e/state", async (c) => {
  Object.assign(state, await c.req.json());
  return c.json(state);
});

api.get("/sw.js", (c, next) =>
  state.swDir ? c.body(Bun.file(`${state.swDir}/sw.js`).stream(), 200, { "Content-Type": "text/javascript" }) : next(),
);

api.get("/auth/google/start", (c) => c.html("<title>Google sign-in</title><h1>Sign in with Google</h1>"));

api.use("/api/*", async (c, next) => {
  if (!state.signedIn) return c.json({ error: "unauthorized" }, 401);
  await next();
});

api.get("/api/me", (c) => c.json({ email: "alice@example.com", userSub: "user-1" }));
api.get("/api/now", (c) => c.json(nowState()));
api.get("/api/tasks", (c) =>
  c.json({ todayKey: "2026-10-11", tabs: [{ name: "Home", overdue: [], today: [], upcoming: [], undated: [] }] }),
);
api.get("/api/events", (c) => c.json({ events: [], nextAnchor: null }));
api.get("/api/returns", (c) => c.json({ items: [], todayKey: "2026-10-11" }));
api.get("/api/limits", (c) => c.json({ generatedAt: Date.now(), accounts: [] }));
api.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

api.route("/", client);

const server = Bun.serve({
  port,
  fetch: (req) => api.fetch(req, { STATIC_DIR: state.dir } as Env["Bindings"]),
});

console.log(`e2e server on http://localhost:${server.port} serving ${state.dir}`);
