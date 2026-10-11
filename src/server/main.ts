import app from "./index";
import { loadConfig } from "./config";
import { migrateDb, openDb } from "./db";

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
