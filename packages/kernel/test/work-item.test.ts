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
  if (!("ok" in result && result.ok)) {
    throw new Error(`expected success, got ${JSON.stringify(result)}`);
  }
  return result;
};

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const envelope = (
  commandType: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  expectedRevision: number,
  changeId?: InternalId
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: commandType,
  requested_at: now,
  actor_id: actorId,
  project_id: projectId,
  expected_revision: expectedRevision,
  target: changeId ? { object_type: "change" as const, id: changeId, domain_version: 1 } : undefined,
  source: { origin: "human_cli" as const, producer: "m2-work-item-test" },
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
  verification_strategy: "Kernel 测试证明 Ready 与 Lease。",
  recovery_considerations: "lease 冲突不得自动重试。",
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

const openStores: SqliteProjectStore[] = [];

const openKernel = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m2-work-item-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  openStores.push(store);
  const kernel = new CimiLoopKernel({ store, now: () => now });
  return { store, kernel };
};

const bootstrap = (kernel: CimiLoopKernel, stopAt: "IntentReady" | "Planned") => {
  const initialized = success(
    kernel.execute(
      envelope(
        "InitializeProject",
        createInternalId(),
        createInternalId(),
        {
          name: "M2 Work Item",
          repository_kind: "directory",
          repository_path: "/tmp/m2-work-item",
          owner_name: "Owner"
        },
        1
      )
    )
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data)) {
    throw new Error("InitializeProject missing project/actor");
  }
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = success(
    kernel.execute(envelope("CreateChange", projectId, actorId, { title: "M2 scheduling" }, 1))
  );
  if (!("change" in created.data)) throw new Error("missing change");
  let change = created.data.change;
  const targetId = change.id;
  const revisionOf = () => {
    const loaded = kernel.getChange(targetId);
    if ("code" in loaded) throw new Error(loaded.code);
    return loaded.revision;
  };

  success(
    kernel.execute(
      envelope(
        "BootstrapSoloGovernance",
        projectId,
        actorId,
        {
          change_id: change.id,
          intent_owner_actor_id: actorId,
          technical_owner_actor_id: actorId
        },
        revisionOf(),
        change.id
      )
    )
  );
  success(
    kernel.execute(
      envelope("SubmitContractCandidate", projectId, actorId, contractPayload(), revisionOf(), change.id)
    )
  );
  const intentRequest = success(
    kernel.execute(envelope("RequestIntentDecision", projectId, actorId, { change_id: change.id }, revisionOf(), change.id))
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
        revisionOf(),
        change.id
      )
    )
  );
  if (stopAt === "IntentReady") {
    const ready = kernel.getChange(targetId);
    if ("code" in ready) throw new Error(ready.code);
    return { projectId, actorId, change: ready };
  }

  return finishPlan(kernel, projectId, actorId, change.id);
};

const finishPlan = (kernel: CimiLoopKernel, projectId: InternalId, actorId: InternalId, changeId: InternalId) => {
  const revisionOf = () => {
    const loaded = kernel.getChange(changeId);
    if ("code" in loaded) throw new Error(loaded.code);
    return loaded.revision;
  };
  success(
    kernel.execute(envelope("SubmitPlanCandidate", projectId, actorId, planPayload(), revisionOf(), changeId))
  );
  const planRequest = success(
    kernel.execute(envelope("RequestPlanDecision", projectId, actorId, { change_id: changeId }, revisionOf(), changeId))
  );
  if (!("request" in planRequest.data)) throw new Error("missing plan request");
  const technical = kernel.listRoles().find((role) => role.role_key === "technical_owner");
  const planned = success(
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
        revisionOf(),
        changeId
      )
    )
  );
  if (!("change" in planned.data)) throw new Error("missing planned change");
  return { projectId, actorId, change: planned.data.change };
};

describe("M2 work item scheduling", () => {
  it("creates a planning work item at IntentReady and does not recreate it after Planned", () => {
    const { kernel } = openKernel();
    const intentReady = bootstrap(kernel, "IntentReady");
    const created = success(
      kernel.execute(
        envelope(
          "CreatePlanningWorkItem",
          intentReady.projectId,
          intentReady.actorId,
          { change_id: intentReady.change.id },
          intentReady.change.revision,
          intentReady.change.id
        )
      )
    );
    expect("work_item" in created.data && created.data.work_item.kind).toBe("planning");
    const planningId = "work_item" in created.data ? created.data.work_item.id : "";

    const planned = finishPlan(kernel, intentReady.projectId, intentReady.actorId, intentReady.change.id);
    const skipped = success(
      kernel.execute(
        envelope(
          "CreatePlanningWorkItem",
          planned.projectId,
          planned.actorId,
          { change_id: planned.change.id },
          planned.change.revision,
          planned.change.id
        )
      )
    );
    expect(skipped).toMatchObject({ ok: true });
    if ("work_item" in skipped.data) {
      expect(skipped.data.work_item.id).toBe(planningId);
    }
  });

  it("creates execution work items only for ready tasks and binds plan, task and policy", () => {
    const { kernel, store } = openKernel();
    const planned = bootstrap(kernel, "Planned");
    const created = success(
      kernel.execute(
        envelope(
          "CreateExecutionWorkItems",
          planned.projectId,
          planned.actorId,
          { change_id: planned.change.id },
          planned.change.revision,
          planned.change.id
        )
      )
    );
    expect("work_items" in created.data).toBe(true);
    if (!("work_items" in created.data)) throw new Error("missing work items");
    expect(created.data.work_items).toHaveLength(1);
    expect(created.data.work_items[0]).toMatchObject({
      kind: "execution",
      status: "ready"
    });
    expect(created.data.work_items[0]?.task_id).toBeTruthy();
    expect(created.data.work_items[0]?.plan_id).toBeTruthy();
    expect(created.data.work_items[0]?.policy_snapshot_id).toBeTruthy();
    expect(created.data.change?.lifecycle_state).toBe("Executing");

    const tasks = store.transaction((transaction) => {
      const plan = transaction.getCurrentPlan(planned.change.id);
      return plan ? transaction.listTasks(plan.plan_id, plan.domain_version) : [];
    });
    expect(created.data.work_items[0]?.task_id).toBe(tasks.find((task) => task.key === "implement")?.id);
  });

  it("rejects a second claim with a stable lease conflict and does not retry", () => {
    const { kernel } = openKernel();
    const planned = bootstrap(kernel, "Planned");
    const created = success(
      kernel.execute(
        envelope(
          "CreateExecutionWorkItems",
          planned.projectId,
          planned.actorId,
          { change_id: planned.change.id },
          planned.change.revision,
          planned.change.id
        )
      )
    );
    if (!("work_items" in created.data) || !created.data.work_items[0]) throw new Error("missing work item");
    const workItemId = created.data.work_items[0].id;
    const claimed = success(
      kernel.execute(
        envelope(
          "ClaimWorkItem",
          planned.projectId,
          planned.actorId,
          { work_item_id: workItemId },
          created.revision,
          planned.change.id
        )
      )
    );
    expect("lease" in claimed.data && claimed.data.lease.status).toBe("active");
    expect("work_item" in claimed.data && claimed.data.work_item.status).toBe("claimed");

    const conflict = failure(
      kernel.execute(
        envelope(
          "ClaimWorkItem",
          planned.projectId,
          planned.actorId,
          { work_item_id: workItemId },
          claimed.revision,
          planned.change.id
        )
      )
    );
    expect(conflict.code).toBe("LEASE_CONFLICT");
    expect(conflict.retryable).toBe(false);
  });
});
