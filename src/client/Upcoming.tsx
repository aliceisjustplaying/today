import type { Task, TasksResponse } from "./types";
import { formatDateShort } from "./format";
import { googleTasksUrl } from "./urls";
import { OpenIcon } from "./icons";

type Props = {
  tasks: TasksResponse | null;
  completing: Set<string>;
  onComplete: (taskListId: string, id: string) => void;
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
                key={`${t.taskListId}:${t.id}`}
                className={`task ${completing.has(`${t.taskListId}:${t.id}`) ? "task--completing" : ""}`}
              >
                <button
                  type="button"
                  className="task-check"
                  data-completing={completing.has(`${t.taskListId}:${t.id}`) ? "true" : undefined}
                  onClick={() => onComplete(t.taskListId, t.id)}
                  aria-label={`mark "${t.content}" as done`}
                  disabled={completing.has(`${t.taskListId}:${t.id}`)}
                />
                <div className="task-body">
                  <div className="task-content">{t.content}</div>
                  <div className="task-labels">
                    <span className="label-chip">{t.taskListTitle}</span>
                  </div>
                </div>
                <a
                  className="row-open"
                  href={t.webViewLink ?? googleTasksUrl}
                  aria-label="open in Google Tasks"
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
