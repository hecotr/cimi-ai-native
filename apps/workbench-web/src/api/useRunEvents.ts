import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { RunEvent } from "./types";

/** Follows a run's SSE stream. EventSource resumes with Last-Event-ID on its own; we stop at `done`. */
export function useRunEvents(runId: string | undefined) {
  const client = useQueryClient();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [state, setState] = useState<"connecting" | "live" | "ended" | "unavailable">("connecting");

  useEffect(() => {
    if (!runId) return;
    setEvents([]); setState("connecting");
    const source = new EventSource(`/api/agent-runs/${encodeURIComponent(runId)}/events`);
    let failures = 0;
    source.onopen = () => { failures = 0; setState("live"); };
    source.onmessage = message => {
      let event: RunEvent;
      try { event = JSON.parse(message.data) as RunEvent; } catch { return; }
      setEvents(list => list.some(item => item.seq === event.seq) ? list : [...list, event]);
      if (event.type === "done") {
        source.close(); setState("ended");
        void client.invalidateQueries();
      }
      if (event.type === "status" && event.status !== "Running") void client.invalidateQueries();
    };
    source.onerror = () => {
      if (++failures >= 5) { source.close(); setState("unavailable"); }
    };
    return () => source.close();
  }, [runId, client]);

  return { events, state };
}
