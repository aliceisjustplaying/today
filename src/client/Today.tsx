import type { Task, TaskBuckets } from "./types";
import { OpenIcon } from "./icons";
import { usePrivacy } from "./privacy";

type Props = {
  tasks: TaskBuckets;
  completing: Set<string>;
  onComplete: (task: Task) => void;
};

export function Today({ tasks, completing, onComplete }: Props) {
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

export function TaskItem({
  task,
  completing,
  onComplete,
}: {
  task: Task;
  completing: boolean;
  onComplete: (task: Task) => void;
}) {
  const p = usePrivacy();
  return (
    <li className={`task ${completing ? "task--completing" : ""}`}>
      <button
        type="button"
        className="task-check"
        data-completing={completing ? "true" : undefined}
        onClick={() => onComplete(task)}
        aria-label={`mark "${task.content}" as done`}
        disabled={completing}
      />
      <div className="task-body">
        <div className="task-content">{p.hide(task.content)}</div>
        <div className="task-labels">
          <span className="label-chip">{p.hide(task.context)}</span>
        </div>
      </div>
      <a
        className="row-open"
        href={task.url}
        aria-label={`open ${task.identifier} in Linear`}
      >
        <OpenIcon />
      </a>
    </li>
  );
}
