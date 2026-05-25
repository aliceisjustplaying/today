import type { TasksResponse, TodoistTask } from "./types";
import { formatDateShort } from "./format";
import { todoistTaskUrl } from "./urls";
import { OpenIcon } from "./icons";

type Props = {
  tasks: TasksResponse | null;
  completing: Set<string>;
  onComplete: (id: string) => void;
};

function groupByDate(tasks: TodoistTask[]): Map<string, TodoistTask[]> {
  const m = new Map<string, TodoistTask[]>();
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
  if (!tasks || tasks.upcoming.length === 0) return null;
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
                  data-priority={t.priority}
                  data-completing={completing.has(t.id) ? "true" : undefined}
                  onClick={() => onComplete(t.id)}
                  aria-label={`mark "${t.content}" as done`}
                  disabled={completing.has(t.id)}
                />
                <div className="task-body">
                  <div className="task-content">{t.content}</div>
                  {t.labels.length > 0 && (
                    <div className="task-labels">
                      {t.labels.map((l) => (
                        <span key={l} className="label-chip">
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <a
                  className="row-open"
                  href={todoistTaskUrl(t.id)}
                  aria-label="open in Todoist"
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
