import {
  SCHEMA_VERSION,
  type ContractAmendment,
  type InternalId,
  type PlanAmendment,
  type SubmitContractAmendmentCommand,
  type SubmitPlanAmendmentCommand
} from "@cimiloop/protocol";

export const nextDomainVersion = (currentVersion: number): number => currentVersion + 1;

export const createContractAmendment = (
  id: InternalId,
  projectId: InternalId,
  changeId: InternalId,
  contractId: InternalId,
  payload: SubmitContractAmendmentCommand["payload"],
  now: string,
  revision = 1
): ContractAmendment => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  change_id: changeId,
  contract_id: contractId,
  revision,
  created_at: now,
  updated_at: now,
  base_version: payload.base_version,
  status: "open",
  profile_key: payload.profile_key,
  intent: payload.intent,
  outcomes: payload.outcomes,
  scope: payload.scope,
  non_goals: payload.non_goals,
  acceptance: payload.acceptance,
  constraints: payload.constraints
});

export const createPlanAmendment = (
  id: InternalId,
  projectId: InternalId,
  changeId: InternalId,
  planId: InternalId,
  contractId: InternalId,
  contractVersion: number,
  payload: SubmitPlanAmendmentCommand["payload"],
  now: string,
  revision = 1
): PlanAmendment => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  change_id: changeId,
  plan_id: planId,
  revision,
  created_at: now,
  updated_at: now,
  base_version: payload.base_version,
  contract_id: contractId,
  contract_version: contractVersion,
  status: "open",
  summary: payload.summary,
  verification_strategy: payload.verification_strategy,
  recovery_considerations: payload.recovery_considerations,
  tasks: payload.tasks
});
