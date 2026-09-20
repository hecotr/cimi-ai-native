import { Type, type Static } from "typebox";
import {
  DeploymentAttemptSchema,
  DeploymentSchema,
  EnvironmentSchema,
  ExternalOperationSchema,
  RecoveryExecutionSchema,
  RecoveryStrategySchema,
  ReconciliationSchema,
  ReleasePackageSchema,
  ReleaseSchema,
  VerificationResultSchema
} from "./domain.js";

export const M4CommandSuccessDataSchema = Type.Union([
  Type.Object({ environment: EnvironmentSchema }, { additionalProperties: false }),
  Type.Object(
    {
      release: ReleaseSchema,
      package: Type.Optional(ReleasePackageSchema),
      recovery_strategy: Type.Optional(RecoveryStrategySchema)
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      deployment: DeploymentSchema,
      attempt: Type.Optional(DeploymentAttemptSchema),
      operation: Type.Optional(ExternalOperationSchema)
    },
    { additionalProperties: false }
  ),
  Type.Object({ operation: ExternalOperationSchema }, { additionalProperties: false }),
  Type.Object({ verification: VerificationResultSchema }, { additionalProperties: false }),
  Type.Object({ reconciliation: ReconciliationSchema }, { additionalProperties: false }),
  Type.Object({ recovery_execution: RecoveryExecutionSchema }, { additionalProperties: false })
]);

export const EnvironmentShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    environment: EnvironmentSchema
  },
  { additionalProperties: false }
);

export const ReleaseShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    release: ReleaseSchema,
    package: Type.Optional(ReleasePackageSchema)
  },
  { additionalProperties: false }
);

export const DeploymentShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    deployment: DeploymentSchema,
    attempts: Type.Array(DeploymentAttemptSchema),
    operation: Type.Optional(ExternalOperationSchema)
  },
  { additionalProperties: false }
);

export const m4ResultSchemas = {
  EnvironmentShowResult: EnvironmentShowResultSchema,
  ReleaseShowResult: ReleaseShowResultSchema,
  DeploymentShowResult: DeploymentShowResultSchema
} as const;

export type M4CommandSuccessData = Static<typeof M4CommandSuccessDataSchema>;
export type EnvironmentShowResult = Static<typeof EnvironmentShowResultSchema>;
export type ReleaseShowResult = Static<typeof ReleaseShowResultSchema>;
export type DeploymentShowResult = Static<typeof DeploymentShowResultSchema>;
