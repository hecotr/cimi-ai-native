import { SCHEMA_VERSION, type Digest, type InternalId, type WorkItem } from "@cimiloop/protocol";
import { requestDigest } from "./canonical.js";

export const defaultExecutionAuthorization = () => ({
  permission_scope: ["workspace.write", "git.commit"],
  budget: { max_duration_ms: 600_000, max_retries: 2 },
  stop_conditions: ["timeout", "budget_exhausted", "cancel_requested"]
});

export const authorizationDigest = (value: unknown, subject: string): Digest => ({
  algorithm: "sha256",
  value: requestDigest(value),
  subject
});

export const createPlanningWorkItem = (input: {
  id: InternalId;
  projectId: InternalId;
  changeId: InternalId;
  contractId: InternalId;
  contractVersion: number;
  policySnapshotId: InternalId;
  now: string;
}): WorkItem => {
  const authorization = {
    permission_scope: ["workspace.read"],
    budget: { max_duration_ms: 600_000, max_retries: 0 },
    stop_conditions: ["cancel_requested"]
  };
  return {
    schema_version: SCHEMA_VERSION,
    id: input.id,
    project_id: input.projectId,
    change_id: input.changeId,
    kind: "planning",
    status: "ready",
    contract_id: input.contractId,
    contract_version: input.contractVersion,
    policy_snapshot_id: input.policySnapshotId,
    authorized_role_key: "intent_owner",
    ...authorization,
    authorization_digest: authorizationDigest(authorization, "work_item_authorization"),
    created_at: input.now,
    updated_at: input.now,
    revision: 1
  };
};

export const createExecutionWorkItem = (input: {
  id: InternalId;
  projectId: InternalId;
  changeId: InternalId;
  contractId: InternalId;
  contractVersion: number;
  planId: InternalId;
  planVersion: number;
  taskId: InternalId;
  policySnapshotId: InternalId;
  now: string;
}): WorkItem => {
  const authorization = defaultExecutionAuthorization();
  return {
    schema_version: SCHEMA_VERSION,
    id: input.id,
    project_id: input.projectId,
    change_id: input.changeId,
    kind: "execution",
    status: "ready",
    contract_id: input.contractId,
    contract_version: input.contractVersion,
    plan_id: input.planId,
    plan_version: input.planVersion,
    task_id: input.taskId,
    policy_snapshot_id: input.policySnapshotId,
    authorized_role_key: "technical_owner",
    ...authorization,
    authorization_digest: authorizationDigest(authorization, "work_item_authorization"),
    created_at: input.now,
    updated_at: input.now,
    revision: 1
  };
};
