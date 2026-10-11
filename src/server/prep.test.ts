import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { migrateDb, openDb } from "./db";
import { getPrepHistory, getPrepToday, parseStepInputs, PrepInputError, saveSteps, updatePrepToday } from "./prep";

const TZ = "Europe/London";

function freshDb() {
  const db = openDb(":memory:");
  migrateDb(db, "drizzle/migrations");
  return db;
}

describe("prep", () => {
  test("seeds the old hardcoded steps", async () => {
    const prep = await getPrepToday(freshDb(), TZ, new Date("2026-10-11T08:00:00Z"));
    expect(prep.steps.map((s) => `${s.label} ${s.minutes}`)).toEqual([
      "ate 15",
      "showered 15",
      "shaved 10",
      "dressed 5",
      "packed 10",
    ]);
    expect(prep.remainingMinutes).toBe(55);
    expect(prep.runningLate).toBe(false);
  });

  test("checks and the late flag reset at London midnight, not UTC midnight", async () => {
    const db = freshDb();
    const lateEvening = new Date("2026-10-11T22:30:00Z");
    await updatePrepToday(db, TZ, { stepId: 1, done: true, runningLate: true }, lateEvening);

    const sameLondonDay = await getPrepToday(db, TZ, new Date("2026-10-11T22:59:00Z"));
    expect(sameLondonDay.steps[0]).toMatchObject({ done: true, doneAt: lateEvening.toISOString() });
    expect(sameLondonDay.runningLate).toBe(true);
    expect(sameLondonDay.remainingMinutes).toBe(40);

    const nextLondonDay = await getPrepToday(db, TZ, new Date("2026-10-11T23:01:00Z"));
    expect(nextLondonDay.day).toBe("2026-10-12");
    expect(nextLondonDay.steps.every((s) => !s.done)).toBe(true);
    expect(nextLondonDay.runningLate).toBe(false);
  });

  test("unchecking removes the check and rechecking records the new time", async () => {
    const db = freshDb();
    await updatePrepToday(db, TZ, { stepId: 2, done: true }, new Date("2026-10-11T07:00:00Z"));
    await updatePrepToday(db, TZ, { stepId: 2, done: false }, new Date("2026-10-11T07:05:00Z"));
    const prep = await updatePrepToday(db, TZ, { stepId: 2, done: true }, new Date("2026-10-11T07:10:00Z"));
    expect(prep.steps[1]!.doneAt).toBe("2026-10-11T07:10:00.000Z");
  });

  test("saving steps renames, reorders, adds and removes while keeping history", async () => {
    const db = freshDb();
    const now = new Date("2026-10-11T07:00:00Z");
    await updatePrepToday(db, TZ, { stepId: 3, done: true }, now);
    await saveSteps(db, [
      { id: 5, label: "bag", minutes: 8 },
      { id: 1, label: "breakfast", minutes: 20 },
      { label: "meds", minutes: 2 },
    ]);
    const prep = await getPrepToday(db, TZ, now);
    expect(prep.steps.map((s) => `${s.label} ${s.minutes} ${s.done}`)).toEqual([
      "bag 8 false",
      "breakfast 20 false",
      "meds 2 false",
    ]);
    expect(prep.remainingMinutes).toBe(30);
    await expect(updatePrepToday(db, TZ, { stepId: 3, done: false }, now)).rejects.toThrow(PrepInputError);

    const history = await getPrepHistory(db, TZ, 30, now);
    expect(history.steps.map((s) => [s.label, s.removed])).toEqual([
      ["bag", false],
      ["breakfast", false],
      ["meds", false],
      ["shaved", true],
    ]);
  });

  test("history covers the last 30 London days with average done times", async () => {
    const db = freshDb();
    await updatePrepToday(db, TZ, { stepId: 1, done: true, runningLate: true }, new Date("2026-10-09T07:00:00Z"));
    await updatePrepToday(db, TZ, { stepId: 1, done: true }, new Date("2026-10-10T08:00:00Z"));
    await updatePrepToday(db, TZ, { stepId: 4, done: true }, new Date("2026-08-01T08:00:00Z"));

    const history = await getPrepHistory(db, TZ, 30, new Date("2026-10-11T12:00:00Z"));
    expect(history.days).toHaveLength(30);
    expect(history.days[0]!.day).toBe("2026-10-11");
    expect(history.days[29]!.day).toBe("2026-09-12");
    expect(history.days[2]).toEqual({ day: "2026-10-09", runningLate: true, checks: { 1: "2026-10-09T07:00:00.000Z" } });
    const ate = history.steps.find((s) => s.label === "ate")!;
    expect(ate.doneDays).toBe(2);
    expect(ate.avgDoneMinute).toBe(8 * 60 + 30);
    expect(history.steps.find((s) => s.label === "dressed")!.avgDoneMinute).toBeNull();
  });

  test("validates step input", () => {
    expect(parseStepInputs({ steps: [{ id: 1, label: " ate ", minutes: 15 }] })).toEqual([{ id: 1, label: "ate", minutes: 15 }]);
    expect(() => parseStepInputs({ steps: [{ label: "x", minutes: 2.5 }] })).toThrow(PrepInputError);
    expect(() => parseStepInputs({ steps: [{ label: "x", minutes: -1 }] })).toThrow(PrepInputError);
    expect(() => parseStepInputs({ steps: "nope" })).toThrow(PrepInputError);
  });
});

describe("prep migration", () => {
  test("carries the old body_state into today's London day and drops it", () => {
    const path = `${import.meta.dir}/../../.prep-migration-test.sqlite`;
    const raw = new Database(path, { create: true });
    try {
      for (const stmt of readFileSync("drizzle/migrations/0000_jittery_santa_claus.sql", "utf8").split("--> statement-breakpoint")) {
        raw.exec(stmt);
      }
      raw.exec(`CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
      const journal = JSON.parse(readFileSync("drizzle/migrations/meta/_journal.json", "utf8"));
      raw.query(`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('x', ?)`).run(journal.entries[0].when);
      const tickedAt = Date.parse("2026-10-10T23:30:00Z") / 1000;
      raw.query("INSERT INTO body_state VALUES (1, 0, 1, 0, 0, 1, 1, ?)").run(tickedAt);
      raw.close();

      const db = openDb(path);
      migrateDb(db, "drizzle/migrations");
      const c = db.$client;
      expect(c.query("SELECT day, step_id FROM prep_checks ORDER BY step_id").all()).toEqual([
        { day: "2026-10-11", step_id: 2 },
        { day: "2026-10-11", step_id: 5 },
      ]);
      expect(c.query("SELECT day, running_late FROM prep_days").all()).toEqual([{ day: "2026-10-11", running_late: 1 }]);
      expect(c.query("SELECT name FROM sqlite_master WHERE name = 'body_state'").all()).toEqual([]);
      c.close();
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) Bun.file(path + suffix).delete().catch(() => {});
    }
  });
});
