import { useEffect, useRef } from "react";
import type { StructuredEvent } from "../demo/types";

export function ToastStack({
  event,
  rejection,
  revision,
  onDismiss
}: {
  event: StructuredEvent | null;
  rejection: string | null;
  revision: number;
  onDismiss: (revision: number) => void;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!event && !rejection) {
      return;
    }
    const startedAt = revision;
    const timer = window.setTimeout(() => onDismissRef.current(startedAt), 8000);
    return () => window.clearTimeout(timer);
  }, [event, rejection, revision]);

  if (!event && !rejection) {
    return null;
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite" data-testid="toast-stack">
      {rejection ? (
        <div className="toast rejection" data-testid="toast-rejection">
          <strong>Command rejected</strong>
          <p style={{ margin: "6px 0 0" }}>{rejection}</p>
        </div>
      ) : null}
      {event ? (
        <div className="toast" data-testid="toast-event">
          <strong>{event.headline}</strong>
          {event.lines.map((line) => (
            <div key={line} className="muted">
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
