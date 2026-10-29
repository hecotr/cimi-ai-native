import type { Run } from "../api/types";

export type RunFilter = "all" | Run["status"];

/** Keep only runs in the chosen status; "all" keeps every run. */
export const filterRuns = (runs: Run[], filter: RunFilter) => filter === "all" ? runs : runs.filter(run => run.status === filter);
