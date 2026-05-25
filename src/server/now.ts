import { eq } from "drizzle-orm";
import { db } from "./db";
import { bodyState } from "./db/schema";
import {
  getValidGoogleAccessToken,
  listAllCalendarEvents,
  findNextAnchor,
  eventStartMs,
  type CalendarEvent,
} from "./google";
import {
  computeTravelMinutes,
  isVirtualLocation,
  type TravelMode,
} from "./routes-api";

export const PREP_DURATIONS = {
  eaten: 15,
  showered: 15,
  shaved: 10,
  dressed: 5,
  packed: 10,
} as const;

export type PrepKey = keyof typeof PREP_DURATIONS;
export type BodyStateRow = typeof bodyState.$inferSelect;

export async function ensureBodyState(env: Cloudflare.Env): Promise<BodyStateRow> {
  const existing = await db(env.DB)
    .select()
    .from(bodyState)
    .where(eq(bodyState.id, 1))
    .limit(1);
  if (existing[0]) return existing[0];

  const now = new Date();
  await db(env.DB).insert(bodyState).values({
    id: 1,
    eaten: false,
    showered: false,
    shaved: false,
    dressed: false,
    packed: false,
    runningLate: false,
    updatedAt: now,
  });
  const seeded = await db(env.DB)
    .select()
    .from(bodyState)
    .where(eq(bodyState.id, 1))
    .limit(1);
  return seeded[0]!;
}

export function remainingPrepMinutes(bs: BodyStateRow): {
  total: number;
  steps: { key: PrepKey; minutes: number; done: boolean }[];
} {
  const steps: { key: PrepKey; minutes: number; done: boolean }[] = (
    Object.keys(PREP_DURATIONS) as PrepKey[]
  ).map((key) => ({
    key,
    minutes: PREP_DURATIONS[key],
    done: bs[key],
  }));

  const total = steps
    .filter((s) => !s.done)
    .reduce((sum, s) => sum + s.minutes, 0);

  return { total, steps };
}

export type NowAnchor = {
  id: string;
  title: string;
  location: string | null;
  isVirtual: boolean;
  start: string;
  end: string | null;
};

export type NowTravel = {
  defaultMode: TravelMode;
  defaultMinutes: number | null;
  rescueMode: TravelMode;
  rescueMinutes: number | null;
};

export type NowTiming = {
  timeRemainingMinutes: number;
  leaveByDefault: string | null;
  leaveByRescue: string | null;
  prepStart: string | null;
  prepRequiredMinutes: number;
  bufferMinutes: number;
};

export type NowState = {
  currentTime: string;
  anchor: NowAnchor | null;
  travel: NowTravel | null;
  timing: NowTiming | null;
  bodyState: BodyStateRow;
  prepSteps: { key: PrepKey; minutes: number; done: boolean }[];
};

function anchorEndIso(e: CalendarEvent): string | null {
  if (!e.end) return null;
  if ("dateTime" in e.end) return e.end.dateTime;
  if ("date" in e.end) return e.end.date;
  return null;
}

function anchorStartIso(e: CalendarEvent): string {
  if (e.start && "dateTime" in e.start) return e.start.dateTime;
  if (e.start && "date" in e.start) return e.start.date;
  return new Date().toISOString();
}

export async function computeNowState(
  env: Cloudflare.Env,
  userSub: string,
): Promise<NowState> {
  const now = new Date();
  const bs = await ensureBodyState(env);
  const { total: prepRequiredMinutes, steps: prepSteps } = remainingPrepMinutes(bs);
  const bufferMinutes = parseInt(env.BUFFER_MINUTES || "10", 10);

  const accessToken = await getValidGoogleAccessToken(env, userSub);
  const endOfTomorrow = new Date(now);
  endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 2);
  endOfTomorrow.setUTCHours(0, 0, 0, 0);

  const events = await listAllCalendarEvents(accessToken, {
    timeMin: now,
    timeMax: endOfTomorrow,
  });
  const nextEvent = findNextAnchor(events, now);

  if (!nextEvent) {
    return {
      currentTime: now.toISOString(),
      anchor: null,
      travel: null,
      timing: null,
      bodyState: bs,
      prepSteps,
    };
  }

  const startMs = eventStartMs(nextEvent)!;
  const location = nextEvent.location ?? null;
  const virtual = isVirtualLocation(location);
  const anchor: NowAnchor = {
    id: nextEvent.id,
    title: nextEvent.summary ?? "(no title)",
    location,
    isVirtual: virtual,
    start: anchorStartIso(nextEvent),
    end: anchorEndIso(nextEvent),
  };

  const defaultMode = (env.TRANSPORT_DEFAULT as TravelMode) ?? "TRANSIT";
  const rescueMode = (env.TRANSPORT_RESCUE as TravelMode) ?? "DRIVE";

  let travel: NowTravel | null = null;
  if (!virtual && location && env.HOME_ADDRESS) {
    const [defaultMinutes, rescueMinutes] = await Promise.all([
      computeTravelMinutes({
        apiKey: env.GOOGLE_API_KEY,
        origin: env.HOME_ADDRESS,
        destination: location,
        mode: defaultMode,
        departureTime: now,
      }).catch(() => null),
      computeTravelMinutes({
        apiKey: env.GOOGLE_API_KEY,
        origin: env.HOME_ADDRESS,
        destination: location,
        mode: rescueMode,
        departureTime: now,
      }).catch(() => null),
    ]);
    travel = { defaultMode, defaultMinutes, rescueMode, rescueMinutes };
  }

  const timeRemainingMinutes = Math.round((startMs - now.getTime()) / 60000);
  let leaveByDefault: string | null = null;
  let leaveByRescue: string | null = null;
  let prepStart: string | null = null;

  if (travel?.defaultMinutes != null) {
    leaveByDefault = new Date(startMs - travel.defaultMinutes * 60000).toISOString();
    const prepStartMs =
      startMs -
      travel.defaultMinutes * 60000 -
      (prepRequiredMinutes + bufferMinutes) * 60000;
    prepStart = new Date(prepStartMs).toISOString();
  }
  if (travel?.rescueMinutes != null) {
    leaveByRescue = new Date(startMs - travel.rescueMinutes * 60000).toISOString();
  }

  return {
    currentTime: now.toISOString(),
    anchor,
    travel,
    timing: {
      timeRemainingMinutes,
      leaveByDefault,
      leaveByRescue,
      prepStart,
      prepRequiredMinutes,
      bufferMinutes,
    },
    bodyState: bs,
    prepSteps,
  };
}

const ALLOWED_FIELDS = [
  "eaten",
  "showered",
  "shaved",
  "dressed",
  "packed",
  "runningLate",
] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function updateBodyState(
  env: Cloudflare.Env,
  updates: Partial<Record<AllowedField, boolean>>,
): Promise<BodyStateRow> {
  await ensureBodyState(env);
  const filtered: Partial<Record<AllowedField, boolean>> = {};
  for (const key of ALLOWED_FIELDS) {
    if (typeof updates[key] === "boolean") filtered[key] = updates[key];
  }
  if (Object.keys(filtered).length > 0) {
    await db(env.DB)
      .update(bodyState)
      .set({ ...filtered, updatedAt: new Date() })
      .where(eq(bodyState.id, 1));
  }
  const rows = await db(env.DB)
    .select()
    .from(bodyState)
    .where(eq(bodyState.id, 1))
    .limit(1);
  return rows[0]!;
}
