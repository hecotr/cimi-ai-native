import { Type, type Static } from "typebox";
import { InternalIdSchema, mutatingCommandSchema } from "../schemas.js";
import { DigestSchema, ScopeInOutSchema } from "../m1/common.js";
import { ContentReferenceSchema } from "../m2/common.js";
import {
  EnvironmentKindSchema,
  ExternalOperationStateSchema,
  OperationKeySchema,
  ReconciliationConclusionSchema,
  RecoveryExecutionStatusSchema,
  RecoveryStrategyDraftSchema,
  ReleaseKindSchema,
  ReleaseWindowSchema
} from "./common.js";

export const RegisterEnvironmentCommandSchema = mutatingCommandSchema(
  "RegisterEnvironment",
  Type.Object(
    {
      environment_key: Type.String({ minLength: 1, maxLength: 64 }),
      kind: EnvironmentKindSchema,
      display_name: Type.String({ minLength: 1, maxLength: 200 }),
      adapter_ref: ContentReferenceSchema
    },
    { additionalProperties: false }
  )
);

export const CreateReleaseCommandSchema = mutatingCommandSchema(
  "CreateRelease",
  Type.Object(
    {
      change_id: InternalIdSchema,
      kind: ReleaseKindSchema,
      artifact_id: InternalIdSchema,
      artifact_digest: DigestSchema,
      environment_id: InternalIdSchema,
      evidence_package_id: Type.Optional(InternalIdSchema),
      scope: ScopeInOutSchema,
      window: ReleaseWindowSchema,
      recovery: RecoveryStrategyDraftSchema
    },
    { additionalProperties: false }
  )
);

export const RequestReleaseDecisionCommandSchema = mutatingCommandSchema(
  "RequestReleaseDecision",
  Type.Object({ release_id: InternalIdSchema }, { additionalProperties: false })
);

export const QueueDeploymentCommandSchema = mutatingCommandSchema(
  "QueueDeployment",
  Type.Object(
    {
      release_id: InternalIdSchema,
      environment_id: InternalIdSchema
    },
    { additionalProperties: false }
  )
);

export const RecordOperationResultCommandSchema = mutatingCommandSchema(
  "RecordOperationResult",
  Type.Object(
    {
      operation_id: InternalIdSchema,
      operation_key: OperationKeySchema,
      state: ExternalOperationStateSchema,
      actual_digest: Type.Optional(DigestSchema),
      health: Type.Optional(Type.Union([Type.Literal("healthy"), Type.Literal("unhealthy"), Type.Literal("unknown")])),
      core_path: Type.Optional(Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("unknown")])),
      log_reference: ContentReferenceSchema,
      log_digest: DigestSchema,
      summary: Type.String({ minLength: 1, maxLength: 2000 })
    },
    { additionalProperties: false }
  )
);

export const RequestReconciliationCommandSchema = mutatingCommandSchema(
  "RequestReconciliation",
  Type.Object({ operation_id: InternalIdSchema }, { additionalProperties: false })
);

export const RecordReconciliationCommandSchema = mutatingCommandSchema(
  "RecordReconciliation",
  Type.Object(
    {
      operation_id: InternalIdSchema,
      conclusion: ReconciliationConclusionSchema,
      observed_digest: Type.Optional(DigestSchema),
      observed_state: Type.Optional(ExternalOperationStateSchema),
      summary: Type.String({ minLength: 1, maxLength: 2000 })
    },
    { additionalProperties: false }
  )
);

export const AuthorizeRecoveryCommandSchema = mutatingCommandSchema(
  "AuthorizeRecovery",
  Type.Object(
    {
      release_id: InternalIdSchema,
      strategy_id: InternalIdSchema,
      source_deployment_id: InternalIdSchema
    },
    { additionalProperties: false }
  )
);

export const RecordRecoveryCommandSchema = mutatingCommandSchema(
  "RecordRecovery",
  Type.Object(
    {
      execution_id: InternalIdSchema,
      status: RecoveryExecutionStatusSchema,
      verification_id: Type.Optional(InternalIdSchema)
    },
    { additionalProperties: false }
  )
);

export const m4CommandSchemas = {
  RegisterEnvironmentCommand: RegisterEnvironmentCommandSchema,
  CreateReleaseCommand: CreateReleaseCommandSchema,
  RequestReleaseDecisionCommand: RequestReleaseDecisionCommandSchema,
  QueueDeploymentCommand: QueueDeploymentCommandSchema,
  RecordOperationResultCommand: RecordOperationResultCommandSchema,
  RequestReconciliationCommand: RequestReconciliationCommandSchema,
  RecordReconciliationCommand: RecordReconciliationCommandSchema,
  AuthorizeRecoveryCommand: AuthorizeRecoveryCommandSchema,
  RecordRecoveryCommand: RecordRecoveryCommandSchema
} as const;

export type RegisterEnvironmentCommand = Static<typeof RegisterEnvironmentCommandSchema>;
export type CreateReleaseCommand = Static<typeof CreateReleaseCommandSchema>;
export type RequestReleaseDecisionCommand = Static<typeof RequestReleaseDecisionCommandSchema>;
export type QueueDeploymentCommand = Static<typeof QueueDeploymentCommandSchema>;
export type RecordOperationResultCommand = Static<typeof RecordOperationResultCommandSchema>;
export type RequestReconciliationCommand = Static<typeof RequestReconciliationCommandSchema>;
export type RecordReconciliationCommand = Static<typeof RecordReconciliationCommandSchema>;
export type AuthorizeRecoveryCommand = Static<typeof AuthorizeRecoveryCommandSchema>;
export type RecordRecoveryCommand = Static<typeof RecordRecoveryCommandSchema>;
