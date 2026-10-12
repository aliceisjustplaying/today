import { useState } from "react";
import type { Task, TasksResponse } from "./types";
import { Today } from "./Today";
import { Upcoming } from "./Upcoming";
import { NoDate } from "./NoDate";
import { Limits } from "./Limits";
import { getCached, setCached } from "./cache";
import { Stars } from "./Stars";
import { LIMITS_TAB, STARS_TAB, resolveTab } from "./tabs";

type Props = {
  tasks: TasksResponse | null;
  completing: Set<string>;
  onComplete: (task: Task) => void;
};

export function TaskTabs({ tasks, completing, onComplete }: Props) {
  const [selected, setSelected] = useState(() => getCached<string>("tasks.tab"));
  const tabs = tasks?.tabs ?? [];
  const current = resolveTab(selected, tabs.map((t) => t.name));
  const showLimits = current === LIMITS_TAB;
  const showStars = current === STARS_TAB;
  const tab = tabs.find((t) => t.name === current);
  const select = (name: string) => {
    setSelected(name);
    setCached("tasks.tab", name);
  };

  return (
    <>
      <nav className="tabs" role="tablist" aria-label="Linear teams, limits and stars">
        {tabs.map((t) => (
          <button
            key={t.name}
            type="button"
            role="tab"
            aria-selected={t.name === tab?.name}
            className="tab"
            onClick={() => select(t.name)}
          >
            {t.name}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={showLimits}
          className="tab"
          onClick={() => select(LIMITS_TAB)}
        >
          {LIMITS_TAB}
        </button>
        <button type="button" role="tab" aria-selected={showStars} className="tab" onClick={() => select(STARS_TAB)}>
          {STARS_TAB}
        </button>
      </nav>
      {showLimits && <Limits />}
      {showStars && <Stars />}
      {tab && (
        <>
          {[tab.overdue, tab.today, tab.upcoming, tab.undated].every((list) => list.length === 0) && (
            <p className="tabs-empty">Nothing open assigned to you in {tab.name}.</p>
          )}
          <Today tasks={tab} completing={completing} onComplete={onComplete} />
          <Upcoming tasks={tab} completing={completing} onComplete={onComplete} />
          <NoDate tasks={tab} completing={completing} onComplete={onComplete} />
        </>
      )}
    </>
  );
}
