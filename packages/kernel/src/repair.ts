import { SCHEMA_VERSION, type Digest, type InternalId, type RepairWorkItemLink, type WorkItem } from "@cimiloop/protocol";
import { authorizationDigest, defaultExecutionAuthorization } from "./work-item.js";

export const createRepairWorkItem = (input: {
  id: InternalId;
  projectId: InternalId;
  changeId: InternalId;
  contractId: InternalId;
  contractVersion: number;
  planId: InternalId;
  planVersion: number;
  taskId: InternalId;
  policySnapshotId: InternalId;
  failedArtifactId: InternalId;
  now: string;
}): WorkItem => {
  const authorization = defaultExecutionAuthorization();
  return {
    schema_version: SCHEMA_VERSION,
    id: input.id,
    project_id: input.projectId,
    change_id: input.changeId,
    kind: "repair",
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
    revision: 1,
    extensions: {
      "cimiloop.repair": {
        artifact_id: input.failedArtifactId
      }
    }
  };
};

export const createRepairWorkItemLink = (input: {
  id: InternalId;
  projectId: InternalId;
  changeId: InternalId;
  failedEvidenceId: InternalId;
  sourceWorkItemId: InternalId;
  taskId: InternalId;
  artifactId: InternalId;
  repairWorkItemId: InternalId;
  now: string;
}): RepairWorkItemLink => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.projectId,
  change_id: input.changeId,
  failed_evidence_id: input.failedEvidenceId,
  source_work_item_id: input.sourceWorkItemId,
  task_id: input.taskId,
  artifact_id: input.artifactId,
  repair_work_item_id: input.repairWorkItemId,
  created_at: input.now
});

export const failedArtifactDigestUnchanged = (failed: Digest, next: Digest): boolean =>
  failed.algorithm === next.algorithm && failed.value === next.value;
