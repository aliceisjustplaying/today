import type { Task, TasksResponse } from "./types";
import { googleTasksUrl } from "./urls";
import { OpenIcon } from "./icons";

type Props = {
  tasks: TasksResponse | null;
  completing: Set<string>;
  onComplete: (taskListId: string, id: string) => void;
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
                key={`${t.taskListId}:${t.id}`}
                task={t}
                completing={completing.has(`${t.taskListId}:${t.id}`)}
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
                key={`${t.taskListId}:${t.id}`}
                task={t}
                completing={completing.has(`${t.taskListId}:${t.id}`)}
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
  task: Task;
  completing: boolean;
  onComplete: (taskListId: string, id: string) => void;
}) {
  return (
    <li className={`task ${completing ? "task--completing" : ""}`}>
      <button
        type="button"
        className="task-check"
        data-completing={completing ? "true" : undefined}
        onClick={() => onComplete(task.taskListId, task.id)}
        aria-label={`mark "${task.content}" as done`}
        disabled={completing}
      />
      <div className="task-body">
        <div className="task-content">{task.content}</div>
        <div className="task-labels">
          <span className="label-chip">{task.taskListTitle}</span>
        </div>
      </div>
      <a
        className="row-open"
        href={task.webViewLink ?? googleTasksUrl}
        aria-label="open in Google Tasks"
      >
        <OpenIcon />
      </a>
    </li>
  );
}
