import { SCHEMA_VERSION, type Claim, type ContractVersion, type GateRequirementSet, type InternalId } from "@cimiloop/protocol";

const categoryFor = (source: GateRequirementSet["items"][number]["source"]): Claim["category"] => {
  switch (source) {
    case "acceptance":
      return "intent";
    case "contract":
      return "integrity";
    case "risk":
      return "risk";
    case "policy":
      return "boundary";
    case "plan":
      return "technical";
  }
};

export const draftClaimsFromRequirementSet = (input: {
  requirementSet: GateRequirementSet;
  contract: ContractVersion;
  now: string;
  id: (index: number) => InternalId;
}): Claim[] =>
  input.requirementSet.items.map((item, index) => {
    const acceptance = input.contract.acceptance.find((criterion) => criterion.key === item.claim_key);
    return {
      schema_version: SCHEMA_VERSION,
      id: input.id(index),
      project_id: input.requirementSet.project_id,
      change_id: input.requirementSet.change_id,
      claim_key: item.claim_key,
      statement: acceptance?.statement ?? item.claim_key,
      category: categoryFor(item.source),
      obligation: item.obligation,
      source: item.source,
      contract_id: input.contract.contract_id,
      contract_version: input.contract.domain_version,
      requirement_set_id: input.requirementSet.id,
      created_at: input.now
    };
  });
