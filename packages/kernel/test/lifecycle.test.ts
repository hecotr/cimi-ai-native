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
import { CHANGE_LIFECYCLE_STATES, canAdvanceLifecycle } from "../src/lifecycle.js";
import { createPlanningWorkItem } from "../src/work-item.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T12:00:00.000Z";
const digest = (subject: string, value = "e".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
  subject
});
const recovery = {
  trigger: "verify_fail" as const,
  kind: "rollback" as const,
  target_digest: digest("known_good_artifact", "f".repeat(64)),
  scope: { in: ["service"], out: [] },
  steps: ["restore prior digest"],
  verify_checks: ["digest" as const, "health" as const, "core_path" as const],
  authorization: "preauthorized" as const
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
  if (!("ok" in result && result.ok)) throw new Error(JSON.stringify(result));
  return result;
};

const envelope = (
  type: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  revision: number,
  changeId: InternalId,
  origin: "human_cli" | "system" = "human_cli"
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
  source: { origin, producer: "lifecycle-test" },
  payload
});

const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "走完整权威生命周期。",
  outcomes: ["DeliveryClosed"],
  scope: { in: ["Contract", "Plan", "Release"], out: ["Secrets"] },
  non_goals: ["不跳过生命周期"],
  acceptance: [{ key: "AC-1", statement: "同一 Artifact digest 完成测试与生产验证。" }],
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
  summary: "实现、验证、更新知识后关闭。",
  verification_strategy: "独立 Evaluation 与同一 digest 的测试/生产验证。",
  recovery_considerations: "未知外部结果必须核对。",
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

const lifecycleOf = (kernel: CimiLoopKernel, changeId: InternalId) => {
  const change = kernel.getChange(changeId);
  if ("code" in change) throw new Error(change.code);
  return change.lifecycle_state;
};

const revisionOf = (kernel: CimiLoopKernel, changeId: InternalId) => {
  const change = kernel.getChange(changeId);
  if ("code" in change) throw new Error(change.code);
  return change.revision;
};

const exec = (
  kernel: CimiLoopKernel,
  projectId: InternalId,
  actorId: InternalId,
  changeId: InternalId,
  type: string,
  payload: Record<string, unknown>,
  origin: "human_cli" | "system" = "human_cli"
) =>
  success(
    kernel.execute(envelope(type, projectId, actorId, payload, revisionOf(kernel, changeId), changeId, origin))
  );

const recordOperation = (
  kernel: CimiLoopKernel,
  projectId: InternalId,
  actorId: InternalId,
  changeId: InternalId,
  operation: { id: InternalId; operation_key: string },
  payload: Record<string, unknown>
) =>
  exec(
    kernel,
    projectId,
    actorId,
    changeId,
    "RecordOperationResult",
    {
      operation_id: operation.id,
      operation_key: operation.operation_key,
      log_reference: "file://logs/op.log",
      log_digest: digest("op_log"),
      ...payload
    },
    "system"
  );

describe("authoritative Change lifecycle rules", () => {
  it("defines the architecture states and forbids silent jumps", () => {
    expect(CHANGE_LIFECYCLE_STATES).toEqual([
      "Draft",
      "IntentReady",
      "Planned",
      "Executing",
      "Evaluating",
      "TestDeploying",
      "TestValidating",
      "ReleaseReady",
      "ProductionDeploying",
      "ReleaseVerified",
      "DeliveryClosed",
      "Cancelled",
      "Superseded"
    ]);
    expect(canAdvanceLifecycle("Draft", "DeliveryClosed")).toBe(true);
    expect(canAdvanceLifecycle("Executing", "ReleaseVerified")).toBe(false);
    expect(canAdvanceLifecycle("ReleaseVerified", "Executing")).toBe(false);
    expect(canAdvanceLifecycle("DeliveryClosed", "Executing")).toBe(false);
  });
});

describe("authoritative Change lifecycle", () => {
  it("persists every mainline state on the Change record and closes to DeliveryClosed", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-lifecycle-"));
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
        source: { origin: "human_cli", producer: "lifecycle-test" },
        payload: {
          name: "Lifecycle",
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
        source: { origin: "human_cli", producer: "lifecycle-test" },
        payload: { title: "Full lifecycle" }
      })
    );
    if (!("change" in created.data)) throw new Error("missing change");
    const changeId = created.data.change.id;
    expect(lifecycleOf(kernel, changeId)).toBe("Draft");

    exec(kernel, projectId, actorId, changeId, "BootstrapSoloGovernance", {
      change_id: changeId,
      intent_owner_actor_id: actorId,
      technical_owner_actor_id: actorId
    });
    exec(kernel, projectId, actorId, changeId, "SubmitContractCandidate", contractPayload());
    const intent = exec(kernel, projectId, actorId, changeId, "RequestIntentDecision", { change_id: changeId });
    if (!("request" in intent.data)) throw new Error("missing intent");
    exec(kernel, projectId, actorId, changeId, "SubmitDecision", {
      request_id: intent.data.request.id,
      outcome: "approve",
      acting_role_id: kernel.listRoles().find((role) => role.role_key === "intent_owner")?.id,
      reason: "批准 Contract"
    });
    expect(lifecycleOf(kernel, changeId)).toBe("IntentReady");

    exec(kernel, projectId, actorId, changeId, "SubmitPlanCandidate", planPayload());
    const plan = exec(kernel, projectId, actorId, changeId, "RequestPlanDecision", { change_id: changeId });
    if (!("request" in plan.data)) throw new Error("missing plan");
    exec(kernel, projectId, actorId, changeId, "SubmitDecision", {
      request_id: plan.data.request.id,
      outcome: "approve",
      acting_role_id: kernel.listRoles().find((role) => role.role_key === "technical_owner")?.id,
      reason: "批准 Plan"
    });
    expect(lifecycleOf(kernel, changeId)).toBe("Planned");

    exec(kernel, projectId, actorId, changeId, "CreateExecutionWorkItems", { change_id: changeId });
    expect(lifecycleOf(kernel, changeId)).toBe("Executing");

    const sourceWorkItem = createPlanningWorkItem({
      id: createInternalId(),
      projectId,
      changeId,
      contractId: store.transaction((transaction) => transaction.getCurrentContract(changeId))!.contract_id,
      contractVersion: 1,
      policySnapshotId: store.transaction((transaction) => transaction.getLatestPolicySnapshot(projectId))!.id,
      now
    });
    const requirementSet: GateRequirementSet = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: projectId,
      change_id: changeId,
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
      project_id: projectId,
      change_id: changeId,
      work_item_id: sourceWorkItem.id,
      run_id: createInternalId(),
      context_pack_id: createInternalId(),
      binding_id: createInternalId(),
      source_snapshot_id: createInternalId(),
      contract_id: sourceWorkItem.contract_id,
      contract_version: 1,
      plan_id: createInternalId(),
      plan_version: 1,
      status: "candidate",
      summary: "lifecycle artifact",
      digest: digest("artifact"),
      content_reference: "file://artifact.bin",
      created_at: now
    };
    store.transaction((transaction) => {
      transaction.insertWorkItem(sourceWorkItem);
      transaction.insertGateRequirementSet(requirementSet);
      transaction.insertArtifact(artifact);
    });
    exec(kernel, projectId, actorId, changeId, "SubmitClaim", {
      change_id: changeId,
      claim_key: "AC-1",
      statement: "验收通过。",
      category: "intent",
      obligation: "required",
      source: "acceptance",
      artifact_id: artifact.id,
      artifact_digest: artifact.digest
    });
    const claim = store.transaction((transaction) => transaction.listClaimsByChange(changeId).at(-1));
    if (!claim) throw new Error("missing claim");
    const evidence = exec(
      kernel,
      projectId,
      actorId,
      changeId,
      "RecordEvidence",
      {
        change_id: changeId,
        claim_id: claim.id,
        stance: "Supports",
        subject_type: "artifact",
        subject_id: artifact.id,
        subject_digest: artifact.digest,
        content_reference: "repo://docs/api.md#v1",
        digest: digest("evidence"),
        producer_role: "evaluator"
      },
      "system"
    );
    exec(kernel, projectId, actorId, changeId, "RequestEvaluation", {
      change_id: changeId,
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      requirement_set_id: requirementSet.id
    });
    expect(lifecycleOf(kernel, changeId)).toBe("Evaluating");

    exec(kernel, projectId, actorId, changeId, "CompleteEvaluation", {
      change_id: changeId,
      evaluation_id: createInternalId(),
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      requirement_set_id: requirementSet.id,
      input_digest: digest("ignored"),
      result: "DENY",
      reason: "ignored"
    });
    expect(lifecycleOf(kernel, changeId)).toBe("Evaluating");

    const testEnv = exec(kernel, projectId, actorId, changeId, "RegisterEnvironment", {
      environment_key: "test",
      kind: "test",
      display_name: "Test",
      adapter_ref: "file://examples/acceptance-target"
    });
    if (!("environment" in testEnv.data)) throw new Error("missing test env");
    const testRelease = exec(kernel, projectId, actorId, changeId, "CreateRelease", {
      change_id: changeId,
      kind: "test",
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      environment_id: testEnv.data.environment.id,
      scope: { in: ["test.service"], out: [] },
      window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
      recovery
    });
    if (!("release" in testRelease.data)) throw new Error("missing test release");
    const queuedTest = exec(kernel, projectId, actorId, changeId, "QueueDeployment", {
      release_id: testRelease.data.release.id,
      environment_id: testEnv.data.environment.id
    });
    expect(lifecycleOf(kernel, changeId)).toBe("TestDeploying");
    if (!("operation" in queuedTest.data) || !queuedTest.data.operation) throw new Error("missing test deploy");
    recordOperation(kernel, projectId, actorId, changeId, queuedTest.data.operation, {
      state: "succeeded",
      actual_digest: artifact.digest,
      summary: "deployed"
    });
    expect(lifecycleOf(kernel, changeId)).toBe("TestValidating");
    const statusQueued = exec(kernel, projectId, actorId, changeId, "QueueDeployment", {
      release_id: testRelease.data.release.id,
      environment_id: testEnv.data.environment.id
    });
    if (!("operation" in statusQueued.data) || !statusQueued.data.operation) throw new Error("missing status");
    recordOperation(kernel, projectId, actorId, changeId, statusQueued.data.operation, {
      state: "succeeded",
      actual_digest: artifact.digest,
      health: "healthy",
      core_path: "pass",
      summary: "healthy"
    });
    const verifyQueued = exec(kernel, projectId, actorId, changeId, "QueueDeployment", {
      release_id: testRelease.data.release.id,
      environment_id: testEnv.data.environment.id
    });
    if (!("operation" in verifyQueued.data) || !verifyQueued.data.operation) throw new Error("missing verify");
    recordOperation(kernel, projectId, actorId, changeId, verifyQueued.data.operation, {
      state: "succeeded",
      actual_digest: artifact.digest,
      health: "healthy",
      core_path: "pass",
      summary: "verified"
    });
    expect(lifecycleOf(kernel, changeId)).toBe("ReleaseReady");

    const prodEnv = exec(kernel, projectId, actorId, changeId, "RegisterEnvironment", {
      environment_key: "prod",
      kind: "production",
      display_name: "Production",
      adapter_ref: "file://examples/acceptance-target"
    });
    if (!("environment" in prodEnv.data)) throw new Error("missing prod env");
    const prodRelease = exec(kernel, projectId, actorId, changeId, "CreateRelease", {
      change_id: changeId,
      kind: "production",
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      environment_id: prodEnv.data.environment.id,
      scope: { in: ["production.service"], out: [] },
      window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
      recovery
    });
    if (!("release" in prodRelease.data)) throw new Error("missing prod release");
    expect(lifecycleOf(kernel, changeId)).toBe("ReleaseReady");
    const requested = exec(kernel, projectId, actorId, changeId, "RequestReleaseDecision", {
      release_id: prodRelease.data.release.id
    });
    if (!("request" in requested.data)) throw new Error("missing release request");
    exec(kernel, projectId, actorId, changeId, "SubmitDecision", {
      request_id: requested.data.request.id,
      outcome: "approve",
      acting_role_id: kernel.listRoles().find((role) => role.role_key === "release_owner")?.id,
      reason: "批准生产发布"
    });
    expect(lifecycleOf(kernel, changeId)).toBe("ReleaseReady");
    const queuedProd = exec(kernel, projectId, actorId, changeId, "QueueDeployment", {
      release_id: prodRelease.data.release.id,
      environment_id: prodEnv.data.environment.id
    });
    expect(lifecycleOf(kernel, changeId)).toBe("ProductionDeploying");
    if (!("operation" in queuedProd.data) || !queuedProd.data.operation) throw new Error("missing prod deploy");
    recordOperation(kernel, projectId, actorId, changeId, queuedProd.data.operation, {
      state: "succeeded",
      actual_digest: artifact.digest,
      summary: "deployed"
    });
    const prodStatus = exec(kernel, projectId, actorId, changeId, "QueueDeployment", {
      release_id: prodRelease.data.release.id,
      environment_id: prodEnv.data.environment.id
    });
    if (!("operation" in prodStatus.data) || !prodStatus.data.operation) throw new Error("missing prod status");
    recordOperation(kernel, projectId, actorId, changeId, prodStatus.data.operation, {
      state: "succeeded",
      actual_digest: artifact.digest,
      health: "healthy",
      core_path: "pass",
      summary: "healthy"
    });
    const prodVerify = exec(kernel, projectId, actorId, changeId, "QueueDeployment", {
      release_id: prodRelease.data.release.id,
      environment_id: prodEnv.data.environment.id
    });
    if (!("operation" in prodVerify.data) || !prodVerify.data.operation) throw new Error("missing prod verify");
    recordOperation(kernel, projectId, actorId, changeId, prodVerify.data.operation, {
      state: "succeeded",
      actual_digest: artifact.digest,
      health: "healthy",
      core_path: "pass",
      summary: "verified"
    });
    expect(lifecycleOf(kernel, changeId)).toBe("ReleaseVerified");

    if (!("evidence" in evidence.data)) throw new Error("missing evidence");
    const currentPlan = store.transaction((transaction) => transaction.getCurrentPlan(changeId));
    const knowledgeTask = currentPlan
      ? store
          .transaction((transaction) => transaction.listTasks(currentPlan.plan_id, currentPlan.domain_version))
          .find((task) => task.kind === "knowledge")
      : undefined;
    if (!knowledgeTask) throw new Error("missing knowledge task");
    exec(kernel, projectId, actorId, changeId, "RecordKnowledgeUpdate", {
      change_id: changeId,
      task_id: knowledgeTask.id,
      knowledge_source: "technical",
      conclusion: "Update",
      external_reference_id: evidence.data.evidence.external_reference_id,
      evidence_id: evidence.data.evidence.id
    });
    const proposed = exec(kernel, projectId, actorId, changeId, "ProposeClose", {
      change_id: changeId,
      residual_risk: "无未关闭生产风险。",
      known_issues: ["文档链接待补"]
    });
    if (!("closure_evaluation" in proposed.data)) throw new Error("missing closure");
    exec(kernel, projectId, actorId, changeId, "CloseChange", {
      change_id: changeId,
      closure_evaluation_id: proposed.data.closure_evaluation.id
    });
    const closed = kernel.getChange(changeId);
    if ("code" in closed) throw new Error(closed.code);
    expect(closed.lifecycle_state).toBe("DeliveryClosed");
    expect(
      store.transaction((transaction) => transaction.getChange(changeId)?.lifecycle_state)
    ).toBe("DeliveryClosed");
  });
});
