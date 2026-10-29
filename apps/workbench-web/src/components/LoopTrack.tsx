import { Tooltip } from "antd";
import { STATIONS, type Holder } from "../lib/flow";

/**
 * The page's signature: the Change's path as a track of stations that closes back on itself.
 * Passed stations are solid ink, the current one glows in the colour of whoever holds the ball.
 */
export function LoopTrack({ current, holder }: { current: number; holder: Holder }) {
  const terminated = current < 0;
  return (
    <div className={`loop-track holder-${holder}${terminated ? " is-terminated" : ""}`} role="list" aria-label="需求推进位置">
      {STATIONS.map((station, index) => {
        const state = terminated ? "future" : index < current ? "done" : index === current ? "current" : "future";
        return (
          <div key={station.key} className={`loop-station is-${state}`} role="listitem" aria-current={state === "current" ? "step" : undefined}>
            <div className="loop-station__rail">
              <span className="loop-station__node">{state === "done" ? <Tick /> : null}</span>
            </div>
            <div className="loop-station__name">{station.name}</div>
            <div className="loop-station__hint">{station.hint}</div>
          </div>
        );
      })}
      <div className="loop-return" aria-hidden><span className="loop-return__label">交付后回到需求池</span></div>
    </div>
  );
}

/** Compact form for lists: six ticks, the current one coloured by holder. */
export function LoopTicks({ current, holder }: { current: number; holder: Holder }) {
  return (
    <Tooltip title={current < 0 ? "已终止" : `当前：${STATIONS[current]?.name}`}>
      <span className={`loop-ticks holder-${holder}`} aria-label={current < 0 ? "已终止" : `当前位置：${STATIONS[current]?.name}`}>
        {STATIONS.map((station, index) => (
          <i key={station.key} className={current < 0 ? "" : index < current ? "is-done" : index === current ? "is-current" : ""} />
        ))}
      </span>
    </Tooltip>
  );
}

const Tick = () => (
  <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden><path d="M2.5 6.2l2.2 2.2L9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export function HolderBadge({ holder, text }: { holder: Holder; text: string }) {
  return <span className={`holder-badge holder-${holder}`}><span className="holder-badge__dot" />{text}</span>;
}
