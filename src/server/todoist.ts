export type TodoistDue = {
  date: string;
  string: string;
  timezone: string | null;
  is_recurring: boolean;
};

export type TodoistTask = {
  id: string;
  content: string;
  description: string;
  due: TodoistDue | null;
  priority: number;
  project_id: string;
  labels: string[];
  checked: boolean;
};

type FilterResponse = {
  results: TodoistTask[];
  next_cursor: string | null;
};

const BASE = "https://api.todoist.com/api/v1";

export async function fetchTasksByFilter(
  token: string,
  query: string,
  limit = 200,
): Promise<TodoistTask[]> {
  const url = `${BASE}/tasks/filter?query=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Todoist ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as FilterResponse;
  return data.results;
}

function dueDateKey(t: TodoistTask): string | null {
  if (!t.due) return null;
  return t.due.date.slice(0, 10);
}

export type TaskBuckets = {
  overdue: TodoistTask[];
  today: TodoistTask[];
  upcoming: TodoistTask[];
};

export function bucketTasks(
  tasks: TodoistTask[],
  todayKey: string,
  sevenDayKey: string,
): TaskBuckets {
  const overdue: TodoistTask[] = [];
  const today: TodoistTask[] = [];
  const upcoming: TodoistTask[] = [];

  for (const t of tasks) {
    if (t.checked) continue;
    const k = dueDateKey(t);
    if (!k) continue;
    if (k < todayKey) overdue.push(t);
    else if (k === todayKey) today.push(t);
    else if (k <= sevenDayKey) upcoming.push(t);
  }

  const byPriority = (a: TodoistTask, b: TodoistTask) => b.priority - a.priority;
  overdue.sort(byPriority);
  today.sort(byPriority);
  upcoming.sort((a, b) => {
    const aKey = dueDateKey(a)!;
    const bKey = dueDateKey(b)!;
    if (aKey !== bKey) return aKey < bKey ? -1 : 1;
    return b.priority - a.priority;
  });

  return { overdue, today, upcoming };
}
