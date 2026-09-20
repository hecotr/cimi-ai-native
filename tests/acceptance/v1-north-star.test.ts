import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId, SCHEMA_VERSION, type InternalId } from "../../packages/protocol/src/index.js";
import { createPlanningWorkItem } from "../../packages/kernel/src/work-item.js";
import {
  contractPayload,
  digest,
  exec,
  openAcceptanceProject,
  planPayload,
  recovery,
  success,
  type AcceptanceContext
} from "./helpers.js";

const temporary: Array<{ store: { close(): void }; directory: string }> = [];

afterEach(() => {
  while (temporary.length > 0) {
    const item = temporary.pop();
    item?.store.close();
    if (item) rmSync(item.directory, { recursive: true, force: true });
  }
});

const roleId = (
  ctx: AcceptanceContext,
  key: "intent_owner" | "technical_owner" | "project_owner" | "release_owner"
): InternalId => {
  const role = ctx.store.transaction((transaction) => transaction.getRoleByKey(key));
  if (!role) throw new Error(`missing role ${key}`);
  return role.id;
};

const verifyRelease = (ctx: AcceptanceContext, releaseId: InternalId, environmentId: InternalId, artifactDigest: ReturnType<typeof digest>) => {
  const deploy = exec(ctx, "QueueDeployment", { release_id: releaseId, environment_id: environmentId });
  if (!("operation" in deploy.data) || !deploy.data.operation) throw new Error("missing deploy");
  exec(ctx, "RecordOperationResult", {
    operation_id: deploy.data.operation.id,
    operation_key: deploy.data.operation.operation_key,
    state: "succeeded",
    actual_digest: artifactDigest,
    log_reference: "file://logs/deploy.log",
    log_digest: digest("deploy_log"),
    summary: "deployed requested digest"
  });
  const status = exec(ctx, "QueueDeployment", { release_id: releaseId, environment_id: environmentId });
  if (!("operation" in status.data) || !status.data.operation) throw new Error("missing status");
  exec(ctx, "RecordOperationResult", {
    operation_id: status.data.operation.id,
    operation_key: status.data.operation.operation_key,
    state: "succeeded",
    actual_digest: artifactDigest,
    health: "healthy",
    core_path: "pass",
    log_reference: "file://logs/status.log",
    log_digest: digest("status_log"),
    summary: "status healthy"
  });
  const verify = exec(ctx, "QueueDeployment", { release_id: releaseId, environment_id: environmentId });
  if (!("operation" in verify.data) || !verify.data.operation) throw new Error("missing verify");
  exec(ctx, "RecordOperationResult", {
    operation_id: verify.data.operation.id,
    operation_key: verify.data.operation.operation_key,
    state: "succeeded",
    actual_digest: artifactDigest,
    health: "healthy",
    core_path: "pass",
    log_reference: "file://logs/verify.log",
    log_digest: digest("verify_log"),
    summary: "verified requested digest"
  });
};

describe("V1 north-star Feature loop", () => {
  it("closes a Feature after intent, plan, evaluation, same-digest delivery, knowledge, and export", () => {
    const ctx = openAcceptanceProject("cimiloop-v1-north-star-");
    temporary.push(ctx);
    expect(execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ctx.directory, encoding: "utf8" }).trim()).toBe(
      "true"
    );

    exec(ctx, "BootstrapSoloGovernance", {
      change_id: ctx.changeId,
      intent_owner_actor_id: ctx.actorId,
      technical_owner_actor_id: ctx.actorId
    });
    exec(ctx, "SubmitContractCandidate", contractPayload());
    const intent = exec(ctx, "RequestIntentDecision", { change_id: ctx.changeId });
    if (!("request" in intent.data)) throw new Error("missing intent request");
    exec(ctx, "SubmitDecision", {
      request_id: intent.data.request.id,
      outcome: "approve",
      acting_role_id: roleId(ctx, "intent_owner"),
      reason: "Approve Feature Contract."
    });
    exec(ctx, "SubmitPlanCandidate", planPayload());
    const plan = exec(ctx, "RequestPlanDecision", { change_id: ctx.changeId });
    if (!("request" in plan.data)) throw new Error("missing plan request");
    const planned = exec(ctx, "SubmitDecision", {
      request_id: plan.data.request.id,
      outcome: "approve",
      acting_role_id: roleId(ctx, "technical_owner"),
      reason: "Approve Feature Plan."
    });
    if (!("change" in planned.data)) throw new Error("missing planned change");
    expect(planned.data.change.lifecycle_state).toBe("Planned");

    const workItem = createPlanningWorkItem({
      id: createInternalId(),
      projectId: ctx.projectId,
      changeId: ctx.changeId,
      contractId: ctx.store.transaction((transaction) => transaction.getCurrentContract(ctx.changeId))!.contract_id,
      contractVersion: 1,
      policySnapshotId: ctx.store.transaction((transaction) => transaction.getLatestPolicySnapshot(ctx.projectId))!.id,
      now: "2026-09-20T12:00:00.000Z"
    });
    const artifactId = createInternalId();
    const artifactDigest = digest("artifact");
    const requirementSetId = createInternalId();
    ctx.store.transaction((transaction) => {
      transaction.insertWorkItem(workItem);
      transaction.insertGateRequirementSet({
        schema_version: SCHEMA_VERSION,
        id: requirementSetId,
        project_id: ctx.projectId,
        change_id: ctx.changeId,
        version: 1,
        profile_key: "feature",
        policy_snapshot_id: workItem.policy_snapshot_id,
        contract_id: workItem.contract_id,
        contract_version: 1,
        items: [{ claim_key: "AC-1", obligation: "required", source: "acceptance", accepted_evidence_kinds: ["evaluator"] }],
        digest: digest("requirement_set"),
        created_at: "2026-09-20T12:00:00.000Z"
      });
      transaction.insertArtifact({
        schema_version: SCHEMA_VERSION,
        id: artifactId,
        project_id: ctx.projectId,
        change_id: ctx.changeId,
        work_item_id: workItem.id,
        run_id: createInternalId(),
        context_pack_id: createInternalId(),
        binding_id: createInternalId(),
        source_snapshot_id: createInternalId(),
        contract_id: workItem.contract_id,
        contract_version: 1,
        plan_id: createInternalId(),
        plan_version: 1,
        status: "candidate",
        summary: "north-star artifact",
        digest: artifactDigest,
        content_reference: `file://${resolve(ctx.directory, "artifact.bin").replaceAll("\\", "/")}`,
        created_at: "2026-09-20T12:00:00.000Z"
      });
    });
    const claim = exec(ctx, "SubmitClaim", {
      change_id: ctx.changeId,
      claim_key: "AC-1",
      statement: "Acceptance passed.",
      category: "intent",
      obligation: "required",
      source: "acceptance",
      artifact_id: artifactId,
      artifact_digest: artifactDigest
    });
    if (!("claim" in claim.data)) throw new Error("missing claim");
    const evidence = exec(
      ctx,
      "RecordEvidence",
      {
        change_id: ctx.changeId,
        claim_id: claim.data.claim.id,
        stance: "Supports",
        subject_type: "artifact",
        subject_id: artifactId,
        subject_digest: artifactDigest,
        content_reference: "repo://docs/api.md#v1",
        digest: digest("knowledge-evidence"),
        producer_role: "evaluator"
      },
      ctx.revision,
      "system"
    );
    if (!("evidence" in evidence.data)) throw new Error("missing evidence");
    expect(evidence.data.evidence.external_reference_id).toMatch(/^[0-9a-f-]{36}$/i);
    const evaluation = exec(ctx, "CompleteEvaluation", {
      change_id: ctx.changeId,
      evaluation_id: createInternalId(),
      artifact_id: artifactId,
      artifact_digest: artifactDigest,
      requirement_set_id: requirementSetId,
      input_digest: digest("ignored"),
      result: "DENY",
      reason: "evaluator self-score is ignored"
    });
    if (!("evaluation" in evaluation.data)) throw new Error("missing evaluation");
    expect(evaluation.data.evaluation.result).toBe("ALLOW");

    const testEnv = exec(ctx, "RegisterEnvironment", {
      environment_key: "acceptance-test",
      kind: "test",
      display_name: "Acceptance Test",
      adapter_ref: "file://examples/acceptance-target"
    });
    if (!("environment" in testEnv.data)) throw new Error("missing test env");
    const testRelease = exec(ctx, "CreateRelease", {
      change_id: ctx.changeId,
      kind: "test",
      artifact_id: artifactId,
      artifact_digest: artifactDigest,
      environment_id: testEnv.data.environment.id,
      scope: { in: ["acceptance.health"], out: [] },
      window: { starts_at: "2026-09-20T12:00:00.000Z", ends_at: "2026-09-21T12:00:00.000Z" },
      recovery: recovery("acceptance.health")
    });
    if (!("release" in testRelease.data)) throw new Error("missing test release");
    expect(testRelease.data.release.status).toBe("authorized");
    verifyRelease(ctx, testRelease.data.release.id, testEnv.data.environment.id, artifactDigest);
    expect(ctx.kernel.getRelease(testRelease.data.release.id)).toMatchObject({
      status: "verified",
      artifact_digest: artifactDigest
    });

    const prodEnv = exec(ctx, "RegisterEnvironment", {
      environment_key: "prod",
      kind: "production",
      display_name: "Production",
      adapter_ref: "file://examples/acceptance-target"
    });
    if (!("environment" in prodEnv.data)) throw new Error("missing prod env");
    const prodRelease = exec(ctx, "CreateRelease", {
      change_id: ctx.changeId,
      kind: "production",
      artifact_id: artifactId,
      artifact_digest: artifactDigest,
      environment_id: prodEnv.data.environment.id,
      scope: { in: ["production.service"], out: [] },
      window: { starts_at: "2026-09-20T12:00:00.000Z", ends_at: "2026-09-21T12:00:00.000Z" },
      recovery: recovery("production.service")
    });
    if (!("release" in prodRelease.data)) throw new Error("missing prod release");
    expect(prodRelease.data.release.status).toBe("drafted");
    const releaseDecision = exec(ctx, "RequestReleaseDecision", { release_id: prodRelease.data.release.id });
    if (!("request" in releaseDecision.data)) throw new Error("missing release request");
    exec(ctx, "SubmitDecision", {
      request_id: releaseDecision.data.request.id,
      outcome: "approve",
      acting_role_id: roleId(ctx, "release_owner"),
      reason: "Approve production release of the evaluated digest."
    });
    verifyRelease(ctx, prodRelease.data.release.id, prodEnv.data.environment.id, artifactDigest);
    expect(ctx.kernel.getRelease(prodRelease.data.release.id)).toMatchObject({
      status: "verified",
      artifact_digest: artifactDigest
    });

    const currentPlan = ctx.store.transaction((transaction) => transaction.getCurrentPlan(ctx.changeId));
    const knowledgeTask = currentPlan
      ? ctx.store
          .transaction((transaction) => transaction.listTasks(currentPlan.plan_id, currentPlan.domain_version))
          .find((task) => task.kind === "knowledge")
      : undefined;
    if (!knowledgeTask) throw new Error("missing knowledge task");
    const knowledge = exec(ctx, "RecordKnowledgeUpdate", {
      change_id: ctx.changeId,
      task_id: knowledgeTask.id,
      knowledge_source: "technical",
      conclusion: "Update",
      external_reference_id: evidence.data.evidence.external_reference_id,
      evidence_id: evidence.data.evidence.id
    });
    if (!("knowledge_update" in knowledge.data)) throw new Error("missing knowledge update");

    const proposed = exec(ctx, "ProposeClose", {
      change_id: ctx.changeId,
      residual_risk: "No open production defects.",
      known_issues: ["Docs link still pending."]
    });
    if (!("closure_evaluation" in proposed.data)) throw new Error("missing closure");
    expect(proposed.data.closure_evaluation.result).toBe("ALLOW");
    exec(ctx, "CloseChange", {
      change_id: ctx.changeId,
      closure_evaluation_id: proposed.data.closure_evaluation.id
    });
    const project = ctx.kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    const exported = success(
      ctx.kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "ExportProject",
        requested_at: "2026-09-20T12:00:00.000Z",
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: project.revision,
        source: { origin: "human_cli" as const, producer: "v1-acceptance" },
        payload: { scope: "project" }
      })
    );
    if (!("export_manifest" in exported.data)) throw new Error("missing export");
    expect(exported.data.export_manifest.content_digest.value).toMatch(/^[0-9a-f]{64}$/);
    expect(exported.data.export_manifest.ids.length).toBeGreaterThan(0);
    const timeline = ctx.kernel.getTimeline(ctx.changeId);
    if ("code" in timeline) throw new Error(timeline.code);
    expect(timeline.events.map((item) => item.event_type)).toEqual(
      expect.arrayContaining(["ChangeCreated", "DecisionSubmitted", "ChangeClosed"])
    );
    expect(ctx.store.listEvents().map((item) => item.event_type)).toEqual(
      expect.arrayContaining(["ProjectExported"])
    );
  });
});
