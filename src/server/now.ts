import type { AppEnv } from "./env";
import { endOfTomorrowInTz } from "./dates";
import { getPrepToday, type PrepToday } from "./prep";
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
  prep: PrepToday;
  travelError: string | null;
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
  env: AppEnv,
  userSub: string,
): Promise<NowState> {
  const now = new Date();
  const prep = await getPrepToday(env.db, env.TIMEZONE, now);
  const prepRequiredMinutes = prep.remainingMinutes;
  const bufferMinutes = parseInt(env.BUFFER_MINUTES || "10", 10);

  const accessToken = await getValidGoogleAccessToken(env, userSub);

  const events = await listAllCalendarEvents(accessToken, {
    timeMin: now,
    timeMax: endOfTomorrowInTz(env.TIMEZONE, now),
  });
  const nextEvent = findNextAnchor(events, now);

  if (!nextEvent) {
    return {
      currentTime: now.toISOString(),
      anchor: null,
      travel: null,
      timing: null,
      prep,
      travelError: null,
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
  let travelError: string | null = null;
  if (!virtual && location && env.HOME_ADDRESS) {
    const tryMode = async (mode: TravelMode) => {
      try {
        return await computeTravelMinutes({
          apiKey: env.GOOGLE_API_KEY,
          origin: env.HOME_ADDRESS,
          destination: location,
          mode,
          departureTime: now,
        });
      } catch (e) {
        if (!travelError) travelError = (e as Error).message;
        return null;
      }
    };
    const [defaultMinutes, rescueMinutes] = await Promise.all([
      tryMode(defaultMode),
      tryMode(rescueMode),
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
    prep,
    travelError,
  };
}
