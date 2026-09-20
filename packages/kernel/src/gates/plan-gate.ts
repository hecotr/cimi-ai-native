import type { GateResult } from "@cimiloop/protocol";

export interface PlanGateFacts {
  hasCompleteCandidate: boolean;
  hasHumanApproval: boolean;
  digestMatches: boolean;
  rejected: boolean;
}

export const evaluatePlanGate = (facts: PlanGateFacts): GateResult => {
  if (facts.rejected) return "DENY";
  if (!facts.hasCompleteCandidate) return "NEED_MORE_EVIDENCE";
  if (!facts.hasHumanApproval || !facts.digestMatches) return "REQUIRE_HUMAN";
  return "ALLOW";
};
