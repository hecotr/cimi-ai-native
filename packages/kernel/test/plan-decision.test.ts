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
import { evaluatePlanGate } from "../src/gates/plan-gate.js";
import { CimiLoopKernel } from "../src/kernel.js";

const temporaryDirectories: string[] = [];
const now = "2026-09-20T00:00:00.000Z";

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  expect("ok" in result && result.ok).toBe(true);
  return result as CommandSuccess;
};

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "批准后进入 IntentReady。",
  outcomes: ["IntentReady"],
  scope: { in: ["Contract"], out: ["Runtime"] },
  non_goals: ["不执行"],
  acceptance: [{ key: "AC-1", statement: "Contract v1 已批准。" }],
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
  summary: "覆盖验收、风险与知识义务的实施计划。",
  verification_strategy: "通过 Kernel 场景测试证明 IntentReady → Planned。",
  recovery_considerations: "写失败回滚 Decision、Plan、Task、Transition、Event、Outbox 与 Receipt。",
  tasks: [
    { key: "define-plan", title: "形成 Plan", kind: "governance" as const, dependencies: [] },
    {
      key: "verify-acceptance",
      title: "验证验收",
      kind: "verification" as const,
      dependencies: ["define-plan"]
    },
    {
      key: "update-docs",
      title: "更新说明",
      kind: "knowledge" as const,
      knowledge_source: "technical" as const,
      dependencies: ["verify-acceptance"]
    }
  ]
});

const envelope = (
  type: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: type,
  requested_at: now,
  project_id: projectId,
  actor_id: actorId,
  source: { origin: "human_cli" as const, producer: "plan-decision-test" },
  payload,
  ...extra
});

const createPlannedReadyHarness = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-plan-decision-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute(
      envelope("InitializeProject", createInternalId(), createInternalId(), {
        name: "Plan Decision",
        repository_kind: "directory",
        repository_path: directory,
        owner_name: "Human Owner"
      })
    )
  );
  if (!("project" in initialized.data)) throw new Error("expected project");
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = success(kernel.execute(envelope("CreateChange", projectId, actorId, { title: "Plan Decision" })));
  if (!("change" in created.data)) throw new Error("expected change");
  success(
    kernel.execute(
      envelope(
        "BootstrapSoloGovernance",
        projectId,
        actorId,
        {
          change_id: created.data.change.id,
          intent_owner_actor_id: actorId,
          technical_owner_actor_id: actorId
        },
        {
          target: { object_type: "change", id: created.data.change.id, domain_version: 1 },
          expected_revision: created.data.change.revision
        }
      )
    )
  );
  const afterGovernance = store.getChange(created.data.change.id);
  if (!afterGovernance) throw new Error("missing change");
  success(
    kernel.execute(
      envelope("SubmitContractCandidate", projectId, actorId, contractPayload(), {
        target: { object_type: "change", id: afterGovernance.id, domain_version: 1 },
        expected_revision: afterGovernance.revision
      })
    )
  );
  const afterCandidate = store.getChange(afterGovernance.id);
  if (!afterCandidate) throw new Error("missing candidate change");
  const intentRequested = success(
    kernel.execute(
      envelope(
        "RequestIntentDecision",
        projectId,
        actorId,
        { change_id: afterCandidate.id },
        {
          target: { object_type: "change", id: afterCandidate.id, domain_version: 1 },
          expected_revision: afterCandidate.revision
        }
      )
    )
  );
  if (!("request" in intentRequested.data)) throw new Error("expected intent request");
  const intentRole = store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
  success(
    kernel.execute(
      envelope(
        "SubmitDecision",
        projectId,
        actorId,
        {
          request_id: intentRequested.data.request.id,
          outcome: "approve",
          acting_role_id: intentRole?.id,
          reason: "批准 Contract。"
        },
        { expected_revision: store.getChange(afterCandidate.id)?.revision }
      )
    )
  );
  const ready = store.getChange(afterCandidate.id);
  if (!ready) throw new Error("missing IntentReady change");
  success(
    kernel.execute(
      envelope("SubmitPlanCandidate", projectId, actorId, planPayload(), {
        target: { object_type: "change", id: ready.id, domain_version: 1 },
        expected_revision: ready.revision
      })
    )
  );
  const plannedReady = store.getChange(ready.id);
  if (!plannedReady) throw new Error("missing plan-ready change");
  return { store, kernel, projectId, actorId, change: plannedReady };
};

const requestPlan = (harness: ReturnType<typeof createPlannedReadyHarness>) =>
  success(
    harness.kernel.execute(
      envelope(
        "RequestPlanDecision",
        harness.projectId,
        harness.actorId,
        { change_id: harness.change.id },
        {
          target: { object_type: "change", id: harness.change.id, domain_version: 1 },
          expected_revision: harness.store.getChange(harness.change.id)?.revision
        }
      )
    )
  );

const submitPlanDecision = (
  harness: ReturnType<typeof createPlannedReadyHarness>,
  requestId: InternalId,
  outcome: "approve" | "request_changes" | "reject",
  actingRoleId: InternalId | undefined,
  extra: Record<string, unknown> = {}
) =>
  harness.kernel.execute(
    envelope(
      "SubmitDecision",
      harness.projectId,
      harness.actorId,
      {
        request_id: requestId,
        outcome,
        acting_role_id: actingRoleId,
        reason: outcome === "approve" ? "Plan 覆盖完整，批准。" : "需要调整。",
        ...(outcome === "request_changes" ? { feedback: [{ category: "plan", body: "补充验证步骤。" }] } : {})
      },
      { expected_revision: harness.store.getChange(harness.change.id)?.revision, ...extra }
    )
  );

describe("plan gate results", () => {
  it("covers ALLOW, REQUIRE_HUMAN, NEED_MORE_EVIDENCE and DENY", () => {
    expect(
      evaluatePlanGate({
        hasCompleteCandidate: true,
        hasHumanApproval: true,
        digestMatches: true,
        rejected: false
      })
    ).toBe("ALLOW");
    expect(
      evaluatePlanGate({
        hasCompleteCandidate: true,
        hasHumanApproval: false,
        digestMatches: true,
        rejected: false
      })
    ).toBe("REQUIRE_HUMAN");
    expect(
      evaluatePlanGate({
        hasCompleteCandidate: false,
        hasHumanApproval: false,
        digestMatches: true,
        rejected: false
      })
    ).toBe("NEED_MORE_EVIDENCE");
    expect(
      evaluatePlanGate({
        hasCompleteCandidate: true,
        hasHumanApproval: true,
        digestMatches: true,
        rejected: true
      })
    ).toBe("DENY");
  });
});

describe("plan decisions", () => {
  it("approves a plan through a technical owner and enters Planned", () => {
    const harness = createPlannedReadyHarness();
    const requested = requestPlan(harness);
    if (!("request" in requested.data)) throw new Error("expected request");
    const role = harness.store.transaction((transaction) => transaction.getRoleByKey("technical_owner"));
    const approved = success(submitPlanDecision(harness, requested.data.request.id, "approve", role?.id));
    expect(harness.store.getChange(harness.change.id)).toMatchObject({
      lifecycle_state: "Planned",
      operating_status: "Active"
    });
    expect(approved.data).toMatchObject({
      gate: { result: "ALLOW", gate_type: "plan" },
      plan: { domain_version: 1 },
      tasks: [{ key: "define-plan" }, { key: "update-docs" }, { key: "verify-acceptance" }]
    });
    if (!("plan" in approved.data) || !approved.data.plan) throw new Error("expected plan");
    const planId = approved.data.plan.plan_id;
    expect(harness.store.transaction((transaction) => transaction.listTasks(planId, 1))).toHaveLength(3);
    harness.store.close();
  });

  it("keeps IntentReady Active on request_changes and Pauses on reject", () => {
    const requestChanges = createPlannedReadyHarness();
    const requested = requestPlan(requestChanges);
    if (!("request" in requested.data)) throw new Error("expected request");
    const role = requestChanges.store.transaction((transaction) => transaction.getRoleByKey("technical_owner"));
    success(submitPlanDecision(requestChanges, requested.data.request.id, "request_changes", role?.id));
    expect(requestChanges.store.getChange(requestChanges.change.id)).toMatchObject({
      lifecycle_state: "IntentReady",
      operating_status: "Active"
    });
    expect(
      requestChanges.store.transaction((transaction) => transaction.getCurrentPlan(requestChanges.change.id))
    ).toBeUndefined();
    requestChanges.store.close();

    const rejected = createPlannedReadyHarness();
    const rejectRequest = requestPlan(rejected);
    if (!("request" in rejectRequest.data)) throw new Error("expected request");
    const rejectRole = rejected.store.transaction((transaction) => transaction.getRoleByKey("technical_owner"));
    success(submitPlanDecision(rejected, rejectRequest.data.request.id, "reject", rejectRole?.id));
    expect(rejected.store.getChange(rejected.change.id)).toMatchObject({
      lifecycle_state: "IntentReady",
      operating_status: "Paused"
    });
    expect(rejected.store.transaction((transaction) => transaction.getCurrentPlan(rejected.change.id))).toBeUndefined();
    rejected.store.close();
  });

  it("rejects the wrong role, expires stale plan requests and serializes competing approvers", () => {
    const wrongRole = createPlannedReadyHarness();
    const requested = requestPlan(wrongRole);
    if (!("request" in requested.data)) throw new Error("expected request");
    const intentRole = wrongRole.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
    const denied = failure(submitPlanDecision(wrongRole, requested.data.request.id, "approve", intentRole?.id));
    expect(denied.code).toBe("ROLE_NOT_ALLOWED");
    expect(wrongRole.store.getChange(wrongRole.change.id)).toMatchObject({ lifecycle_state: "IntentReady" });
    wrongRole.store.close();

    const stale = createPlannedReadyHarness();
    const staleRequest = requestPlan(stale);
    if (!("request" in staleRequest.data)) throw new Error("expected request");
    const technicalRole = stale.store.transaction((transaction) => transaction.getRoleByKey("technical_owner"));
    success(
      stale.kernel.execute(
        envelope("SubmitPlanCandidate", stale.projectId, stale.actorId, {
          ...planPayload(),
          summary: "候选已变化。"
        }, {
          target: { object_type: "change", id: stale.change.id, domain_version: 1 },
          expected_revision: stale.store.getChange(stale.change.id)?.revision
        })
      )
    );
    const expired = failure(submitPlanDecision(stale, staleRequest.data.request.id, "approve", technicalRole?.id));
    expect(expired.code).toBe("DECISION_REQUEST_EXPIRED");
    expect(stale.store.getChange(stale.change.id)).toMatchObject({ lifecycle_state: "IntentReady" });
    stale.store.close();

    const first = createPlannedReadyHarness();
    const firstRequest = requestPlan(first);
    if (!("request" in firstRequest.data)) throw new Error("expected request");
    const firstRole = first.store.transaction((transaction) => transaction.getRoleByKey("technical_owner"));
    const sharedRevision = first.store.getChange(first.change.id)?.revision;
    const winner = success(
      submitPlanDecision(first, firstRequest.data.request.id, "approve", firstRole?.id, {
        expected_revision: sharedRevision
      })
    );
    const loser = failure(
      submitPlanDecision(first, firstRequest.data.request.id, "approve", firstRole?.id, {
        expected_revision: sharedRevision
      })
    );
    expect(winner.data).toMatchObject({ plan: { domain_version: 1 } });
    expect(loser.code).toBe("REVISION_CONFLICT");
    expect(first.store.transaction((transaction) => transaction.getCurrentPlan(first.change.id))).toMatchObject({
      domain_version: 1
    });
    first.store.close();
  });
});
