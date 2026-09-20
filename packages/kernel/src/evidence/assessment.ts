import type {
  Claim,
  ClaimAssessmentResult,
  Evidence,
  EvidenceValidity,
  GateRequirementSet,
  InternalId
} from "@cimiloop/protocol";

export const assessClaim = (input: {
  claim: Claim;
  requirement?: GateRequirementSet["items"][number];
  evidence: readonly Evidence[];
  validity: Record<string, EvidenceValidity>;
}): { result: ClaimAssessmentResult; evidence_ids: InternalId[] } => {
  const accepted = new Set(input.requirement?.accepted_evidence_kinds ?? ["evaluator", "deterministic_test", "human"]);
  const applicable = input.evidence.filter((item) => item.claim_id === input.claim.id);
  const valid = applicable.filter((item) => (input.validity[item.id] ?? "Valid") === "Valid");
  const evidence_ids = valid.map((item) => item.id);
  const supports = valid.filter((item) => item.stance === "Supports" && accepted.has(item.producer_role));
  const refutes = valid.filter((item) => item.stance === "Refutes");
  if (supports.length > 0 && refutes.length > 0) {
    return { result: "Conflicted", evidence_ids };
  }
  if (refutes.length > 0) {
    return { result: "Refuted", evidence_ids };
  }
  if (supports.length > 0) {
    return { result: "Satisfied", evidence_ids };
  }
  return { result: "Insufficient", evidence_ids };
};
