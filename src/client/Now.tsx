import type { BodyStateUpdate, NowState } from "./types";
import { BodyPills } from "./BodyPills";
import { formatDateLong, formatRemaining, formatTime } from "./format";

type Props = {
  state: NowState | null;
  onBodyStateChange: (u: BodyStateUpdate) => void;
};

export function Now({ state, onBodyStateChange }: Props) {
  if (!state) {
    return (
      <section className="now now--loading" aria-busy="true">
        <div className="now-head">
          <div className="now-time">--:--</div>
          <div className="now-date">loading…</div>
        </div>
      </section>
    );
  }

  const { currentTime, anchor, travel, timing, bodyState, prepSteps, travelError } = state;
  const hasTravel = travel && (travel.defaultMinutes != null || travel.rescueMinutes != null);

  return (
    <section className="now">
      <div className="now-head">
        <div className="now-time">{formatTime(currentTime)}</div>
        <div className="now-date">{formatDateLong(currentTime)}</div>
      </div>

      {!anchor && (
        <div className="now-empty">
          <span className="now-empty-line">No anchor today.</span>{" "}
          <span className="now-empty-sub">free time.</span>
        </div>
      )}

      {anchor && (
        <>
          <div className="now-anchor">
            <div className="now-anchor-titlerow">
              <span className="now-anchor-label">Next</span>
              {timing && (
                <span className="now-anchor-remaining">
                  in {formatRemaining(timing.timeRemainingMinutes)}
                </span>
              )}
            </div>
            <h2 className="now-anchor-title">{anchor.title}</h2>
            <div className="now-anchor-meta">
              <span className="now-anchor-time">{formatTime(anchor.start)}</span>
              {anchor.location && !anchor.isVirtual && (
                <span className="now-anchor-loc">{anchor.location}</span>
              )}
              {anchor.isVirtual && <span className="now-anchor-virtual">virtual</span>}
            </div>
          </div>

          {hasTravel && travel && (
            <div className="now-travel">
              {travel.defaultMinutes != null && timing?.leaveByDefault && (
                <div className="travel-row travel-row--default">
                  <span className="travel-mode">{travel.defaultMode.toLowerCase()}</span>
                  <span className="travel-minutes">{travel.defaultMinutes}m</span>
                  <span className="travel-leaveby">leave {formatTime(timing.leaveByDefault)}</span>
                </div>
              )}
              {travel.rescueMinutes != null && timing?.leaveByRescue && (
                <div className="travel-row travel-row--rescue">
                  <span className="travel-mode">{travel.rescueMode.toLowerCase()}</span>
                  <span className="travel-minutes">{travel.rescueMinutes}m</span>
                  <span className="travel-leaveby">leave {formatTime(timing.leaveByRescue)}</span>
                </div>
              )}
            </div>
          )}

          {!hasTravel && !anchor.isVirtual && anchor.location && (
            <div className="now-travel-missing">
              {travelError ? `travel: ${travelError}` : "no travel info"}
            </div>
          )}

          {timing?.prepStart && (
            <div className="now-prep">
              <span className="now-prep-label">prep</span>
              <span className="now-prep-time">{formatTime(timing.prepStart)}</span>
              <span className="now-prep-mins">· {timing.prepRequiredMinutes}m needed</span>
            </div>
          )}
        </>
      )}

      <BodyPills
        state={bodyState}
        prepSteps={prepSteps}
        onChange={onBodyStateChange}
      />
    </section>
  );
}
