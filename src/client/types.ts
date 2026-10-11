export type Me = { email: string; userSub: string };

export type BodyState = {
  id: number;
  eaten: boolean;
  showered: boolean;
  shaved: boolean;
  dressed: boolean;
  packed: boolean;
  runningLate: boolean;
  updatedAt: string;
};

export type PrepKey = "eaten" | "showered" | "shaved" | "dressed" | "packed";
export type PrepStep = { key: PrepKey; minutes: number; done: boolean };

export type TravelMode = "TRANSIT" | "DRIVE" | "WALK" | "BICYCLE";

export type NowState = {
  currentTime: string;
  anchor: {
    id: string;
    title: string;
    location: string | null;
    isVirtual: boolean;
    start: string;
    end: string | null;
  } | null;
  travel: {
    defaultMode: TravelMode;
    defaultMinutes: number | null;
    rescueMode: TravelMode;
    rescueMinutes: number | null;
  } | null;
  timing: {
    timeRemainingMinutes: number;
    leaveByDefault: string | null;
    leaveByRescue: string | null;
    prepStart: string | null;
    prepRequiredMinutes: number;
    bufferMinutes: number;
  } | null;
  bodyState: BodyState;
  prepSteps: PrepStep[];
  travelError: string | null;
};

export type Task = {
  id: string;
  workspace: number;
  identifier: string;
  content: string;
  description: string;
  due: { date: string } | null;
  context: string;
  team: { key: string; name: string };
  url: string;
};

export type TaskBuckets = {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  undated: Task[];
};

export type TaskTab = TaskBuckets & { name: string };

export type TasksResponse = {
  tabs: TaskTab[];
  todayKey: string;
};

export type ReturnUrgency = "overdue" | "due_today" | "due_soon" | "scheduled" | "no_date";

export type ReturnItem = Task & {
  urgency: ReturnUrgency;
  daysUntilDue: number | null;
};

export type ReturnsResponse = {
  items: ReturnItem[];
  todayKey: string;
};

export type CalendarEventTime =
  | { dateTime: string; timeZone?: string }
  | { date: string };

export type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: CalendarEventTime;
  end?: CalendarEventTime;
};

export type EventsResponse = {
  events: CalendarEvent[];
  nextAnchor: CalendarEvent | null;
};

export type BodyStateUpdate = Partial<{
  eaten: boolean;
  showered: boolean;
  shaved: boolean;
  dressed: boolean;
  packed: boolean;
  runningLate: boolean;
}>;

export type LimitsWindow = {
  window: string;
  usedPercent: number | null;
  resetsAt: number | null;
  projection: {
    percentPerHour: number;
    projectedAtReset: number | null;
    hitsLimitAt: number | null;
    samples: number;
  } | null;
};

export type LimitsBurn = { perDay: number; daysLeft: number | null };
export type LimitsSpendProjection = { perDay: number; projectedAtEnd: number };

export type LimitsAccount = {
  id: string;
  provider: string;
  label: string;
  /** "inactive": the credential works but the subscription lapsed or the balance is empty. Not an error. */
  status: "ok" | "inactive" | "error" | "pending";
  error: string | null;
  /** Why the account is inactive, or a partial-data note on an ok account (limits#4; absent before it). */
  notice?: string | null;
  lastAttemptAt: number | null;
  observedAt: number | null;
  windows: LimitsWindow[];
  credits?: { balance: number | null; unlimited: boolean; burn: LimitsBurn | null } | null;
  balanceUsd?: { balance: number; burn: LimitsBurn | null } | null;
  spendUsd?: {
    credits: number;
    total: number;
    periodEnd: number | null;
    projection: { credits: LimitsSpendProjection | null; total: LimitsSpendProjection | null };
  } | null;
};

export type LimitsSummary = {
  generatedAt: number;
  accounts: LimitsAccount[];
  errors?: { providers: string[]; message: string }[];
};
