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
import { clearCached, getCached, setCached } from "./cache";

export function SignedIn({ me }: { me: Me }) {
  const [now, setNow] = useState<NowState | null>(() => getCached<NowState>("now"));
  const [tasks, setTasks] = useState<TasksResponse | null>(() =>
    getCached<TasksResponse>("tasks"),
  );
  const [events, setEvents] = useState<EventsResponse | null>(() =>
    getCached<EventsResponse>("events"),
  );
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadNow = useCallback(async () => {
    try {
      const r = await fetch("/api/now");
      if (r.status === 401) {
        window.location.href = "/auth/google/start";
        return;
      }
      if (!r.ok) throw new Error(`now ${r.status}`);
      const data = (await r.json()) as NowState;
      setNow(data);
      setCached("now", data);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks");
      if (r.ok) {
        const data = (await r.json()) as TasksResponse;
        setTasks(data);
        setCached("tasks", data);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const r = await fetch("/api/events");
      if (r.ok) {
        const data = (await r.json()) as EventsResponse;
        setEvents(data);
        setCached("events", data);
      }
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

  const onCompleteTask = useCallback(
    async (id: string) => {
      setCompleting((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      try {
        const r = await fetch(`/api/tasks/${encodeURIComponent(id)}/close`, {
          method: "POST",
        });
        if (!r.ok) throw new Error(`close ${r.status}`);
        await loadTasks();
      } catch (e) {
        setError(String(e));
      } finally {
        setCompleting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [loadTasks],
  );

  const onLogout = useCallback(() => {
    clearCached();
  }, []);

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
        <form method="post" action="/auth/logout" onSubmit={onLogout}>
          <button className="topbar-logout" type="submit" aria-label="Sign out">
            {handle}
          </button>
        </form>
      </header>

      <Now state={now} onBodyStateChange={onBodyStateChange} />
      <Events events={events} />
      <Today tasks={tasks} completing={completing} onComplete={onCompleteTask} />
      <Upcoming tasks={tasks} completing={completing} onComplete={onCompleteTask} />

      {error && <div className="error-toast">{error}</div>}
    </main>
  );
}
