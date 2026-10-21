import { useCallback, useEffect, useState } from "react";
import type {
  EventsResponse,
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
import { REFETCH_GAP_MS, onResume, signInAgain, throttle } from "./resume";
import { reloadIfStale, supersededByDeploy } from "./updates";
import { EyeIcon, PrivacyContext, loadPrivacy, maskInline, savePrivacy } from "./privacy";

export function SignedIn() {
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
  const [errors, setErrors] = useState<Partial<Record<"now" | "tasks" | "returns" | "prep" | "close", string>>>({});
  const [prepSheet, setPrepSheet] = useState<"edit" | "history" | null>(null);

  const loadNow = useCallback(async () => {
    try {
      const r = await fetch("/api/now");
      if (r.status === 401) {
        signInAgain();
        return;
      }
      if (!r.ok) throw new Error(`now ${r.status}`);
      const data = (await r.json()) as NowState;
      if (await supersededByDeploy()) return;
      setNow(data);
      setCached("now.v2", data);
      setErrors((prev) => ({ ...prev, now: undefined }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, now: String(e) }));
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks");
      if (r.status === 401) {
        signInAgain();
        return;
      }
      if (!r.ok) throw new Error(`tasks ${r.status}`);
      const data = (await r.json()) as TasksResponse;
      if (await supersededByDeploy()) return;
      setTasks(data);
      setCached("tasks.linear.v2", data);
      setErrors((prev) => ({ ...prev, tasks: undefined }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, tasks: String(e) }));
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const r = await fetch("/api/events");
      if (r.ok) {
        const data = (await r.json()) as EventsResponse;
        if (await supersededByDeploy()) return;
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
        signInAgain();
        return;
      }
      if (!r.ok) throw new Error(`returns ${r.status}`);
      const data = (await r.json()) as ReturnsResponse;
      if (await supersededByDeploy()) return;
      setReturns(data);
      setCached("returns.linear", data);
      setErrors((prev) => ({ ...prev, returns: undefined }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, returns: String(e) }));
    }
  }, []);

  useEffect(() => {
    const loadData = () => {
      loadNow();
      loadTasks();
      loadEvents();
      loadReturns();
    };
    reloadIfStale();
    loadData();
    const refetch = throttle(loadData, REFETCH_GAP_MS);
    const interval = window.setInterval(loadNow, 60_000);
    const stopResume = onResume(() => {
      reloadIfStale();
      refetch();
    });
    return () => {
      window.clearInterval(interval);
      stopResume();
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
        setErrors((prev) => ({ ...prev, prep: undefined }));
      } catch (e) {
        setErrors((prev) => ({ ...prev, prep: String(e) }));
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
          signInAgain();
          return;
        }
        if (!r.ok) throw new Error(`close ${r.status}`);
        setErrors((prev) => ({ ...prev, close: undefined }));
        await Promise.all([loadTasks(), loadReturns()]);
      } catch (e) {
        setErrors((prev) => ({ ...prev, close: String(e) }));
      } finally {
        setCompleting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [loadTasks, loadReturns],
  );

  const onLogout = useCallback(() => {
    clearCached();
  }, []);

  const [privacy, setPrivacy] = useState(loadPrivacy);
  const togglePrivacy = () => {
    setPrivacy(!privacy);
    savePrivacy(!privacy);
  };

  return (
    <PrivacyContext.Provider value={privacy}>
      <main className={privacy ? "shell shell--private" : "shell"}>
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              t
            </div>
            <span className="brand-name">today</span>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="privacy-toggle"
              aria-pressed={privacy}
              aria-label={privacy ? "Privacy mode on: show emails and amounts" : "Hide emails and amounts for screenshots"}
              onClick={togglePrivacy}
            >
              <EyeIcon off={privacy} />
              {privacy && <span>Private</span>}
            </button>
            <form method="post" action="/auth/logout" onSubmit={onLogout}>
              <button className="topbar-logout" type="submit" aria-label="Sign out" title="Sign out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
                </svg>
              </button>
            </form>
          </div>
        </header>

        <Now state={now} onPrepChange={onPrepChange} onEditPrep={() => setPrepSheet("edit")} />
        <Events events={events} />
        <TaskTabs tasks={tasks} completing={completing} onComplete={onCompleteTask} />
        <Returns returns={returns} />

        {Object.values(errors).some(Boolean) && (
          <div className="error-toast">
            {Object.entries(errors).map(([source, error]) => error && (
              <div key={source}>{privacy ? maskInline(error) : error}</div>
            ))}
          </div>
        )}

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
    </PrivacyContext.Provider>
  );
}
