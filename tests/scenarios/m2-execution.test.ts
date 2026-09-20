import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/kernel.js";
import { MemoryProcessRegistry, RunOrchestrator } from "../../packages/orchestrator/src/index.js";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";

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
  source: { origin: "human_cli" as const, producer: "m2-execution-scenario" },
  payload
});

const plannedChange = (kernel: CimiLoopKernel) => {
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m2-execution-scenario" },
      payload: {
        name: "M2 Scenario",
        repository_kind: "directory",
        repository_path: "/tmp/m2-scenario",
        owner_name: "Owner"
      }
    })
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      actor_id: actorId,
      project_id: projectId,
      source: { origin: "human_cli" as const, producer: "m2-execution-scenario" },
      payload: { title: "M2 scenario" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  const changeId = created.data.change.id;
  const revisionOf = () => {
    const change = kernel.getChange(changeId);
    if ("code" in change) throw new Error(change.code);
    return change.revision;
  };
  const exec = (type: string, payload: Record<string, unknown>) =>
    success(kernel.execute(envelope(type, projectId, actorId, payload, revisionOf(), changeId)));
  exec("BootstrapSoloGovernance", {
    change_id: changeId,
    intent_owner_actor_id: actorId,
    technical_owner_actor_id: actorId
  });
  exec("SubmitContractCandidate", {
    profile_key: "feature",
    intent: "场景验收。",
    outcomes: ["Planned"],
    scope: { in: ["Plan"], out: ["Production"] },
    non_goals: ["不发布"],
    acceptance: [{ key: "AC-1", statement: "Work Item 可执行。" }],
    constraints: ["Human only"],
    risk: {
      data_exposure: "none",
      security: "none",
      reliability: "local-only",
      reversibility: "fully_reversible"
    },
    knowledge_impact: {
      product_business: { conclusion: "NoImpact", rationale: "无产品变化。" },
      technical: {
        conclusion: "Update",
        owner_role: "technical_owner",
        gate: "change_closure",
        summary: "更新说明。"
      },
      operations: { conclusion: "NoImpact", rationale: "无运维变化。" },
      communication: { conclusion: "NoImpact", rationale: "无沟通变化。" }
    }
  });
  const intent = exec("RequestIntentDecision", { change_id: changeId });
  if (!("request" in intent.data)) throw new Error("missing request");
  exec("SubmitDecision", {
    request_id: intent.data.request.id,
    outcome: "approve",
    acting_role_id: kernel.listRoles().find((role) => role.role_key === "intent_owner")?.id ?? actorId,
    reason: "批准"
  });
  exec("SubmitPlanCandidate", {
    summary: "先实现。",
    verification_strategy: "场景测试。",
    recovery_considerations: "reclaim",
    tasks: [
      { key: "implement", title: "实现", kind: "implementation", dependencies: [] },
      { key: "verify", title: "验证", kind: "verification", dependencies: ["implement"] },
      {
        key: "update-docs",
        title: "更新说明",
        kind: "knowledge",
        knowledge_source: "technical",
        dependencies: ["verify"]
      }
    ]
  });
  const plan = exec("RequestPlanDecision", { change_id: changeId });
  if (!("request" in plan.data)) throw new Error("missing plan");
  exec("SubmitDecision", {
    request_id: plan.data.request.id,
    outcome: "approve",
    acting_role_id: kernel.listRoles().find((role) => role.role_key === "technical_owner")?.id ?? actorId,
    reason: "批准 Plan"
  });
  return { projectId, actorId, changeId, exec, revisionOf };
};

describe("M2 execution scenarios", () => {
  it("goes Planned to Work Item, Run, Snapshot and Artifact, and retries as a new Run", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m2-scenario-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = plannedChange(kernel);
    const items = ctx.exec("CreateExecutionWorkItems", { change_id: ctx.changeId });
    if (!("work_items" in items.data) || !items.data.work_items[0]) throw new Error("missing work item");
    const claimed = ctx.exec("ClaimWorkItem", { work_item_id: items.data.work_items[0].id });
    if (!("work_item" in claimed.data)) throw new Error("missing claimed");
    const started = ctx.exec("StartRun", {
      work_item_id: claimed.data.work_item.id,
      context_pack_id: createInternalId(),
      binding_id: createInternalId()
    });
    if (!("run" in started.data)) throw new Error("missing run");
    ctx.exec("CompleteRun", {
      run_id: started.data.run.id,
      summary: "exited",
      log_reference: "file://logs/run.log",
      log_digest: { algorithm: "sha256", value: "b".repeat(64), subject: "runtime_log" }
    });
    expect(kernel.listArtifactsByChange(ctx.changeId)).toEqual([]);
    const snapshot = ctx.exec("RecordSourceSnapshot", {
      run_id: started.data.run.id,
      snapshot_kind: "git_commit",
      dirty: false,
      commit_sha: "a".repeat(40),
      tree_sha: "a".repeat(40),
      digest: { algorithm: "sha256", value: "e".repeat(64), subject: "source_snapshot" },
      content_reference: "git://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    if (!("snapshot" in snapshot.data)) throw new Error("missing snapshot");
    const file = join(directory, "artifact.bin");
    writeFileSync(file, "payload");
    const artifact = ctx.exec("RecordArtifact", {
      run_id: started.data.run.id,
      source_snapshot_id: snapshot.data.snapshot.id,
      context_pack_id: started.data.run.context_pack_id,
      binding_id: started.data.run.binding_id,
      digest: {
        algorithm: "sha256",
        value: createHash("sha256").update("payload").digest("hex"),
        subject: "artifact"
      },
      content_reference: pathToFileURL(file).href,
      summary: "candidate"
    });
    expect("artifact" in artifact.data).toBe(true);
    const retry = ctx.exec("StartRun", {
      work_item_id: claimed.data.work_item.id,
      context_pack_id: createInternalId(),
      binding_id: createInternalId()
    });
    if (!("run" in retry.data)) throw new Error("missing retry");
    expect(retry.data.run.id).not.toBe(started.data.run.id);
    expect(retry.data.run.attempt).toBe(2);
  });

  it("blocks execution when a required capability is missing and reclaims an expired lease", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m2-scenario-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = plannedChange(kernel);
    const items = ctx.exec("CreateExecutionWorkItems", { change_id: ctx.changeId });
    if (!("work_items" in items.data) || !items.data.work_items[0]) throw new Error("missing work item");
    const orchestrator = new RunOrchestrator({
      kernel,
      runtime: {
        start: async () => {
          throw new Error("should not start");
        },
        run: async () => {
          throw new Error("should not run");
        }
      },
      processRegistry: new MemoryProcessRegistry(),
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      worktreePath: join(directory, "worktree"),
      contextDirectory: join(directory, "context"),
      providers: [],
      actorPermissions: ["workspace.write"],
      providerPermissions: ["workspace.write"]
    });
    const blocked = await orchestrator.executeReadyWorkItem(ctx.changeId);
    expect(blocked.kind).toBe("blocked");
    const lease = kernel.getActiveLeaseByWorkItem(items.data.work_items[0].id);
    if (!lease) throw new Error("missing lease after blocked execute");
    const later = new CimiLoopKernel({ store, now: () => "2026-09-20T00:20:00.000Z" });
    const change = later.getChange(ctx.changeId);
    if ("code" in change) throw new Error(change.code);
    const reclaimed = later.execute(
      envelope(
        "ReclaimExpiredLease",
        ctx.projectId,
        ctx.actorId,
        { lease_id: lease.id },
        change.revision,
        ctx.changeId
      )
    );
    expect("ok" in reclaimed && reclaimed.ok).toBe(true);
  });
});
