import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Env } from "./env";

const IMMUTABLE = "public, max-age=31536000, immutable";

const client = new Hono<Env>();

client.use("*", (c, next) =>
  serveStatic({
    root: c.env.STATIC_DIR,
    onFound: (_path, c) => {
      c.header("Cache-Control", c.req.path.startsWith("/assets/") ? IMMUTABLE : "no-cache");
    },
  })(c, next),
);

client.get("/assets/*", (c) => c.text("Not found", 404, { "Cache-Control": "no-store" }));

client.get("*", (c, next) =>
  serveStatic({
    root: c.env.STATIC_DIR,
    path: "index.html",
    onFound: (_path, c) => {
      c.header("Cache-Control", "no-cache");
    },
  })(c, next),
);

export default client;
