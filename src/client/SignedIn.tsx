import { useCallback, useEffect, useState } from "react";
import type {
  EventsResponse,
  Me,
  NowState,
  PrepStepDraft,
  PrepToday,
  PrepUpdate,
  ReturnsResponse,
  Task,
  TasksResponse,
} from "./types";
import { Now } from "./Now";
import { PrepSheet } from "./PrepSheet";
import { Returns } from "./Returns";
import { Events } from "./Events";
import { TaskTabs } from "./TaskTabs";
import { clearCached, getCached, setCached } from "./cache";

export function SignedIn({ me }: { me: Me }) {
  const [now, setNow] = useState<NowState | null>(() => getCached<NowState>("now.v2"));
  const [tasks, setTasks] = useState<TasksResponse | null>(() =>
    getCached<TasksResponse>("tasks.linear.v2"),
  );
  const [events, setEvents] = useState<EventsResponse | null>(() =>
    getCached<EventsResponse>("events"),
  );
  const [returns, setReturns] = useState<ReturnsResponse | null>(() =>
    getCached<ReturnsResponse>("returns.linear"),
  );
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [prepSheet, setPrepSheet] = useState<"edit" | "history" | null>(null);

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
      setCached("now.v2", data);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks");
      if (r.status === 401) {
        window.location.href = "/auth/google/start";
        return;
      }
      if (!r.ok) throw new Error(`tasks ${r.status}`);
      const data = (await r.json()) as TasksResponse;
      setTasks(data);
      setCached("tasks.linear.v2", data);
    } catch (e) {
      setError(String(e));
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

  const loadReturns = useCallback(async () => {
    try {
      const r = await fetch("/api/returns");
      if (r.status === 401) {
        window.location.href = "/auth/google/start";
        return;
      }
      if (!r.ok) throw new Error(`returns ${r.status}`);
      const data = (await r.json()) as ReturnsResponse;
      setReturns(data);
      setCached("returns.linear", data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadNow();
    loadTasks();
    loadEvents();
    loadReturns();
    const interval = window.setInterval(loadNow, 60_000);
    const onFocus = () => {
      loadNow();
      loadTasks();
      loadEvents();
      loadReturns();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadNow, loadTasks, loadEvents, loadReturns]);

  const applyPrep = useCallback((prep: PrepToday) => {
    setNow((prev) => (prev ? { ...prev, prep } : prev));
    loadNow();
  }, [loadNow]);

  const onPrepChange = useCallback(
    async (update: PrepUpdate) => {
      setNow((prev) =>
        prev && {
          ...prev,
          prep: {
            ...prev.prep,
            ...("runningLate" in update ? { runningLate: update.runningLate } : {}),
            steps: prev.prep.steps.map((s) =>
              "stepId" in update && s.id === update.stepId ? { ...s, done: update.done } : s,
            ),
          },
        },
      );
      try {
        const r = await fetch("/api/prep", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(update),
        });
        if (!r.ok) throw new Error(`prep ${r.status}`);
        applyPrep((await r.json()) as PrepToday);
      } catch (e) {
        setError(String(e));
        loadNow();
      }
    },
    [applyPrep, loadNow],
  );

  const onSavePrepSteps = useCallback(
    async (steps: PrepStepDraft[]) => {
      const r = await fetch("/api/prep/steps", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `steps ${r.status}`);
      applyPrep((await r.json()) as PrepToday);
    },
    [applyPrep],
  );

  const closePrepSheet = useCallback(() => setPrepSheet(null), []);

  const onCompleteTask = useCallback(
    async (task: Task) => {
      const { id } = task;
      setCompleting((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      try {
        const r = await fetch(`/api/tasks/${task.workspace}/${encodeURIComponent(id)}/close`, {
          method: "POST",
        });
        if (r.status === 401) {
          window.location.href = "/auth/google/start";
          return;
        }
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

      <Now state={now} onPrepChange={onPrepChange} onEditPrep={() => setPrepSheet("edit")} />
      <Events events={events} />
      <TaskTabs tasks={tasks} completing={completing} onComplete={onCompleteTask} />
      <Returns returns={returns} />

      {error && <div className="error-toast">{error}</div>}

      {prepSheet && now && (
        <PrepSheet
          view={prepSheet}
          steps={now.prep.steps}
          onView={setPrepSheet}
          onSave={onSavePrepSteps}
          onClose={closePrepSheet}
        />
      )}
    </main>
  );
}
