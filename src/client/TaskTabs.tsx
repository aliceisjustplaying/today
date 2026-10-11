import { useState } from "react";
import type { Task, TasksResponse } from "./types";
import { Today } from "./Today";
import { Upcoming } from "./Upcoming";
import { NoDate } from "./NoDate";
import { Limits } from "./Limits";
import { getCached, setCached } from "./cache";

const LIMITS_TAB = "Limits";

type Props = {
  tasks: TasksResponse | null;
  completing: Set<string>;
  onComplete: (task: Task) => void;
};

export function TaskTabs({ tasks, completing, onComplete }: Props) {
  const [selected, setSelected] = useState(() => getCached<string>("tasks.tab"));
  const tabs = tasks?.tabs ?? [];
  const showLimits = selected === LIMITS_TAB;
  const tab = tabs.find((t) => t.name === selected) ?? tabs[0];
  const select = (name: string) => {
    setSelected(name);
    setCached("tasks.tab", name);
  };

  return (
    <>
      <nav className="tabs" role="tablist" aria-label="Linear teams and limits">
        {tabs.map((t) => {
          const pressing = t.overdue.length + t.today.length;
          return (
            <button
              key={t.name}
              type="button"
              role="tab"
              aria-selected={!showLimits && t.name === tab?.name}
              className="tab"
              onClick={() => select(t.name)}
            >
              {t.name}
              {pressing > 0 && <span className="tab-count num">{pressing}</span>}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={showLimits}
          className="tab"
          onClick={() => select(LIMITS_TAB)}
        >
          {LIMITS_TAB}
        </button>
      </nav>
      {showLimits && <Limits />}
      {!showLimits && tab && (
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
