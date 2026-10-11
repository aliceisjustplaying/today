import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { migrateDb, openDb } from ".";

const IMPORTED_TABLES = ["sessions", "oauth_tokens", "candidates", "body_state", "prefs"];

const databasePath = process.env.DATABASE_PATH ?? "data/today.sqlite";
const migrationsDir = process.env.MIGRATIONS_DIR ?? "drizzle/migrations";
const d1ExportPath = process.argv[2];

const db = openDb(databasePath);
migrateDb(db, migrationsDir);
console.log(`migrated ${databasePath}`);

if (d1ExportPath) {
  const exported = new Database(":memory:");
  exported.exec(readFileSync(d1ExportPath, "utf8"));

  const target = db.$client;
  target.transaction(() => {
    for (const table of IMPORTED_TABLES) {
      const existing = target.query(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number };
      if (existing.n > 0) throw new Error(`${table} already has rows; import into a fresh database`);

      const rows = exported.query(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      for (const row of rows) {
        const columns = Object.keys(row);
        target
          .query(
            `INSERT INTO "${table}" (${columns.map((col) => `"${col}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
          )
          .run(...(Object.values(row) as never[]));
      }
      console.log(`imported ${rows.length} rows into ${table}`);
    }
  })();
}
