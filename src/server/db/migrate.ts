import { Database } from "bun:sqlite";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDb, openDb } from ".";

const IMPORTED_TABLES = ["sessions", "oauth_tokens", "candidates", "body_state", "prefs"];

const databasePath = process.env.DATABASE_PATH ?? "data/today.sqlite";
const migrationsDir = process.env.MIGRATIONS_DIR ?? "drizzle/migrations";
const d1ExportPath = process.argv[2];

const db = openDb(databasePath);

if (d1ExportPath) {
  const migrated = db.$client.query("SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'").get();
  if (migrated) throw new Error(`${databasePath} already has rows; import into a fresh database`);
  const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8"));
  const [first] = journal.entries;
  const d1Schema = mkdtempSync(join(tmpdir(), "today-d1-schema-"));
  cpSync(join(migrationsDir, `${first.tag}.sql`), join(d1Schema, `${first.tag}.sql`));
  cpSync(join(migrationsDir, "meta"), join(d1Schema, "meta"), { recursive: true });
  writeFileSync(join(d1Schema, "meta/_journal.json"), JSON.stringify({ ...journal, entries: [first] }));
  migrateDb(db, d1Schema);
  rmSync(d1Schema, { recursive: true, force: true });

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

migrateDb(db, migrationsDir);
console.log(`migrated ${databasePath}`);
