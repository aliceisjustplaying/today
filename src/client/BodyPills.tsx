import type { PrepToday, PrepUpdate } from "./types";

type Props = {
  prep: PrepToday;
  onChange: (u: PrepUpdate) => void;
  onEdit: () => void;
};

export function BodyPills({ prep, onChange, onEdit }: Props) {
  return (
    <div className="body-pills">
      {prep.steps.map((step) => (
        <button
          key={step.id}
          type="button"
          className={`pill pill--prep ${step.done ? "pill--done" : ""}`}
          onClick={() => onChange({ stepId: step.id, done: !step.done })}
          aria-pressed={step.done}
        >
          <span className="pill-label">{step.label}</span>
          <span className="pill-mins">{step.minutes}m</span>
        </button>
      ))}
      <button
        type="button"
        className={`pill pill--alert ${prep.runningLate ? "pill--alert-on" : ""}`}
        onClick={() => onChange({ runningLate: !prep.runningLate })}
        aria-pressed={prep.runningLate}
      >
        <span className="pill-label">late</span>
      </button>
      <button type="button" className="pill pill--edit" onClick={onEdit} aria-label="Edit prep steps">
        <span className="pill-label">edit</span>
      </button>
    </div>
  );
}
