import type { TimelineEvent } from "../demo/types";

export function LifecycleTimeline({
  events,
  onOpenRun
}: {
  events: TimelineEvent[];
  onOpenRun?: (runId: string) => void;
}) {
  return (
    <ol className="timeline" data-testid="lifecycle-timeline">
      {events.map((event, index) => (
        <li key={event.id} className="timeline-item" data-event={event.title}>
          <div className="timeline-rail">
            <span className="timeline-dot" />
            {index < events.length - 1 ? <span className="timeline-line" /> : null}
          </div>
          <div className="timeline-body">
            <div className="tiny">
              {event.at} · {event.category}
            </div>
            <strong>{event.title}</strong>
            <div className="muted">{event.detail}</div>
            {event.runId && onOpenRun ? (
              <button type="button" className="button-ghost" onClick={() => onOpenRun(event.runId!)}>
                查看 {event.runId} 技术明细
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
