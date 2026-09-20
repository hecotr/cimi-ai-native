import { Type, type Static } from "typebox";
import { InternalIdSchema, SCHEMA_VERSION, UtcTimestampSchema } from "../schemas.js";
import { DigestSchema, ImmutableMetadata, MutableMetadata, optionalExtensions, ScopeInOutSchema } from "../m1/common.js";
import { ContentReferenceSchema } from "../m2/common.js";
import {
  CorePathObservationSchema,
  DeploymentAttemptKindSchema,
  DeploymentStatusSchema,
  EnvironmentKindSchema,
  EnvironmentStatusSchema,
  ExternalOperationKindSchema,
  ExternalOperationStateSchema,
  HealthObservationSchema,
  OperationKeySchema,
  RecoveryAuthorizationSchema,
  RecoveryExecutionStatusSchema,
  RecoveryKindSchema,
  RecoveryTriggerSchema,
  ReconciliationConclusionSchema,
  ReleaseKindSchema,
  ReleaseStatusSchema,
  ReleaseWindowSchema,
  VerificationCheckSchema,
  VerificationOutcomeSchema
} from "./common.js";

export const EnvironmentSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    environment_key: Type.String({ minLength: 1, maxLength: 64 }),
    kind: EnvironmentKindSchema,
    display_name: Type.String({ minLength: 1, maxLength: 200 }),
    owner_actor_id: InternalIdSchema,
    adapter_ref: ContentReferenceSchema,
    status: EnvironmentStatusSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ReleaseSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    kind: ReleaseKindSchema,
    artifact_id: InternalIdSchema,
    artifact_digest: DigestSchema,
    environment_id: InternalIdSchema,
    contract_id: InternalIdSchema,
    contract_version: Type.Integer({ minimum: 1 }),
    package_id: Type.Optional(InternalIdSchema),
    recovery_strategy_id: Type.Optional(InternalIdSchema),
    decision_id: Type.Optional(InternalIdSchema),
    evidence_package_id: Type.Optional(InternalIdSchema),
    policy_snapshot_id: InternalIdSchema,
    status: ReleaseStatusSchema,
    authorization_digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ReleasePackageSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    release_id: InternalIdSchema,
    artifact_id: InternalIdSchema,
    artifact_digest: DigestSchema,
    environment_id: InternalIdSchema,
    evidence_package_id: InternalIdSchema,
    scope: ScopeInOutSchema,
    window: ReleaseWindowSchema,
    recovery_strategy_id: InternalIdSchema,
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const DeploymentSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    release_id: InternalIdSchema,
    environment_id: InternalIdSchema,
    artifact_digest: DigestSchema,
    status: DeploymentStatusSchema,
    current_operation_id: Type.Optional(InternalIdSchema),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const DeploymentAttemptSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    deployment_id: InternalIdSchema,
    attempt_kind: DeploymentAttemptKindSchema,
    operation_key: OperationKeySchema,
    artifact_digest: DigestSchema,
    requested_at: UtcTimestampSchema,
    previous_attempt_id: Type.Optional(InternalIdSchema),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const VerificationResultSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    deployment_id: InternalIdSchema,
    environment_id: InternalIdSchema,
    expected_digest: DigestSchema,
    actual_digest: DigestSchema,
    health: HealthObservationSchema,
    core_path: CorePathObservationSchema,
    result: VerificationOutcomeSchema,
    evidence_id: Type.Optional(InternalIdSchema),
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const RecoveryStrategySchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    release_id: InternalIdSchema,
    trigger: RecoveryTriggerSchema,
    kind: RecoveryKindSchema,
    target_digest: DigestSchema,
    scope: ScopeInOutSchema,
    steps: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1 }),
    verify_checks: Type.Array(VerificationCheckSchema, { minItems: 1 }),
    authorization: RecoveryAuthorizationSchema,
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const RecoveryExecutionSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    strategy_id: InternalIdSchema,
    source_deployment_id: InternalIdSchema,
    deployment_id: InternalIdSchema,
    status: RecoveryExecutionStatusSchema,
    authorization_decision_id: Type.Optional(InternalIdSchema),
    verification_id: Type.Optional(InternalIdSchema),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ReconciliationSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    operation_id: InternalIdSchema,
    conclusion: ReconciliationConclusionSchema,
    observed_digest: Type.Optional(DigestSchema),
    observed_state: Type.Optional(ExternalOperationStateSchema),
    summary: Type.String({ minLength: 1, maxLength: 2000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ExternalOperationSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    operation_key: OperationKeySchema,
    operation_kind: ExternalOperationKindSchema,
    environment_id: InternalIdSchema,
    release_id: InternalIdSchema,
    deployment_id: InternalIdSchema,
    artifact_digest: DigestSchema,
    state: ExternalOperationStateSchema,
    log_reference: ContentReferenceSchema,
    log_digest: DigestSchema,
    summary: Type.String({ minLength: 1, maxLength: 2000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const DevOpsAdapterInputSchema = Type.Object(
  {
    schema_version: Type.Literal(SCHEMA_VERSION),
    operation_key: OperationKeySchema,
    operation: ExternalOperationKindSchema,
    environment_id: InternalIdSchema,
    release_id: InternalIdSchema,
    artifact_digest: DigestSchema,
    working_directory: Type.String({ minLength: 1, maxLength: 500 }),
    config_digest: DigestSchema,
    input_reference: ContentReferenceSchema
  },
  { additionalProperties: false }
);

export const DevOpsAdapterResultSchema = Type.Object(
  {
    schema_version: Type.Literal(SCHEMA_VERSION),
    operation_key: OperationKeySchema,
    state: ExternalOperationStateSchema,
    actual_digest: Type.Optional(DigestSchema),
    health: Type.Optional(HealthObservationSchema),
    core_path: Type.Optional(CorePathObservationSchema),
    log_reference: ContentReferenceSchema,
    log_digest: DigestSchema,
    summary: Type.String({ minLength: 1, maxLength: 2000 })
  },
  { additionalProperties: false }
);

export const m4ProtocolSchemas = {
  Environment: EnvironmentSchema,
  Release: ReleaseSchema,
  ReleasePackage: ReleasePackageSchema,
  Deployment: DeploymentSchema,
  DeploymentAttempt: DeploymentAttemptSchema,
  VerificationResult: VerificationResultSchema,
  RecoveryStrategy: RecoveryStrategySchema,
  RecoveryExecution: RecoveryExecutionSchema,
  Reconciliation: ReconciliationSchema,
  ExternalOperation: ExternalOperationSchema,
  DevOpsAdapterInput: DevOpsAdapterInputSchema,
  DevOpsAdapterResult: DevOpsAdapterResultSchema
} as const;

export type Environment = Static<typeof EnvironmentSchema>;
export type Release = Static<typeof ReleaseSchema>;
export type ReleasePackage = Static<typeof ReleasePackageSchema>;
export type Deployment = Static<typeof DeploymentSchema>;
export type DeploymentAttempt = Static<typeof DeploymentAttemptSchema>;
export type VerificationResult = Static<typeof VerificationResultSchema>;
export type RecoveryStrategy = Static<typeof RecoveryStrategySchema>;
export type RecoveryExecution = Static<typeof RecoveryExecutionSchema>;
export type Reconciliation = Static<typeof ReconciliationSchema>;
export type ExternalOperation = Static<typeof ExternalOperationSchema>;
export type DevOpsAdapterInput = Static<typeof DevOpsAdapterInputSchema>;
export type DevOpsAdapterResult = Static<typeof DevOpsAdapterResultSchema>;
