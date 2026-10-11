import { useState } from "react";
import type { Task, TaskBuckets } from "./types";
import { TaskItem } from "./Today";
import { getCached, setCached } from "./cache";

type Props = {
  tasks: TaskBuckets;
  completing: Set<string>;
  onComplete: (task: Task) => void;
};

export function NoDate({ tasks, completing, onComplete }: Props) {
  const [open, setOpen] = useState(() => getCached<boolean>("tasks.nodate.open") ?? false);
  if (tasks.undated.length === 0) return null;

  const toggle = () => {
    setOpen(!open);
    setCached("tasks.nodate.open", !open);
  };

  return (
    <section className="section section--no-date">
      <button type="button" className="day-toggle section-toggle" onClick={toggle} aria-expanded={open}>
        <h2 className="section-title">No date</h2>
        <span className={`day-toggle-icon ${open ? "day-toggle-icon--open" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="task-list">
          {tasks.undated.map((t) => (
            <TaskItem key={t.id} task={t} completing={completing.has(t.id)} onComplete={onComplete} />
          ))}
        </ul>
      )}
    </section>
  );
}
