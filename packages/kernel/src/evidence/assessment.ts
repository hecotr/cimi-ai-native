import {
  SCHEMA_VERSION,
  type Claim,
  type ClaimAssessmentResult,
  type Evidence,
  type EvidenceValidity,
  type GateRequirementSet,
  type InternalId
} from "@cimiloop/protocol";

export const assessClaim = (input: {
  claim: Claim;
  requirement?: GateRequirementSet["items"][number];
  evidence: readonly Evidence[];
  validity: Record<string, EvidenceValidity>;
}): { result: ClaimAssessmentResult; evidence_ids: InternalId[] } => {
  const accepted = new Set(input.requirement?.accepted_evidence_kinds ?? ["evaluator", "deterministic_test"]);
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

export const assessRequirementSet = (input: {
  requirementSet: GateRequirementSet;
  claims: readonly Claim[];
  evidence: readonly Evidence[];
  validity: Record<string, EvidenceValidity>;
}): Array<{ claim: Claim; result: ClaimAssessmentResult; evidence_ids: InternalId[] }> =>
  input.requirementSet.items
    .filter((item) => item.obligation === "required")
    .map((requirement) => {
      const claim = input.claims.find((item) => item.claim_key === requirement.claim_key);
      if (!claim) {
        const missing: Claim = {
          schema_version: SCHEMA_VERSION,
          id: input.requirementSet.id,
          project_id: input.requirementSet.project_id,
          change_id: input.requirementSet.change_id,
          claim_key: requirement.claim_key,
          statement: requirement.claim_key,
          category: requirement.source === "acceptance" ? "intent" : "integrity",
          obligation: "required",
          source: requirement.source,
          contract_id: input.requirementSet.contract_id,
          contract_version: input.requirementSet.contract_version,
          created_at: input.requirementSet.created_at
        };
        return { claim: missing, result: "Insufficient", evidence_ids: [] };
      }
      return {
        claim,
        ...assessClaim({
          claim,
          requirement,
          evidence: input.evidence.filter((item) => item.claim_id === claim.id),
          validity: input.validity
        })
      };
    });
