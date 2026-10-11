import { useEffect, useState } from "react";
import type { PrepHistory, PrepStep, PrepStepDraft } from "./types";
import { formatTime } from "./format";
import { usePrivacy } from "./privacy";

type Props = {
  view: "edit" | "history";
  steps: PrepStep[];
  onView: (view: "edit" | "history") => void;
  onSave: (steps: PrepStepDraft[]) => Promise<void>;
  onClose: () => void;
};

export function PrepSheet({ view, steps, onView, onSave, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={view === "edit" ? "Prep steps" : "Prep history"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <div className="sheet-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={view === "edit"} className="sheet-tab" onClick={() => onView("edit")}>
              Steps
            </button>
            <button type="button" role="tab" aria-selected={view === "history"} className="sheet-tab" onClick={() => onView("history")}>
              History
            </button>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {view === "edit" ? <EditSteps steps={steps} onSave={onSave} onClose={onClose} /> : <History />}
      </div>
    </div>
  );
}

function EditSteps({ steps, onSave, onClose }: { steps: PrepStep[]; onSave: Props["onSave"]; onClose: () => void }) {
  const [draft, setDraft] = useState<(PrepStepDraft & { key: string })[]>(() =>
    steps.map((s) => ({ id: s.id, label: s.label, minutes: s.minutes, key: String(s.id) })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (i: number, p: Partial<PrepStepDraft>) =>
    setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, by: number) =>
    setDraft((d) => {
      const next = [...d];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item!);
      return next;
    });

  const total = draft.reduce((sum, s) => sum + s.minutes, 0);
  const invalid = draft.some((s) => !s.label.trim());

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft.map(({ id, label, minutes }) => ({ id, label: label.trim(), minutes })));
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <>
      <ol className="prep-edit">
        {draft.map((s, i) => (
          <li key={s.key} className="prep-edit-row">
            <input
              className="prep-edit-label"
              value={s.label}
              maxLength={24}
              placeholder="step"
              aria-label="Step name"
              onChange={(e) => patch(i, { label: e.target.value })}
            />
            <label className="prep-edit-mins">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={240}
                value={s.minutes}
                aria-label={`${s.label || "step"} minutes`}
                onChange={(e) => patch(i, { minutes: Math.max(0, Math.min(240, Math.round(Number(e.target.value) || 0))) })}
              />
              <span>m</span>
            </label>
            <button type="button" className="prep-edit-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.label} up`}>
              ↑
            </button>
            <button type="button" className="prep-edit-btn" disabled={i === draft.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.label} down`}>
              ↓
            </button>
            <button
              type="button"
              className="prep-edit-btn prep-edit-btn--remove"
              onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
              aria-label={`Remove ${s.label}`}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="prep-edit-add"
        disabled={draft.length >= 30}
        onClick={() => setDraft((d) => [...d, { label: "", minutes: 5, key: `new-${Date.now()}` }])}
      >
        + add step
      </button>
      {error && <div className="error-toast">{error}</div>}
      <div className="sheet-foot">
        <span className="sheet-total">{total}m total</span>
        <button type="button" className="sheet-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="sheet-btn sheet-btn--primary" disabled={saving || invalid} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}

function clock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function History() {
  const p = usePrivacy();
  const [history, setHistory] = useState<PrepHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/prep/history")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`history ${r.status}`))))
      .then(setHistory, (e) => setError(String(e)));
  }, []);

  if (error) return <div className="error-toast">{error}</div>;
  if (!history) return <div className="prep-history-empty">loading…</div>;

  const columns = [...history.steps.map((s) => ({ key: String(s.id), label: s.label, removed: s.removed })), { key: "late", label: "late", removed: false }];

  return (
    <div className="prep-history">
      <table className="prep-avg">
        <tbody>
          {history.steps.map((s) => (
            <tr key={s.id} className={s.removed ? "prep-avg--removed" : ""}>
              <th scope="row">{p.decoy("prep", s.id, s.label)}</th>
              <td className="prep-avg-time">{s.avgDoneMinute == null ? "—" : `~${clock(s.avgDoneMinute)}`}</td>
              <td className="prep-avg-days">
                {s.doneDays}/{history.days.length} days
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="prep-grid-wrap">
        <table className="prep-grid">
          <thead>
            <tr>
              <th />
              {columns.map((c) => (
                <th key={c.key} scope="col" className={c.removed ? "prep-grid-col--removed" : ""}>
                  <span>{p.decoy("prep", c.key, c.label)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.days.map((d) => {
              const date = new Date(`${d.day}T12:00:00Z`);
              return (
                <tr key={d.day}>
                  <th scope="row" className="prep-grid-day">
                    {date.toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" })}{" "}
                    {date.getUTCDate()}
                  </th>
                  {history.steps.map((s) => {
                    const at = d.checks[String(s.id)];
                    return (
                      <td key={s.id} className={at ? "prep-cell prep-cell--done" : "prep-cell"} title={at ? formatTime(at) : undefined}>
                        {at ? formatTime(at) : ""}
                      </td>
                    );
                  })}
                  <td className={d.runningLate ? "prep-cell prep-cell--late" : "prep-cell"}>{d.runningLate ? "late" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
