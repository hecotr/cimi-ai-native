import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Artifact,
  type Claim,
  type CommandSuccess,
  type DomainError,
  type Evidence,
  type InternalId,
  type Task,
  type WorkItem
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { hasOpenExecutionWorkItem, selectReadyTasks } from "../src/scheduler.js";
import { createRepairWorkItem } from "../src/repair.js";
import { findReusableEvaluation } from "../src/evidence/evaluation-gate.js";
import { CimiLoopKernel } from "../src/kernel.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string, value = "c".repeat(64)) => ({
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

describe("repair work item factory and scheduler", () => {
  it("creates a repair work item that does not overwrite the failed artifact", () => {
    const artifactId = createInternalId();
    const repair = createRepairWorkItem({
      id: createInternalId(),
      projectId: createInternalId(),
      changeId: createInternalId(),
      contractId: createInternalId(),
      contractVersion: 1,
      planId: createInternalId(),
      planVersion: 1,
      taskId: createInternalId(),
      policySnapshotId: createInternalId(),
      failedArtifactId: artifactId,
      now
    });
    expect(repair.kind).toBe("repair");
    expect(repair.status).toBe("ready");
    expect(repair.permission_scope).toContain("workspace.write");
    expect(repair.extensions?.["cimiloop.repair"]).toMatchObject({ artifact_id: artifactId });
  });

  it("treats an open repair work item as occupying the task", () => {
    const taskId = createInternalId();
    const repair: WorkItem = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: createInternalId(),
      change_id: createInternalId(),
      kind: "repair",
      status: "ready",
      contract_id: createInternalId(),
      contract_version: 1,
      task_id: taskId,
      policy_snapshot_id: createInternalId(),
      authorized_role_key: "technical_owner",
      permission_scope: ["workspace.write"],
      budget: { max_duration_ms: 60000, max_retries: 1 },
      stop_conditions: ["timeout"],
      authorization_digest: digest("work_item_authorization"),
      created_at: now,
      updated_at: now,
      revision: 1
    };
    expect(hasOpenExecutionWorkItem([repair], taskId)).toBe(true);
    const task: Task = {
      schema_version: SCHEMA_VERSION,
      id: taskId,
      project_id: repair.project_id,
      change_id: repair.change_id,
      plan_id: createInternalId(),
      plan_version: 1,
      key: "implement",
      title: "实现",
      kind: "implementation",
      dependencies: [],
      created_at: now,
      updated_at: now,
      revision: 1
    };
    expect(
      selectReadyTasks("Executing", [task], [repair], {
        has_open_blocker: false,
        has_contract: true,
        has_plan: true,
        has_policy_snapshot: true
      })
    ).toEqual([]);
  });

  it("does not reuse an old ALLOW after the artifact digest changes", () => {
    const oldDigest = digest("artifact");
    const evaluation = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: createInternalId(),
      change_id: createInternalId(),
      artifact_id: createInternalId(),
      artifact_digest: oldDigest,
      requirement_set_id: createInternalId(),
      input_digest: digest("evaluation_input"),
      result: "ALLOW" as const,
      reason: "required claims satisfied",
      created_at: now
    };
    expect(findReusableEvaluation([evaluation], digest("evaluation_input"))?.id).toBe(evaluation.id);
    expect(findReusableEvaluation([evaluation], digest("evaluation_input", "d".repeat(64)))).toBeUndefined();
  });
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
  source: { origin: "system" as const, producer: "m3-repair-test" },
  payload
});

describe("CreateRepairWorkItem kernel command", () => {
  it("keeps the change executing and links a new repair work item to the failed evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-repair-"));
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
        source: { origin: "human_cli" as const, producer: "m3-repair-test" },
        payload: {
          name: "M3 Repair",
          repository_kind: "directory",
          repository_path: "/tmp/m3-repair",
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
        source: { origin: "human_cli" as const, producer: "m3-repair-test" },
        payload: { title: "Repair" }
      })
    );
    if (!("change" in created.data)) throw new Error("missing change");
    const taskId = createInternalId();
    const sourceWorkItem = createRepairWorkItem({
      id: createInternalId(),
      projectId: initialized.data.project.id,
      changeId: created.data.change.id,
      contractId: createInternalId(),
      contractVersion: 1,
      planId: createInternalId(),
      planVersion: 1,
      taskId,
      policySnapshotId: createInternalId(),
      failedArtifactId: createInternalId(),
      now
    });
    const sourceExecution: WorkItem = { ...sourceWorkItem, kind: "execution", id: createInternalId() };
    const artifact: Artifact = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: initialized.data.project.id,
      change_id: created.data.change.id,
      work_item_id: sourceExecution.id,
      run_id: createInternalId(),
      context_pack_id: createInternalId(),
      binding_id: createInternalId(),
      source_snapshot_id: createInternalId(),
      contract_id: sourceExecution.contract_id,
      contract_version: 1,
      plan_id: sourceExecution.plan_id ?? createInternalId(),
      plan_version: 1,
      status: "candidate",
      summary: "failed artifact",
      digest: digest("artifact"),
      content_reference: "file://old-artifact.bin",
      created_at: now
    };
    const claim: Claim = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: initialized.data.project.id,
      change_id: created.data.change.id,
      claim_key: "AC-1",
      statement: "验收通过。",
      category: "intent",
      obligation: "required",
      source: "acceptance",
      contract_id: artifact.contract_id,
      contract_version: 1,
      created_at: now
    };
    const failed: Evidence = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: initialized.data.project.id,
      change_id: created.data.change.id,
      claim_id: claim.id,
      stance: "Refutes",
      subject_type: "artifact",
      subject_id: artifact.id,
      subject_digest: artifact.digest,
      content_reference: "cimi-object://evidence/refute",
      digest: digest("evidence"),
      producer_role: "evaluator",
      created_at: now
    };
    store.transaction((transaction) => {
      transaction.insertWorkItem(sourceExecution);
      transaction.insertArtifact(artifact);
      transaction.insertClaim(claim);
      transaction.insertEvidence(failed);
    });
    const repaired = success(
      kernel.execute(
        envelope(
          "CreateRepairWorkItem",
          initialized.data.project.id,
          initialized.data.actor.id,
          {
            change_id: created.data.change.id,
            failed_evidence_id: failed.id,
            source_work_item_id: sourceExecution.id,
            artifact_id: artifact.id,
            task_id: taskId
          },
          created.data.change.revision,
          created.data.change.id
        )
      )
    );
    expect("repair_link" in repaired.data).toBe(true);
    if (!("repair_link" in repaired.data)) throw new Error("missing repair link");
    expect(repaired.data.repair_link.failed_evidence_id).toBe(failed.id);
    expect(repaired.data.repair_link.artifact_id).toBe(artifact.id);
    expect(repaired.data.repair_link.source_work_item_id).toBe(sourceExecution.id);
    const change = kernel.getChange(created.data.change.id);
    if ("code" in change) throw new Error(change.code);
    expect(change.lifecycle_state).toBe("Executing");
    const items = kernel.listWorkItemsByChange(created.data.change.id);
    const repairItem = items.find((item) => item.kind === "repair");
    expect(repairItem?.id).toBe(repaired.data.repair_link.repair_work_item_id);
    const kept = kernel.getArtifact(artifact.id);
    if ("code" in kept) throw new Error(kept.code);
    expect(kept.status).toBe("candidate");
    expect(kept.digest.value).toBe(artifact.digest.value);
  });
});
