import type { Change } from "@cimiloop/protocol";

export const CHANGE_LIFECYCLE_STATES = [
  "Draft",
  "IntentReady",
  "Planned",
  "Executing",
  "Evaluating",
  "TestDeploying",
  "TestValidating",
  "ReleaseReady",
  "ProductionDeploying",
  "ReleaseVerified",
  "DeliveryClosed",
  "Cancelled",
  "Superseded"
] as const;

export type ChangeLifecycleState = (typeof CHANGE_LIFECYCLE_STATES)[number];

const AUTHORITATIVE_TRANSITIONS: ReadonlyArray<readonly [ChangeLifecycleState, ChangeLifecycleState]> = [
  ["Draft", "IntentReady"],
  ["IntentReady", "Planned"],
  ["Planned", "Executing"],
  ["Planned", "Evaluating"],
  ["Executing", "Evaluating"],
  ["Evaluating", "TestDeploying"],
  ["Executing", "TestDeploying"],
  ["Evaluating", "Executing"],
  ["TestDeploying", "TestValidating"],
  ["TestDeploying", "Executing"],
  ["TestValidating", "ReleaseReady"],
  ["TestValidating", "Executing"],
  ["TestValidating", "DeliveryClosed"],
  ["ReleaseReady", "ProductionDeploying"],
  ["ReleaseReady", "Executing"],
  ["ProductionDeploying", "ReleaseVerified"],
  ["ProductionDeploying", "Executing"],
  ["ReleaseVerified", "DeliveryClosed"],
  ["Draft", "DeliveryClosed"],
  ["IntentReady", "DeliveryClosed"],
  ["Planned", "DeliveryClosed"],
  ["Executing", "DeliveryClosed"],
  ["Evaluating", "DeliveryClosed"],
  ["TestDeploying", "DeliveryClosed"],
  ["ReleaseReady", "DeliveryClosed"],
  ["ProductionDeploying", "DeliveryClosed"],
  ["Draft", "Cancelled"],
  ["IntentReady", "Cancelled"],
  ["Planned", "Cancelled"],
  ["Executing", "Cancelled"],
  ["Evaluating", "Cancelled"],
  ["TestDeploying", "Cancelled"],
  ["TestValidating", "Cancelled"],
  ["ReleaseReady", "Cancelled"],
  ["ProductionDeploying", "Cancelled"],
  ["ReleaseVerified", "Cancelled"],
  ["Draft", "Superseded"],
  ["IntentReady", "Superseded"],
  ["Planned", "Superseded"],
  ["Executing", "Superseded"],
  ["Evaluating", "Superseded"],
  ["TestDeploying", "Superseded"],
  ["TestValidating", "Superseded"],
  ["ReleaseReady", "Superseded"],
  ["ProductionDeploying", "Superseded"],
  ["ReleaseVerified", "Superseded"]
];

export const isTerminalLifecycle = (state: ChangeLifecycleState): boolean =>
  state === "DeliveryClosed" || state === "Cancelled" || state === "Superseded";

export const canAdvanceLifecycle = (from: ChangeLifecycleState, to: ChangeLifecycleState): boolean =>
  from === to || AUTHORITATIVE_TRANSITIONS.some(([start, end]) => start === from && end === to);

export const nextLifecycle = (
  change: Pick<Change, "lifecycle_state">,
  to: ChangeLifecycleState
): ChangeLifecycleState => {
  const from = change.lifecycle_state as ChangeLifecycleState;
  if (!canAdvanceLifecycle(from, to)) return from;
  return to;
};
