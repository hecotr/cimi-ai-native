import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/kernel.js";
import { createPlanningWorkItem } from "../../packages/kernel/src/work-item.js";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Artifact,
  type CommandSuccess,
  type DomainError,
  type GateRequirementSet,
  type InternalId
} from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";

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
  source: { origin: "human_cli" as const, producer: "m4-scenario" },
  payload
});

const recovery = (scope: string) => ({
  trigger: "verify_fail" as const,
  kind: "rollback" as const,
  target_digest: digest("known_good_artifact", "f".repeat(64)),
  scope: { in: [scope], out: [] },
  steps: ["restore prior digest"],
  verify_checks: ["digest" as const, "health" as const],
  authorization: "preauthorized" as const
});

const openHarness = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-scenario-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  openStores.push(store);
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m4-scenario" },
      payload: {
        name: "M4 Scenarios",
        repository_kind: "directory",
        repository_path: directory,
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
      source: { origin: "human_cli" as const, producer: "m4-scenario" },
      payload: { title: "M4 delivery scenarios" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  return {
    store,
    kernel,
    directory,
    projectId: initialized.data.project.id,
    actorId: initialized.data.actor.id,
    roleId: initialized.data.assignment.role_id,
    changeId: created.data.change.id,
    revision: created.data.change.revision
  };
};

const allowArtifact = (
  store: SqliteProjectStore,
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof openHarness>,
  options: { includeKnownGood?: boolean; digestValue?: string } = {}
) => {
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
    digest: digest("artifact", options.digestValue ?? "e".repeat(64)),
    content_reference: "file://artifact.bin",
    created_at: now
  };
  const knownGood: Artifact = {
    ...artifact,
    id: createInternalId(),
    digest: digest("known_good_artifact", "f".repeat(64)),
    summary: "known good artifact"
  };
  let activeSet = requirementSet;
  store.transaction((transaction) => {
    transaction.insertWorkItem(sourceWorkItem);
    const existingSet = transaction.getLatestGateRequirementSet(ctx.changeId);
    if (!existingSet) transaction.insertGateRequirementSet(requirementSet);
    activeSet = existingSet ?? requirementSet;
    artifact.contract_id = activeSet.contract_id;
    transaction.insertArtifact(artifact);
    if (options.includeKnownGood) transaction.insertArtifact(knownGood);
    transaction.insertClaim({
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      claim_key: "AC-1",
      statement: "Artifact is deliverable.",
      category: "intent",
      obligation: "required",
      source: "acceptance",
      contract_id: activeSet.contract_id,
      contract_version: 1,
      requirement_set_id: activeSet.id,
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      created_at: now
    });
    const claim = transaction.listClaimsByChange(ctx.changeId).at(-1);
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
  const current = kernel.getChange(ctx.changeId);
  if ("code" in current) throw new Error(current.code);
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
          requirement_set_id: activeSet.id,
          input_digest: digest("ignored", artifact.digest.value),
          result: "DENY",
          reason: "ignored"
        },
        current.revision,
        ctx.changeId
      )
    )
  );
  const change = kernel.getChange(ctx.changeId);
  if ("code" in change) throw new Error(change.code);
  return { artifact, sourceWorkItem, revision: change.revision };
};

const registerEnv = (
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof openHarness>,
  revision: number,
  key: string,
  kind: "test" | "production"
) => {
  const registered = success(
    kernel.execute(
      envelope(
        "RegisterEnvironment",
        ctx.projectId,
        ctx.actorId,
        {
          environment_key: key,
          kind,
          display_name: key,
          adapter_ref: "file://examples/acceptance-target"
        },
        revision,
        ctx.changeId
      )
    )
  );
  if (!("environment" in registered.data)) throw new Error("missing environment");
  return { revision: registered.revision, environmentId: registered.data.environment.id };
};

const createRelease = (
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof openHarness>,
  revision: number,
  kind: "test" | "production",
  artifact: Artifact,
  environmentId: InternalId,
  scope: string
) => {
  const created = success(
    kernel.execute(
      envelope(
        "CreateRelease",
        ctx.projectId,
        ctx.actorId,
        {
          change_id: ctx.changeId,
          kind,
          artifact_id: artifact.id,
          artifact_digest: artifact.digest,
          environment_id: environmentId,
          scope: { in: [scope], out: [] },
          window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery: recovery(scope)
        },
        revision,
        ctx.changeId
      )
    )
  );
  if (!("release" in created.data)) throw new Error("missing release");
  const recoveryStrategy = "recovery_strategy" in created.data ? created.data.recovery_strategy : undefined;
  return {
    revision: created.revision,
    release: created.data.release,
    ...(recoveryStrategy ? { recovery_strategy: recoveryStrategy } : {})
  };
};

const queue = (
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof openHarness>,
  revision: number,
  releaseId: InternalId,
  environmentId: InternalId
) => {
  const queued = success(
    kernel.execute(
      envelope(
        "QueueDeployment",
        ctx.projectId,
        ctx.actorId,
        { release_id: releaseId, environment_id: environmentId },
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

const record = (
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof openHarness>,
  revision: number,
  operation: { id: InternalId; operation_key: string },
  payload: Record<string, unknown>
) =>
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

const markTestVerified = (store: SqliteProjectStore, releaseId: InternalId) => {
  store.transaction((transaction) => {
    const release = transaction.getRelease(releaseId);
    if (!release) throw new Error("missing test release");
    transaction.updateRelease({ ...release, status: "verified", revision: release.revision + 1 }, release.revision);
  });
};

describe("M4 delivery scenarios", () => {
  it("turns a test verify failure into a repair work item instead of a hot-fix", () => {
    const ctx = openHarness();
    const allowed = allowArtifact(ctx.store, ctx.kernel, ctx);
    const testEnv = registerEnv(ctx.kernel, ctx, allowed.revision, "acceptance-test", "test");
    const created = createRelease(ctx.kernel, ctx, testEnv.revision, "test", allowed.artifact, testEnv.environmentId, "acceptance.health");
    const deploy = queue(ctx.kernel, ctx, created.revision, created.release.id, testEnv.environmentId);
    const deployed = record(ctx.kernel, ctx, deploy.revision, deploy.operation, {
      state: "succeeded",
      actual_digest: allowed.artifact.digest,
      summary: "deployed requested digest"
    });
    const next = queue(ctx.kernel, ctx, deployed.revision, created.release.id, testEnv.environmentId);
    ctx.store.transaction((transaction) => {
      const operation = transaction.getExternalOperation(next.operation.id);
      if (!operation) throw new Error("missing operation");
      transaction.updateExternalOperation(
        { ...operation, operation_kind: "verify", revision: operation.revision + 1 },
        operation.revision
      );
    });
    record(ctx.kernel, ctx, next.revision, next.operation, {
      state: "failed",
      actual_digest: allowed.artifact.digest,
      health: "unhealthy",
      core_path: "fail",
      summary: "test verify failed"
    });
    expect(ctx.store.transaction((transaction) => transaction.listRepairWorkItemLinksByChange(ctx.changeId))).toHaveLength(1);
    expect(ctx.kernel.showRelease(created.release.id)).toMatchObject({ ok: true, release: { kind: "test" } });
  });

  it("promotes production only with the same verified test digest", () => {
    const ctx = openHarness();
    const allowed = allowArtifact(ctx.store, ctx.kernel, ctx);
    const other = allowArtifact(ctx.store, ctx.kernel, ctx, { digestValue: "c".repeat(64) });
    const testEnv = registerEnv(ctx.kernel, ctx, other.revision, "acceptance-test", "test");
    const testRelease = createRelease(ctx.kernel, ctx, testEnv.revision, "test", allowed.artifact, testEnv.environmentId, "acceptance.health");
    markTestVerified(ctx.store, testRelease.release.id);
    const prodEnv = registerEnv(ctx.kernel, ctx, testRelease.revision, "prod", "production");
    const mismatched = ctx.kernel.execute(
      envelope(
        "CreateRelease",
        ctx.projectId,
        ctx.actorId,
        {
          change_id: ctx.changeId,
          kind: "production",
          artifact_id: other.artifact.id,
          artifact_digest: other.artifact.digest,
          environment_id: prodEnv.environmentId,
          scope: { in: ["production.service"], out: [] },
          window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery: recovery("production.service")
        },
        prodEnv.revision,
        ctx.changeId
      )
    );
    expect(mismatched).toMatchObject({ code: "ARTIFACT_DIGEST_MISMATCH" });
    const production = createRelease(ctx.kernel, ctx, prodEnv.revision, "production", allowed.artifact, prodEnv.environmentId, "production.service");
    expect(production.release.status).toBe("drafted");
    expect(production.release.artifact_digest.value).toBe(allowed.artifact.digest.value);
    expect(ctx.kernel.showEnvironment(testEnv.environmentId)).toMatchObject({
      ok: true,
      environment: { kind: "test" }
    });
  });

  it("expires a stale production release decision", () => {
    const ctx = openHarness();
    const allowed = allowArtifact(ctx.store, ctx.kernel, ctx);
    const testEnv = registerEnv(ctx.kernel, ctx, allowed.revision, "acceptance-test", "test");
    const testRelease = createRelease(ctx.kernel, ctx, testEnv.revision, "test", allowed.artifact, testEnv.environmentId, "acceptance.health");
    markTestVerified(ctx.store, testRelease.release.id);
    const prodEnv = registerEnv(ctx.kernel, ctx, testRelease.revision, "prod", "production");
    const drafted = createRelease(ctx.kernel, ctx, prodEnv.revision, "production", allowed.artifact, prodEnv.environmentId, "production.service");
    const requested = success(
      ctx.kernel.execute(
        envelope("RequestReleaseDecision", ctx.projectId, ctx.actorId, { release_id: drafted.release.id }, drafted.revision, ctx.changeId)
      )
    );
    if (!("request" in requested.data)) throw new Error("missing request");
    ctx.store.transaction((transaction) => {
      const release = transaction.getRelease(drafted.release.id);
      if (!release) throw new Error("missing release");
      transaction.updateRelease(
        { ...release, authorization_digest: digest("stale_release", "1".repeat(64)), revision: release.revision + 1 },
        release.revision
      );
    });
    const stale = ctx.kernel.execute(
      envelope(
        "SubmitDecision",
        ctx.projectId,
        ctx.actorId,
        {
          request_id: requested.data.request.id,
          outcome: "approve",
          acting_role_id: ctx.roleId,
          reason: "stale digest must expire"
        },
        requested.revision,
        ctx.changeId
      )
    );
    expect(stale).toMatchObject({ code: "DECISION_REQUEST_EXPIRED" });
  });

  it("reconciles an unknown external result instead of redeploying", () => {
    const ctx = openHarness();
    const allowed = allowArtifact(ctx.store, ctx.kernel, ctx);
    const testEnv = registerEnv(ctx.kernel, ctx, allowed.revision, "acceptance-test", "test");
    const created = createRelease(ctx.kernel, ctx, testEnv.revision, "test", allowed.artifact, testEnv.environmentId, "acceptance.health");
    const deploy = queue(ctx.kernel, ctx, created.revision, created.release.id, testEnv.environmentId);
    const unknown = record(ctx.kernel, ctx, deploy.revision, deploy.operation, {
      state: "unknown",
      summary: "adapter timed out"
    });
    expect(
      ctx.kernel.execute(
        envelope(
          "QueueDeployment",
          ctx.projectId,
          ctx.actorId,
          { release_id: created.release.id, environment_id: testEnv.environmentId },
          unknown.revision,
          ctx.changeId
        )
      )
    ).toMatchObject({ code: "EXTERNAL_OPERATION_UNKNOWN" });
    const requested = success(
      ctx.kernel.execute(
        envelope("RequestReconciliation", ctx.projectId, ctx.actorId, { operation_id: deploy.operation.id }, unknown.revision, ctx.changeId)
      )
    );
    const reconciled = success(
      ctx.kernel.execute(
        envelope(
          "RecordReconciliation",
          ctx.projectId,
          ctx.actorId,
          { operation_id: deploy.operation.id, conclusion: "confirmed_success", summary: "observed the original deploy" },
          requested.revision,
          ctx.changeId
        )
      )
    );
    expect("reconciliation" in reconciled.data).toBe(true);
    const operations = ctx.kernel.listExternalOperationsByChange(ctx.changeId);
    expect(operations.filter((item) => item.operation_kind === "deploy")).toHaveLength(1);
    expect(operations[0]?.state).toBe("succeeded");
    const shown = ctx.kernel.showDeployment(deploy.deployment.id);
    expect(shown).toMatchObject({ ok: true });
  });

  it("recovers a production verify failure without rewriting the failed deployment", () => {
    const ctx = openHarness();
    const allowed = allowArtifact(ctx.store, ctx.kernel, ctx, { includeKnownGood: true });
    const testEnv = registerEnv(ctx.kernel, ctx, allowed.revision, "acceptance-test", "test");
    const testRelease = createRelease(ctx.kernel, ctx, testEnv.revision, "test", allowed.artifact, testEnv.environmentId, "acceptance.health");
    markTestVerified(ctx.store, testRelease.release.id);
    const prodEnv = registerEnv(ctx.kernel, ctx, testRelease.revision, "prod", "production");
    const drafted = createRelease(ctx.kernel, ctx, prodEnv.revision, "production", allowed.artifact, prodEnv.environmentId, "production.service");
    if (!("recovery_strategy" in drafted) || !drafted.recovery_strategy) throw new Error("missing strategy");
    const strategyId = drafted.recovery_strategy.id;
    const requested = success(
      ctx.kernel.execute(
        envelope("RequestReleaseDecision", ctx.projectId, ctx.actorId, { release_id: drafted.release.id }, drafted.revision, ctx.changeId)
      )
    );
    if (!("request" in requested.data)) throw new Error("missing request");
    const approved = success(
      ctx.kernel.execute(
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
    const deploy = queue(ctx.kernel, ctx, approved.revision, drafted.release.id, prodEnv.environmentId);
    const deployed = record(ctx.kernel, ctx, deploy.revision, deploy.operation, {
      state: "succeeded",
      actual_digest: allowed.artifact.digest,
      summary: "deployed"
    });
    const status = queue(ctx.kernel, ctx, deployed.revision, drafted.release.id, prodEnv.environmentId);
    const statused = record(ctx.kernel, ctx, status.revision, status.operation, {
      state: "succeeded",
      actual_digest: allowed.artifact.digest,
      health: "healthy",
      core_path: "pass",
      summary: "status"
    });
    const verify = queue(ctx.kernel, ctx, statused.revision, drafted.release.id, prodEnv.environmentId);
    const failed = record(ctx.kernel, ctx, verify.revision, verify.operation, {
      state: "failed",
      actual_digest: allowed.artifact.digest,
      health: "unhealthy",
      core_path: "fail",
      summary: "production verify failed"
    });
    expect(ctx.store.transaction((transaction) => transaction.listRepairWorkItemLinksByChange(ctx.changeId))).toEqual([]);
    const authorized = success(
      ctx.kernel.execute(
        envelope(
          "AuthorizeRecovery",
          ctx.projectId,
          ctx.actorId,
          {
            release_id: drafted.release.id,
            strategy_id: strategyId,
            source_deployment_id: deploy.deployment.id
          },
          failed.revision,
          ctx.changeId
        )
      )
    );
    expect("recovery_execution" in authorized.data).toBe(true);
    if (!("recovery_execution" in authorized.data)) throw new Error("missing recovery");
    expect(authorized.data.recovery_execution.status).toBe("authorized");
    const deployments = ctx.kernel.listDeploymentsByRelease(drafted.release.id);
    expect(deployments.some((item) => item.id === deploy.deployment.id && item.status === "failed")).toBe(true);
    expect(deployments.length).toBeGreaterThan(1);
    const room = ctx.kernel.getChangeRoom(ctx.changeId);
    expect("ok" in room && room.ok).toBe(true);
    if (!("ok" in room) || !room.ok) throw new Error("missing room");
    expect(room.room.focus).toMatch(/Recovery|Delivery|Deployment|Release/);
  });
});
