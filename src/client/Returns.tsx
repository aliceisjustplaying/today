import type { ReturnItem, ReturnsResponse } from "./types";
import { formatDateShort } from "./format";
import { OpenIcon } from "./icons";
import { todoistTaskUrl } from "./urls";

function dueLabel(item: ReturnItem): string {
  const fallback = item.due?.date.slice(0, 10);
  const days = item.daysUntilDue;
  if (!fallback) return "date needed";
  if (days == null) return formatDateShort(fallback);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days}d`;
}

function deadlineLabel(item: ReturnItem): string | null {
  const fallback = item.deadline?.date.slice(0, 10);
  const days = item.daysUntilDeadline;
  if (!fallback) return null;
  if (days == null) return `deadline ${formatDateShort(fallback)}`;
  if (days < 0) return `deadline ${Math.abs(days)}d overdue`;
  if (days === 0) return "deadline today";
  if (days === 1) return "deadline tomorrow";
  return `deadline in ${days}d`;
}

function priorityLabel(priority: number): string {
  if (priority === 4) return "P1";
  if (priority === 3) return "P2";
  if (priority === 2) return "P3";
  return "P4";
}

export function Returns({ returns }: { returns: ReturnsResponse | null }) {
  if (!returns || returns.items.length === 0) return null;

  return (
    <section className="section section--returns">
      <h2 className="section-title">Returns</h2>
      <ul className="return-list">
        {returns.items.map((item) => (
          <ReturnRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ReturnRow({ item }: { item: ReturnItem }) {
  const deadline = deadlineLabel(item);

  return (
    <li className="return-item" data-urgency={item.urgency}>
      <div className="return-body">
        <div className="return-head">
          <span className="return-merchant">Todoist</span>
          <span className="return-due">{dueLabel(item)}</span>
        </div>
        <div className="return-title">{item.content}</div>
        <div className="return-meta">
          <span>{priorityLabel(item.priority)}</span>
          {item.labels
            .filter((label) => label !== "returns")
            .map((label) => (
              <span key={label}>@{label}</span>
            ))}
          {deadline && <span>{deadline}</span>}
        </div>
        {item.description && <div className="return-action">{item.description}</div>}
      </div>
      <a
        className="row-open"
        href={todoistTaskUrl(item.id)}
        aria-label="open return task in Todoist"
      >
        <OpenIcon />
      </a>
    </li>
  );
}
