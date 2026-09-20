import { Type, type Static } from "typebox";
import { DigestSchema, ScopeInOutSchema } from "../m1/common.js";
import { UtcTimestampSchema } from "../schemas.js";

export const EnvironmentKindSchema = Type.Union([Type.Literal("test"), Type.Literal("production")]);

export const EnvironmentStatusSchema = Type.Union([Type.Literal("active"), Type.Literal("retired")]);

export const ReleaseKindSchema = Type.Union([Type.Literal("test"), Type.Literal("production")]);

export const ReleaseStatusSchema = Type.Union([
  Type.Literal("drafted"),
  Type.Literal("authorized"),
  Type.Literal("queued"),
  Type.Literal("deploying"),
  Type.Literal("verified"),
  Type.Literal("failed"),
  Type.Literal("superseded"),
  Type.Literal("cancelled")
]);

export const DeploymentStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("in_progress"),
  Type.Literal("unknown"),
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("recovered")
]);

export const DeploymentAttemptKindSchema = Type.Union([
  Type.Literal("deploy"),
  Type.Literal("verify"),
  Type.Literal("recover"),
  Type.Literal("reconcile")
]);

export const ExternalOperationKindSchema = Type.Union([
  Type.Literal("build"),
  Type.Literal("deploy"),
  Type.Literal("status"),
  Type.Literal("verify"),
  Type.Literal("recover"),
  Type.Literal("reconcile")
]);

export const ExternalOperationStateSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("unknown"),
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("not_found")
]);

export const RecoveryKindSchema = Type.Union([
  Type.Literal("rollback"),
  Type.Literal("roll_forward"),
  Type.Literal("feature_disable"),
  Type.Literal("traffic_shift"),
  Type.Literal("data_restore"),
  Type.Literal("compensation"),
  Type.Literal("manual")
]);

export const RecoveryTriggerSchema = Type.Union([
  Type.Literal("verify_fail"),
  Type.Literal("deploy_fail"),
  Type.Literal("unknown_timeout")
]);

export const RecoveryAuthorizationSchema = Type.Union([
  Type.Literal("preauthorized"),
  Type.Literal("human_required")
]);

export const RecoveryExecutionStatusSchema = Type.Union([
  Type.Literal("authorized"),
  Type.Literal("executing"),
  Type.Literal("verified"),
  Type.Literal("failed"),
  Type.Literal("require_human")
]);

export const ReconciliationConclusionSchema = Type.Union([
  Type.Literal("confirmed_success"),
  Type.Literal("confirmed_failure"),
  Type.Literal("not_found"),
  Type.Literal("still_unknown")
]);

export const VerificationCheckSchema = Type.Union([
  Type.Literal("digest"),
  Type.Literal("health"),
  Type.Literal("core_path")
]);

export const HealthObservationSchema = Type.Union([
  Type.Literal("healthy"),
  Type.Literal("unhealthy"),
  Type.Literal("unknown")
]);

export const CorePathObservationSchema = Type.Union([
  Type.Literal("pass"),
  Type.Literal("fail"),
  Type.Literal("unknown")
]);

export const VerificationOutcomeSchema = Type.Union([
  Type.Literal("pass"),
  Type.Literal("fail"),
  Type.Literal("invalid")
]);

export const ReleaseWindowSchema = Type.Object(
  {
    starts_at: UtcTimestampSchema,
    ends_at: UtcTimestampSchema
  },
  { additionalProperties: false }
);

export const RecoveryStrategyDraftSchema = Type.Object(
  {
    trigger: RecoveryTriggerSchema,
    kind: RecoveryKindSchema,
    target_digest: DigestSchema,
    scope: ScopeInOutSchema,
    steps: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1 }),
    verify_checks: Type.Array(VerificationCheckSchema, { minItems: 1 }),
    authorization: RecoveryAuthorizationSchema
  },
  { additionalProperties: false }
);

export const OperationKeySchema = Type.String({ minLength: 1, maxLength: 200 });

export type EnvironmentKind = Static<typeof EnvironmentKindSchema>;
export type ReleaseKind = Static<typeof ReleaseKindSchema>;
export type ReleaseStatus = Static<typeof ReleaseStatusSchema>;
export type DeploymentStatus = Static<typeof DeploymentStatusSchema>;
export type ExternalOperationKind = Static<typeof ExternalOperationKindSchema>;
export type ExternalOperationState = Static<typeof ExternalOperationStateSchema>;
export type RecoveryKind = Static<typeof RecoveryKindSchema>;
export type RecoveryAuthorization = Static<typeof RecoveryAuthorizationSchema>;
export type RecoveryExecutionStatus = Static<typeof RecoveryExecutionStatusSchema>;
export type ReconciliationConclusion = Static<typeof ReconciliationConclusionSchema>;
export type RecoveryStrategyDraft = Static<typeof RecoveryStrategyDraftSchema>;
export type ReleaseWindow = Static<typeof ReleaseWindowSchema>;
