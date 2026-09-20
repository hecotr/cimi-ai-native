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
import {
  canPromoteProductionDigest,
  productionNeedsRecovery,
  releaseIsVerified
} from "../src/delivery/production.js";
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
  changeId: InternalId,
  origin: "human_cli" | "system" = "human_cli"
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
  source: { origin, producer: "m4-production-test" },
  payload
});

const recovery = {
  trigger: "verify_fail" as const,
  kind: "rollback" as const,
  target_digest: digest("known_good_artifact", "f".repeat(64)),
  scope: { in: ["production.service"], out: [] },
  steps: ["restore prior digest"],
  verify_checks: ["digest" as const, "health" as const, "core_path" as const],
  authorization: "preauthorized" as const
};

const bootstrap = (kernel: CimiLoopKernel, store: SqliteProjectStore) => {
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m4-production-test" },
      payload: {
        name: "M4 Production",
        repository_kind: "directory",
        repository_path: "/tmp/m4-production",
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
      source: { origin: "human_cli" as const, producer: "m4-production-test" },
      payload: { title: "Production Promotion" }
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
  return {
    projectId,
    actorId,
    roleId: releaseRoleId,
    changeId: created.data.change.id,
    revision: created.data.change.revision
  };
};

const allowArtifact = (
  store: SqliteProjectStore,
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof bootstrap>,
  value = "e".repeat(64)
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
    digest: digest("artifact", value),
    content_reference: "file://artifact.bin",
    created_at: now
  };
  let activeSet = requirementSet;
  store.transaction((transaction) => {
    transaction.insertWorkItem(sourceWorkItem);
    const existingSet = transaction.getLatestGateRequirementSet(ctx.changeId);
    if (!existingSet) transaction.insertGateRequirementSet(requirementSet);
    activeSet = existingSet ?? requirementSet;
    artifact.contract_id = activeSet.contract_id;
    transaction.insertArtifact(artifact);
    transaction.insertClaim({
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      claim_key: "AC-1",
      statement: "Artifact 可通过生产发布。",
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
      digest: digest("evidence", value),
      producer_role: "evaluator",
      created_at: now
    });
  });
  const change = kernel.getChange(ctx.changeId);
  if ("code" in change) throw new Error(change.code);
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
          input_digest: digest("ignored"),
          result: "DENY",
          reason: "ignored"
        },
        change.revision,
        ctx.changeId
      )
    )
  );
  const next = kernel.getChange(ctx.changeId);
  if ("code" in next) throw new Error(next.code);
  return { artifact, sourceWorkItem, revision: next.revision };
};

const recordResult = (
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof bootstrap>,
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
        ctx.changeId,
        "system"
      )
    )
  );

const queueNext = (
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof bootstrap>,
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
  if (!("deployment" in queued.data) || !("operation" in queued.data) || !queued.data.operation) {
    throw new Error("missing queued operation");
  }
  return { revision: queued.revision, operation: queued.data.operation };
};

const createEnvironment = (
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof bootstrap>,
  revision: number,
  key: string,
  kind: "test" | "production"
) => {
  const created = success(
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
  if (!("environment" in created.data)) throw new Error("missing environment");
  return { revision: created.revision, environmentId: created.data.environment.id };
};

const createRelease = (
  kernel: CimiLoopKernel,
  ctx: ReturnType<typeof bootstrap>,
  revision: number,
  kind: "test" | "production",
  artifact: Artifact,
  environmentId: InternalId
) => {
  const created = kernel.execute(
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
        scope: { in: [`${kind}.service`], out: [] },
        window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
        recovery
      },
      revision,
      ctx.changeId
    )
  );
  return created;
};

const completePipeline = (
  kernel: CimiLoopKernel,
  store: SqliteProjectStore,
  ctx: ReturnType<typeof bootstrap>,
  revision: number,
  releaseId: InternalId,
  environmentId: InternalId,
  artifactDigest: ReturnType<typeof digest>,
  verify: { state: "succeeded" | "failed"; health?: "healthy" | "unhealthy"; core_path?: "pass" | "fail"; actual?: ReturnType<typeof digest> }
) => {
  const deploy = queueNext(kernel, ctx, revision, releaseId, environmentId);
  expect(deploy.operation.operation_kind).toBe("deploy");
  const deployed = recordResult(kernel, ctx, deploy.revision, deploy.operation, {
    state: "succeeded",
    actual_digest: artifactDigest,
    summary: "deployed requested digest"
  });
  const afterDeploy = store.transaction((transaction) => transaction.getRelease(releaseId));
  expect(releaseIsVerified(afterDeploy!)).toBe(false);

  const status = queueNext(kernel, ctx, deployed.revision, releaseId, environmentId);
  expect(status.operation.operation_kind).toBe("status");
  const statused = recordResult(kernel, ctx, status.revision, status.operation, {
    state: "succeeded",
    actual_digest: artifactDigest,
    health: "healthy",
    core_path: "pass",
    summary: "status healthy"
  });
  expect(releaseIsVerified(store.transaction((transaction) => transaction.getRelease(releaseId))!)).toBe(false);

  const verifyQueued = queueNext(kernel, ctx, statused.revision, releaseId, environmentId);
  expect(verifyQueued.operation.operation_kind).toBe("verify");
  const verified = recordResult(kernel, ctx, verifyQueued.revision, verifyQueued.operation, {
    state: verify.state,
    actual_digest: verify.actual ?? artifactDigest,
    health: verify.health ?? "healthy",
    core_path: verify.core_path ?? "pass",
    summary: verify.state === "succeeded" ? "immediate verify passed" : "immediate verify failed"
  });
  return { verified, release: store.transaction((transaction) => transaction.getRelease(releaseId)) };
};

describe("M4 production promotion helpers", () => {
  it("promotes only a verified test digest and treats health or core-path failure as recovery", () => {
    expect(
      canPromoteProductionDigest(
        [{ kind: "test", status: "verified", artifact_digest: digest("artifact") }],
        digest("artifact")
      )
    ).toBe(true);
    expect(
      canPromoteProductionDigest(
        [{ kind: "test", status: "authorized", artifact_digest: digest("artifact") }],
        digest("artifact")
      )
    ).toBe(false);
    expect(
      canPromoteProductionDigest(
        [{ kind: "test", status: "verified", artifact_digest: digest("artifact") }],
        digest("other", "c".repeat(64))
      )
    ).toBe(false);
    expect(releaseIsVerified({ status: "deploying" })).toBe(false);
    expect(releaseIsVerified({ status: "verified" })).toBe(true);
    expect(productionNeedsRecovery({ state: "failed" })).toBe(true);
    expect(productionNeedsRecovery({ state: "succeeded", health: "unhealthy" })).toBe(true);
    expect(productionNeedsRecovery({ state: "succeeded", core_path: "fail" })).toBe(true);
    expect(productionNeedsRecovery({ state: "succeeded", digest_matches: false })).toBe(true);
    expect(productionNeedsRecovery({ state: "succeeded", health: "healthy", core_path: "pass", digest_matches: true })).toBe(
      false
    );
  });
});

describe("M4 production promotion", () => {
  it("requires the same verified test digest and only verifies after status plus immediate verify", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-prod-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel, store);
    const allowed = allowArtifact(store, kernel, ctx);
    const other = allowArtifact(store, kernel, ctx, "c".repeat(64));
    const testEnv = createEnvironment(kernel, ctx, other.revision, "acceptance-test", "test");
    const testRelease = success(
      createRelease(kernel, ctx, testEnv.revision, "test", allowed.artifact, testEnv.environmentId)
    );
    if (!("release" in testRelease.data)) throw new Error("missing test release");
    const testDone = completePipeline(
      kernel,
      store,
      ctx,
      testRelease.revision,
      testRelease.data.release.id,
      testEnv.environmentId,
      allowed.artifact.digest,
      { state: "succeeded" }
    );
    expect(testDone.release?.status).toBe("verified");

    const prodEnv = createEnvironment(kernel, ctx, testDone.verified.revision, "prod", "production");
    const swapped = createRelease(kernel, ctx, prodEnv.revision, "production", other.artifact, prodEnv.environmentId);
    expect(swapped).toMatchObject({ code: "ARTIFACT_DIGEST_MISMATCH" });

    const drafted = success(
      createRelease(kernel, ctx, prodEnv.revision, "production", allowed.artifact, prodEnv.environmentId)
    );
    if (!("release" in drafted.data)) throw new Error("missing production release");
    const productionReleaseId = drafted.data.release.id;
    expect(drafted.data.release.status).toBe("drafted");
    expect(drafted.data.release.artifact_digest.value).toBe(allowed.artifact.digest.value);
    expect(
      kernel.execute(
        envelope(
          "QueueDeployment",
          ctx.projectId,
          ctx.actorId,
          { release_id: productionReleaseId, environment_id: prodEnv.environmentId },
          drafted.revision,
          ctx.changeId
        )
      )
    ).toMatchObject({ code: "RELEASE_NOT_AUTHORIZED" });

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
            reason: "approve this production release"
          },
          requested.revision,
          ctx.changeId
        )
      )
    );

    const promoted = completePipeline(
      kernel,
      store,
      ctx,
      approved.revision,
      productionReleaseId,
      prodEnv.environmentId,
      allowed.artifact.digest,
      { state: "succeeded" }
    );
    expect(promoted.release?.status).toBe("verified");
    const verifications = store.transaction((transaction) => {
      const deployment = transaction.listDeploymentsByRelease(productionReleaseId).at(-1);
      return deployment ? transaction.listVerificationResultsByDeployment(deployment.id) : [];
    });
    expect(verifications.at(-1)?.result).toBe("pass");
  });

  it("sends production verify failures into recovery instead of a repair work item", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-prod-fail-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel, store);
    const allowed = allowArtifact(store, kernel, ctx);
    const testEnv = createEnvironment(kernel, ctx, allowed.revision, "acceptance-test", "test");
    const testRelease = success(
      createRelease(kernel, ctx, testEnv.revision, "test", allowed.artifact, testEnv.environmentId)
    );
    if (!("release" in testRelease.data)) throw new Error("missing test release");
    const testDone = completePipeline(
      kernel,
      store,
      ctx,
      testRelease.revision,
      testRelease.data.release.id,
      testEnv.environmentId,
      allowed.artifact.digest,
      { state: "succeeded" }
    );
    const prodEnv = createEnvironment(kernel, ctx, testDone.verified.revision, "prod", "production");
    const drafted = success(
      createRelease(kernel, ctx, prodEnv.revision, "production", allowed.artifact, prodEnv.environmentId)
    );
    if (!("release" in drafted.data)) throw new Error("missing production release");
    const failedReleaseId = drafted.data.release.id;
    const requested = success(
      kernel.execute(
        envelope("RequestReleaseDecision", ctx.projectId, ctx.actorId, { release_id: failedReleaseId }, drafted.revision, ctx.changeId)
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
    const failed = completePipeline(
      kernel,
      store,
      ctx,
      approved.revision,
      failedReleaseId,
      prodEnv.environmentId,
      allowed.artifact.digest,
      { state: "failed", health: "unhealthy", core_path: "fail" }
    );
    expect(failed.release?.status).toBe("failed");
    expect(store.transaction((transaction) => transaction.listRepairWorkItemLinksByChange(ctx.changeId))).toEqual([]);
    expect(store.transaction((transaction) => transaction.listOpenBlockers(ctx.changeId)).some((item) => item.code === "PRODUCTION_VERIFICATION_FAILED")).toBe(
      true
    );
  });
});
