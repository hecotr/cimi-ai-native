import { SCHEMA_VERSION, type ContractCandidate, type InternalId, type SubmitContractCandidateCommand } from "@cimiloop/protocol";

export const createContractCandidate = (
  id: InternalId,
  projectId: InternalId,
  changeId: InternalId,
  payload: SubmitContractCandidateCommand["payload"],
  now: string,
  revision = 1
): ContractCandidate => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  change_id: changeId,
  revision,
  created_at: now,
  updated_at: now,
  profile_key: payload.profile_key,
  intent: payload.intent,
  outcomes: payload.outcomes,
  scope: payload.scope,
  non_goals: payload.non_goals,
  acceptance: payload.acceptance,
  constraints: payload.constraints
});
