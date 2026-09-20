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
import { nextDomainVersion } from "../src/amendment.js";
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

const contractPayload = (intent = "批准后进入 IntentReady。") => ({
  profile_key: "feature" as const,
  intent,
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

const planPayload = (summary = "覆盖验收、风险与知识义务的实施计划。") => ({
  summary,
  verification_strategy: "通过 Kernel 场景测试证明版本化 Amendment。",
  recovery_considerations: "拒绝或撤回的 Amendment 不占正式版本号。",
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
  source: { origin: "human_cli" as const, producer: "amendment-test" },
  payload,
  ...extra
});

const createHarness = (through: "intent" | "planned") => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-amendment-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute(
      envelope("InitializeProject", createInternalId(), createInternalId(), {
        name: "Amendment",
        repository_kind: "directory",
        repository_path: directory,
        owner_name: "Human Owner"
      })
    )
  );
  if (!("project" in initialized.data)) throw new Error("expected project");
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = success(kernel.execute(envelope("CreateChange", projectId, actorId, { title: "Amendment" })));
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
  if (through === "intent") {
    const ready = store.getChange(afterCandidate.id);
    if (!ready) throw new Error("missing IntentReady change");
    return { store, kernel, projectId, actorId, change: ready };
  }
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
  const planRequested = success(
    kernel.execute(
      envelope(
        "RequestPlanDecision",
        projectId,
        actorId,
        { change_id: ready.id },
        {
          target: { object_type: "change", id: ready.id, domain_version: 1 },
          expected_revision: store.getChange(ready.id)?.revision
        }
      )
    )
  );
  if (!("request" in planRequested.data)) throw new Error("expected plan request");
  const technicalRole = store.transaction((transaction) => transaction.getRoleByKey("technical_owner"));
  success(
    kernel.execute(
      envelope(
        "SubmitDecision",
        projectId,
        actorId,
        {
          request_id: planRequested.data.request.id,
          outcome: "approve",
          acting_role_id: technicalRole?.id,
          reason: "批准 Plan。"
        },
        { expected_revision: store.getChange(ready.id)?.revision }
      )
    )
  );
  const planned = store.getChange(ready.id);
  if (!planned) throw new Error("missing Planned change");
  return { store, kernel, projectId, actorId, change: planned };
};

describe("amendment version helper", () => {
  it("increments the current domain version", () => {
    expect(nextDomainVersion(1)).toBe(2);
  });
});

describe("contract and plan amendments", () => {
  it("approves a contract amendment into v2, keeps v1 and expires old plan requests", () => {
    const harness = createHarness("intent");
    success(
      harness.kernel.execute(
        envelope("SubmitPlanCandidate", harness.projectId, harness.actorId, planPayload(), {
          target: { object_type: "change", id: harness.change.id, domain_version: 1 },
          expected_revision: harness.change.revision
        })
      )
    );
    const planRequest = success(
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
    if (!("request" in planRequest.data)) throw new Error("expected plan request");
    const originalContract = harness.store.transaction((transaction) =>
      transaction.getCurrentContract(harness.change.id)
    );
    expect(originalContract?.domain_version).toBe(1);

    success(
      harness.kernel.execute(
        envelope(
          "SubmitContractAmendment",
          harness.projectId,
          harness.actorId,
          { ...contractPayload("修订后的意图。"), base_version: 1 },
          {
            target: { object_type: "change", id: harness.change.id, domain_version: 1 },
            expected_revision: harness.store.getChange(harness.change.id)?.revision
          }
        )
      )
    );
    const requested = success(
      harness.kernel.execute(
        envelope(
          "RequestIntentDecision",
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
    if (!("request" in requested.data)) throw new Error("expected intent request");
    const role = harness.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
    const approved = success(
      harness.kernel.execute(
        envelope(
          "SubmitDecision",
          harness.projectId,
          harness.actorId,
          {
            request_id: requested.data.request.id,
            outcome: "approve",
            acting_role_id: role?.id,
            reason: "批准 Contract v2。"
          },
          { expected_revision: harness.store.getChange(harness.change.id)?.revision }
        )
      )
    );
    expect(approved.data).toMatchObject({ contract: { domain_version: 2, intent: "修订后的意图。" } });
    expect(
      harness.store.transaction((transaction) => transaction.getCurrentContract(harness.change.id))
    ).toMatchObject({ domain_version: 2, contract_id: originalContract?.contract_id });
    expect(
      harness.store.transaction((transaction) =>
        originalContract ? transaction.getContractVersion(originalContract.id) : undefined
      )
    ).toMatchObject({ domain_version: 1, intent: "批准后进入 IntentReady。" });
    const expiredRequestId = planRequest.data.request.id;
    expect(
      harness.store.transaction((transaction) => transaction.getDecisionRequest(expiredRequestId))
    ).toMatchObject({ status: "expired" });
    expect(harness.store.getChange(harness.change.id)).toMatchObject({ lifecycle_state: "IntentReady" });
    harness.store.close();
  });

  it("rejects planned contract amendments and stale bases without occupying a version", () => {
    const planned = createHarness("planned");
    const current = planned.store.transaction((transaction) => transaction.getCurrentContract(planned.change.id));
    const blocked = failure(
      planned.kernel.execute(
        envelope(
          "SubmitContractAmendment",
          planned.projectId,
          planned.actorId,
          { ...contractPayload("Planned 后修订。"), base_version: 1 },
          {
            target: { object_type: "change", id: planned.change.id, domain_version: 1 },
            expected_revision: planned.change.revision
          }
        )
      )
    );
    expect(blocked.code).toBe("M1_AMENDMENT_AFTER_PLANNED_UNSUPPORTED");
    expect(
      planned.store.transaction((transaction) => transaction.getCurrentContract(planned.change.id))
    ).toMatchObject({ domain_version: 1, id: current?.id });
    planned.store.close();

    const stale = createHarness("intent");
    const staleResult = failure(
      stale.kernel.execute(
        envelope(
          "SubmitContractAmendment",
          stale.projectId,
          stale.actorId,
          { ...contractPayload(), base_version: 99 },
          {
            target: { object_type: "change", id: stale.change.id, domain_version: 1 },
            expected_revision: stale.change.revision
          }
        )
      )
    );
    expect(staleResult.code).toBe("AMENDMENT_BASE_STALE");
    expect(
      stale.store.transaction((transaction) => transaction.getCurrentContract(stale.change.id))
    ).toMatchObject({ domain_version: 1 });
    stale.store.close();
  });

  it("approves a plan amendment into v2 while staying Planned, and reject does not occupy a version", () => {
    const harness = createHarness("planned");
    const originalPlan = harness.store.transaction((transaction) => transaction.getCurrentPlan(harness.change.id));
    expect(originalPlan?.domain_version).toBe(1);
    success(
      harness.kernel.execute(
        envelope(
          "SubmitPlanAmendment",
          harness.projectId,
          harness.actorId,
          { ...planPayload("修订后的验证路径。"), base_version: 1 },
          {
            target: { object_type: "change", id: harness.change.id, domain_version: 1 },
            expected_revision: harness.change.revision
          }
        )
      )
    );
    const requested = success(
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
    if (!("request" in requested.data)) throw new Error("expected plan request");
    const role = harness.store.transaction((transaction) => transaction.getRoleByKey("technical_owner"));
    const approved = success(
      harness.kernel.execute(
        envelope(
          "SubmitDecision",
          harness.projectId,
          harness.actorId,
          {
            request_id: requested.data.request.id,
            outcome: "approve",
            acting_role_id: role?.id,
            reason: "批准 Plan v2。"
          },
          { expected_revision: harness.store.getChange(harness.change.id)?.revision }
        )
      )
    );
    expect(approved.data).toMatchObject({ plan: { domain_version: 2, summary: "修订后的验证路径。" } });
    expect(harness.store.getChange(harness.change.id)).toMatchObject({ lifecycle_state: "Planned" });
    expect(
      harness.store.transaction((transaction) => transaction.getCurrentPlan(harness.change.id))
    ).toMatchObject({ domain_version: 2, plan_id: originalPlan?.plan_id });
    expect(
      harness.store.transaction((transaction) =>
        originalPlan ? transaction.getPlanVersion(originalPlan.id) : undefined
      )
    ).toMatchObject({ domain_version: 1 });
    if (!("plan" in approved.data) || !approved.data.plan) throw new Error("expected plan");
    const amendedPlanId = approved.data.plan.plan_id;
    expect(
      harness.store.transaction((transaction) => transaction.listTasks(amendedPlanId, 2))
    ).toHaveLength(3);
    harness.store.close();

    const rejected = createHarness("intent");
    success(
      rejected.kernel.execute(
        envelope(
          "SubmitContractAmendment",
          rejected.projectId,
          rejected.actorId,
          { ...contractPayload("将被拒绝的修订。"), base_version: 1 },
          {
            target: { object_type: "change", id: rejected.change.id, domain_version: 1 },
            expected_revision: rejected.store.getChange(rejected.change.id)?.revision
          }
        )
      )
    );
    const rejectRequest = success(
      rejected.kernel.execute(
        envelope(
          "RequestIntentDecision",
          rejected.projectId,
          rejected.actorId,
          { change_id: rejected.change.id },
          {
            target: { object_type: "change", id: rejected.change.id, domain_version: 1 },
            expected_revision: rejected.store.getChange(rejected.change.id)?.revision
          }
        )
      )
    );
    if (!("request" in rejectRequest.data)) throw new Error("expected request");
    const intentRole = rejected.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
    success(
      rejected.kernel.execute(
        envelope(
          "SubmitDecision",
          rejected.projectId,
          rejected.actorId,
          {
            request_id: rejectRequest.data.request.id,
            outcome: "reject",
            acting_role_id: intentRole?.id,
            reason: "这次修订不接受。"
          },
          { expected_revision: rejected.store.getChange(rejected.change.id)?.revision }
        )
      )
    );
    expect(
      rejected.store.transaction((transaction) => transaction.getCurrentContract(rejected.change.id))
    ).toMatchObject({ domain_version: 1 });
    expect(rejected.store.getChange(rejected.change.id)).toMatchObject({
      lifecycle_state: "IntentReady",
      operating_status: "Paused"
    });
    rejected.store.close();
  });
});
