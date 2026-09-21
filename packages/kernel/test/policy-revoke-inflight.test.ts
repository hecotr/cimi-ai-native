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
const now = "2026-09-20T12:00:00.000Z";

afterEach(() => {
  while (openStores.length > 0) openStores.pop()?.close();
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
  source: { origin: "human_cli" as const, producer: "policy-inflight-test" },
  payload
});

const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "撤销进行中的 Run。",
  outcomes: ["Policy revoke"],
  scope: { in: ["Policy"], out: ["Secrets"] },
  non_goals: ["不假装撤销已调用的外部效果"],
  acceptance: [{ key: "AC-1", statement: "运行中的 Run 被停止请求。" }],
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

describe("running Run Policy revoke", () => {
  it("stops an actually running Run and blocks new work after revoke", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-policy-inflight-"));
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
        source: { origin: "human_cli", producer: "policy-inflight-test" },
        payload: {
          name: "Policy Inflight",
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
        source: { origin: "human_cli", producer: "policy-inflight-test" },
        payload: { title: "Running revoke" }
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
      kernel.execute(envelope(type, projectId, actorId, payload, revisionOf(), changeId));
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
    success(exec("ClaimWorkItem", { work_item_id: workItemId }));
    const started = success(
      exec("StartRun", {
        work_item_id: workItemId,
        context_pack_id: createInternalId(),
        binding_id: createInternalId()
      })
    );
    if (!("run" in started.data)) throw new Error("missing run");
    expect(["starting", "running"]).toContain(started.data.run.status);
    const project = kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    success(
      kernel.execute(envelope("RevokeProjectPolicy", projectId, actorId, { reason: "停止进行中的运行。" }, project.revision))
    );
    const run = kernel.getAgentRun(started.data.run.id);
    if (!run || "code" in run) throw new Error("missing run after revoke");
    expect(run.status).toBe("cancelled");
    expect(kernel.listOpenBlockers(changeId).some((item) => item.code === "POLICY_REVOKED")).toBe(true);
    expect(kernel.listOpenAttentionItems(projectId).some((item) => item.kind === "blocker")).toBe(true);
    expect(failure(exec("ClaimWorkItem", { work_item_id: workItemId })).code).toBe("POLICY_REVOKED");
    expect(failure(exec("StartRun", {
      work_item_id: workItemId,
      context_pack_id: createInternalId(),
      binding_id: createInternalId()
    })).code).toBe("POLICY_REVOKED");
    expect(failure(exec("CreateExecutionWorkItems", { change_id: changeId })).code).toBe("POLICY_REVOKED");
    expect(
      failure(
        exec("CreateRelease", {
          change_id: changeId,
          kind: "test",
          artifact_id: createInternalId(),
          artifact_digest: { algorithm: "sha256", value: "e".repeat(64), subject: "artifact" },
          environment_id: createInternalId(),
          scope: { in: ["test.service"], out: [] },
          window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery: {
            trigger: "verify_fail",
            kind: "rollback",
            target_digest: { algorithm: "sha256", value: "f".repeat(64), subject: "known_good_artifact" },
            scope: { in: ["service"], out: [] },
            steps: ["restore prior digest"],
            verify_checks: ["digest", "health", "core_path"],
            authorization: "preauthorized"
          }
        })
      ).code
    ).toBe("POLICY_REVOKED");
    expect(
      failure(
        exec("QueueDeployment", { release_id: createInternalId(), environment_id: createInternalId() })
      ).code
    ).toBe("POLICY_REVOKED");
    expect(
      failure(
        exec("AuthorizeRecovery", {
          release_id: createInternalId(),
          strategy_id: createInternalId(),
          source_deployment_id: createInternalId()
        })
      ).code
    ).toBe("POLICY_REVOKED");
  });
});
