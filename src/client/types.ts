export type Me = { email: string; userSub: string };

export type PrepStep = { id: number; label: string; minutes: number; done: boolean; doneAt: string | null };

export type PrepToday = { day: string; steps: PrepStep[]; runningLate: boolean; remainingMinutes: number };

export type PrepUpdate = { stepId: number; done: boolean } | { runningLate: boolean };

export type PrepStepDraft = { id?: number; label: string; minutes: number };

export type PrepHistory = {
  days: { day: string; runningLate: boolean; checks: Record<string, string> }[];
  steps: { id: number; label: string; removed: boolean; doneDays: number; avgDoneMinute: number | null }[];
};

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
  prep: PrepToday;
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
  /** The account's email, shown under the label (limits' `email`; absent before it). */
  email?: string | null;
  /** "inactive": the credential works but the subscription lapsed or the balance is empty. "expired": the web login behind it was signed out. Neither is an error. */
  status: "ok" | "inactive" | "expired" | "error" | "pending";
  error: string | null;
  /** Why the account is inactive, or a partial-data note on an ok account (limits#4; absent before it). */
  notice?: string | null;
  /** Inactive accounts: when the upstream said usage comes back, e.g. from a Claude 429's Retry-After; null when it didn't say. */
  availableAt?: number | null;
  lastAttemptAt: number | null;
  observedAt: number | null;
  windows: LimitsWindow[];
  credits?: { balance: number | null; unlimited: boolean; burn: LimitsBurn | null } | null;
  balanceUsd?: { balance: number; burn: LimitsBurn | null } | null;
  /** Codex: banked rate-limit resets the account can redeem; null or absent when limits doesn't know. */
  resetCredits?: number | null;
  /** Capy: the balance read off Settings → Billing that `balanceUsd` is derived from, or null until set. */
  balanceAnchor?: { balanceUsd: number; asOf: number } | null;
  /** True where today can set the balance anchor (Capy). */
  balanceSettable?: boolean;
  /** The subscription as the upstream names it ("Max 20x", "Pro", "SuperGrok", "Muse Code Power Usage", "Go", "Capy Lite"); null when it doesn't say. */
  plan?: { name: string; status: string; renewsAt: number | null; canceledAt: number | null } | null;
  /** Capy with a web session: the billing page's plan, totals and credit sources, in dollars. */
  billing?: {
    remainingUsd: number;
    usedUsd: number;
    grantedUsd: number;
    unlimited: boolean;
    plan: { name: string; status: string; canceledAt: number | null; renewsAt: number | null } | null;
    sources: { name: string; kind: string; grantedUsd: number; remainingUsd: number; resetsAt: number | null; expiresAt: number | null }[];
  } | null;
  /** ACS: this month's token totals from the usage page; each budget is also a window. */
  tokens?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    requests: number;
    todayTokens: number | null;
    budgets: { name: string; usedTokens: number; limitTokens: number; resetsAt: number }[];
  } | null;
  spendUsd?: {
    credits: number;
    total: number;
    periodEnd: number | null;
    projection: { credits: LimitsSpendProjection | null; total: LimitsSpendProjection | null };
  } | null;
};

export type LimitsSummary = {
  generatedAt: number;
  /** today's TIMEZONE, added by the /api/limits proxy; reset times and plan dates are shown in it. */
  timezone?: string;
  accounts: LimitsAccount[];
  errors?: { providers: string[]; message: string }[];
};

export type GithubEvent = {
  /** "stars": stars GitHub counted that day with no event to name them, shown as one anonymous row. */
  kind: "star" | "fork" | "stars";
  repo: string;
  login: string;
  /** The GitHub profile's display name, when set and looked up. */
  name: string | null;
  avatarUrl: string;
  at: number;
  /** "stars" rows only. */
  count?: number;
};

export type GithubRepo = { name: string; stars: number; forks: number; url: string };

export type GithubFeed = {
  user: string;
  repos: GithubRepo[];
  /** Newest first: the last 30 days, at most 200. */
  events: GithubEvent[];
  /** No repo's events could be read on the last refresh, so new stars aren't coming in. */
  starsUnavailable?: boolean;
  generatedAt: number;
  /** today's TIMEZONE; days split by it. */
  timezone?: string;
};
