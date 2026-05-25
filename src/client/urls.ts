import type { CalendarEvent } from "./types";

export function todoistTaskUrl(taskId: string): string {
  return `https://todoist.com/showTask?id=${encodeURIComponent(taskId)}`;
}

export function fantasticalForEvent(e: CalendarEvent): string {
  let dateKey: string | null = null;
  if (e.start && "dateTime" in e.start) {
    dateKey = new Date(e.start.dateTime).toLocaleDateString("en-CA");
  } else if (e.start && "date" in e.start) {
    dateKey = e.start.date;
  }
  if (!dateKey) return "x-fantastical3://";
  return `x-fantastical3://show?date=${encodeURIComponent(dateKey)}`;
}
