const ENDPOINT = "https://api.linear.app/graphql";
const OPEN_STATE_FILTER = { type: { nin: ["completed", "canceled"] } };

export class LinearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinearError";
  }
}

export type Task = {
  id: string;
  identifier: string;
  content: string;
  description: string;
  due: { date: string } | null;
  context: string;
  url: string;
};

type IssueNode = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  url: string;
  team: { key: string };
  project: { name: string } | null;
};

type IssueConnection = {
  nodes: IssueNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const ISSUE_FIELDS = `
  nodes {
    id identifier title description dueDate url
    team { key }
    project { name }
  }
  pageInfo { hasNextPage endCursor }
`;

async function linearRequest<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message: string }[];
  } | null;
  if (!res.ok || body?.errors?.length || !body?.data) {
    const detail = body?.errors?.map((e) => e.message).join("; ") ?? res.statusText;
    throw new LinearError(`Linear ${res.status}: ${detail}`);
  }
  return body.data;
}

function toTask(issue: IssueNode): Task {
  return {
    id: issue.id,
    identifier: issue.identifier,
    content: issue.title,
    description: issue.description ?? "",
    due: issue.dueDate ? { date: issue.dueDate } : null,
    context: issue.project?.name ?? issue.team.key,
    url: issue.url,
  };
}

async function collectIssues(
  fetchPage: (after: string | null) => Promise<IssueConnection>,
): Promise<Task[]> {
  const tasks: Task[] = [];
  let after: string | null = null;
  do {
    const page = await fetchPage(after);
    tasks.push(...page.nodes.map(toTask));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return tasks;
}

export function listAssignedIssues(apiKey: string): Promise<Task[]> {
  const query = `query AssignedIssues($after: String, $filter: IssueFilter) {
    viewer { assignedIssues(first: 100, after: $after, filter: $filter) { ${ISSUE_FIELDS} } }
  }`;
  return collectIssues(async (after) => {
    const data = await linearRequest<{ viewer: { assignedIssues: IssueConnection } }>(
      apiKey,
      query,
      { after, filter: { state: OPEN_STATE_FILTER } },
    );
    return data.viewer.assignedIssues;
  });
}

export function listIssuesByLabel(apiKey: string, label: string): Promise<Task[]> {
  const query = `query LabelledIssues($after: String, $filter: IssueFilter) {
    issues(first: 100, after: $after, filter: $filter) { ${ISSUE_FIELDS} }
  }`;
  return collectIssues(async (after) => {
    const data = await linearRequest<{ issues: IssueConnection }>(apiKey, query, {
      after,
      filter: {
        state: OPEN_STATE_FILTER,
        labels: { some: { name: { eqIgnoreCase: label.trim() } } },
      },
    });
    return data.issues;
  });
}

export async function completeIssue(apiKey: string, issueId: string): Promise<void> {
  const lookup = await linearRequest<{
    issue: { team: { states: { nodes: { id: string; position: number }[] } } };
  }>(
    apiKey,
    `query CompletedStates($id: String!) {
      issue(id: $id) {
        team { states(filter: { type: { eq: "completed" } }) { nodes { id position } } }
      }
    }`,
    { id: issueId },
  );
  const [done] = [...lookup.issue.team.states.nodes].sort((a, b) => a.position - b.position);
  if (!done) throw new LinearError(`No completed state on the team of issue ${issueId}`);

  const result = await linearRequest<{ issueUpdate: { success: boolean } }>(
    apiKey,
    `mutation CompleteIssue($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { success }
    }`,
    { id: issueId, stateId: done.id },
  );
  if (!result.issueUpdate.success) {
    throw new LinearError(`issueUpdate failed for ${issueId}`);
  }
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
