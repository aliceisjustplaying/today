import type { BodyState, BodyStateUpdate, PrepStep } from "./types";

const SHORT_LABEL: Record<string, string> = {
  eaten: "ate",
  showered: "showered",
  shaved: "shaved",
  dressed: "dressed",
  packed: "packed",
  runningLate: "late",
};

type Props = {
  state: BodyState;
  prepSteps: PrepStep[];
  onChange: (u: BodyStateUpdate) => void;
};

export function BodyPills({ state, prepSteps, onChange }: Props) {
  return (
    <div className="body-pills">
      {prepSteps.map((step) => (
        <button
          key={step.key}
          type="button"
          className={`pill pill--prep ${step.done ? "pill--done" : ""}`}
          onClick={() => onChange({ [step.key]: !step.done })}
          aria-pressed={step.done}
        >
          <span className="pill-label">{SHORT_LABEL[step.key]}</span>
          <span className="pill-mins">{step.minutes}</span>
        </button>
      ))}
      <button
        type="button"
        className={`pill pill--alert ${state.runningLate ? "pill--alert-on" : ""}`}
        onClick={() => onChange({ runningLate: !state.runningLate })}
        aria-pressed={state.runningLate}
      >
        <span className="pill-label">{SHORT_LABEL.runningLate}</span>
      </button>
    </div>
  );
}
