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

export type TodoistTask = {
  id: string;
  content: string;
  description: string;
  priority: number;
  labels: string[];
  due: { date: string; string: string; is_recurring: boolean } | null;
};

export type TasksResponse = {
  overdue: TodoistTask[];
  today: TodoistTask[];
  upcoming: TodoistTask[];
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
