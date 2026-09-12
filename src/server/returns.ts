import { todayKeyInTz } from "./dates";
import { fetchTasksByFilter, type TodoistTask } from "./todoist";

export type ReturnUrgency = "overdue" | "due_today" | "due_soon" | "scheduled" | "no_date";

export type ReturnItem = TodoistTask & {
  urgency: ReturnUrgency;
  daysUntilDue: number | null;
  daysUntilDeadline: number | null;
};

export type ReturnsResponse = {
  items: ReturnItem[];
  todayKey: string;
};

function daysBetweenKeys(startKey: string, endKey: string): number {
  const start = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function urgencyFor(daysUntilDue: number | null): ReturnUrgency {
  if (daysUntilDue == null) return "no_date";
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue === 0) return "due_today";
  if (daysUntilDue <= 4) return "due_soon";
  return "scheduled";
}

export function getReturns(opts: {
  token: string;
  now?: Date;
  timezone?: string;
}): Promise<ReturnsResponse> {
  const todayKey = todayKeyInTz(opts.timezone ?? "Europe/London", opts.now);
  return fetchTasksByFilter(opts.token, "@returns", 100).then((tasks) => {
    const items = tasks
      .filter((task) => !task.checked && task.labels.includes("returns"))
      .map((task): ReturnItem => {
        const dueKey = task.due?.date.slice(0, 10);
        const deadlineKey = task.deadline?.date.slice(0, 10);
        const daysUntilDue = dueKey ? daysBetweenKeys(todayKey, dueKey) : null;
        const daysUntilDeadline = deadlineKey
          ? daysBetweenKeys(todayKey, deadlineKey)
          : null;
        return {
          ...task,
          urgency: urgencyFor(daysUntilDue ?? daysUntilDeadline),
          daysUntilDue,
          daysUntilDeadline,
        };
      })
      .sort((a, b) => {
        const aSort = a.daysUntilDue ?? a.daysUntilDeadline;
        const bSort = b.daysUntilDue ?? b.daysUntilDeadline;
        if (aSort == null && bSort == null) return b.priority - a.priority;
        if (aSort == null) return 1;
        if (bSort == null) return -1;
        if (aSort !== bSort) return aSort - bSort;
        return b.priority - a.priority;
      });

    return { items, todayKey };
  });
}
