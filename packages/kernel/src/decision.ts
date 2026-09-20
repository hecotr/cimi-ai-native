import {
  SCHEMA_VERSION,
  type Assignment,
  type Decision,
  type DecisionOutcome,
  type DecisionRequest,
  type Feedback,
  type InternalId,
  type Role
} from "@cimiloop/protocol";
import { requestDigest } from "./canonical.js";

export interface DecisionRequestDigestInput {
  change_id: InternalId;
  candidate_id: InternalId;
  candidate_revision: number;
  profile_id: InternalId;
  profile_version: number;
  risk_assessment_id: InternalId;
  knowledge_assessment_id: InternalId;
  policy_snapshot_id: InternalId;
  required_role_key: DecisionRequest["required_role_key"];
  scope: unknown;
  assignments: Array<{ actor_id: InternalId; role_key: Role["role_key"]; scope_type: Assignment["scope_type"] }>;
}

export const computeDecisionRequestDigest = (input: DecisionRequestDigestInput): string => requestDigest(input);

export const createDecisionRequest = (input: {
  id: InternalId;
  projectId: InternalId;
  changeId: InternalId;
  requestType: DecisionRequest["request_type"];
  requiredRoleKey: DecisionRequest["required_role_key"];
  candidateId: InternalId;
  candidateRevision: number;
  profileId: InternalId;
  profileVersion: number;
  riskAssessmentId: InternalId;
  knowledgeAssessmentId: InternalId;
  policySnapshotId: InternalId;
  digest: string;
  now: string;
}): DecisionRequest => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.projectId,
  change_id: input.changeId,
  revision: 1,
  created_at: input.now,
  updated_at: input.now,
  request_type: input.requestType,
  required_role_key: input.requiredRoleKey,
  candidate_id: input.candidateId,
  candidate_revision: input.candidateRevision,
  profile_id: input.profileId,
  profile_version: input.profileVersion,
  risk_assessment_id: input.riskAssessmentId,
  knowledge_assessment_id: input.knowledgeAssessmentId,
  policy_snapshot_id: input.policySnapshotId,
  digest: { algorithm: "sha256", value: input.digest, subject: `${input.requestType}_decision_request` },
  status: "open"
});

export const createDecisionRecord = (input: {
  id: InternalId;
  request: DecisionRequest;
  actorId: InternalId;
  actingRoleId: InternalId;
  outcome: DecisionOutcome;
  reason: string;
  now: string;
}): Decision => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.request.project_id,
  change_id: input.request.change_id,
  request_id: input.request.id,
  actor_id: input.actorId,
  acting_role_id: input.actingRoleId,
  outcome: input.outcome,
  reason: input.reason,
  created_at: input.now
});

export const createFeedbackRecords = (
  items: Array<{ category: Feedback["category"]; body: string }> | undefined,
  decision: Decision,
  id: () => InternalId
): Feedback[] =>
  (items ?? []).map((item) => ({
    schema_version: SCHEMA_VERSION,
    id: id(),
    project_id: decision.project_id,
    change_id: decision.change_id,
    decision_id: decision.id,
    category: item.category,
    body: item.body,
    created_at: decision.created_at
  }));

export const actorHasRole = (
  assignments: Assignment[],
  roles: Role[],
  actorId: InternalId,
  actingRoleId: InternalId,
  requiredRoleKey: DecisionRequest["required_role_key"]
): boolean => {
  const role = roles.find((item) => item.id === actingRoleId);
  if (!role || role.role_key !== requiredRoleKey) return false;
  return assignments.some((assignment) => assignment.actor_id === actorId && assignment.role_id === actingRoleId);
};
