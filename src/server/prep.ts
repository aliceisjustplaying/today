import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { prepChecks, prepDays, prepSteps } from "./db/schema";
import type { DB } from "./db";
import { addDaysToKey, todayKeyInTz } from "./dates";

export type PrepStep = { id: number; label: string; minutes: number; done: boolean; doneAt: string | null };
export type PrepToday = { day: string; steps: PrepStep[]; runningLate: boolean; remainingMinutes: number };
export type PrepStepInput = { id?: number; label: string; minutes: number };

export type PrepHistory = {
  days: { day: string; runningLate: boolean; checks: Record<number, string> }[];
  steps: { id: number; label: string; removed: boolean; doneDays: number; avgDoneMinute: number | null }[];
};

export class PrepInputError extends Error {}

function activeSteps(db: DB) {
  return db.select().from(prepSteps).where(isNull(prepSteps.removedAt)).orderBy(asc(prepSteps.position));
}

export async function getPrepToday(db: DB, timezone: string, now = new Date()): Promise<PrepToday> {
  const day = todayKeyInTz(timezone, now);
  const [steps, checks, dayRow] = await Promise.all([
    activeSteps(db),
    db.select().from(prepChecks).where(eq(prepChecks.day, day)),
    db.select().from(prepDays).where(eq(prepDays.day, day)),
  ]);
  const checkedAt = new Map(checks.map((c) => [c.stepId, c.checkedAt.toISOString()]));
  const out = steps.map((s) => ({
    id: s.id,
    label: s.label,
    minutes: s.minutes,
    done: checkedAt.has(s.id),
    doneAt: checkedAt.get(s.id) ?? null,
  }));
  return {
    day,
    steps: out,
    runningLate: dayRow[0]?.runningLate ?? false,
    remainingMinutes: out.filter((s) => !s.done).reduce((sum, s) => sum + s.minutes, 0),
  };
}

export async function updatePrepToday(
  db: DB,
  timezone: string,
  update: { stepId?: unknown; done?: unknown; runningLate?: unknown },
  now = new Date(),
): Promise<PrepToday> {
  const day = todayKeyInTz(timezone, now);
  if (typeof update.stepId === "number" && typeof update.done === "boolean") {
    const step = await db.select().from(prepSteps).where(eq(prepSteps.id, update.stepId));
    if (!step[0] || step[0].removedAt) throw new PrepInputError("unknown step");
    if (update.done) {
      await db.insert(prepChecks).values({ day, stepId: update.stepId, checkedAt: now }).onConflictDoNothing();
    } else {
      await db.delete(prepChecks).where(and(eq(prepChecks.day, day), eq(prepChecks.stepId, update.stepId)));
    }
    console.log(`prep ${day}: step ${update.stepId} ${update.done ? "done" : "undone"}`);
  }
  if (typeof update.runningLate === "boolean") {
    await db
      .insert(prepDays)
      .values({ day, runningLate: update.runningLate, updatedAt: now })
      .onConflictDoUpdate({ target: prepDays.day, set: { runningLate: update.runningLate, updatedAt: now } });
    console.log(`prep ${day}: running late ${update.runningLate}`);
  }
  return getPrepToday(db, timezone, now);
}

export function parseStepInputs(body: unknown): PrepStepInput[] {
  const steps = (body as { steps?: unknown })?.steps;
  if (!Array.isArray(steps) || steps.length > 30) throw new PrepInputError("steps must be a list of at most 30");
  return steps.map((raw) => {
    const s = raw as Record<string, unknown>;
    const label = typeof s.label === "string" ? s.label.trim() : "";
    const minutes = s.minutes;
    if (!label || label.length > 24) throw new PrepInputError("each step needs a label of 1-24 characters");
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0 || minutes > 240) {
      throw new PrepInputError("minutes must be a whole number from 0 to 240");
    }
    if (s.id !== undefined && typeof s.id !== "number") throw new PrepInputError("id must be a number");
    return { id: s.id as number | undefined, label, minutes };
  });
}

export async function saveSteps(db: DB, inputs: PrepStepInput[], now = new Date()) {
  db.transaction((tx) => {
    const existing = new Set(tx.select({ id: prepSteps.id }).from(prepSteps).where(isNull(prepSteps.removedAt)).all().map((r) => r.id));
    const kept = new Set<number>();
    inputs.forEach((s, position) => {
      if (s.id !== undefined && existing.has(s.id)) {
        tx.update(prepSteps).set({ label: s.label, minutes: s.minutes, position }).where(eq(prepSteps.id, s.id)).run();
        kept.add(s.id);
      } else {
        tx.insert(prepSteps).values({ label: s.label, minutes: s.minutes, position }).run();
      }
    });
    const removed = [...existing].filter((id) => !kept.has(id));
    if (removed.length) tx.update(prepSteps).set({ removedAt: now }).where(inArray(prepSteps.id, removed)).run();
  });
  console.log(`prep steps saved: ${inputs.map((s) => `${s.label} ${s.minutes}m`).join(", ")}`);
}

function minuteOfDay(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export async function getPrepHistory(db: DB, timezone: string, days = 30, now = new Date()): Promise<PrepHistory> {
  const today = todayKeyInTz(timezone, now);
  const first = addDaysToKey(today, -(days - 1));
  const [steps, checks, dayRows] = await Promise.all([
    db.select().from(prepSteps).orderBy(sql`${prepSteps.removedAt} IS NOT NULL`, asc(prepSteps.position)),
    db.select().from(prepChecks).where(gte(prepChecks.day, first)),
    db.select().from(prepDays).where(gte(prepDays.day, first)),
  ]);
  const late = new Set(dayRows.filter((d) => d.runningLate).map((d) => d.day));
  const keys = Array.from({ length: days }, (_, i) => addDaysToKey(today, -i));
  const byDay = new Map(keys.map((day) => [day, {} as Record<number, string>]));
  for (const c of checks) {
    const row = byDay.get(c.day);
    if (row) row[c.stepId] = c.checkedAt.toISOString();
  }

  const checkedStepIds = new Set(checks.map((c) => c.stepId));
  return {
    days: keys.map((day) => ({ day, runningLate: late.has(day), checks: byDay.get(day)! })),
    steps: steps
      .filter((s) => !s.removedAt || checkedStepIds.has(s.id))
      .map((s) => {
        const mine = checks.filter((c) => c.stepId === s.id);
        return {
          id: s.id,
          label: s.label,
          removed: s.removedAt !== null,
          doneDays: mine.length,
          avgDoneMinute: mine.length
            ? Math.round(mine.reduce((sum, c) => sum + minuteOfDay(c.checkedAt, timezone), 0) / mine.length)
            : null,
        };
      }),
  };
}
