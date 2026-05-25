import type { TasksResponse, TodoistTask } from "./types";

export function Today({ tasks }: { tasks: TasksResponse | null }) {
  if (!tasks) return null;
  const { overdue, today } = tasks;
  if (overdue.length === 0 && today.length === 0) return null;

  return (
    <section className="section section--today">
      <h2 className="section-title">Today</h2>
      {overdue.length > 0 && (
        <div className="task-group task-group--overdue">
          <h3 className="task-group-label">
            Overdue · <span className="num">{overdue.length}</span>
          </h3>
          <ul className="task-list">
            {overdue.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </ul>
        </div>
      )}
      {today.length > 0 && (
        <div className="task-group">
          <h3 className="task-group-label">
            Due today · <span className="num">{today.length}</span>
          </h3>
          <ul className="task-list">
            {today.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TaskItem({ task }: { task: TodoistTask }) {
  return (
    <li className="task">
      <span
        className={`priority-dot priority-${task.priority}`}
        aria-label={`priority ${task.priority}`}
      />
      <div className="task-body">
        <div className="task-content">{task.content}</div>
        {task.labels.length > 0 && (
          <div className="task-labels">
            {task.labels.map((l) => (
              <span key={l} className="label-chip">
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
