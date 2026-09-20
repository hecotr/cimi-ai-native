import { Type, type Static } from "typebox";
import {
  SCHEMA_VERSION,
  compileValidator,
  DigestSchema,
  ExternalOperationStateSchema,
  OperationKeySchema
} from "@cimiloop/protocol";

const ArgSchema = Type.String({ minLength: 1, maxLength: 500, pattern: "^[^|&;<>\\n]+$" });

const OperationArgsSchema = Type.Object(
  {
    args: Type.Array(ArgSchema)
  },
  { additionalProperties: false }
);

export const DevOpsCommandConfigSchema = Type.Object(
  {
    schema_version: Type.Literal(SCHEMA_VERSION),
    executable: Type.String({ minLength: 1, maxLength: 500, pattern: "^[^\\s|&;<>$]+$" }),
    args: Type.Array(ArgSchema),
    working_directory: Type.String({ minLength: 1, maxLength: 500 }),
    log_directory: Type.String({ minLength: 1, maxLength: 500 }),
    timeout_ms: Type.Integer({ minimum: 1 }),
    operations: Type.Object(
      {
        build: OperationArgsSchema,
        deploy: OperationArgsSchema,
        status: OperationArgsSchema,
        verify: OperationArgsSchema,
        recover: OperationArgsSchema,
        reconcile: OperationArgsSchema
      },
      { additionalProperties: false }
    )
  },
  { additionalProperties: false }
);

export const DevOpsScriptResultSchema = Type.Object(
  {
    schema_version: Type.Literal(SCHEMA_VERSION),
    operation_key: OperationKeySchema,
    state: ExternalOperationStateSchema,
    actual_digest: Type.Optional(DigestSchema),
    health: Type.Optional(Type.Union([Type.Literal("healthy"), Type.Literal("unhealthy"), Type.Literal("unknown")])),
    core_path: Type.Optional(Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("unknown")])),
    summary: Type.String({ minLength: 1, maxLength: 2000 })
  },
  { additionalProperties: false }
);

export const parseDevOpsCommandConfig = compileValidator<DevOpsCommandConfig>(DevOpsCommandConfigSchema);
export const parseDevOpsScriptResult = compileValidator<DevOpsScriptResult>(DevOpsScriptResultSchema);

export const redactSecrets = (text: string, secrets: readonly string[]): string => {
  let redacted = text;
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
};

export type DevOpsCommandConfig = Static<typeof DevOpsCommandConfigSchema>;
export type DevOpsScriptResult = Static<typeof DevOpsScriptResultSchema>;
