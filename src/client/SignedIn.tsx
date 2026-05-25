import { useCallback, useEffect, useState } from "react";
import type {
  BodyStateUpdate,
  EventsResponse,
  Me,
  NowState,
  TasksResponse,
} from "./types";
import { Now } from "./Now";
import { Today } from "./Today";
import { Events } from "./Events";
import { Upcoming } from "./Upcoming";

export function SignedIn({ me }: { me: Me }) {
  const [now, setNow] = useState<NowState | null>(null);
  const [tasks, setTasks] = useState<TasksResponse | null>(null);
  const [events, setEvents] = useState<EventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadNow = useCallback(async () => {
    try {
      const r = await fetch("/api/now");
      if (r.status === 401) {
        window.location.href = "/auth/google/start";
        return;
      }
      if (!r.ok) throw new Error(`now ${r.status}`);
      setNow((await r.json()) as NowState);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks");
      if (r.ok) setTasks((await r.json()) as TasksResponse);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const r = await fetch("/api/events");
      if (r.ok) setEvents((await r.json()) as EventsResponse);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadNow();
    loadTasks();
    loadEvents();
    const interval = window.setInterval(loadNow, 60_000);
    const onFocus = () => {
      loadNow();
      loadTasks();
      loadEvents();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadNow, loadTasks, loadEvents]);

  const onBodyStateChange = useCallback(
    async (updates: BodyStateUpdate) => {
      try {
        const r = await fetch("/api/body-state", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (r.ok) loadNow();
      } catch (e) {
        setError(String(e));
      }
    },
    [loadNow],
  );

  const handle = me.email.split("@")[0] ?? "you";

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            t
          </div>
          <span className="brand-name">today</span>
        </div>
        <form method="post" action="/auth/logout">
          <button className="topbar-logout" type="submit" aria-label="Sign out">
            {handle}
          </button>
        </form>
      </header>

      <Now state={now} onBodyStateChange={onBodyStateChange} />
      <Today tasks={tasks} />
      <Events events={events} />
      <Upcoming tasks={tasks} />

      {error && <div className="error-toast">{error}</div>}
    </main>
  );
}
