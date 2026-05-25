export type TravelMode = "TRANSIT" | "DRIVE" | "WALK" | "BICYCLE";

type RouteMatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  condition?: string;
};

export async function computeTravelMinutes(opts: {
  apiKey: string;
  origin: string;
  destination: string;
  mode: TravelMode;
  departureTime?: Date;
}): Promise<number | null> {
  const body: Record<string, unknown> = {
    origins: [{ waypoint: { address: opts.origin } }],
    destinations: [{ waypoint: { address: opts.destination } }],
    travelMode: opts.mode,
  };

  if (opts.departureTime) {
    body.departureTime = opts.departureTime.toISOString();
  }
  if (opts.mode === "DRIVE") {
    body.routingPreference = "TRAFFIC_AWARE";
  }

  const res = await fetch(
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": opts.apiKey,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    throw new Error(`Routes ${res.status}: ${await res.text()}`);
  }

  const raw = (await res.json()) as unknown;
  const data = Array.isArray(raw) ? (raw as RouteMatrixElement[]) : [];

  // If the API returned an error envelope (e.g. BILLING_DISABLED, INVALID_ARGUMENT),
  // surface it so it doesn't get silently swallowed as "no route".
  const errish = raw as { error?: { code?: number; status?: string; message?: string } };
  if (!Array.isArray(raw) && errish.error) {
    throw new Error(`Routes ${errish.error.code} ${errish.error.status}: ${errish.error.message}`);
  }
  if (Array.isArray(raw)) {
    const wrappedError = (raw[0] as { error?: { code?: number; status?: string; message?: string } })?.error;
    if (wrappedError) {
      throw new Error(`Routes ${wrappedError.code} ${wrappedError.status}: ${wrappedError.message}`);
    }
  }

  const item = data[0];
  if (!item?.duration) return null;
  if (item.condition && item.condition !== "ROUTE_EXISTS") return null;

  const seconds = parseInt(item.duration.replace(/s$/, ""), 10);
  if (Number.isNaN(seconds)) return null;
  return Math.round(seconds / 60);
}

const VIRTUAL_LOCATION_PATTERNS: RegExp[] = [
  /meet\.google\.com/i,
  /zoom\.us/i,
  /teams\.microsoft\.com/i,
  /^https?:\/\//i,
];

export function isVirtualLocation(location: string | null | undefined): boolean {
  if (!location || !location.trim()) return true;
  return VIRTUAL_LOCATION_PATTERNS.some((p) => p.test(location));
}
