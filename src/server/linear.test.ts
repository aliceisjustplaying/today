import { afterEach, describe, expect, mock, test } from "bun:test";
import { bucketTasks, completeIssue, LinearError, listAssignedIssues, type Task } from "./linear";
import { getReturns } from "./returns";

type Call = { query: string; variables: Record<string, unknown>; auth: string | null };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockLinear(responses: unknown[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({
      query: body.query,
      variables: body.variables,
      auth: new Headers(init?.headers).get("authorization"),
    });
    return Response.json(responses.shift());
  }) as unknown as typeof fetch;
  return calls;
}

function issue(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "uuid-1",
    identifier: "ALI-1",
    title: "Post the parcel",
    description: null,
    dueDate: "2026-10-11",
    url: "https://linear.app/alice/issue/ALI-1",
    team: { key: "ALI" },
    project: null,
    ...overrides,
  };
}

function task(content: string, date: string | null): Task {
  return {
    id: content,
    workspace: 0,
    identifier: content,
    content,
    description: "",
    due: date ? { date } : null,
    context: "ALI",
    url: "",
  };
}

describe("listAssignedIssues", () => {
  test("pages through open assigned issues with the raw API key", async () => {
    const calls = mockLinear([
      {
        data: {
          viewer: {
            assignedIssues: {
              nodes: [issue()],
              pageInfo: { hasNextPage: true, endCursor: "c1" },
            },
          },
        },
      },
      {
        data: {
          viewer: {
            assignedIssues: {
              nodes: [issue({ id: "uuid-2", identifier: "ALI-2", project: { name: "Flat" } })],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    ]);

    const tasks = await listAssignedIssues(["lin_api_key"]);

    expect(calls.map((c) => c.variables.after)).toEqual([null, "c1"]);
    expect(calls[0]!.auth).toBe("lin_api_key");
    expect(calls[0]!.variables.filter).toEqual({
      state: { type: { nin: ["completed", "canceled"] } },
    });
    expect(tasks).toEqual([
      {
        id: "uuid-1",
        workspace: 0,
        identifier: "ALI-1",
        content: "Post the parcel",
        description: "",
        due: { date: "2026-10-11" },
        context: "ALI",
        url: "https://linear.app/alice/issue/ALI-1",
      },
      expect.objectContaining({ identifier: "ALI-2", context: "Flat" }),
    ]);
  });

  test("surfaces GraphQL errors as LinearError", async () => {
    mockLinear([{ errors: [{ message: "Authentication required" }] }]);
    const result = listAssignedIssues(["bad"]);
    await expect(result).rejects.toBeInstanceOf(LinearError);
    await expect(result).rejects.toThrow("Authentication required");
  });
});

describe("several workspaces", () => {
  test("merges issues from every key and tags each with its workspace", async () => {
    const calls: string[] = [];
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("authorization")!;
      calls.push(auth);
      const node = issue({ id: `issue-${auth}`, identifier: auth === "key-a" ? "A-1" : "B-1" });
      return Response.json({
        data: {
          viewer: {
            assignedIssues: { nodes: [node], pageInfo: { hasNextPage: false, endCursor: null } },
          },
        },
      });
    }) as unknown as typeof fetch;

    const tasks = await listAssignedIssues(["key-a", "key-b"]);

    expect(calls.sort()).toEqual(["key-a", "key-b"]);
    expect(tasks.map((t) => [t.identifier, t.workspace])).toEqual([
      ["A-1", 0],
      ["B-1", 1],
    ]);
  });

  test("one failing workspace fails the whole list", async () => {
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      if (new Headers(init?.headers).get("authorization") === "bad") {
        return Response.json({ errors: [{ message: "Authentication required" }] }, { status: 400 });
      }
      return Response.json({
        data: { viewer: { assignedIssues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } },
      });
    }) as unknown as typeof fetch;

    await expect(listAssignedIssues(["good", "bad"])).rejects.toBeInstanceOf(LinearError);
  });
});

describe("getReturns", () => {
  test("filters open issues by label, not assignee, and ranks by urgency", async () => {
    const calls = mockLinear([
      {
        data: {
          issues: {
            nodes: [
              issue({ id: "a", title: "Shoes", dueDate: null }),
              issue({ id: "b", title: "Jacket", dueDate: "2026-10-13" }),
              issue({ id: "c", title: "Lamp", dueDate: "2026-10-09" }),
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    ]);

    const result = await getReturns({
      apiKeys: ["k"],
      label: "Returns",
      now: new Date("2026-10-11T09:00:00Z"),
      timezone: "Europe/London",
    });

    expect(calls[0]!.query).toContain("issues(");
    expect(calls[0]!.query).not.toContain("assignedIssues");
    expect(calls[0]!.variables.filter).toEqual({
      state: { type: { nin: ["completed", "canceled"] } },
      labels: { some: { name: { eqIgnoreCase: "Returns" } } },
    });
    expect(result.items.map((i) => [i.content, i.urgency, i.daysUntilDue])).toEqual([
      ["Lamp", "overdue", -2],
      ["Jacket", "due_soon", 2],
      ["Shoes", "no_date", null],
    ]);
  });
});

describe("completeIssue", () => {
  test("moves the issue to its team's first completed state", async () => {
    const calls = mockLinear([
      {
        data: {
          issue: {
            team: {
              states: {
                nodes: [
                  { id: "shipped", position: 5 },
                  { id: "done", position: 3 },
                ],
              },
            },
          },
        },
      },
      { data: { issueUpdate: { success: true } } },
    ]);

    await completeIssue("k", "uuid-1");

    expect(calls[0]!.variables).toEqual({ id: "uuid-1" });
    expect(calls[1]!.query).toContain("issueUpdate");
    expect(calls[1]!.variables).toEqual({ id: "uuid-1", stateId: "done" });
  });
});

describe("bucketTasks", () => {
  test("splits dated tasks into overdue, today and the next seven days", () => {
    const buckets = bucketTasks(
      [
        task("b-late", "2026-10-01"),
        task("a-late", "2026-10-10"),
        task("today", "2026-10-11"),
        task("soon", "2026-10-18"),
        task("later", "2026-10-19"),
        task("undated", null),
      ],
      "2026-10-11",
      "2026-10-18",
    );
    expect(buckets.overdue.map((t) => t.content)).toEqual(["a-late", "b-late"]);
    expect(buckets.today.map((t) => t.content)).toEqual(["today"]);
    expect(buckets.upcoming.map((t) => t.content)).toEqual(["soon"]);
  });
});
