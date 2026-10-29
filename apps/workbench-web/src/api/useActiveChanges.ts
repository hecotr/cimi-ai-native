import { useQueries } from "@tanstack/react-query";
import { nextStep, stationIndex, type NextStep } from "../lib/flow";
import { api } from "./client";
import { keys, useDashboard } from "./hooks";
import type { Change, ChangeDetail } from "./types";

export interface ChangeSummary { change: Change; detail?: ChangeDetail; station: number; next?: NextStep }

/** Every non-closed Change with its derived station and next step (one detail read each; local and small). */
export function useActiveChanges() {
  const dashboard = useDashboard();
  const changes = dashboard.data?.flow.changes ?? [];
  const details = useQueries({
    queries: changes.map(change => ({
      queryKey: keys.change(change.id),
      queryFn: () => api<ChangeDetail>(`/api/changes/${encodeURIComponent(change.id)}`),
      enabled: !["Completed", "Terminated"].includes(change.lifecycle_state)
    }))
  });
  const summaries: ChangeSummary[] = changes.map((change, index) => {
    const detail = details[index]?.data;
    return { change, detail, station: stationIndex(change, detail), next: detail ? nextStep(detail) : undefined };
  });
  return { dashboard, summaries, loading: dashboard.isLoading || details.some(query => query.isLoading) };
}
