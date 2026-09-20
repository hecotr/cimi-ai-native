import type { Artifact, Digest, InternalId, WorkItem } from "@cimiloop/protocol";

export const EVALUATOR_PERMISSIONS = ["workspace.read", "evidence.record"] as const;

export const planEvaluation = (input: {
  artifact: Artifact;
  requirementSetId: InternalId;
  contractId: InternalId;
  contractVersion: number;
  policySnapshotId: InternalId;
  now: string;
}): Pick<WorkItem, "kind" | "permission_scope" | "extensions"> => ({
  kind: "evaluation",
  permission_scope: [...EVALUATOR_PERMISSIONS],
  extensions: {
    "cimiloop.evaluation": {
      artifact_id: input.artifact.id,
      artifact_digest: input.artifact.digest,
      requirement_set_id: input.requirementSetId
    }
  }
});

export type PlannedEvaluationBinding = {
  artifact_id: InternalId;
  artifact_digest: Digest;
  requirement_set_id: InternalId;
};
