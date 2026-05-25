import type { CalendarEvent, EventsResponse } from "./types";
import { weekdayLabel } from "./format";

function eventStart(e: CalendarEvent): string {
  if (e.start && "dateTime" in e.start) {
    return new Date(e.start.dateTime).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (e.start && "date" in e.start) return "all day";
  return "—";
}

function eventDay(e: CalendarEvent): string {
  if (e.start && "dateTime" in e.start) return weekdayLabel(e.start.dateTime);
  if (e.start && "date" in e.start) return weekdayLabel(e.start.date);
  return "";
}

export function Events({ events }: { events: EventsResponse | null }) {
  if (!events || events.events.length === 0) return null;

  const grouped = new Map<string, CalendarEvent[]>();
  for (const e of events.events) {
    const key = eventDay(e);
    const arr = grouped.get(key) ?? [];
    arr.push(e);
    grouped.set(key, arr);
  }

  return (
    <section className="section section--events">
      <h2 className="section-title">Calendar</h2>
      {Array.from(grouped.entries()).map(([day, items]) => (
        <div key={day} className="day-group">
          <h3 className="day-label">{day}</h3>
          <ul className="event-list">
            {items.map((e) => (
              <li key={e.id} className="event">
                <span className="event-time">{eventStart(e)}</span>
                <span className="event-title">{e.summary ?? "(no title)"}</span>
                {e.location && <span className="event-loc">{e.location}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
