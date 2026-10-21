export function todayKeyInTz(tz: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

export function addDaysToKey(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function endOfTomorrowInTz(tz: string, now: Date): Date {
  const key = addDaysToKey(todayKeyInTz(tz, now), 2);
  const midnightUtc = Date.parse(`${key}T00:00:00Z`);
  let before = midnightUtc - 86_400_000;
  let after = midnightUtc + 86_400_000;
  while (after - before > 1) {
    const mid = Math.floor((before + after) / 2);
    if (todayKeyInTz(tz, new Date(mid)) < key) before = mid;
    else after = mid;
  }
  return new Date(after);
}
