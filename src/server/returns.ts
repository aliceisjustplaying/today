import { todayKeyInTz } from "./dates";
import { listIssuesByLabel, type Task } from "./linear";

export type ReturnUrgency = "overdue" | "due_today" | "due_soon" | "scheduled" | "no_date";

export type ReturnItem = Task & {
  urgency: ReturnUrgency;
  daysUntilDue: number | null;
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
  apiKey: string;
  label: string;
  now?: Date;
  timezone?: string;
}): Promise<ReturnsResponse> {
  const todayKey = todayKeyInTz(opts.timezone ?? "Europe/London", opts.now);
  return listIssuesByLabel(opts.apiKey, opts.label).then((tasks) => {
    const items = tasks
      .map((task): ReturnItem => {
        const dueKey = task.due?.date.slice(0, 10);
        const daysUntilDue = dueKey ? daysBetweenKeys(todayKey, dueKey) : null;
        return {
          ...task,
          urgency: urgencyFor(daysUntilDue),
          daysUntilDue,
        };
      })
      .sort((a, b) => {
        const aSort = a.daysUntilDue;
        const bSort = b.daysUntilDue;
        if (aSort == null && bSort == null) {
          return a.content.localeCompare(b.content);
        }
        if (aSort == null) return 1;
        if (bSort == null) return -1;
        if (aSort !== bSort) return aSort - bSort;
        return a.content.localeCompare(b.content);
      });

    return { items, todayKey };
  });
}
