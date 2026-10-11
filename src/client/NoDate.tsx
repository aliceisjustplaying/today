import type { Task, TaskBuckets } from "./types";
import { TaskItem } from "./Today";

type Props = {
  tasks: TaskBuckets;
  completing: Set<string>;
  onComplete: (task: Task) => void;
};

export function NoDate({ tasks, completing, onComplete }: Props) {
  if (tasks.undated.length === 0) return null;

  return (
    <section className="section section--no-date">
      <h2 className="section-title">No date</h2>
      <ul className="task-list">
        {tasks.undated.map((t) => (
          <TaskItem key={t.id} task={t} completing={completing.has(t.id)} onComplete={onComplete} />
        ))}
      </ul>
    </section>
  );
}
