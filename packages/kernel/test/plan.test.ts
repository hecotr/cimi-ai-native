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
import { validateTaskDag } from "../src/task-dag.js";

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
  verification_strategy: "用 Kernel 场景测试证明 IntentReady 后可形成合法 Plan Candidate。",
  recovery_considerations: "写失败回滚 Change、Candidate、Event、Outbox 与 Receipt。",
  tasks: [
    {
      key: "define-plan",
      title: "形成覆盖验收与验证策略的 Plan",
      kind: "governance" as const,
      dependencies: []
    },
    {
      key: "verify-acceptance",
      title: "验证验收与风险控制",
      kind: "verification" as const,
      dependencies: ["define-plan"]
    },
    {
      key: "update-docs",
      title: "更新技术说明",
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
  source: { origin: "human_cli" as const, producer: "plan-test" },
  payload,
  ...extra
});

const createHarness = (approveIntent = true) => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-plan-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute(
      envelope("InitializeProject", createInternalId(), createInternalId(), {
        name: "Plan",
        repository_kind: "directory",
        repository_path: directory,
        owner_name: "Human Owner"
      })
    )
  );
  if (!("project" in initialized.data)) throw new Error("expected project");
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = success(kernel.execute(envelope("CreateChange", projectId, actorId, { title: "Plan Change" })));
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
  if (!approveIntent) {
    const draft = store.getChange(afterGovernance.id);
    if (!draft) throw new Error("missing draft change");
    return { store, kernel, projectId, actorId, change: draft };
  }
  const afterCandidate = store.getChange(afterGovernance.id);
  if (!afterCandidate) throw new Error("missing candidate change");
  const requested = success(
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
  if (!("request" in requested.data)) throw new Error("expected request");
  const role = store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
  success(
    kernel.execute(
      envelope(
        "SubmitDecision",
        projectId,
        actorId,
        {
          request_id: requested.data.request.id,
          outcome: "approve",
          acting_role_id: role?.id,
          reason: "范围完整，批准。"
        },
        { expected_revision: store.getChange(afterCandidate.id)?.revision }
      )
    )
  );
  const ready = store.getChange(afterCandidate.id);
  if (!ready) throw new Error("missing IntentReady change");
  return { store, kernel, projectId, actorId, change: ready };
};

const submitPlan = (
  harness: ReturnType<typeof createHarness>,
  payload: Record<string, unknown> = planPayload(),
  expectedRevision = harness.change.revision
) =>
  harness.kernel.execute(
    envelope("SubmitPlanCandidate", harness.projectId, harness.actorId, payload, {
      target: { object_type: "change", id: harness.change.id, domain_version: 1 },
      expected_revision: expectedRevision
    })
  );

describe("task DAG validation", () => {
  it("accepts unique keys with existing acyclic dependencies", () => {
    expect(
      validateTaskDag([
        { key: "a", dependencies: [] },
        { key: "b", dependencies: ["a"] }
      ])
    ).toEqual({ ok: true });
  });

  it("rejects duplicate keys, missing dependencies, self-dependencies and cycles", () => {
    expect(validateTaskDag([{ key: "a", dependencies: [] }, { key: "a", dependencies: [] }])).toMatchObject({
      ok: false,
      code: "PLAN_TASK_KEY_DUPLICATE"
    });
    expect(validateTaskDag([{ key: "a", dependencies: ["missing"] }])).toMatchObject({
      ok: false,
      code: "PLAN_TASK_DEPENDENCY_MISSING"
    });
    expect(validateTaskDag([{ key: "a", dependencies: ["a"] }])).toMatchObject({
      ok: false,
      code: "PLAN_TASK_SELF_DEPENDENCY"
    });
    expect(
      validateTaskDag([
        { key: "c", dependencies: ["b"] },
        { key: "a", dependencies: ["c"] },
        { key: "b", dependencies: ["a"] }
      ])
    ).toMatchObject({
      ok: false,
      code: "PLAN_TASK_CYCLE",
      cycle_task_ids: ["a", "b", "c"]
    });
  });
});

describe("plan candidates", () => {
  it("rejects plans before IntentReady and writes nothing", () => {
    const harness = createHarness(false);
    const eventsBefore = harness.store.listEvents().length;
    const result = failure(submitPlan(harness));
    expect(result.code).toBe("CHANGE_NOT_INTENT_READY");
    expect(harness.store.listEvents()).toHaveLength(eventsBefore);
    expect(
      harness.store.transaction((transaction) => transaction.getPlanCandidateByChange(harness.change.id))
    ).toBeUndefined();
    harness.store.close();
  });

  it("binds the current Contract and persists only a candidate before approval", () => {
    const harness = createHarness();
    const contract = harness.store.transaction((transaction) => transaction.getCurrentContract(harness.change.id));
    expect(contract).toMatchObject({ domain_version: 1 });
    const submitted = success(submitPlan(harness));
    expect(submitted.data).toMatchObject({
      candidate: {
        revision: 1,
        contract_version: 1,
        contract_id: contract?.contract_id,
        summary: "覆盖验收、风险与知识义务的实施计划。"
      }
    });
    if (!("candidate" in submitted.data)) throw new Error("expected candidate");
    const candidateId = submitted.data.candidate.id;
    expect(
      harness.store.transaction((transaction) => transaction.getPlanCandidate(candidateId))
    ).toMatchObject({ revision: 1, contract_id: contract?.contract_id });
    expect(
      harness.store.transaction((transaction) => transaction.getCurrentPlan(harness.change.id))
    ).toBeUndefined();
    expect(harness.store.getChange(harness.change.id)).toMatchObject({
      lifecycle_state: "IntentReady",
      revision: harness.change.revision + 1
    });
    harness.store.close();
  });

  it("rejects incomplete knowledge coverage and cyclic DAGs without creating official tasks", () => {
    const missingKnowledge = createHarness();
    const incomplete = failure(
      submitPlan(missingKnowledge, {
        ...planPayload(),
        tasks: [
          {
            key: "only-impl",
            title: "只写实现",
            kind: "implementation",
            dependencies: []
          }
        ]
      })
    );
    expect(incomplete.code).toBe("PLAN_KNOWLEDGE_TASK_REQUIRED");
    expect(
      missingKnowledge.store.transaction((transaction) =>
        transaction.getPlanCandidateByChange(missingKnowledge.change.id)
      )
    ).toBeUndefined();
    missingKnowledge.store.close();

    const cyclic = createHarness();
    const cycle = failure(
      submitPlan(cyclic, {
        ...planPayload(),
        tasks: [
          { key: "zeta", title: "Z", kind: "governance", dependencies: ["beta"] },
          { key: "alpha", title: "A", kind: "knowledge", knowledge_source: "technical", dependencies: ["zeta"] },
          { key: "beta", title: "B", kind: "verification", dependencies: ["alpha"] }
        ]
      })
    );
    expect(cycle.code).toBe("PLAN_TASK_CYCLE");
    expect(cycle.details.cycle_task_ids).toEqual(["alpha", "beta", "zeta"]);
    expect(
      cyclic.store.transaction((transaction) => transaction.getPlanCandidateByChange(cyclic.change.id))
    ).toBeUndefined();
    cyclic.store.close();
  });

  it("rejects a stale change revision and writes nothing", () => {
    const harness = createHarness();
    const eventsBefore = harness.store.listEvents().length;
    const result = failure(submitPlan(harness, planPayload(), 99));
    expect(result.code).toBe("REVISION_CONFLICT");
    expect(harness.store.listEvents()).toHaveLength(eventsBefore);
    expect(
      harness.store.transaction((transaction) => transaction.getPlanCandidateByChange(harness.change.id))
    ).toBeUndefined();
    harness.store.close();
  });
});
