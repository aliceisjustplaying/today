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
  identifier: string;
  content: string;
  description: string;
  due: { date: string } | null;
  context: string;
  url: string;
};

export type TasksResponse = {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
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
