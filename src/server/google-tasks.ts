import { GoogleReauthNeeded } from "./google";

const BASE = "https://tasks.googleapis.com/tasks/v1";

type GoogleTaskListResource = {
  id: string;
  title: string;
};

type GoogleTaskListsResponse = {
  items?: GoogleTaskListResource[];
  nextPageToken?: string;
};

type GoogleTaskResource = {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status?: "needsAction" | "completed";
  deleted?: boolean;
  hidden?: boolean;
  webViewLink?: string;
};

type GoogleTasksResponse = {
  items?: GoogleTaskResource[];
  nextPageToken?: string;
};

export type Task = {
  id: string;
  taskListId: string;
  taskListTitle: string;
  content: string;
  description: string;
  due: { date: string } | null;
  webViewLink?: string;
};

async function readGoogleTasksResponse<T>(res: Response, operation: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;

  const text = await res.text();
  if (
    res.status === 401 ||
    (res.status === 403 && /insufficient|scope/i.test(text))
  ) {
    throw new GoogleReauthNeeded(`${operation}: ${res.status}`);
  }
  throw new Error(`${operation} ${res.status}: ${text}`);
}

export async function listTaskLists(
  accessToken: string,
): Promise<GoogleTaskListResource[]> {
  const taskLists: GoogleTaskListResource[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${BASE}/users/@me/lists`);
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await readGoogleTasksResponse<GoogleTaskListsResponse>(
      res,
      "Google Tasks tasklists.list",
    );
    taskLists.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return taskLists;
}

async function listTasksInList(
  accessToken: string,
  taskList: GoogleTaskListResource,
): Promise<Task[]> {
  const tasks: Task[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `${BASE}/lists/${encodeURIComponent(taskList.id)}/tasks`,
    );
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("showCompleted", "false");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("showHidden", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await readGoogleTasksResponse<GoogleTasksResponse>(
      res,
      "Google Tasks tasks.list",
    );

    tasks.push(
      ...(data.items ?? [])
        .filter(
          (task) =>
            task.status !== "completed" && !task.deleted && !task.hidden,
        )
        .map((task) => ({
          id: task.id,
          taskListId: taskList.id,
          taskListTitle: taskList.title,
          content: task.title,
          description: task.notes ?? "",
          due: task.due ? { date: task.due.slice(0, 10) } : null,
          ...(task.webViewLink ? { webViewLink: task.webViewLink } : {}),
        })),
    );
    pageToken = data.nextPageToken;
  } while (pageToken);

  return tasks;
}

export async function listAllTasks(accessToken: string): Promise<Task[]> {
  const taskLists = await listTaskLists(accessToken);
  const tasks = await Promise.all(
    taskLists.map((taskList) => listTasksInList(accessToken, taskList)),
  );
  return tasks.flat();
}

export async function listTasksByListTitle(
  accessToken: string,
  title: string,
): Promise<Task[]> {
  const taskLists = await listTaskLists(accessToken);
  const normalizedTitle = title.trim().toLocaleLowerCase();
  const matches = taskLists.filter(
    (taskList) => taskList.title.trim().toLocaleLowerCase() === normalizedTitle,
  );
  const tasks = await Promise.all(
    matches.map((taskList) => listTasksInList(accessToken, taskList)),
  );
  return tasks.flat();
}

export async function completeTask(
  accessToken: string,
  taskListId: string,
  taskId: string,
): Promise<void> {
  const url = `${BASE}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "completed" }),
  });
  await readGoogleTasksResponse<GoogleTaskResource>(
    res,
    "Google Tasks tasks.patch",
  );
}

function dueDateKey(task: Task): string | null {
  return task.due?.date ?? null;
}

export type TaskBuckets = {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
};

export function bucketTasks(
  tasks: Task[],
  todayKey: string,
  sevenDayKey: string,
): TaskBuckets {
  const overdue: Task[] = [];
  const today: Task[] = [];
  const upcoming: Task[] = [];

  for (const task of tasks) {
    const dateKey = dueDateKey(task);
    if (!dateKey) continue;
    if (dateKey < todayKey) overdue.push(task);
    else if (dateKey === todayKey) today.push(task);
    else if (dateKey <= sevenDayKey) upcoming.push(task);
  }

  const byTitle = (a: Task, b: Task) => a.content.localeCompare(b.content);
  overdue.sort(byTitle);
  today.sort(byTitle);
  upcoming.sort((a, b) => {
    const aKey = dueDateKey(a)!;
    const bKey = dueDateKey(b)!;
    if (aKey !== bKey) return aKey < bKey ? -1 : 1;
    return byTitle(a, b);
  });

  return { overdue, today, upcoming };
}
