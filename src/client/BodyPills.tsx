import type { PrepToday, PrepUpdate } from "./types";
import { decoyEach, usePrivacy } from "./privacy";

type Props = {
  prep: PrepToday;
  onChange: (u: PrepUpdate) => void;
  onEdit: () => void;
};

export function BodyPills({ prep, onChange, onEdit }: Props) {
  const p = usePrivacy();
  const decoys = decoyEach("prep", [...prep.steps.map((s) => s.id), "late"]);
  return (
    <div className="body-pills">
      {prep.steps.map((step, i) => (
        <button
          key={step.id}
          type="button"
          className={`pill pill--prep ${step.done ? "pill--done" : ""}`}
          onClick={() => onChange({ stepId: step.id, done: !step.done })}
          aria-pressed={step.done}
        >
          <span className="pill-label">{p.on ? decoys[i] : step.label}</span>
          <span className="pill-mins">{step.minutes}m</span>
        </button>
      ))}
      <button
        type="button"
        className={`pill pill--alert ${prep.runningLate ? "pill--alert-on" : ""}`}
        onClick={() => onChange({ runningLate: !prep.runningLate })}
        aria-pressed={prep.runningLate}
      >
        <span className="pill-label">{p.on ? decoys.at(-1) : "late"}</span>
      </button>
      <button type="button" className="pill pill--edit" onClick={onEdit} aria-label="Edit prep steps">
        <span className="pill-label">edit</span>
      </button>
    </div>
  );
}
