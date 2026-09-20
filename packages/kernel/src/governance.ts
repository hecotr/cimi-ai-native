import {
  SCHEMA_VERSION,
  type Assignment,
  type ChangeProfile,
  type InternalId,
  type PolicySnapshot,
  type ProjectPolicy,
  type Role
} from "@cimiloop/protocol";
import { SOLO_POLICY_RULES, snapshotDigestFromPolicy } from "./policy.js";

export interface GovernanceIds {
  changeOwnerRoleId: InternalId;
  intentOwnerRoleId: InternalId;
  technicalOwnerRoleId: InternalId;
  releaseOwnerRoleId: InternalId;
  changeOwnerAssignmentId: InternalId;
  intentOwnerAssignmentId: InternalId;
  technicalOwnerAssignmentId: InternalId;
  releaseOwnerAssignmentId: InternalId;
  policyId: InternalId;
  snapshotId: InternalId;
  featureProfileId: InternalId;
  bugfixProfileId: InternalId;
  incidentProfileId: InternalId;
}

export const createSoloRoles = (ids: GovernanceIds, now: string): Role[] => [
  {
    schema_version: SCHEMA_VERSION,
    id: ids.changeOwnerRoleId,
    role_key: "change_owner",
    display_name: "变更负责人",
    created_at: now,
    revision: 1
  },
  {
    schema_version: SCHEMA_VERSION,
    id: ids.intentOwnerRoleId,
    role_key: "intent_owner",
    display_name: "意图负责人",
    created_at: now,
    revision: 1
  },
  {
    schema_version: SCHEMA_VERSION,
    id: ids.technicalOwnerRoleId,
    role_key: "technical_owner",
    display_name: "技术负责人",
    created_at: now,
    revision: 1
  },
  {
    schema_version: SCHEMA_VERSION,
    id: ids.releaseOwnerRoleId,
    role_key: "release_owner",
    display_name: "发布负责人",
    created_at: now,
    revision: 1
  }
];

export const createSoloAssignments = (
  ids: GovernanceIds,
  projectId: InternalId,
  actorId: InternalId,
  now: string
): Assignment[] => [
  {
    schema_version: SCHEMA_VERSION,
    id: ids.changeOwnerAssignmentId,
    project_id: projectId,
    actor_id: actorId,
    role_id: ids.changeOwnerRoleId,
    scope_type: "project",
    scope_id: projectId,
    effective_at: now,
    created_at: now,
    revision: 1
  },
  {
    schema_version: SCHEMA_VERSION,
    id: ids.intentOwnerAssignmentId,
    project_id: projectId,
    actor_id: actorId,
    role_id: ids.intentOwnerRoleId,
    scope_type: "project",
    scope_id: projectId,
    effective_at: now,
    created_at: now,
    revision: 1
  },
  {
    schema_version: SCHEMA_VERSION,
    id: ids.technicalOwnerAssignmentId,
    project_id: projectId,
    actor_id: actorId,
    role_id: ids.technicalOwnerRoleId,
    scope_type: "project",
    scope_id: projectId,
    effective_at: now,
    created_at: now,
    revision: 1
  },
  {
    schema_version: SCHEMA_VERSION,
    id: ids.releaseOwnerAssignmentId,
    project_id: projectId,
    actor_id: actorId,
    role_id: ids.releaseOwnerRoleId,
    scope_type: "project",
    scope_id: projectId,
    effective_at: now,
    created_at: now,
    revision: 1
  }
];

export const createSoloPolicy = (policyId: InternalId, projectId: InternalId, now: string): ProjectPolicy => ({
  schema_version: SCHEMA_VERSION,
  id: policyId,
  project_id: projectId,
  created_at: now,
  updated_at: now,
  revision: 1,
  ...SOLO_POLICY_RULES
});

export const createSoloPolicySnapshot = (
  snapshotId: InternalId,
  policy: ProjectPolicy,
  now: string
): PolicySnapshot => ({
  schema_version: SCHEMA_VERSION,
  id: snapshotId,
  project_id: policy.project_id,
  policy_id: policy.id,
  policy_revision: policy.revision,
  digest: snapshotDigestFromPolicy(policy),
  created_at: now
});

export const createBuiltInChangeProfiles = (
  ids: GovernanceIds,
  projectId: InternalId,
  now: string
): ChangeProfile[] => [
  {
    schema_version: SCHEMA_VERSION,
    id: ids.featureProfileId,
    project_id: projectId,
    profile_key: "feature",
    display_name: "Feature",
    domain_version: 1,
    created_at: now
  },
  {
    schema_version: SCHEMA_VERSION,
    id: ids.bugfixProfileId,
    project_id: projectId,
    profile_key: "bugfix",
    display_name: "Bugfix",
    domain_version: 1,
    created_at: now
  },
  {
    schema_version: SCHEMA_VERSION,
    id: ids.incidentProfileId,
    project_id: projectId,
    profile_key: "incident",
    display_name: "Incident",
    domain_version: 1,
    created_at: now
  }
];
