export function todoistTaskUrl(taskId: string): string {
  return `https://app.todoist.com/app/task/${encodeURIComponent(taskId)}`;
}

export const fantasticalOpen = "x-fantastical3://";
