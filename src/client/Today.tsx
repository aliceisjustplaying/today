import type { TasksResponse, TodoistTask } from "./types";

type Props = {
  tasks: TasksResponse | null;
  completing: Set<string>;
  onComplete: (id: string) => void;
};

export function Today({ tasks, completing, onComplete }: Props) {
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
              <TaskItem
                key={t.id}
                task={t}
                completing={completing.has(t.id)}
                onComplete={onComplete}
              />
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
              <TaskItem
                key={t.id}
                task={t}
                completing={completing.has(t.id)}
                onComplete={onComplete}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TaskItem({
  task,
  completing,
  onComplete,
}: {
  task: TodoistTask;
  completing: boolean;
  onComplete: (id: string) => void;
}) {
  return (
    <li className={`task ${completing ? "task--completing" : ""}`}>
      <button
        type="button"
        className="task-check"
        data-priority={task.priority}
        data-completing={completing ? "true" : undefined}
        onClick={() => onComplete(task.id)}
        aria-label={`mark "${task.content}" as done`}
        disabled={completing}
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
