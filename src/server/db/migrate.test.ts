import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "today-migrate-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function runMigrate(databasePath: string, ...args: string[]) {
  return Bun.spawnSync(["bun", "src/server/db/migrate.ts", ...args], {
    env: { ...process.env, DATABASE_PATH: databasePath },
  });
}

test("imports a wrangler d1 export into a fresh database", () => {
  const schema = readFileSync("drizzle/migrations/0000_jittery_santa_claus.sql", "utf8").replaceAll(
    "--> statement-breakpoint",
    "",
  );
  const exportPath = join(root, "d1-export.sql");
  writeFileSync(
    exportPath,
    [
      "PRAGMA defer_foreign_keys=TRUE;",
      "CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);",
      "INSERT INTO \"d1_migrations\" (\"id\",\"name\") VALUES(1,'0000_jittery_santa_claus.sql');",
      schema,
      "INSERT INTO \"sessions\" VALUES('sid','sub','me@example.com',1700000000,1800000000);",
      "INSERT INTO \"oauth_tokens\" VALUES(1,'google','sub','access','refresh','openid',1700000000,1700000000);",
      "INSERT INTO \"body_state\" VALUES(1,1,0,0,1,0,0,1700000000);",
    ].join("\n"),
  );

  const databasePath = join(root, "today.sqlite");
  const first = runMigrate(databasePath, exportPath);
  expect(first.exitCode).toBe(0);

  const db = new Database(databasePath);
  expect(db.query("SELECT email FROM sessions").all()).toEqual([{ email: "me@example.com" }]);
  expect(db.query("SELECT refresh_token FROM oauth_tokens").all()).toEqual([{ refresh_token: "refresh" }]);
  expect(db.query("SELECT eaten, dressed FROM body_state").all()).toEqual([{ eaten: 1, dressed: 1 }]);
  db.close();

  const again = runMigrate(databasePath, exportPath);
  expect(again.exitCode).not.toBe(0);
  expect(again.stderr.toString()).toContain("already has rows");
});
