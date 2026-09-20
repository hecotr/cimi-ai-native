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
  source: { origin: "system" as const, producer: "m4-delivery-test" },
  payload
});

const bootstrap = (kernel: CimiLoopKernel) => {
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m4-delivery-test" },
      payload: {
        name: "M4 Delivery",
        repository_kind: "directory",
        repository_path: "/tmp/m4-delivery",
        owner_name: "Owner"
      }
    })
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      actor_id: initialized.data.actor.id,
      project_id: initialized.data.project.id,
      source: { origin: "human_cli" as const, producer: "m4-delivery-test" },
      payload: { title: "Deliver" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  return {
    projectId: initialized.data.project.id,
    actorId: initialized.data.actor.id,
    changeId: created.data.change.id,
    revision: created.data.change.revision
  };
};

const allowArtifact = (store: SqliteProjectStore, kernel: CimiLoopKernel, ctx: ReturnType<typeof bootstrap>) => {
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
    items: [
      {
        claim_key: "AC-1",
        obligation: "required",
        source: "acceptance",
        accepted_evidence_kinds: ["evaluator"]
      }
    ],
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
  store.transaction((transaction) => {
    transaction.insertWorkItem(sourceWorkItem);
    transaction.insertGateRequirementSet(requirementSet);
    transaction.insertArtifact(artifact);
    transaction.insertClaim({
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      claim_key: "AC-1",
      statement: "Artifact 可通过测试部署。",
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
    const claims = transaction.listClaimsByChange(ctx.changeId);
    const claim = claims[0];
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
  const completed = success(
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
        ctx.revision,
        ctx.changeId
      )
    )
  );
  const change = kernel.getChange(ctx.changeId);
  if ("code" in change) throw new Error(change.code);
  return { artifact, sourceWorkItem, revision: change.revision };
};

const recovery = {
  trigger: "verify_fail" as const,
  kind: "rollback" as const,
  target_digest: digest("known_good_artifact", "f".repeat(64)),
  scope: { in: ["acceptance.service"], out: [] },
  steps: ["restore prior digest"],
  verify_checks: ["digest" as const, "health" as const],
  authorization: "preauthorized" as const
};

describe("M4 test release gate", () => {
  it("allows a test release only after M3 ALLOW and rejects a different digest", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-release-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const denied = kernel.execute(
      envelope(
        "CreateRelease",
        ctx.projectId,
        ctx.actorId,
        {
          change_id: ctx.changeId,
          kind: "test",
          artifact_id: createInternalId(),
          artifact_digest: digest("missing"),
          environment_id: createInternalId(),
          scope: { in: ["acceptance.health"], out: [] },
          window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery
        },
        ctx.revision,
        ctx.changeId
      )
    );
    expect(denied).toMatchObject({ code: "ARTIFACT_EVALUATION_NOT_ALLOWED" });

    const allowed = allowArtifact(store, kernel, ctx);
    const environment = success(
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
          allowed.revision,
          ctx.changeId
        )
      )
    );
    expect("environment" in environment.data).toBe(true);
    if (!("environment" in environment.data)) throw new Error("missing environment");

    const created = success(
      kernel.execute(
        envelope(
          "CreateRelease",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            kind: "test",
            artifact_id: allowed.artifact.id,
            artifact_digest: allowed.artifact.digest,
            environment_id: environment.data.environment.id,
            scope: { in: ["acceptance.health"], out: [] },
            window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
            recovery
          },
          environment.revision,
          ctx.changeId
        )
      )
    );
    expect("release" in created.data).toBe(true);
    if (!("release" in created.data)) throw new Error("missing release");
    expect(created.data.release.status).toBe("authorized");
    expect(created.data.release.kind).toBe("test");
    expect(created.data.release.artifact_digest.value).toBe(allowed.artifact.digest.value);
  });

  it("queues a deployment and treats a wrong digest as invalid evidence plus failure", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-queue-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const allowed = allowArtifact(store, kernel, ctx);
    const environment = success(
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
          allowed.revision,
          ctx.changeId
        )
      )
    );
    if (!("environment" in environment.data)) throw new Error("missing environment");
    const created = success(
      kernel.execute(
        envelope(
          "CreateRelease",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            kind: "test",
            artifact_id: allowed.artifact.id,
            artifact_digest: allowed.artifact.digest,
            environment_id: environment.data.environment.id,
            scope: { in: ["acceptance.health"], out: [] },
            window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
            recovery
          },
          environment.revision,
          ctx.changeId
        )
      )
    );
    if (!("release" in created.data)) throw new Error("missing release");
    const queued = success(
      kernel.execute(
        envelope(
          "QueueDeployment",
          ctx.projectId,
          ctx.actorId,
          {
            release_id: created.data.release.id,
            environment_id: environment.data.environment.id
          },
          created.revision,
          ctx.changeId
        )
      )
    );
    expect("deployment" in queued.data).toBe(true);
    if (!("deployment" in queued.data) || !("operation" in queued.data) || !queued.data.operation) {
      throw new Error("missing deployment");
    }
    expect(queued.data.deployment.status).toBe("queued");
    expect(queued.data.operation.state).toBe("pending");
    expect(store.listOutbox("pending").length).toBeGreaterThan(0);

    const mismatch = success(
      kernel.execute(
        envelope(
          "RecordOperationResult",
          ctx.projectId,
          ctx.actorId,
          {
            operation_id: queued.data.operation.id,
            operation_key: queued.data.operation.operation_key,
            state: "succeeded",
            actual_digest: digest("wrong_artifact", "c".repeat(64)),
            log_reference: "file://logs/deploy-wrong.log",
            log_digest: digest("deploy_log"),
            summary: "deployed a different digest"
          },
          queued.revision,
          ctx.changeId
        )
      )
    );
    expect(store.transaction((transaction) => transaction.listOpenBlockers(ctx.changeId)).length).toBeGreaterThan(0);
    expect(store.transaction((transaction) => transaction.listImpactAssessmentsBySubject(allowed.artifact.id)).at(-1)).toMatchObject({
      new_validity: "Invalid"
    });
    expect("operation" in mismatch.data).toBe(true);
  });

  it("creates a repair work item when test verify fails instead of hot-fixing", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-verify-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const allowed = allowArtifact(store, kernel, ctx);
    const environment = success(
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
          allowed.revision,
          ctx.changeId
        )
      )
    );
    if (!("environment" in environment.data)) throw new Error("missing environment");
    const created = success(
      kernel.execute(
        envelope(
          "CreateRelease",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            kind: "test",
            artifact_id: allowed.artifact.id,
            artifact_digest: allowed.artifact.digest,
            environment_id: environment.data.environment.id,
            scope: { in: ["acceptance.health"], out: [] },
            window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
            recovery
          },
          environment.revision,
          ctx.changeId
        )
      )
    );
    if (!("release" in created.data)) throw new Error("missing release");
    const queued = success(
      kernel.execute(
        envelope(
          "QueueDeployment",
          ctx.projectId,
          ctx.actorId,
          {
            release_id: created.data.release.id,
            environment_id: environment.data.environment.id
          },
          created.revision,
          ctx.changeId
        )
      )
    );
    if (!("operation" in queued.data) || !queued.data.operation) throw new Error("missing operation");
    success(
      kernel.execute(
        envelope(
          "RecordOperationResult",
          ctx.projectId,
          ctx.actorId,
          {
            operation_id: queued.data.operation.id,
            operation_key: queued.data.operation.operation_key,
            state: "succeeded",
            actual_digest: allowed.artifact.digest,
            log_reference: "file://logs/deploy.log",
            log_digest: digest("deploy_log"),
            summary: "deployed requested digest"
          },
          queued.revision,
          ctx.changeId
        )
      )
    );
    const change = kernel.getChange(ctx.changeId);
    if ("code" in change) throw new Error(change.code);
    const verifyQueued = success(
      kernel.execute(
        envelope(
          "QueueDeployment",
          ctx.projectId,
          ctx.actorId,
          {
            release_id: created.data.release.id,
            environment_id: environment.data.environment.id
          },
          change.revision,
          ctx.changeId
        )
      )
    );
    if (!("operation" in verifyQueued.data) || !verifyQueued.data.operation) throw new Error("missing verify op");
    const verifyOperationId = verifyQueued.data.operation.id;
    store.transaction((transaction) => {
      const operation = transaction.getExternalOperation(verifyOperationId);
      if (!operation) throw new Error("missing stored operation");
      transaction.updateExternalOperation({ ...operation, operation_kind: "verify", revision: operation.revision + 1 }, operation.revision);
    });
    const failed = success(
      kernel.execute(
        envelope(
          "RecordOperationResult",
          ctx.projectId,
          ctx.actorId,
          {
            operation_id: verifyQueued.data.operation.id,
            operation_key: verifyQueued.data.operation.operation_key,
            state: "failed",
            actual_digest: allowed.artifact.digest,
            health: "unhealthy",
            core_path: "fail",
            log_reference: "file://logs/verify.log",
            log_digest: digest("verify_log"),
            summary: "health failed"
          },
          verifyQueued.revision,
          ctx.changeId
        )
      )
    );
    const repairs = store.transaction((transaction) => transaction.listRepairWorkItemLinksByChange(ctx.changeId));
    expect(repairs.length).toBe(1);
    expect("operation" in failed.data).toBe(true);
  });
});
