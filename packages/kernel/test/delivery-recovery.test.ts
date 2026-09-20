import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Artifact,
  type CommandSuccess,
  type DomainError,
  type GateRequirementSet,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../src/kernel.js";
import { failedDeploymentPreserved, recoveryRequiresHuman, recoveryScopeExceeded } from "../src/delivery/recovery.js";
import { createPlanningWorkItem } from "../src/work-item.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T12:00:00.000Z";
const digest = (subject: string, value = "e".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

afterEach(() => {
  while (openStores.length > 0) {
    openStores.pop()?.close();
  }
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  if (!("ok" in result && result.ok)) throw new Error(JSON.stringify(result));
  return result;
};

const envelope = (
  type: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  revision: number,
  changeId: InternalId
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: type,
  requested_at: now,
  actor_id: actorId,
  project_id: projectId,
  expected_revision: revision,
  target: { object_type: "change" as const, id: changeId, domain_version: 1 },
  source: { origin: "human_cli" as const, producer: "m4-recovery-test" },
  payload
});

const recoveryDraft = {
  trigger: "verify_fail" as const,
  kind: "rollback" as const,
  target_digest: digest("known_good_artifact", "f".repeat(64)),
  scope: { in: ["production.service"], out: [] },
  steps: ["restore prior digest"],
  verify_checks: ["digest" as const, "health" as const],
  authorization: "preauthorized" as const
};

describe("M4 recovery helpers", () => {
  it("requires a human when recovery leaves the preauthorized envelope", () => {
    expect(
      recoveryRequiresHuman({
        authorization: "preauthorized",
        targetAvailable: true,
        strategyCurrent: true,
        scopeExceeded: false
      })
    ).toBe(false);
    expect(
      recoveryRequiresHuman({
        authorization: "human_required",
        targetAvailable: true,
        strategyCurrent: true,
        scopeExceeded: false
      })
    ).toBe(true);
    expect(recoveryScopeExceeded({ in: ["production.service", "other"], out: [] }, { in: ["production.service"], out: [] })).toBe(
      true
    );
    expect(failedDeploymentPreserved({ id: "failed", status: "failed" }, { id: "recovery" })).toBe(true);
  });
});

const prepareFailedProduction = (store: SqliteProjectStore, kernel: CimiLoopKernel) => {
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m4-recovery-test" },
      payload: {
        name: "M4 Recovery",
        repository_kind: "directory",
        repository_path: "/tmp/m4-recovery",
        owner_name: "Owner"
      }
    })
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data) || !("assignment" in initialized.data)) {
    throw new Error("missing project");
  }
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      actor_id: initialized.data.actor.id,
      project_id: initialized.data.project.id,
      source: { origin: "human_cli" as const, producer: "m4-recovery-test" },
      payload: { title: "Recover" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const releaseRoleId = createInternalId();
  store.transaction((transaction) => {
    transaction.insertRole({
      schema_version: SCHEMA_VERSION,
      id: releaseRoleId,
      role_key: "release_owner",
      display_name: "发布负责人",
      created_at: now,
      revision: 1
    });
    transaction.insertAssignment({
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: projectId,
      actor_id: actorId,
      role_id: releaseRoleId,
      scope_type: "project",
      scope_id: projectId,
      effective_at: now,
      created_at: now,
      revision: 1
    });
  });
  const ctx = {
    projectId,
    actorId,
    roleId: releaseRoleId,
    changeId: created.data.change.id
  };
  const sourceWorkItem = createPlanningWorkItem({
    id: createInternalId(),
    projectId: ctx.projectId,
    changeId: ctx.changeId,
    contractId: createInternalId(),
    contractVersion: 1,
    policySnapshotId: createInternalId(),
    now
  });
  const requirementSet: GateRequirementSet = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: ctx.projectId,
    change_id: ctx.changeId,
    version: 1,
    profile_key: "feature",
    policy_snapshot_id: sourceWorkItem.policy_snapshot_id,
    contract_id: sourceWorkItem.contract_id,
    contract_version: 1,
    items: [{ claim_key: "AC-1", obligation: "required", source: "acceptance", accepted_evidence_kinds: ["evaluator"] }],
    digest: digest("requirement_set"),
    created_at: now
  };
  const artifact: Artifact = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: ctx.projectId,
    change_id: ctx.changeId,
    work_item_id: sourceWorkItem.id,
    run_id: createInternalId(),
    context_pack_id: createInternalId(),
    binding_id: createInternalId(),
    source_snapshot_id: createInternalId(),
    contract_id: requirementSet.contract_id,
    contract_version: 1,
    plan_id: createInternalId(),
    plan_version: 1,
    status: "candidate",
    summary: "candidate artifact",
    digest: digest("artifact"),
    content_reference: "file://artifact.bin",
    created_at: now
  };
  const knownGood: Artifact = {
    ...artifact,
    id: createInternalId(),
    digest: digest("known_good_artifact", "f".repeat(64)),
    summary: "known good artifact"
  };
  store.transaction((transaction) => {
    transaction.insertWorkItem(sourceWorkItem);
    transaction.insertGateRequirementSet(requirementSet);
    transaction.insertArtifact(artifact);
    transaction.insertArtifact(knownGood);
    transaction.insertClaim({
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      claim_key: "AC-1",
      statement: "Artifact 可恢复。",
      category: "intent",
      obligation: "required",
      source: "acceptance",
      contract_id: requirementSet.contract_id,
      contract_version: 1,
      requirement_set_id: requirementSet.id,
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      created_at: now
    });
    const claim = transaction.listClaimsByChange(ctx.changeId)[0];
    if (!claim) throw new Error("missing claim");
    transaction.insertEvidence({
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      claim_id: claim.id,
      stance: "Supports",
      subject_type: "artifact",
      subject_id: artifact.id,
      subject_digest: artifact.digest,
      content_reference: "cimi-object://evidence/allow",
      digest: digest("evidence"),
      producer_role: "evaluator",
      created_at: now
    });
  });
  success(
    kernel.execute(
      envelope(
        "CompleteEvaluation",
        ctx.projectId,
        ctx.actorId,
        {
          change_id: ctx.changeId,
          evaluation_id: createInternalId(),
          artifact_id: artifact.id,
          artifact_digest: artifact.digest,
          requirement_set_id: requirementSet.id,
          input_digest: digest("ignored"),
          result: "DENY",
          reason: "ignored"
        },
        created.data.change.revision,
        ctx.changeId
      )
    )
  );
  const afterEval = kernel.getChange(ctx.changeId);
  if ("code" in afterEval) throw new Error(afterEval.code);
  const testEnv = success(
    kernel.execute(
      envelope(
        "RegisterEnvironment",
        ctx.projectId,
        ctx.actorId,
        {
          environment_key: "acceptance-test",
          kind: "test",
          display_name: "Acceptance Test",
          adapter_ref: "file://examples/acceptance-target"
        },
        afterEval.revision,
        ctx.changeId
      )
    )
  );
  if (!("environment" in testEnv.data)) throw new Error("missing test env");
  const testRelease = success(
    kernel.execute(
      envelope(
        "CreateRelease",
        ctx.projectId,
        ctx.actorId,
        {
          change_id: ctx.changeId,
          kind: "test",
          artifact_id: artifact.id,
          artifact_digest: artifact.digest,
          environment_id: testEnv.data.environment.id,
          scope: { in: ["acceptance.service"], out: [] },
          window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery: recoveryDraft
        },
        testEnv.revision,
        ctx.changeId
      )
    )
  );
  if (!("release" in testRelease.data)) throw new Error("missing test release");
  const verifiedTestReleaseId = testRelease.data.release.id;
  store.transaction((transaction) => {
    const release = transaction.getRelease(verifiedTestReleaseId);
    if (!release) throw new Error("missing stored test release");
    transaction.updateRelease({ ...release, status: "verified", revision: release.revision + 1 }, release.revision);
  });
  const prodEnv = success(
    kernel.execute(
      envelope(
        "RegisterEnvironment",
        ctx.projectId,
        ctx.actorId,
        {
          environment_key: "prod",
          kind: "production",
          display_name: "Production",
          adapter_ref: "file://examples/acceptance-target"
        },
        testRelease.revision,
        ctx.changeId
      )
    )
  );
  if (!("environment" in prodEnv.data)) throw new Error("missing prod env");
  const productionEnvironmentId = prodEnv.data.environment.id;
  const drafted = success(
    kernel.execute(
      envelope(
        "CreateRelease",
        ctx.projectId,
        ctx.actorId,
        {
          change_id: ctx.changeId,
          kind: "production",
          artifact_id: artifact.id,
          artifact_digest: artifact.digest,
          environment_id: productionEnvironmentId,
          scope: { in: ["production.service"], out: [] },
          window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery: recoveryDraft
        },
        prodEnv.revision,
        ctx.changeId
      )
    )
  );
  if (!("release" in drafted.data) || !("recovery_strategy" in drafted.data) || !drafted.data.recovery_strategy) {
    throw new Error("missing production release");
  }
  const productionReleaseId = drafted.data.release.id;
  const strategyId = drafted.data.recovery_strategy.id;
  const requested = success(
    kernel.execute(
      envelope("RequestReleaseDecision", ctx.projectId, ctx.actorId, { release_id: productionReleaseId }, drafted.revision, ctx.changeId)
    )
  );
  if (!("request" in requested.data)) throw new Error("missing request");
  const approved = success(
    kernel.execute(
      envelope(
        "SubmitDecision",
        ctx.projectId,
        ctx.actorId,
        {
          request_id: requested.data.request.id,
          outcome: "approve",
          acting_role_id: ctx.roleId,
          reason: "approve production"
        },
        requested.revision,
        ctx.changeId
      )
    )
  );
  const queue = (revision: number) => {
    const queued = success(
      kernel.execute(
        envelope(
          "QueueDeployment",
          ctx.projectId,
          ctx.actorId,
          { release_id: productionReleaseId, environment_id: productionEnvironmentId },
          revision,
          ctx.changeId
        )
      )
    );
    if (!("operation" in queued.data) || !queued.data.operation || !("deployment" in queued.data)) {
      throw new Error("missing queued operation");
    }
    return { revision: queued.revision, operation: queued.data.operation, deployment: queued.data.deployment };
  };
  const record = (revision: number, operation: { id: InternalId; operation_key: string }, payload: Record<string, unknown>) =>
    success(
      kernel.execute(
        envelope(
          "RecordOperationResult",
          ctx.projectId,
          ctx.actorId,
          {
            operation_id: operation.id,
            operation_key: operation.operation_key,
            log_reference: "file://logs/op.log",
            log_digest: digest("op_log"),
            ...payload
          },
          revision,
          ctx.changeId
        )
      )
    );
  const deploy = queue(approved.revision);
  const deployed = record(deploy.revision, deploy.operation, {
    state: "succeeded",
    actual_digest: artifact.digest,
    summary: "deployed"
  });
  const status = queue(deployed.revision);
  const statused = record(status.revision, status.operation, {
    state: "succeeded",
    actual_digest: artifact.digest,
    health: "healthy",
    core_path: "pass",
    summary: "status"
  });
  const verify = queue(statused.revision);
  const failed = record(verify.revision, verify.operation, {
    state: "failed",
    health: "unhealthy",
    core_path: "fail",
    actual_digest: artifact.digest,
    summary: "production verify failed"
  });
  return {
    ctx,
    artifact,
    knownGood,
    releaseId: productionReleaseId,
    strategyId,
    sourceDeploymentId: deploy.deployment.id,
    environmentId: productionEnvironmentId,
    revision: failed.revision
  };
};

describe("M4 production recovery", () => {
  it("executes a preauthorized recovery as a new attempt and keeps the failed deployment", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-recovery-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const failed = prepareFailedProduction(store, kernel);
    const authorized = success(
      kernel.execute(
        envelope(
          "AuthorizeRecovery",
          failed.ctx.projectId,
          failed.ctx.actorId,
          {
            release_id: failed.releaseId,
            strategy_id: failed.strategyId,
            source_deployment_id: failed.sourceDeploymentId
          },
          failed.revision,
          failed.ctx.changeId
        )
      )
    );
    expect("recovery_execution" in authorized.data).toBe(true);
    if (!("recovery_execution" in authorized.data)) throw new Error("missing execution");
    expect(authorized.data.recovery_execution.status).toBe("authorized");
    const source = store.transaction((transaction) => transaction.getDeployment(failed.sourceDeploymentId));
    const recoveries = store.transaction((transaction) => transaction.listDeploymentsByRelease(failed.releaseId));
    const recoveryDeployment = recoveries.find((item) => item.id !== failed.sourceDeploymentId);
    expect(source?.status).toBe("failed");
    expect(recoveryDeployment).toBeTruthy();
    expect(failedDeploymentPreserved(source!, recoveryDeployment!)).toBe(true);
    const recorded = success(
      kernel.execute(
        envelope(
          "RecordRecovery",
          failed.ctx.projectId,
          failed.ctx.actorId,
          { execution_id: authorized.data.recovery_execution.id, status: "verified" },
          authorized.revision,
          failed.ctx.changeId
        )
      )
    );
    expect("recovery_execution" in recorded.data).toBe(true);
    if (!("recovery_execution" in recorded.data)) throw new Error("missing recorded execution");
    expect(recorded.data.recovery_execution.status).toBe("verified");
    expect(store.transaction((transaction) => transaction.getDeployment(recoveryDeployment!.id))?.status).toBe("recovered");
  });

  it("returns require_human when recovery scope exceeds the authorized strategy", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-recovery-human-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const failed = prepareFailedProduction(store, kernel);
    const widenedId = store.transaction((transaction) => {
      const original = transaction.getRecoveryStrategy(failed.strategyId);
      if (!original) throw new Error("missing strategy");
      const nextId = createInternalId();
      transaction.insertRecoveryStrategy({
        ...original,
        id: nextId,
        scope: { in: ["production.service", "production.database"], out: [] }
      });
      return nextId;
    });
    const human = success(
      kernel.execute(
        envelope(
          "AuthorizeRecovery",
          failed.ctx.projectId,
          failed.ctx.actorId,
          {
            release_id: failed.releaseId,
            strategy_id: widenedId,
            source_deployment_id: failed.sourceDeploymentId
          },
          failed.revision,
          failed.ctx.changeId
        )
      )
    );
    expect("recovery_execution" in human.data).toBe(true);
    if (!("recovery_execution" in human.data)) throw new Error("missing human execution");
    expect(human.data.recovery_execution.status).toBe("require_human");
    expect(store.transaction((transaction) => transaction.listDeploymentsByRelease(failed.releaseId))).toHaveLength(1);
  });
});
