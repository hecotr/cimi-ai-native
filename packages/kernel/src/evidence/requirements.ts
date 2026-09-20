import {
  SCHEMA_VERSION,
  type ChangeProfileKey,
  type ContractVersion,
  type GateRequirementSet,
  type InternalId,
  type PolicySnapshot,
  type RiskAssessment
} from "@cimiloop/protocol";
import { requestDigest } from "../canonical.js";

export interface RequirementResolutionInput {
  id: InternalId;
  now: string;
  version: number;
  profile_key: ChangeProfileKey;
  policy: PolicySnapshot;
  contract: ContractVersion;
  risk: RiskAssessment;
}

const requirementInput = (input: RequirementResolutionInput) => ({
  profile_key: input.profile_key,
  policy_snapshot_id: input.policy.id,
  policy_digest: input.policy.digest.value,
  contract_id: input.contract.contract_id,
  contract_version: input.contract.domain_version,
  acceptance: input.contract.acceptance.map((item) => ({ key: item.key, statement: item.statement })),
  constraints: input.contract.constraints,
  risk: {
    data_exposure: input.risk.dimensions.data_exposure,
    security: input.risk.dimensions.security,
    reliability: input.risk.dimensions.reliability,
    reversibility: input.risk.dimensions.reversibility
  },
  policy_revision: input.policy.policy_revision
});

export const resolveGateRequirementSet = (input: RequirementResolutionInput): GateRequirementSet => {
  const items: GateRequirementSet["items"] = [
    ...input.contract.acceptance.map((criterion) => ({
      claim_key: criterion.key,
      obligation: "required" as const,
      source: "acceptance" as const,
      accepted_evidence_kinds: ["deterministic_test" as const, "evaluator" as const]
    })),
    {
      claim_key: "integrity.digest",
      obligation: "required",
      source: "contract",
      accepted_evidence_kinds: ["deterministic_test"]
    },
    {
      claim_key: "policy.knowledge_closure",
      obligation: "conditional",
      source: "policy",
      accepted_evidence_kinds: ["human", "evaluator"]
    }
  ];
  if (input.risk.dimensions.security !== "none") {
    items.push({
      claim_key: "risk.security",
      obligation: "required",
      source: "risk",
      accepted_evidence_kinds: ["evaluator", "deterministic_test"]
    });
  }
  if (input.risk.dimensions.data_exposure !== "none") {
    items.push({
      claim_key: "risk.data_exposure",
      obligation: "required",
      source: "risk",
      accepted_evidence_kinds: ["evaluator"]
    });
  }
  if (input.profile_key === "incident") {
    items.push({
      claim_key: "recovery.safe_state",
      obligation: "required",
      source: "risk",
      accepted_evidence_kinds: ["human", "evaluator"]
    });
  }
  const body = requirementInput(input);
  return {
    schema_version: SCHEMA_VERSION,
    id: input.id,
    project_id: input.contract.project_id,
    change_id: input.contract.change_id,
    version: input.version,
    profile_key: input.profile_key,
    policy_snapshot_id: input.policy.id,
    contract_id: input.contract.contract_id,
    contract_version: input.contract.domain_version,
    items,
    digest: { algorithm: "sha256", value: requestDigest(body), subject: "gate_requirement_set" },
    created_at: input.now
  };
};
