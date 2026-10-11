import type { ReturnItem, ReturnsResponse } from "./types";
import { formatDateShort } from "./format";
import { OpenIcon } from "./icons";
import { usePrivacy } from "./privacy";

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
  const p = usePrivacy();
  return (
    <li className="return-item" data-urgency={item.urgency}>
      <div className="return-body">
        <div className="return-head">
          <span className="return-merchant">{p.decoy("identifier", item.id, item.identifier)}</span>
          <span className="return-due">{dueLabel(item)}</span>
        </div>
        <div className="return-title">{p.decoy("issue", item.id, item.content)}</div>
        <div className="return-meta">{p.decoy("label", item.id, item.context)}</div>
        {item.description && <div className="return-action">{p.decoy("issue", `${item.id}:description`, item.description)}</div>}
      </div>
      <a
        className="row-open"
        href={item.url}
        aria-label={`open ${p.decoy("identifier", item.id, item.identifier)} in Linear`}
      >
        <OpenIcon />
      </a>
    </li>
  );
}
