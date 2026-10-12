import app from "./index";
import { loadConfig } from "./config";
import { migrateDb, openDb } from "./db";
import { githubSource } from "./github";

const config = loadConfig();
const db = openDb(config.DATABASE_PATH);
migrateDb(db, config.MIGRATIONS_DIR);

const server = Bun.serve({
  hostname: config.HOST,
  port: config.PORT,
  idleTimeout: 60,
  fetch: (req) => app.fetch(req, { ...config, db }),
});

console.log(`today listening on ${server.url}`);

// Keep polling GitHub while nobody has the app open, so stars are stored before they leave the
// repo events window. A request inside the window reuses this refresh.
const pollGithub = () => githubSource(db, config.GITHUB_USER, config.GITHUB_TOKEN).get().catch((e) => console.warn("github poll:", e));
pollGithub();
setInterval(pollGithub, 10 * 60_000);
