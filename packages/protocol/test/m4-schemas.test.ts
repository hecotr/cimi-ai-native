import { describe, expect, it } from "vitest";
import type { TSchema } from "typebox";
import * as protocol from "../src/index.js";

const id = (): string => protocol.createInternalId();

const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "b".repeat(64),
  subject
});

const timestamp = "2026-09-20T12:00:00.000Z";

const schemaNamed = (name: string): TSchema => {
  expect(protocol.protocolSchemas).toHaveProperty(name);
  return (protocol.protocolSchemas as Record<string, TSchema>)[name]!;
};

const parseNamed = (name: string, value: unknown): unknown =>
  protocol.compileValidator(schemaNamed(name))(value);

const source = { origin: "system" as const, producer: "m4-schema-test" };

const envelope = (commandType: string, payload: Record<string, unknown>) => ({
  schema_version: protocol.SCHEMA_VERSION,
  command_id: id(),
  correlation_id: id(),
  command_type: commandType,
  requested_at: timestamp,
  actor_id: id(),
  project_id: id(),
  target: { object_type: "change", id: id(), domain_version: 1 },
  expected_revision: 1,
  source,
  payload
});

const validEnvironment = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  environment_key: "acceptance-test",
  kind: "test",
  display_name: "Acceptance Test",
  owner_actor_id: id(),
  adapter_ref: "file://examples/acceptance-target",
  status: "active",
  created_at: timestamp,
  updated_at: timestamp,
  revision: 1
});

const validRelease = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  kind: "test",
  artifact_id: id(),
  artifact_digest: digest("artifact"),
  environment_id: id(),
  contract_id: id(),
  contract_version: 1,
  package_id: id(),
  recovery_strategy_id: id(),
  policy_snapshot_id: id(),
  status: "authorized",
  authorization_digest: digest("release_authorization"),
  created_at: timestamp,
  updated_at: timestamp,
  revision: 1
});

const validReleasePackage = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  release_id: id(),
  artifact_id: id(),
  artifact_digest: digest("artifact"),
  environment_id: id(),
  evidence_package_id: id(),
  scope: { in: ["acceptance.health"], out: ["production.traffic"] },
  window: { starts_at: timestamp, ends_at: "2026-09-21T12:00:00.000Z" },
  recovery_strategy_id: id(),
  digest: digest("release_package"),
  created_at: timestamp
});

const validDeployment = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  release_id: id(),
  environment_id: id(),
  artifact_digest: digest("artifact"),
  status: "unknown",
  created_at: timestamp,
  updated_at: timestamp,
  revision: 1
});

const validDeploymentAttempt = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  deployment_id: id(),
  attempt_kind: "deploy",
  operation_key: "op:deploy:chg:rel:1",
  artifact_digest: digest("artifact"),
  requested_at: timestamp,
  created_at: timestamp
});

const validVerificationResult = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  deployment_id: id(),
  environment_id: id(),
  expected_digest: digest("artifact"),
  actual_digest: digest("artifact"),
  health: "healthy",
  core_path: "pass",
  result: "pass",
  digest: digest("verification"),
  created_at: timestamp
});

const validRecoveryStrategy = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  release_id: id(),
  trigger: "verify_fail",
  kind: "rollback",
  target_digest: digest("known_good_artifact"),
  scope: { in: ["acceptance.service"], out: ["data.restore"] },
  steps: ["restore prior digest", "verify health"],
  verify_checks: ["digest", "health", "core_path"],
  authorization: "preauthorized",
  digest: digest("recovery_strategy"),
  created_at: timestamp
});

const validRecoveryExecution = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  strategy_id: id(),
  source_deployment_id: id(),
  deployment_id: id(),
  status: "authorized",
  created_at: timestamp,
  updated_at: timestamp,
  revision: 1
});

const validReconciliation = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  operation_id: id(),
  conclusion: "still_unknown",
  summary: "adapter timeout; external state not confirmed",
  created_at: timestamp
});

const validExternalOperation = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  operation_key: "op:deploy:chg:rel:1",
  operation_kind: "deploy",
  environment_id: id(),
  release_id: id(),
  deployment_id: id(),
  artifact_digest: digest("artifact"),
  state: "unknown",
  log_reference: "file://logs/deploy-1.log",
  log_digest: digest("deploy_log"),
  summary: "timeout before status",
  created_at: timestamp,
  updated_at: timestamp,
  revision: 1
});

const validAdapterInput = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  operation_key: "op:deploy:chg:rel:1",
  operation: "deploy",
  environment_id: id(),
  release_id: id(),
  artifact_digest: digest("artifact"),
  working_directory: "examples/acceptance-target",
  config_digest: digest("adapter_config"),
  input_reference: "file://ops/deploy.json"
});

const validAdapterResult = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  operation_key: "op:deploy:chg:rel:1",
  state: "unknown",
  log_reference: "file://logs/deploy-1.log",
  log_digest: digest("deploy_log"),
  summary: "process timeout"
});

describe("M4 delivery domain objects", () => {
  it("accepts test and production environment kinds only", () => {
    expect(parseNamed("Environment", validEnvironment())).toMatchObject({ kind: "test" });
    expect(parseNamed("Environment", { ...validEnvironment(), kind: "production", environment_key: "prod" })).toMatchObject({
      kind: "production"
    });
    expect(() => parseNamed("Environment", { ...validEnvironment(), kind: "staging" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("requires a release to bind an immutable artifact digest", () => {
    expect(parseNamed("Release", validRelease())).toMatchObject({
      artifact_digest: { algorithm: "sha256", value: "b".repeat(64) }
    });
    expect(() =>
      parseNamed("Release", { ...validRelease(), artifact_digest: { algorithm: "sha256", value: "not-a-digest", subject: "artifact" } })
    ).toThrow(protocol.ProtocolValidationError);
    expect(() => parseNamed("Release", { ...validRelease(), secret: "deploy-token" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("accepts unknown operation state and rejects undeclared retry fields", () => {
    expect(parseNamed("ExternalOperation", validExternalOperation())).toMatchObject({ state: "unknown" });
    expect(parseNamed("Deployment", validDeployment())).toMatchObject({ status: "unknown" });
    expect(() => parseNamed("ExternalOperation", { ...validExternalOperation(), state: "retrying" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() =>
      parseNamed("ExternalOperation", { ...validExternalOperation(), auto_retry: true, process_env: { TOKEN: "x" } })
    ).toThrow(protocol.ProtocolValidationError);
  });

  it("requires recovery strategy scope, target digest and verify checks", () => {
    expect(parseNamed("RecoveryStrategy", validRecoveryStrategy())).toMatchObject({
      authorization: "preauthorized",
      verify_checks: ["digest", "health", "core_path"]
    });
    expect(() => parseNamed("RecoveryStrategy", { ...validRecoveryStrategy(), scope: { in: [], out: [] } })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("RecoveryStrategy", { ...validRecoveryStrategy(), target_digest: undefined })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("parses the remaining immutable delivery records", () => {
    expect(parseNamed("ReleasePackage", validReleasePackage())).toMatchObject({
      scope: { in: ["acceptance.health"] }
    });
    expect(parseNamed("DeploymentAttempt", validDeploymentAttempt())).toMatchObject({ attempt_kind: "deploy" });
    expect(parseNamed("VerificationResult", validVerificationResult())).toMatchObject({ result: "pass" });
    expect(parseNamed("RecoveryExecution", validRecoveryExecution())).toMatchObject({ status: "authorized" });
    expect(parseNamed("Reconciliation", validReconciliation())).toMatchObject({ conclusion: "still_unknown" });
  });
});

describe("M4 DevOps adapter contracts", () => {
  it("accepts schema-validated adapter input and unknown results", () => {
    expect(parseNamed("DevOpsAdapterInput", validAdapterInput())).toMatchObject({ operation: "deploy" });
    expect(parseNamed("DevOpsAdapterResult", validAdapterResult())).toMatchObject({ state: "unknown" });
    expect(
      parseNamed("DevOpsAdapterResult", {
        ...validAdapterResult(),
        state: "succeeded",
        actual_digest: digest("artifact"),
        health: "healthy",
        core_path: "pass"
      })
    ).toMatchObject({ state: "succeeded" });
  });

  it("rejects adapter payloads that smuggle secrets or process env", () => {
    expect(() => parseNamed("DevOpsAdapterInput", { ...validAdapterInput(), secret: "token" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() =>
      parseNamed("DevOpsAdapterInput", { ...validAdapterInput(), process_env: { CIMI_TOKEN: "hidden" } })
    ).toThrow(protocol.ProtocolValidationError);
    expect(() => parseNamed("DevOpsAdapterResult", { ...validAdapterResult(), env: { PATH: "/usr/bin" } })).toThrow(
      protocol.ProtocolValidationError
    );
  });
});

describe("M4 delivery commands", () => {
  const commands = () => [
    envelope("RegisterEnvironment", {
      environment_key: "acceptance-test",
      kind: "test",
      display_name: "Acceptance Test",
      adapter_ref: "file://examples/acceptance-target"
    }),
    envelope("CreateRelease", {
      change_id: id(),
      kind: "test",
      artifact_id: id(),
      artifact_digest: digest("artifact"),
      environment_id: id(),
      evidence_package_id: id(),
      scope: { in: ["acceptance.health"], out: [] },
      window: { starts_at: timestamp, ends_at: "2026-09-21T12:00:00.000Z" },
      recovery: {
        trigger: "verify_fail",
        kind: "rollback",
        target_digest: digest("known_good_artifact"),
        scope: { in: ["acceptance.service"], out: [] },
        steps: ["restore prior digest"],
        verify_checks: ["digest", "health"],
        authorization: "preauthorized"
      }
    }),
    envelope("RequestReleaseDecision", { release_id: id() }),
    envelope("QueueDeployment", { release_id: id(), environment_id: id() }),
    envelope("RecordOperationResult", {
      operation_id: id(),
      operation_key: "op:deploy:chg:rel:1",
      state: "unknown",
      log_reference: "file://logs/deploy-1.log",
      log_digest: digest("deploy_log"),
      summary: "timeout before status"
    }),
    envelope("RequestReconciliation", { operation_id: id() }),
    envelope("RecordReconciliation", {
      operation_id: id(),
      conclusion: "confirmed_success",
      observed_digest: digest("artifact"),
      observed_state: "succeeded",
      summary: "external digest matches release"
    }),
    envelope("AuthorizeRecovery", {
      release_id: id(),
      strategy_id: id(),
      source_deployment_id: id()
    }),
    envelope("RecordRecovery", {
      execution_id: id(),
      status: "verified",
      verification_id: id()
    })
  ];

  it("parses the nine M4 delivery commands", () => {
    for (const command of commands()) {
      expect(protocol.parseCommand(command)).toMatchObject({ command_type: command.command_type });
    }
  });

  it("requires expected revision and rejects secret command fields", () => {
    const valid = envelope("QueueDeployment", { release_id: id(), environment_id: id() });
    expect(protocol.parseCommand(valid).expected_revision).toBe(1);
    const { expected_revision: _omitted, ...withoutRevision } = valid;
    expect(() => protocol.parseCommand(withoutRevision)).toThrow(protocol.ProtocolValidationError);
    expect(() =>
      protocol.parseCommand(
        envelope("RecordOperationResult", {
          operation_id: id(),
          operation_key: "op:deploy:chg:rel:1",
          state: "succeeded",
          log_reference: "file://logs/deploy-1.log",
          log_digest: digest("deploy_log"),
          summary: "ok",
          secret: "deploy-token"
        })
      )
    ).toThrow(protocol.ProtocolValidationError);
    expect(() =>
      protocol.parseCommand(
        envelope("CreateRelease", {
          change_id: id(),
          kind: "staging",
          artifact_id: id(),
          artifact_digest: digest("artifact"),
          environment_id: id(),
          scope: { in: ["x"], out: [] },
          window: { starts_at: timestamp, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery: {
            trigger: "verify_fail",
            kind: "rollback",
            target_digest: digest("known_good_artifact"),
            scope: { in: ["x"], out: [] },
            steps: ["restore"],
            verify_checks: ["digest"],
            authorization: "preauthorized"
          }
        })
      )
    ).toThrow(protocol.ProtocolValidationError);
  });
});

describe("M4 command success results", () => {
  it("accepts a strict environment, release and unknown operation success payload", () => {
    const environment = validEnvironment();
    const release = validRelease();
    const operation = validExternalOperation();
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "environment", id: environment.id, domain_version: 1 },
        revision: 2,
        events: [],
        data: { environment }
      })
    ).toMatchObject({ ok: true });
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "release", id: release.id, domain_version: 1 },
        revision: 3,
        events: [],
        data: { release, package: validReleasePackage() }
      })
    ).toMatchObject({ ok: true });
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "external_operation", id: operation.id, domain_version: 1 },
        revision: 4,
        events: [],
        data: { operation }
      })
    ).toMatchObject({ ok: true });
  });

  it("rejects success payloads that smuggle secrets or process env", () => {
    expect(() =>
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "environment", id: id(), domain_version: 1 },
        revision: 1,
        events: [],
        data: { environment: validEnvironment(), secret: "token", process_env: { TOKEN: "x" } }
      })
    ).toThrow(protocol.ProtocolValidationError);
  });
});
