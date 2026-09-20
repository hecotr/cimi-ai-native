import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type ContractVersion,
  type DomainError,
  type InternalId,
  type KnowledgeImpactAssessment,
  type Release
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { createProposedLearningCandidate, learningIsPromotedKnowledge } from "../src/closure/learning.js";
import {
  classifyCloseNotes,
  deliveryCloseReady,
  hasUnresolvedExternalSideEffects
} from "../src/closure/terminal-actions.js";
import { CimiLoopKernel } from "../src/kernel.js";
import { createPlanningWorkItem } from "../src/work-item.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string, value = "c".repeat(64)) => ({
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

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

describe("terminal action rules", () => {
  it("requires a verified production release unless the profile has a legal endpoint", () => {
    expect(
      deliveryCloseReady("feature", [{ kind: "test", status: "verified" }])
    ).toMatchObject({ ready: false, reason: "release_not_verified" });
    expect(
      deliveryCloseReady("feature", [{ kind: "production", status: "verified" }])
    ).toMatchObject({ ready: true, reason: "production_verified" });
    expect(
      deliveryCloseReady("incident", [{ kind: "test", status: "verified" }])
    ).toMatchObject({ ready: true, reason: "incident_test_endpoint" });
  });

  it("requires classified residual risk and known issues", () => {
    expect(classifyCloseNotes("残余风险：无未关闭缺陷。", ["文档待补链"])).toEqual({ classified: true });
    expect(classifyCloseNotes("   ", [])).toEqual({ classified: false });
  });

  it("blocks cancel when external results are unknown or pending", () => {
    expect(hasUnresolvedExternalSideEffects([{ state: "succeeded" }])).toBe(false);
    expect(hasUnresolvedExternalSideEffects([{ state: "unknown" }])).toBe(true);
    expect(hasUnresolvedExternalSideEffects([{ state: "pending" }])).toBe(true);
  });
});

describe("learning candidates", () => {
  it("creates unpromoted candidates from failure sources", () => {
    const candidate = createProposedLearningCandidate({
      id: createInternalId(),
      projectId: createInternalId(),
      changeId: createInternalId(),
      sourceKind: "failure",
      sourceId: createInternalId(),
      summary: "测试验证失败应进入 Repair。",
      now
    });
    expect(candidate).toMatchObject({ status: "proposed", promoted: false, source_kind: "failure" });
    expect(learningIsPromotedKnowledge(candidate)).toBe(false);
  });
});

describe("Close Cancel Supersede Archive commands", () => {
  const envelope = (
    type: string,
    projectId: InternalId,
    actorId: InternalId,
    payload: Record<string, unknown>,
    revision: number,
    changeId: InternalId
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
    source: { origin: "human_cli" as const, producer: "m5-terminal-test" },
    payload
  });

  const initialize = (kernel: CimiLoopKernel) => {
    const initialized = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "InitializeProject",
        requested_at: now,
        actor_id: createInternalId(),
        project_id: createInternalId(),
        source: { origin: "human_cli" as const, producer: "m5-terminal-test" },
        payload: {
          name: "M5 Terminal",
          repository_kind: "directory",
          repository_path: "/tmp/m5-terminal",
          owner_name: "Owner"
        }
      })
    );
    if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
    return { projectId: initialized.data.project.id, actorId: initialized.data.actor.id };
  };

  const createChange = (
    kernel: CimiLoopKernel,
    projectId: InternalId,
    actorId: InternalId,
    title: string
  ) => {
    const created = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CreateChange",
        requested_at: now,
        actor_id: actorId,
        project_id: projectId,
        source: { origin: "human_cli" as const, producer: "m5-terminal-test" },
        payload: { title }
      })
    );
    if (!("change" in created.data)) throw new Error("missing change");
    return {
      projectId,
      actorId,
      changeId: created.data.change.id,
      revision: created.data.change.revision,
      lifecycle: created.data.change.lifecycle_state
    };
  };

  const bootstrap = (kernel: CimiLoopKernel, title = "Terminal") => {
    const project = initialize(kernel);
    return createChange(kernel, project.projectId, project.actorId, title);
  };

  const seedCloseFacts = (
    store: SqliteProjectStore,
    ctx: ReturnType<typeof bootstrap>,
    options: {
      profile?: ContractVersion["profile_key"];
      releaseKind?: Release["kind"];
      releaseStatus?: Release["status"];
      knowledgeUpdate?: boolean;
    } = {}
  ) => {
    const profile = options.profile ?? "feature";
    const contract: ContractVersion = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      contract_id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      domain_version: 1,
      candidate_id: createInternalId(),
      profile_key: profile,
      intent: "关闭前完成交付验证。",
      outcomes: ["可关闭"],
      scope: { in: ["Delivery"], out: ["Secrets"] },
      non_goals: ["不改写历史"],
      acceptance: [{ key: "AC-1", statement: "生产或 Profile 终点已验证。" }],
      constraints: ["Human close"],
      created_at: now
    };
    const knowledge: KnowledgeImpactAssessment = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      revision: 1,
      created_at: now,
      updated_at: now,
      sources: {
        product_business: { conclusion: "NoImpact", rationale: "无产品变化。" },
        technical: options.knowledgeUpdate
          ? {
              conclusion: "Update",
              owner_role: "technical_owner",
              gate: "change_closure",
              summary: "必须更新说明。"
            }
          : { conclusion: "NoImpact", rationale: "无技术变化。" },
        operations: { conclusion: "NoImpact", rationale: "无运维变化。" },
        communication: { conclusion: "NoImpact", rationale: "无沟通变化。" }
      }
    };
    const environmentId = createInternalId();
    const release: Release = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      kind: options.releaseKind ?? "production",
      artifact_id: createInternalId(),
      artifact_digest: digest("artifact"),
      environment_id: environmentId,
      contract_id: contract.contract_id,
      contract_version: 1,
      policy_snapshot_id: createInternalId(),
      status: options.releaseStatus ?? "verified",
      authorization_digest: digest("authorization"),
      revision: 1,
      created_at: now,
      updated_at: now
    };
    store.transaction((transaction) => {
      transaction.insertContractVersion(contract);
      transaction.insertKnowledgeImpactAssessment(knowledge);
      transaction.insertEnvironment({
        schema_version: SCHEMA_VERSION,
        id: environmentId,
        project_id: ctx.projectId,
        environment_key: `${options.releaseKind ?? "production"}-${ctx.changeId}`,
        kind: options.releaseKind ?? "production",
        display_name: "Close env",
        owner_actor_id: ctx.actorId,
        adapter_ref: "file://examples/acceptance-target",
        status: "active",
        revision: 1,
        created_at: now,
        updated_at: now
      });
      transaction.insertRelease(release);
    });
  };

  it("closes only after verified delivery, knowledge ALLOW, and classified notes", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-close-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const project = initialize(kernel);
    const missingRelease = createChange(kernel, project.projectId, project.actorId, "No Release");
    seedCloseFacts(store, missingRelease, { releaseStatus: "drafted" });
    const blocked = success(
      kernel.execute(
        envelope(
          "ProposeClose",
          missingRelease.projectId,
          missingRelease.actorId,
          {
            change_id: missingRelease.changeId,
            residual_risk: "无未关闭生产风险。",
            known_issues: ["文档链接待补"]
          },
          missingRelease.revision,
          missingRelease.changeId
        )
      )
    );
    if (!("closure_evaluation" in blocked.data)) throw new Error("missing evaluation");
    expect(blocked.data.closure_evaluation.result).toBe("REQUIRE_HUMAN");
    expect(
      failure(
        kernel.execute(
          envelope(
            "CloseChange",
            missingRelease.projectId,
            missingRelease.actorId,
            {
              change_id: missingRelease.changeId,
              closure_evaluation_id: blocked.data.closure_evaluation.id
            },
            blocked.revision,
            missingRelease.changeId
          )
        )
      ).code
    ).toBe("CLOSURE_NOT_ALLOWED");

    const knowledgeGap = createChange(kernel, project.projectId, project.actorId, "Knowledge Gap");
    seedCloseFacts(store, knowledgeGap, { knowledgeUpdate: true });
    const incomplete = success(
      kernel.execute(
        envelope(
          "ProposeClose",
          knowledgeGap.projectId,
          knowledgeGap.actorId,
          {
            change_id: knowledgeGap.changeId,
            residual_risk: "无未关闭生产风险。",
            known_issues: []
          },
          knowledgeGap.revision,
          knowledgeGap.changeId
        )
      )
    );
    if (!("closure_evaluation" in incomplete.data)) throw new Error("missing evaluation");
    expect(incomplete.data.closure_evaluation).toMatchObject({
      result: "NEED_MORE_EVIDENCE",
      knowledge_complete: false
    });
    expect(incomplete.data.closure_evaluation.gaps[0]).toMatchObject({
      obligation_key: "technical",
      blocking: true
    });

    const ready = createChange(kernel, project.projectId, project.actorId, "Ready Close");
    seedCloseFacts(store, ready);
    const proposed = success(
      kernel.execute(
        envelope(
          "ProposeClose",
          ready.projectId,
          ready.actorId,
          {
            change_id: ready.changeId,
            residual_risk: "残余风险已分类：无未关闭缺陷。",
            known_issues: ["文档链接待补"]
          },
          ready.revision,
          ready.changeId
        )
      )
    );
    if (!("closure_evaluation" in proposed.data)) throw new Error("missing evaluation");
    expect(proposed.data.closure_evaluation.result).toBe("ALLOW");
    const closed = success(
      kernel.execute(
        envelope(
          "CloseChange",
          ready.projectId,
          ready.actorId,
          {
            change_id: ready.changeId,
            closure_evaluation_id: proposed.data.closure_evaluation.id
          },
          proposed.revision,
          ready.changeId
        )
      )
    );
    if (!("closure_evaluation" in closed.data)) throw new Error("missing evaluation");
    const change = kernel.getChange(ready.changeId);
    if ("code" in change) throw new Error(change.code);
    expect(change.lifecycle_state).toBe("Draft");
    expect(closed.events.some((event) => event.event_type === "ChangeClosed")).toBe(true);
    expect(store.transaction((transaction) => transaction.getChange(ready.changeId))).toBeDefined();
    expect(
      failure(
        kernel.execute(
          envelope(
            "CreateExecutionWorkItems",
            ready.projectId,
            ready.actorId,
            { change_id: ready.changeId },
            closed.revision,
            ready.changeId
          )
        )
      ).code
    ).toBe("CHANGE_ALREADY_TERMINAL");
  });

  it("lets incident close from a verified test endpoint", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-incident-close-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel, "Incident");
    seedCloseFacts(store, ctx, { profile: "incident", releaseKind: "test", releaseStatus: "verified" });
    const proposed = success(
      kernel.execute(
        envelope(
          "ProposeClose",
          ctx.projectId,
          ctx.actorId,
          { change_id: ctx.changeId, residual_risk: "应急已恢复。", known_issues: [] },
          ctx.revision,
          ctx.changeId
        )
      )
    );
    if (!("closure_evaluation" in proposed.data)) throw new Error("missing evaluation");
    expect(proposed.data.closure_evaluation.result).toBe("ALLOW");
  });

  it("cancels without deleting history and refuses unknown external results", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-cancel-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const project = initialize(kernel);
    const ctx = createChange(kernel, project.projectId, project.actorId, "Cancel");
    store.transaction((transaction) => {
      transaction.insertExternalOperation({
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        project_id: ctx.projectId,
        change_id: ctx.changeId,
        operation_key: "deploy:unknown-1",
        operation_kind: "deploy",
        environment_id: createInternalId(),
        release_id: createInternalId(),
        deployment_id: createInternalId(),
        artifact_digest: digest("artifact"),
        state: "unknown",
        log_reference: "file://logs/unknown.log",
        log_digest: digest("log"),
        summary: "外部结果未知",
        revision: 1,
        created_at: now,
        updated_at: now
      });
    });
    expect(
      failure(
        kernel.execute(
          envelope(
            "CancelChange",
            ctx.projectId,
            ctx.actorId,
            {
              change_id: ctx.changeId,
              reason: "业务取消",
              cleanup_summary: "未完成核对外部部署。"
            },
            ctx.revision,
            ctx.changeId
          )
        )
      ).code
    ).toBe("EXTERNAL_OPERATION_UNKNOWN");

    const clean = createChange(kernel, project.projectId, project.actorId, "Cancel Clean");
    const cancelled = success(
      kernel.execute(
        envelope(
          "CancelChange",
          clean.projectId,
          clean.actorId,
          {
            change_id: clean.changeId,
            reason: "范围取消",
            cleanup_summary: "无外部副作用，后续由 Owner 跟进。"
          },
          clean.revision,
          clean.changeId
        )
      )
    );
    if (!("cancellation_record" in cancelled.data)) throw new Error("missing cancellation");
    expect(cancelled.data.cancellation_record).toMatchObject({
      disposition: "cancelled",
      reason: "范围取消",
      cleanup_summary: "无外部副作用，后续由 Owner 跟进。",
      residual_responsibility: "无外部副作用，后续由 Owner 跟进。"
    });
    const existing = kernel.getChange(clean.changeId);
    if ("code" in existing) throw new Error(existing.code);
    expect(existing.id).toBe(clean.changeId);
    expect(existing.lifecycle_state).toBe("Draft");
  });

  it("supersedes by referencing a successor and keeps the original change", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-supersede-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const original = bootstrap(kernel, "Original");
    const successor = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CreateChange",
        requested_at: now,
        actor_id: original.actorId,
        project_id: original.projectId,
        source: { origin: "human_cli" as const, producer: "m5-terminal-test" },
        payload: { title: "Successor" }
      })
    );
    if (!("change" in successor.data)) throw new Error("missing successor");
    expect(
      failure(
        kernel.execute(
          envelope(
            "SupersedeChange",
            original.projectId,
            original.actorId,
            {
              change_id: original.changeId,
              successor_change_id: original.changeId,
              reason: "不能取代自己。"
            },
            original.revision,
            original.changeId
          )
        )
      ).code
    ).toBe("SUPERSEDE_SELF");
    const superseded = success(
      kernel.execute(
        envelope(
          "SupersedeChange",
          original.projectId,
          original.actorId,
          {
            change_id: original.changeId,
            successor_change_id: successor.data.change.id,
            reason: "由后续 Change 接管范围。"
          },
          original.revision,
          original.changeId
        )
      )
    );
    if (!("supersession_record" in superseded.data)) throw new Error("missing supersession");
    expect(superseded.data.supersession_record.successor_change_id).toBe(successor.data.change.id);
    const kept = kernel.getChange(original.changeId);
    if ("code" in kept) throw new Error(kept.code);
    expect(kept.id).toBe(original.changeId);
    expect(kept.lifecycle_state).toBe("Draft");
    expect(kernel.getChange(successor.data.change.id)).toMatchObject({ id: successor.data.change.id });
  });

  it("archives visibility without rewriting lifecycle history", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-archive-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel, "Archive");
    const archived = success(
      kernel.execute(
        envelope(
          "ArchiveChange",
          ctx.projectId,
          ctx.actorId,
          { change_id: ctx.changeId, reason: "从默认工作视图隐藏。" },
          ctx.revision,
          ctx.changeId
        )
      )
    );
    if (!("archive_record" in archived.data)) throw new Error("missing archive");
    expect(archived.data.archive_record.disposition).toBe("archived");
    const change = kernel.getChange(ctx.changeId);
    if ("code" in change) throw new Error(change.code);
    expect(change.lifecycle_state).toBe("Draft");
    expect(change.operating_status).toBe("Paused");
    expect(
      failure(
        kernel.execute(
          envelope(
            "ArchiveChange",
            ctx.projectId,
            ctx.actorId,
            { change_id: ctx.changeId, reason: "重复归档。" },
            archived.revision,
            ctx.changeId
          )
        )
      ).code
    ).toBe("CHANGE_ALREADY_ARCHIVED");
  });

  it("records a learning candidate that is not project knowledge until approved", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-learning-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel, "Learning");
    const runId = createInternalId();
    const workItem = createPlanningWorkItem({
      id: createInternalId(),
      projectId: ctx.projectId,
      changeId: ctx.changeId,
      contractId: createInternalId(),
      contractVersion: 1,
      policySnapshotId: createInternalId(),
      now
    });
    store.transaction((transaction) => {
      transaction.insertWorkItem(workItem);
      transaction.insertAgentRun({
        schema_version: SCHEMA_VERSION,
        id: runId,
        project_id: ctx.projectId,
        change_id: ctx.changeId,
        work_item_id: workItem.id,
        status: "failed",
        attempt: 1,
        summary: "验证失败",
        log_reference: "file://logs/run.log",
        log_digest: digest("run-log"),
        revision: 1,
        created_at: now,
        updated_at: now
      });
    });
    expect(
      failure(
        kernel.execute(
          envelope(
            "CreateLearningCandidate",
            ctx.projectId,
            ctx.actorId,
            {
              change_id: ctx.changeId,
              source_kind: "failure",
              source_id: createInternalId(),
              summary: "来源不存在。"
            },
            ctx.revision,
            ctx.changeId
          )
        )
      ).code
    ).toBe("LEARNING_SOURCE_NOT_FOUND");
    const created = success(
      kernel.execute(
        envelope(
          "CreateLearningCandidate",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            source_kind: "failure",
            source_id: runId,
            summary: "失败应形成 Repair 与知识候选。"
          },
          ctx.revision,
          ctx.changeId
        )
      )
    );
    if (!("learning_candidate" in created.data)) throw new Error("missing candidate");
    expect(created.data.learning_candidate).toMatchObject({
      status: "proposed",
      promoted: false,
      source_kind: "failure",
      source_id: runId
    });
    expect(learningIsPromotedKnowledge(created.data.learning_candidate)).toBe(false);
  });
});
