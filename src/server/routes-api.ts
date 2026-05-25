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

  const data = (await res.json()) as RouteMatrixElement[];
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
