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
        <div className="now-header">
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
      <div className="now-header">
        <div className="now-time">{formatTime(currentTime)}</div>
        <div className="now-date">{formatDateLong(currentTime)}</div>
      </div>

      {!anchor && (
        <div className="now-empty">
          <p className="now-empty-line">No anchor today.</p>
          <p className="now-empty-sub">Free time. Don't waste it. Don't over-fill it.</p>
        </div>
      )}

      {anchor && (
        <>
          <div className="now-anchor">
            <div className="now-anchor-label">Next</div>
            <h2 className="now-anchor-title">{anchor.title}</h2>
            <div className="now-anchor-meta">
              <span className="now-anchor-time">{formatTime(anchor.start)}</span>
              {anchor.location && !anchor.isVirtual && (
                <span className="now-anchor-loc">{anchor.location}</span>
              )}
              {anchor.isVirtual && <span className="now-anchor-virtual">virtual</span>}
            </div>
            {timing && (
              <div className="now-anchor-remaining">
                in {formatRemaining(timing.timeRemainingMinutes)}
              </div>
            )}
          </div>

          {hasTravel && travel && (
            <div className="now-travel">
              {travel.defaultMinutes != null && timing?.leaveByDefault && (
                <div className="travel-row travel-row--default">
                  <div className="travel-mode">{travel.defaultMode.toLowerCase()}</div>
                  <div className="travel-value">
                    <span className="travel-minutes">{travel.defaultMinutes} min</span>
                    <span className="travel-leaveby">
                      leave by {formatTime(timing.leaveByDefault)}
                    </span>
                  </div>
                </div>
              )}
              {travel.rescueMinutes != null && timing?.leaveByRescue && (
                <div className="travel-row travel-row--rescue">
                  <div className="travel-mode">{travel.rescueMode.toLowerCase()}</div>
                  <div className="travel-value">
                    <span className="travel-minutes">{travel.rescueMinutes} min</span>
                    <span className="travel-leaveby">
                      leave by {formatTime(timing.leaveByRescue)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {!hasTravel && !anchor.isVirtual && anchor.location && (
            <div className="now-travel-missing">
              {travelError
                ? `Travel lookup failed: ${travelError}`
                : "No travel info — Routes returned no result for this location."}
            </div>
          )}

          {timing?.prepStart && (
            <div className="now-prep">
              <div className="now-prep-label">Prep</div>
              <div className="now-prep-time">{formatTime(timing.prepStart)}</div>
              <div className="now-prep-mins">{timing.prepRequiredMinutes} min</div>
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
