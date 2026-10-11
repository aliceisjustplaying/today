import type { Task, TaskBuckets } from "./types";
import { formatDateShort } from "./format";
import { OpenIcon } from "./icons";
import { usePrivacy } from "./privacy";

type Props = {
  tasks: TaskBuckets;
  completing: Set<string>;
  onComplete: (task: Task) => void;
};

function groupByDate(tasks: Task[]): Map<string, Task[]> {
  const m = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due) continue;
    const key = t.due.date.slice(0, 10);
    const arr = m.get(key) ?? [];
    arr.push(t);
    m.set(key, arr);
  }
  return m;
}

export function Upcoming({ tasks, completing, onComplete }: Props) {
  const p = usePrivacy();
  if (tasks.upcoming.length === 0) return null;
  const grouped = groupByDate(tasks.upcoming);

  return (
    <section className="section section--upcoming">
      <h2 className="section-title">Upcoming</h2>
      {Array.from(grouped.entries()).map(([dateKey, items]) => (
        <div key={dateKey} className="day-group">
          <h3 className="day-label">{formatDateShort(dateKey)}</h3>
          <ul className="task-list">
            {items.map((t) => (
              <li
                key={t.id}
                className={`task ${completing.has(t.id) ? "task--completing" : ""}`}
              >
                <button
                  type="button"
                  className="task-check"
                  data-completing={completing.has(t.id) ? "true" : undefined}
                  onClick={() => onComplete(t)}
                  aria-label={`mark "${p.decoy("issue", t.id, t.content)}" as done`}
                  disabled={completing.has(t.id)}
                />
                <div className="task-body">
                  <div className="task-content">{p.decoy("issue", t.id, t.content)}</div>
                  <div className="task-labels">
                    <span className="label-chip">{p.decoy("label", t.id, t.context)}</span>
                  </div>
                </div>
                <a
                  className="row-open"
                  href={t.url}
                  aria-label={`open ${p.decoy("identifier", t.id, t.identifier)} in Linear`}
                >
                  <OpenIcon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
