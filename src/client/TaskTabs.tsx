import { useState } from "react";
import type { Task, TasksResponse } from "./types";
import { Today } from "./Today";
import { Upcoming } from "./Upcoming";
import { NoDate } from "./NoDate";
import { getCached, setCached } from "./cache";

type Props = {
  tasks: TasksResponse | null;
  completing: Set<string>;
  onComplete: (task: Task) => void;
};

export function TaskTabs({ tasks, completing, onComplete }: Props) {
  const [selected, setSelected] = useState(() => getCached<string>("tasks.tab"));
  if (!tasks || tasks.tabs.length === 0) return null;

  const tab = tasks.tabs.find((t) => t.name === selected) ?? tasks.tabs[0]!;
  const select = (name: string) => {
    setSelected(name);
    setCached("tasks.tab", name);
  };

  return (
    <>
      {tasks.tabs.length > 1 && (
        <nav className="tabs" role="tablist" aria-label="Linear teams">
          {tasks.tabs.map((t) => {
            const pressing = t.overdue.length + t.today.length;
            return (
              <button
                key={t.name}
                type="button"
                role="tab"
                aria-selected={t.name === tab.name}
                className="tab"
                onClick={() => select(t.name)}
              >
                {t.name}
                {pressing > 0 && <span className="tab-count num">{pressing}</span>}
              </button>
            );
          })}
        </nav>
      )}
      {[tab.overdue, tab.today, tab.upcoming, tab.undated].every((list) => list.length === 0) && (
        <p className="tabs-empty">Nothing open assigned to you in {tab.name}.</p>
      )}
      <Today tasks={tab} completing={completing} onComplete={onComplete} />
      <Upcoming tasks={tab} completing={completing} onComplete={onComplete} />
      <NoDate tasks={tab} completing={completing} onComplete={onComplete} />
    </>
  );
}
