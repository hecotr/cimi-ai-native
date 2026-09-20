import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type AttentionItem,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../src/kernel.js";
import { createPlanningWorkItem } from "../src/work-item.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string, value = "a".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

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

const projection = (items: AttentionItem[]) =>
  items
    .map((item) => ({
      kind: item.kind,
      subject_id: item.subject_id,
      summary: item.summary,
      status: item.status,
      change_id: item.change_id
    }))
    .sort((left, right) => `${left.kind}:${left.subject_id}`.localeCompare(`${right.kind}:${right.subject_id}`));

describe("V1 workbench projection rebuild", () => {
  it("rebuilds attention from facts after deleting read models and ignores notification state", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-read-model-"));
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
        source: { origin: "human_cli" as const, producer: "m5-read-model-test" },
        payload: {
          name: "Read Model",
          repository_kind: "directory",
          repository_path: directory,
          owner_name: "Owner"
        }
      })
    );
    if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
    const created = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CreateChange",
        requested_at: now,
        actor_id: initialized.data.actor.id,
        project_id: initialized.data.project.id,
        source: { origin: "human_cli" as const, producer: "m5-read-model-test" },
        payload: { title: "Attention rebuild" }
      })
    );
    if (!("change" in created.data)) throw new Error("missing change");
    const projectId = initialized.data.project.id;
    const actorId = initialized.data.actor.id;
    const changeId = created.data.change.id;
    const blockerId = createInternalId();
    const runId = createInternalId();
    const evidenceId = createInternalId();
    const requestId = createInternalId();
    const operationId = createInternalId();
    const taskId = createInternalId();
    const planId = createInternalId();
    const claimId = createInternalId();
    store.transaction((transaction) => {
      transaction.insertBlocker({
        schema_version: SCHEMA_VERSION,
        id: blockerId,
        project_id: projectId,
        change_id: changeId,
        code: "RUNTIME_LOST",
        summary: "Runtime process is unknown.",
        status: "open",
        resolution_condition: "reconcile the runtime process",
        created_at: now,
        updated_at: now,
        revision: 1
      });
      const workItem = createPlanningWorkItem({
        id: createInternalId(),
        projectId,
        changeId,
        contractId: createInternalId(),
        contractVersion: 1,
        policySnapshotId: createInternalId(),
        now
      });
      transaction.insertWorkItem(workItem);
      transaction.insertAgentRun({
        schema_version: SCHEMA_VERSION,
        id: runId,
        project_id: projectId,
        change_id: changeId,
        work_item_id: workItem.id,
        status: "failed",
        attempt: 1,
        summary: "Evaluator run failed.",
        log_reference: "file://logs/run.log",
        log_digest: digest("runtime_log"),
        created_at: now,
        updated_at: now,
        revision: 1
      });
      transaction.insertClaim({
        schema_version: SCHEMA_VERSION,
        id: claimId,
        project_id: projectId,
        change_id: changeId,
        claim_key: "AC-1",
        statement: "Acceptance evidence is current.",
        category: "outcome",
        obligation: "required",
        source: "contract",
        contract_id: workItem.contract_id,
        contract_version: 1,
        created_at: now
      });
      transaction.insertEvidence({
        schema_version: SCHEMA_VERSION,
        id: evidenceId,
        project_id: projectId,
        change_id: changeId,
        claim_id: claimId,
        stance: "Supports",
        subject_type: "artifact",
        subject_id: createInternalId(),
        subject_digest: digest("artifact"),
        content_reference: "file://evidence/junit.xml",
        digest: digest("evidence"),
        producer_role: "deterministic_test",
        created_at: now
      });
      transaction.insertImpactAssessment({
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        project_id: projectId,
        change_id: changeId,
        trigger: "artifact",
        subject_type: "artifact",
        subject_id: evidenceId,
        rule: "artifact_digest_changed",
        old_input_digest: digest("old-artifact"),
        new_input_digest: digest("new-artifact"),
        old_validity: "Valid",
        new_validity: "Stale",
        affected_ids: [evidenceId],
        created_at: now
      });
      transaction.insertDecisionRequest({
        schema_version: SCHEMA_VERSION,
        id: requestId,
        project_id: projectId,
        change_id: changeId,
        request_type: "intent",
        required_role_key: "project_owner",
        candidate_id: createInternalId(),
        candidate_revision: 1,
        profile_id: createInternalId(),
        profile_version: 1,
        risk_assessment_id: createInternalId(),
        knowledge_assessment_id: createInternalId(),
        policy_snapshot_id: workItem.policy_snapshot_id,
        digest: digest("decision-request"),
        status: "open",
        created_at: now,
        updated_at: now,
        revision: 1
      });
      transaction.insertExternalOperation({
        schema_version: SCHEMA_VERSION,
        id: operationId,
        project_id: projectId,
        change_id: changeId,
        operation_key: `deploy:${changeId}`,
        operation_kind: "deploy",
        environment_id: createInternalId(),
        release_id: createInternalId(),
        deployment_id: createInternalId(),
        artifact_digest: digest("artifact"),
        state: "unknown",
        log_reference: "file://logs/deploy.log",
        log_digest: digest("deploy_log"),
        summary: "Deploy result is unknown.",
        created_at: now,
        updated_at: now,
        revision: 1
      });
      transaction.insertKnowledgeImpactAssessment({
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        project_id: projectId,
        change_id: changeId,
        revision: 1,
        created_at: now,
        updated_at: now,
        sources: {
          product_business: { conclusion: "NoImpact", rationale: "无产品变化。" },
          technical: {
            conclusion: "Update",
            owner_role: "technical_owner",
            gate: "change_closure",
            summary: "必须更新说明。"
          },
          operations: { conclusion: "NoImpact", rationale: "无运维变化。" },
          communication: { conclusion: "NoImpact", rationale: "无沟通变化。" }
        }
      });
      transaction.insertPlanVersion({
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        plan_id: planId,
        project_id: projectId,
        change_id: changeId,
        domain_version: 1,
        candidate_id: createInternalId(),
        contract_id: workItem.contract_id,
        contract_version: 1,
        summary: "知识义务计划。",
        verification_strategy: "用 KnowledgeUpdateEvidence 证明闭环。",
        recovery_considerations: "缺口进入 Attention。",
        task_ids: [taskId],
        created_at: now
      });
      transaction.insertTask({
        schema_version: SCHEMA_VERSION,
        id: taskId,
        project_id: projectId,
        change_id: changeId,
        plan_id: planId,
        plan_version: 1,
        revision: 1,
        created_at: now,
        updated_at: now,
        key: "update-docs",
        title: "更新技术说明",
        kind: "knowledge",
        dependencies: [],
        knowledge_source: "technical"
      });
    });

    const first = kernel.rebuildReadModels(projectId);
    const kinds = first.map((item) => item.kind).sort();
    expect(kinds).toEqual([
      "blocker",
      "decision",
      "failure",
      "knowledge_gap",
      "stale_evidence",
      "unknown_deployment"
    ]);
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "blocker", subject_id: blockerId, status: "open" }),
        expect.objectContaining({ kind: "failure", subject_id: runId, status: "open" }),
        expect.objectContaining({ kind: "stale_evidence", subject_id: evidenceId, status: "open" }),
        expect.objectContaining({ kind: "decision", subject_id: requestId, status: "open" }),
        expect.objectContaining({ kind: "unknown_deployment", subject_id: operationId, status: "open" }),
        expect.objectContaining({ kind: "knowledge_gap", subject_id: taskId, status: "open" })
      ])
    );

    const inboxBefore = kernel.listDecisionInbox(actorId);
    if ("code" in inboxBefore) throw new Error(inboxBefore.code);
    const roomBefore = kernel.getChangeRoom(changeId);
    if ("code" in roomBefore) throw new Error(roomBefore.code);
    const timelineBefore = kernel.getTimeline(changeId);
    if ("code" in timelineBefore) throw new Error(timelineBefore.code);

    store.transaction((transaction) => {
      transaction.deleteReadModels();
      transaction.upsertReadModelCheckpoint("attention", 0, { skipped: true });
    });
    expect(kernel.listOpenAttentionItems(projectId)).toEqual([]);

    const rebuilt = kernel.rebuildReadModels(projectId);
    expect(projection(rebuilt)).toEqual(projection(first));
    expect(kernel.listOpenAttentionItems(projectId).map((item) => item.kind).sort()).toEqual(kinds);

    const inboxAfter = kernel.listDecisionInbox(actorId);
    const roomAfter = kernel.getChangeRoom(changeId);
    const timelineAfter = kernel.getTimeline(changeId);
    expect(inboxAfter).toEqual(inboxBefore);
    expect(roomAfter).toEqual(roomBefore);
    expect(timelineAfter).toEqual(timelineBefore);

    const decisionAttention = rebuilt.find((item) => item.kind === "decision");
    if (!decisionAttention) throw new Error("missing decision attention");
    kernel.acknowledgeAttention(decisionAttention.id, actorId);
    expect(kernel.listOpenAttentionItems(projectId).some((item) => item.kind === "decision")).toBe(false);
    const inboxStillOpen = kernel.listDecisionInbox(actorId);
    if ("code" in inboxStillOpen) throw new Error(inboxStillOpen.code);
    expect(inboxStillOpen.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ request_id: requestId, status: "open" })])
    );
    expect(
      store.transaction((transaction) => transaction.listDecisions(changeId))
    ).toEqual([]);
    expect(
      store.transaction((transaction) => transaction.getDecisionRequest(requestId)?.status)
    ).toBe("open");

    store.transaction((transaction) => transaction.deleteReadModels());
    expect(projection(kernel.rebuildReadModels(projectId))).toEqual(projection(first));
  });
});
