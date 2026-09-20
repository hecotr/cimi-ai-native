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
import { conclusionToOperationState, reconciliationResolvesBlocker } from "../src/delivery/reconciliation.js";
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
  source: { origin: "system" as const, producer: "m4-reconciliation-test" },
  payload
});

const recovery = {
  trigger: "unknown_timeout" as const,
  kind: "rollback" as const,
  target_digest: digest("known_good_artifact", "f".repeat(64)),
  scope: { in: ["acceptance.service"], out: [] },
  steps: ["query operation key"],
  verify_checks: ["digest" as const],
  authorization: "preauthorized" as const
};

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
      source: { origin: "human_cli" as const, producer: "m4-reconciliation-test" },
      payload: {
        name: "M4 Reconciliation",
        repository_kind: "directory",
        repository_path: "/tmp/m4-reconciliation",
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
      source: { origin: "human_cli" as const, producer: "m4-reconciliation-test" },
      payload: { title: "Reconcile" }
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

const allowAndQueue = (store: SqliteProjectStore, kernel: CimiLoopKernel) => {
  const ctx = bootstrap(kernel);
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
      statement: "Artifact 可部署。",
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
          requirement_set_id: requirementSet.id,
          input_digest: digest("ignored"),
          result: "DENY",
          reason: "ignored"
        },
        current.revision,
        ctx.changeId
      )
    )
  );
  const afterEval = kernel.getChange(ctx.changeId);
  if ("code" in afterEval) throw new Error(afterEval.code);
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
        afterEval.revision,
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
          artifact_id: artifact.id,
          artifact_digest: artifact.digest,
          environment_id: environment.data.environment.id,
          scope: { in: ["acceptance.service"], out: [] },
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
        { release_id: created.data.release.id, environment_id: environment.data.environment.id },
        created.revision,
        ctx.changeId
      )
    )
  );
  if (!("operation" in queued.data) || !queued.data.operation) throw new Error("missing operation");
  return {
    ctx,
    artifact,
    environmentId: environment.data.environment.id,
    releaseId: created.data.release.id,
    operation: queued.data.operation,
    revision: queued.revision
  };
};

describe("M4 reconciliation helpers", () => {
  it("maps conclusions without retrying deploy", () => {
    expect(conclusionToOperationState("confirmed_success")).toBe("succeeded");
    expect(conclusionToOperationState("confirmed_failure")).toBe("failed");
    expect(conclusionToOperationState("not_found")).toBe("not_found");
    expect(conclusionToOperationState("still_unknown")).toBe("unknown");
    expect(reconciliationResolvesBlocker("still_unknown")).toBe(false);
    expect(reconciliationResolvesBlocker("confirmed_success")).toBe(true);
  });
});

describe("M4 unknown results and reconciliation", () => {
  it("marks timeout unknown, blocks redeploy, and records a determinate reconciliation", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-reconcile-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const queued = allowAndQueue(store, kernel);
    const unknown = success(
      kernel.execute(
        envelope(
          "RecordOperationResult",
          queued.ctx.projectId,
          queued.ctx.actorId,
          {
            operation_id: queued.operation.id,
            operation_key: queued.operation.operation_key,
            state: "unknown",
            log_reference: "file://logs/timeout.log",
            log_digest: digest("timeout_log"),
            summary: "adapter timed out after spawn"
          },
          queued.revision,
          queued.ctx.changeId
        )
      )
    );
    const storedUnknown = store.transaction((transaction) => transaction.getExternalOperation(queued.operation.id));
    expect(storedUnknown?.state).toBe("unknown");
    expect(kernel.listOpenBlockers(queued.ctx.changeId).some((item) => item.code === "EXTERNAL_OPERATION_UNKNOWN")).toBe(true);
    expect(
      kernel.execute(
        envelope(
          "QueueDeployment",
          queued.ctx.projectId,
          queued.ctx.actorId,
          { release_id: queued.releaseId, environment_id: queued.environmentId },
          unknown.revision,
          queued.ctx.changeId
        )
      )
    ).toMatchObject({ code: "EXTERNAL_OPERATION_UNKNOWN" });
    expect(
      store.transaction((transaction) => transaction.listExternalOperationsByChange(queued.ctx.changeId)).filter(
        (item) => item.operation_kind === "deploy"
      )
    ).toHaveLength(1);

    const requested = success(
      kernel.execute(
        envelope(
          "RequestReconciliation",
          queued.ctx.projectId,
          queued.ctx.actorId,
          { operation_id: queued.operation.id },
          unknown.revision,
          queued.ctx.changeId
        )
      )
    );
    const recorded = success(
      kernel.execute(
        envelope(
          "RecordReconciliation",
          queued.ctx.projectId,
          queued.ctx.actorId,
          {
            operation_id: queued.operation.id,
            conclusion: "confirmed_success",
            observed_digest: queued.artifact.digest,
            observed_state: "succeeded",
            summary: "external resource already carries the authorized digest"
          },
          requested.revision,
          queued.ctx.changeId
        )
      )
    );
    expect("reconciliation" in recorded.data).toBe(true);
    const resolved = store.transaction((transaction) => transaction.getExternalOperation(queued.operation.id));
    expect(resolved?.state).toBe("succeeded");
    expect(kernel.listOpenBlockers(queued.ctx.changeId).some((item) => item.code === "EXTERNAL_OPERATION_UNKNOWN")).toBe(
      false
    );
    expect(
      store.transaction((transaction) => transaction.listReconciliationsByOperation(queued.operation.id))
    ).toHaveLength(1);
  });

  it("keeps the blocker when reconciliation is still unknown and does not redeploy not-found operations", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-reconcile-unknown-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const queued = allowAndQueue(store, kernel);
    const unknown = success(
      kernel.execute(
        envelope(
          "RecordOperationResult",
          queued.ctx.projectId,
          queued.ctx.actorId,
          {
            operation_id: queued.operation.id,
            operation_key: queued.operation.operation_key,
            state: "unknown",
            log_reference: "file://logs/timeout.log",
            log_digest: digest("timeout_log"),
            summary: "connection lost"
          },
          queued.revision,
          queued.ctx.changeId
        )
      )
    );
    const requested = success(
      kernel.execute(
        envelope(
          "RequestReconciliation",
          queued.ctx.projectId,
          queued.ctx.actorId,
          { operation_id: queued.operation.id },
          unknown.revision,
          queued.ctx.changeId
        )
      )
    );
    success(
      kernel.execute(
        envelope(
          "RecordReconciliation",
          queued.ctx.projectId,
          queued.ctx.actorId,
          {
            operation_id: queued.operation.id,
            conclusion: "still_unknown",
            summary: "status endpoint still times out"
          },
          requested.revision,
          queued.ctx.changeId
        )
      )
    );
    expect(kernel.listOpenBlockers(queued.ctx.changeId).some((item) => item.code === "EXTERNAL_OPERATION_UNKNOWN")).toBe(
      true
    );
    const afterUnknown = kernel.getChange(queued.ctx.changeId);
    if ("code" in afterUnknown) throw new Error(afterUnknown.code);
    const notFound = success(
      kernel.execute(
        envelope(
          "RecordReconciliation",
          queued.ctx.projectId,
          queued.ctx.actorId,
          {
            operation_id: queued.operation.id,
            conclusion: "not_found",
            observed_state: "not_found",
            summary: "operation key has no external resource"
          },
          afterUnknown.revision,
          queued.ctx.changeId
        )
      )
    );
    expect(store.transaction((transaction) => transaction.getExternalOperation(queued.operation.id))?.state).toBe(
      "not_found"
    );
    expect(
      kernel.execute(
        envelope(
          "QueueDeployment",
          queued.ctx.projectId,
          queued.ctx.actorId,
          { release_id: queued.releaseId, environment_id: queued.environmentId },
          notFound.revision,
          queued.ctx.changeId
        )
      )
    ).toMatchObject({ code: "EXTERNAL_OPERATION_NOT_RETRYABLE" });
  });
});
