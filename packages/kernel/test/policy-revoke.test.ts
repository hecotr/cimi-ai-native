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
import { computePolicySnapshotDigest, isPolicyRevoked } from "../src/policy.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T12:00:00.000Z";

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

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const envelope = (
  type: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  revision: number,
  changeId?: InternalId
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: type,
  requested_at: now,
  actor_id: actorId,
  project_id: projectId,
  expected_revision: revision,
  ...(changeId ? { target: { object_type: "change" as const, id: changeId, domain_version: 1 } } : {}),
  source: { origin: "human_cli" as const, producer: "policy-revoke-test" },
  payload
});

const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "执行中撤销策略。",
  outcomes: ["Policy revoke"],
  scope: { in: ["Policy"], out: ["Secrets"] },
  non_goals: ["不假装撤销已开始的外部操作"],
  acceptance: [{ key: "AC-1", statement: "撤销后不能再领取。" }],
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
      summary: "更新策略。"
    },
    operations: { conclusion: "NoImpact" as const, rationale: "无运维变化。" },
    communication: { conclusion: "NoImpact" as const, rationale: "无沟通变化。" }
  }
});

const planPayload = () => ({
  summary: "实现后验证。",
  verification_strategy: "Kernel 测试。",
  recovery_considerations: "已开始的外部操作进入核对。",
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

const revisionOf = (kernel: CimiLoopKernel, changeId: InternalId) => {
  const change = kernel.getChange(changeId);
  if ("code" in change) throw new Error(change.code);
  return change.revision;
};

describe("in-flight Policy revoke", () => {
  it("blocks new claims and deployments after revoke while keeping history and in-flight results", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-policy-revoke-"));
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
        source: { origin: "human_cli", producer: "policy-revoke-test" },
        payload: {
          name: "Policy Revoke",
          repository_kind: "directory",
          repository_path: directory,
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
        source: { origin: "human_cli", producer: "policy-revoke-test" },
        payload: { title: "Revoke inflight" }
      })
    );
    if (!("change" in created.data)) throw new Error("missing change");
    const changeId = created.data.change.id;
    const exec = (type: string, payload: Record<string, unknown>, revision = revisionOf(kernel, changeId)) =>
      kernel.execute(envelope(type, projectId, actorId, payload, revision, changeId));
    success(
      exec("BootstrapSoloGovernance", {
        change_id: changeId,
        intent_owner_actor_id: actorId,
        technical_owner_actor_id: actorId
      })
    );
    success(exec("SubmitContractCandidate", contractPayload()));
    const intent = success(exec("RequestIntentDecision", { change_id: changeId }));
    if (!("request" in intent.data)) throw new Error("missing intent");
    success(
      exec("SubmitDecision", {
        request_id: intent.data.request.id,
        outcome: "approve",
        acting_role_id: kernel.listRoles().find((role) => role.role_key === "intent_owner")?.id,
        reason: "批准 Contract"
      })
    );
    success(exec("SubmitPlanCandidate", planPayload()));
    const plan = success(exec("RequestPlanDecision", { change_id: changeId }));
    if (!("request" in plan.data)) throw new Error("missing plan");
    success(
      exec("SubmitDecision", {
        request_id: plan.data.request.id,
        outcome: "approve",
        acting_role_id: kernel.listRoles().find((role) => role.role_key === "technical_owner")?.id,
        reason: "批准 Plan"
      })
    );
    const createdItems = success(exec("CreateExecutionWorkItems", { change_id: changeId }));
    if (!("work_items" in createdItems.data) || !createdItems.data.work_items[0]) throw new Error("missing work item");
    const workItemId = createdItems.data.work_items[0].id;
    const project = kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    const revoked = success(
      kernel.execute(
        envelope("RevokeProjectPolicy", projectId, actorId, { reason: "执行中撤销生产权限。" }, project.revision)
      )
    );
    expect(revoked.events.some((event) => event.event_type === "PolicyRevoked")).toBe(true);
    const snapshot = store.transaction((transaction) => transaction.getLatestPolicySnapshot(projectId));
    expect(isPolicyRevoked(snapshot)).toBe(true);
    expect(snapshot?.digest.value).toBe(
      computePolicySnapshotDigest({
        intent_required_role: "intent_owner",
        plan_required_role: "technical_owner",
        decisions_human_only: true,
        knowledge_tasks_required: true,
        status: "revoked"
      })
    );
    expect(snapshot?.digest.value).not.toBe(
      computePolicySnapshotDigest({
        intent_required_role: "intent_owner",
        plan_required_role: "technical_owner",
        decisions_human_only: true,
        knowledge_tasks_required: true
      })
    );
    expect(failure(exec("ClaimWorkItem", { work_item_id: workItemId })).code).toBe("POLICY_REVOKED");
    expect(failure(exec("CreateExecutionWorkItems", { change_id: changeId })).code).toBe("POLICY_REVOKED");
    expect(kernel.getChange(changeId)).toMatchObject({ lifecycle_state: "Executing" });
    expect(store.transaction((transaction) => transaction.getWorkItem(workItemId)?.status)).toBe("ready");
  });
});
