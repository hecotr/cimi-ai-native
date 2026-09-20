import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../src/kernel.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const digest = {
  algorithm: "sha256" as const,
  value: "b".repeat(64),
  subject: "runtime_log"
};

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
  if (!("ok" in result && result.ok)) {
    throw new Error(`expected success, got ${JSON.stringify(result)}`);
  }
  return result;
};

const envelope = (
  commandType: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  expectedRevision: number,
  changeId: InternalId
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: commandType,
  requested_at: now,
  actor_id: actorId,
  project_id: projectId,
  expected_revision: expectedRevision,
  target: { object_type: "change" as const, id: changeId, domain_version: 1 },
  source: { origin: "human_cli" as const, producer: "m2-run-test" },
  payload
});

const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "进入可调度执行。",
  outcomes: ["Planned"],
  scope: { in: ["Plan"], out: ["Production"] },
  non_goals: ["不发布"],
  acceptance: [{ key: "AC-1", statement: "Ready Task 可生成 Work Item。" }],
  constraints: ["Human only"],
  risk: {
    data_exposure: "none",
    security: "none",
    reliability: "local-only",
    reversibility: "fully_reversible"
  },
  knowledge_impact: {
    product_business: { conclusion: "NoImpact" as const, rationale: "无产品变化。" },
    technical: {
      conclusion: "Update" as const,
      owner_role: "technical_owner" as const,
      gate: "change_closure" as const,
      summary: "更新说明。"
    },
    operations: { conclusion: "NoImpact" as const, rationale: "无运维变化。" },
    communication: { conclusion: "NoImpact" as const, rationale: "无沟通变化。" }
  }
});

const planPayload = () => ({
  summary: "先做无依赖实现，再验证。",
  verification_strategy: "Kernel 测试证明 Run。",
  recovery_considerations: "未知结果必须 reconcilation。",
  tasks: [
    { key: "implement", title: "实现", kind: "implementation" as const, dependencies: [] },
    { key: "verify", title: "验证", kind: "verification" as const, dependencies: ["implement"] },
    {
      key: "update-docs",
      title: "更新说明",
      kind: "knowledge" as const,
      knowledge_source: "technical" as const,
      dependencies: ["verify"]
    }
  ]
});

const openKernel = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m2-run-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  openStores.push(store);
  return { store, kernel: new CimiLoopKernel({ store, now: () => now }) };
};

const revisionOf = (kernel: CimiLoopKernel, changeId: InternalId) => {
  const loaded = kernel.getChange(changeId);
  if ("code" in loaded) throw new Error(loaded.code);
  return loaded.revision;
};

const bootstrapClaimed = (kernel: CimiLoopKernel) => {
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m2-run-test" },
      payload: {
        name: "M2 Run",
        repository_kind: "directory",
        repository_path: "/tmp/m2-run",
        owner_name: "Owner"
      }
    })
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data)) {
    throw new Error("missing project");
  }
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
      source: { origin: "human_cli" as const, producer: "m2-run-test" },
      payload: { title: "M2 run" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  const changeId = created.data.change.id;
  success(
    kernel.execute(
      envelope(
        "BootstrapSoloGovernance",
        projectId,
        actorId,
        { change_id: changeId, intent_owner_actor_id: actorId, technical_owner_actor_id: actorId },
        revisionOf(kernel, changeId),
        changeId
      )
    )
  );
  success(
    kernel.execute(envelope("SubmitContractCandidate", projectId, actorId, contractPayload(), revisionOf(kernel, changeId), changeId))
  );
  const intentRequest = success(
    kernel.execute(envelope("RequestIntentDecision", projectId, actorId, { change_id: changeId }, revisionOf(kernel, changeId), changeId))
  );
  if (!("request" in intentRequest.data)) throw new Error("missing request");
  const intentOwner = kernel.listRoles().find((role) => role.role_key === "intent_owner");
  success(
    kernel.execute(
      envelope(
        "SubmitDecision",
        projectId,
        actorId,
        {
          request_id: intentRequest.data.request.id,
          outcome: "approve",
          acting_role_id: intentOwner?.id ?? actorId,
          reason: "批准 Contract"
        },
        revisionOf(kernel, changeId),
        changeId
      )
    )
  );
  success(kernel.execute(envelope("SubmitPlanCandidate", projectId, actorId, planPayload(), revisionOf(kernel, changeId), changeId)));
  const planRequest = success(
    kernel.execute(envelope("RequestPlanDecision", projectId, actorId, { change_id: changeId }, revisionOf(kernel, changeId), changeId))
  );
  if (!("request" in planRequest.data)) throw new Error("missing plan request");
  const technical = kernel.listRoles().find((role) => role.role_key === "technical_owner");
  success(
    kernel.execute(
      envelope(
        "SubmitDecision",
        projectId,
        actorId,
        {
          request_id: planRequest.data.request.id,
          outcome: "approve",
          acting_role_id: technical?.id ?? actorId,
          reason: "批准 Plan"
        },
        revisionOf(kernel, changeId),
        changeId
      )
    )
  );
  const createdItems = success(
    kernel.execute(
      envelope("CreateExecutionWorkItems", projectId, actorId, { change_id: changeId }, revisionOf(kernel, changeId), changeId)
    )
  );
  if (!("work_items" in createdItems.data) || !createdItems.data.work_items[0]) throw new Error("missing work item");
  const claimed = success(
    kernel.execute(
      envelope(
        "ClaimWorkItem",
        projectId,
        actorId,
        { work_item_id: createdItems.data.work_items[0].id },
        createdItems.revision,
        changeId
      )
    )
  );
  if (!("work_item" in claimed.data)) throw new Error("missing claimed work item");
  return { projectId, actorId, changeId, workItem: claimed.data.work_item, revision: claimed.revision };
};

describe("M2 run commands", () => {
  it("starts a run on a claimed work item and retry creates a new run id", () => {
    const { kernel } = openKernel();
    const claimed = bootstrapClaimed(kernel);
    const first = success(
      kernel.execute(
        envelope(
          "StartRun",
          claimed.projectId,
          claimed.actorId,
          {
            work_item_id: claimed.workItem.id,
            context_pack_id: createInternalId(),
            binding_id: createInternalId()
          },
          claimed.revision,
          claimed.changeId
        )
      )
    );
    expect("run" in first.data).toBe(true);
    if (!("run" in first.data)) throw new Error("missing run");
    expect(first.data.run.attempt).toBe(1);
    expect(first.data.run.status).toBe("running");
    const completed = success(
      kernel.execute(
        envelope(
          "CompleteRun",
          claimed.projectId,
          claimed.actorId,
          {
            run_id: first.data.run.id,
            summary: "process exited",
            log_reference: "file://logs/run-1.log",
            log_digest: digest
          },
          first.revision,
          claimed.changeId
        )
      )
    );
    expect("run" in completed.data && completed.data.run.status).toBe("completed");
    const second = success(
      kernel.execute(
        envelope(
          "StartRun",
          claimed.projectId,
          claimed.actorId,
          {
            work_item_id: claimed.workItem.id,
            context_pack_id: createInternalId(),
            binding_id: createInternalId()
          },
          completed.revision,
          claimed.changeId
        )
      )
    );
    if (!("run" in second.data)) throw new Error("missing second run");
    expect(second.data.run.id).not.toBe(first.data.run.id);
    expect(second.data.run.attempt).toBe(2);
  });

  it("does not complete a task or migrate Change when a run completes", () => {
    const { kernel, store } = openKernel();
    const claimed = bootstrapClaimed(kernel);
    const started = success(
      kernel.execute(
        envelope(
          "StartRun",
          claimed.projectId,
          claimed.actorId,
          {
            work_item_id: claimed.workItem.id,
            context_pack_id: createInternalId(),
            binding_id: createInternalId()
          },
          claimed.revision,
          claimed.changeId
        )
      )
    );
    if (!("run" in started.data)) throw new Error("missing run");
    success(
      kernel.execute(
        envelope(
          "CompleteRun",
          claimed.projectId,
          claimed.actorId,
          {
            run_id: started.data.run.id,
            summary: "process exited",
            log_reference: "file://logs/run-1.log",
            log_digest: digest
          },
          started.revision,
          claimed.changeId
        )
      )
    );
    const change = kernel.getChange(claimed.changeId);
    if ("code" in change) throw new Error(change.code);
    expect(change.lifecycle_state).toBe("Executing");
    const workItem = kernel.getWorkItem(claimed.workItem.id);
    if (!workItem || "code" in workItem) throw new Error("missing work item");
    expect(workItem.status).not.toBe("completed");
    const tasks = store.transaction((transaction) => {
      const plan = transaction.getCurrentPlan(claimed.changeId);
      return plan ? transaction.listTasks(plan.plan_id, plan.domain_version) : [];
    });
    expect(tasks.every((task) => task.key)).toBe(true);
    expect(workItem.task_id).toBe(tasks.find((task) => task.key === "implement")?.id);
  });
});
