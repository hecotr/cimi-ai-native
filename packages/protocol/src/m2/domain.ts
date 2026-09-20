import { Type, type Static } from "typebox";
import { InternalIdSchema } from "../schemas.js";
import { DigestSchema, GovernanceRoleKeySchema, ImmutableMetadata, MutableMetadata, optionalExtensions } from "../m1/common.js";
import {
  ArtifactStatusSchema,
  BlockerStatusSchema,
  CapabilityIdSchema,
  CapabilitySideEffectSchema,
  ContentReferenceSchema,
  ContextAuthoritySchema,
  ContextFreshnessSchema,
  ContextValiditySchema,
  GitShaSchema,
  LeaseStatusSchema,
  PermissionKeySchema,
  ProviderTypeSchema,
  ResourceLockStatusSchema,
  ResourceTypeSchema,
  RunStatusSchema,
  RunTransitionSchema,
  SnapshotKindSchema,
  WorkItemBudgetSchema,
  WorkItemKindSchema,
  WorkItemStatusSchema
} from "./common.js";

export const ContextSourceSchema = Type.Object(
  {
    key: Type.String({ minLength: 1, maxLength: 64 }),
    authority: ContextAuthoritySchema,
    location_ref: ContentReferenceSchema,
    digest: DigestSchema,
    freshness: ContextFreshnessSchema
  },
  { additionalProperties: false }
);

export const WorkItemSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    kind: WorkItemKindSchema,
    status: WorkItemStatusSchema,
    contract_id: InternalIdSchema,
    contract_version: Type.Integer({ minimum: 1 }),
    plan_id: Type.Optional(InternalIdSchema),
    plan_version: Type.Optional(Type.Integer({ minimum: 1 })),
    task_id: Type.Optional(InternalIdSchema),
    policy_snapshot_id: InternalIdSchema,
    authorized_role_key: GovernanceRoleKeySchema,
    permission_scope: Type.Array(PermissionKeySchema),
    budget: WorkItemBudgetSchema,
    stop_conditions: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { minItems: 1 }),
    authorization_digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const LeaseSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    work_item_id: InternalIdSchema,
    owner_actor_id: InternalIdSchema,
    owner_run_id: Type.Optional(InternalIdSchema),
    status: LeaseStatusSchema,
    acquired_at: ImmutableMetadata.created_at,
    expires_at: ImmutableMetadata.created_at,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ResourceLockSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    resource_type: ResourceTypeSchema,
    resource_key: Type.String({ minLength: 1, maxLength: 300 }),
    holder_work_item_id: InternalIdSchema,
    status: ResourceLockStatusSchema,
    acquired_at: ImmutableMetadata.created_at,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const CapabilityRequirementSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    work_item_id: InternalIdSchema,
    capability_id: CapabilityIdSchema,
    required: Type.Boolean(),
    side_effect: CapabilitySideEffectSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ProviderDescriptorSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    provider_type: ProviderTypeSchema,
    name: Type.String({ minLength: 1, maxLength: 200 }),
    implementation_version: Type.String({ minLength: 1, maxLength: 100 }),
    capability_ids: Type.Array(CapabilityIdSchema, { minItems: 1 }),
    version_digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ContextPackManifestSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    work_item_id: InternalIdSchema,
    contract_id: InternalIdSchema,
    contract_version: Type.Integer({ minimum: 1 }),
    plan_id: Type.Optional(InternalIdSchema),
    plan_version: Type.Optional(Type.Integer({ minimum: 1 })),
    task_id: Type.Optional(InternalIdSchema),
    policy_snapshot_id: InternalIdSchema,
    role_key: GovernanceRoleKeySchema,
    assembly_rule_version: Type.Integer({ minimum: 1 }),
    validity: ContextValiditySchema,
    sources: Type.Array(ContextSourceSchema, { minItems: 1 }),
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const CapabilityBindingSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    work_item_id: InternalIdSchema,
    run_id: InternalIdSchema,
    runtime: ProviderDescriptorSchema,
    model: Type.Optional(ProviderDescriptorSchema),
    skill: Type.Optional(ProviderDescriptorSchema),
    tools: Type.Optional(Type.Array(ProviderDescriptorSchema)),
    adapter: Type.Optional(ProviderDescriptorSchema),
    granted_permissions: Type.Array(PermissionKeySchema),
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const AgentRunRecordSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    work_item_id: InternalIdSchema,
    context_pack_id: Type.Optional(InternalIdSchema),
    binding_id: Type.Optional(InternalIdSchema),
    status: RunStatusSchema,
    attempt: Type.Integer({ minimum: 1 }),
    summary: Type.String({ minLength: 1, maxLength: 2000 }),
    log_reference: ContentReferenceSchema,
    log_digest: DigestSchema,
    started_at: Type.Optional(ImmutableMetadata.created_at),
    ended_at: Type.Optional(ImmutableMetadata.created_at),
    process_reference: Type.Optional(ContentReferenceSchema),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

const snapshotShared = {
  ...ImmutableMetadata,
  id: InternalIdSchema,
  project_id: InternalIdSchema,
  change_id: InternalIdSchema,
  work_item_id: InternalIdSchema,
  run_id: InternalIdSchema,
  digest: DigestSchema,
  content_reference: ContentReferenceSchema
};

export const SourceSnapshotSchema = Type.Union([
  Type.Object(
    {
      ...snapshotShared,
      snapshot_kind: Type.Literal("git_commit"),
      dirty: Type.Literal(false),
      commit_sha: GitShaSchema,
      tree_sha: GitShaSchema,
      ...optionalExtensions
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      ...snapshotShared,
      snapshot_kind: Type.Literal("explicit_dirty_manifest"),
      dirty: Type.Literal(true),
      commit_sha: Type.Optional(GitShaSchema),
      tree_sha: Type.Optional(GitShaSchema),
      ...optionalExtensions
    },
    { additionalProperties: false }
  )
]);

export const ArtifactSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    work_item_id: InternalIdSchema,
    run_id: InternalIdSchema,
    context_pack_id: InternalIdSchema,
    binding_id: InternalIdSchema,
    source_snapshot_id: InternalIdSchema,
    contract_id: InternalIdSchema,
    contract_version: Type.Integer({ minimum: 1 }),
    plan_id: InternalIdSchema,
    plan_version: Type.Integer({ minimum: 1 }),
    status: ArtifactStatusSchema,
    summary: Type.String({ minLength: 1, maxLength: 2000 }),
    digest: DigestSchema,
    content_reference: ContentReferenceSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const FailureSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    work_item_id: Type.Optional(InternalIdSchema),
    run_id: Type.Optional(InternalIdSchema),
    code: Type.String({ pattern: "^[A-Z][A-Z0-9_]+$" }),
    summary: Type.String({ minLength: 1, maxLength: 2000 }),
    details_reference: ContentReferenceSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const BlockerSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    work_item_id: Type.Optional(InternalIdSchema),
    code: Type.String({ pattern: "^[A-Z][A-Z0-9_]+$" }),
    summary: Type.String({ minLength: 1, maxLength: 2000 }),
    status: BlockerStatusSchema,
    resolution_condition: Type.String({ minLength: 1, maxLength: 1000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const m2ProtocolSchemas = {
  WorkItem: WorkItemSchema,
  Lease: LeaseSchema,
  ResourceLock: ResourceLockSchema,
  CapabilityRequirement: CapabilityRequirementSchema,
  ProviderDescriptor: ProviderDescriptorSchema,
  ContextSource: ContextSourceSchema,
  ContextPackManifest: ContextPackManifestSchema,
  CapabilityBinding: CapabilityBindingSchema,
  AgentRunRecord: AgentRunRecordSchema,
  SourceSnapshot: SourceSnapshotSchema,
  Artifact: ArtifactSchema,
  Failure: FailureSchema,
  Blocker: BlockerSchema,
  RunTransition: RunTransitionSchema
} as const;

export type ContextSource = Static<typeof ContextSourceSchema>;
export type WorkItem = Static<typeof WorkItemSchema>;
export type Lease = Static<typeof LeaseSchema>;
export type ResourceLock = Static<typeof ResourceLockSchema>;
export type CapabilityRequirement = Static<typeof CapabilityRequirementSchema>;
export type ProviderDescriptor = Static<typeof ProviderDescriptorSchema>;
export type ContextPackManifest = Static<typeof ContextPackManifestSchema>;
export type CapabilityBinding = Static<typeof CapabilityBindingSchema>;
export type AgentRunRecord = Static<typeof AgentRunRecordSchema>;
export type SourceSnapshot = Static<typeof SourceSnapshotSchema>;
export type Artifact = Static<typeof ArtifactSchema>;
export type Failure = Static<typeof FailureSchema>;
export type Blocker = Static<typeof BlockerSchema>;
