import { useState } from "react";
import type { CalendarEvent, EventsResponse } from "./types";
import { fantasticalOpen } from "./urls";
import { CalendarIcon } from "./icons";

function eventStartIso(e: CalendarEvent): string {
  if (e.start && "dateTime" in e.start) return e.start.dateTime;
  if (e.start && "date" in e.start) return e.start.date;
  return new Date().toISOString();
}

function eventStartTime(e: CalendarEvent): string {
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

function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

function EventRow({ e }: { e: CalendarEvent }) {
  return (
    <li className="event">
      <span className="event-time">{eventStartTime(e)}</span>
      <span className="event-title">{e.summary ?? "(no title)"}</span>
      {e.location && <span className="event-loc">{e.location}</span>}
    </li>
  );
}

export function Events({ events }: { events: EventsResponse | null }) {
  const [tomorrowOpen, setTomorrowOpen] = useState(false);

  if (!events) return null;

  const today = todayKey();
  const tomorrow = tomorrowKey();

  const todayEvents: CalendarEvent[] = [];
  const tomorrowEvents: CalendarEvent[] = [];

  for (const e of events.events) {
    const k = dateKey(eventStartIso(e));
    if (k === today) todayEvents.push(e);
    else if (k === tomorrow) tomorrowEvents.push(e);
  }

  if (todayEvents.length === 0 && tomorrowEvents.length === 0) return null;

  return (
    <section className="section section--events">
      <div className="section-head">
        <h2 className="section-title">Calendar</h2>
        <a
          className="section-open"
          href={fantasticalOpen}
          aria-label="open Fantastical"
        >
          <CalendarIcon />
        </a>
      </div>

      <div className="day-group">
        <h3 className="day-label">Today</h3>
        {todayEvents.length > 0 ? (
          <ul className="event-list">
            {todayEvents.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </ul>
        ) : (
          <p className="day-empty">nothing on the calendar today.</p>
        )}
      </div>

      {tomorrowEvents.length > 0 && (
        <div className="day-group">
          <button
            type="button"
            className="day-toggle"
            onClick={() => setTomorrowOpen((o) => !o)}
            aria-expanded={tomorrowOpen}
          >
            <span className="day-label">Tomorrow</span>
            <span
              className={`day-toggle-icon ${tomorrowOpen ? "day-toggle-icon--open" : ""}`}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
          {tomorrowOpen && (
            <ul className="event-list">
              {tomorrowEvents.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
