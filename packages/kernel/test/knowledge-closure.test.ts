import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Claim,
  type CommandSuccess,
  type Decision,
  type DomainError,
  type Evidence,
  type ExternalReference,
  type InternalId,
  type KnowledgeImpactAssessment,
  type KnowledgeUpdateEvidence,
  type PlanVersion,
  type Task
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { evaluateKnowledgeClosureGate } from "../src/closure/gate.js";
import { collectKnowledgeObligations, evaluateKnowledgeObligation } from "../src/closure/knowledge.js";
import { CimiLoopKernel } from "../src/kernel.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string, value = "b".repeat(64)) => ({
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

const noImpact = { conclusion: "NoImpact" as const, rationale: "无影响。" };
const action = (conclusion: "Create" | "Update" | "Deprecate" | "Verify") => ({
  conclusion,
  owner_role: "technical_owner" as const,
  gate: "change_closure" as const,
  summary: `${conclusion} 知识义务。`
});

const sources = (technical: ReturnType<typeof action> | typeof noImpact) => ({
  product_business: noImpact,
  technical,
  operations: noImpact,
  communication: noImpact
});

const update = (
  taskId: InternalId,
  conclusion: KnowledgeUpdateEvidence["conclusion"],
  extras: Partial<KnowledgeUpdateEvidence> = {}
): KnowledgeUpdateEvidence => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: createInternalId(),
  change_id: createInternalId(),
  task_id: taskId,
  knowledge_source: "technical",
  conclusion,
  external_reference_id: createInternalId(),
  evidence_id: createInternalId(),
  digest: digest("knowledge-update"),
  created_at: now,
  ...extras
});

describe("knowledge obligation rules", () => {
  it("treats NoImpact as complete without evidence", () => {
    const assessed = evaluateKnowledgeObligation({
      source: "technical",
      requiredConclusion: "NoImpact",
      updates: [],
      references: {},
      evidenceById: {},
      validityByEvidenceId: {}
    });
    expect(assessed).toMatchObject({ complete: true, reason: "no_impact" });
  });

  it.each(["Create", "Update", "Deprecate", "Verify"] as const)(
    "completes %s only with versioned reference and valid supporting evidence",
    (conclusion) => {
      const taskId = createInternalId();
      const recorded = update(taskId, conclusion);
      const assessed = evaluateKnowledgeObligation({
        source: "technical",
        requiredConclusion: conclusion,
        task: { id: taskId, kind: "knowledge", knowledge_source: "technical" },
        updates: [recorded],
        references: { [recorded.external_reference_id]: { id: recorded.external_reference_id, reference: "repo://docs/api.md#v2" } },
        evidenceById: {
          [recorded.evidence_id]: {
            id: recorded.evidence_id,
            stance: "Supports",
            external_reference_id: recorded.external_reference_id
          }
        },
        validityByEvidenceId: { [recorded.evidence_id]: "Valid" }
      });
      expect(assessed).toMatchObject({ complete: true, reason: "evidence" });
    }
  );

  it("does not treat stale or unavailable references as complete", () => {
    const taskId = createInternalId();
    const stale = update(taskId, "Verify");
    const unavailable = update(taskId, "Verify", { id: createInternalId() });
    expect(
      evaluateKnowledgeObligation({
        source: "technical",
        requiredConclusion: "Verify",
        task: { id: taskId, kind: "knowledge", knowledge_source: "technical" },
        updates: [stale],
        references: { [stale.external_reference_id]: { id: stale.external_reference_id, reference: "repo://docs/api.md" } },
        evidenceById: {
          [stale.evidence_id]: { id: stale.evidence_id, stance: "Supports", external_reference_id: stale.external_reference_id }
        },
        validityByEvidenceId: { [stale.evidence_id]: "Stale" }
      })
    ).toMatchObject({
      complete: false,
      reason: "stale_reference",
      gap: { obligation_key: "technical", blocking: true }
    });
    expect(
      evaluateKnowledgeObligation({
        source: "technical",
        requiredConclusion: "Verify",
        task: { id: taskId, kind: "knowledge", knowledge_source: "technical" },
        updates: [unavailable],
        references: {
          [unavailable.external_reference_id]: {
            id: unavailable.external_reference_id,
            reference: "unavailable:docs/api.md"
          }
        },
        evidenceById: {
          [unavailable.evidence_id]: {
            id: unavailable.evidence_id,
            stance: "Supports",
            external_reference_id: unavailable.external_reference_id
          }
        },
        validityByEvidenceId: { [unavailable.evidence_id]: "Valid" }
      })
    ).toMatchObject({
      complete: false,
      reason: "unavailable_reference",
      gap: { obligation_key: "technical", blocking: true }
    });
  });

  it("accepts an approved exception in place of completed evidence", () => {
    const taskId = createInternalId();
    const recorded = update(taskId, "Update", { exception_id: createInternalId() });
    const assessed = evaluateKnowledgeObligation({
      source: "technical",
      requiredConclusion: "Update",
      task: { id: taskId, kind: "knowledge", knowledge_source: "technical" },
      updates: [recorded],
      references: { [recorded.external_reference_id]: { id: recorded.external_reference_id, reference: "unavailable:wiki" } },
      evidenceById: {
        [recorded.evidence_id]: { id: recorded.evidence_id, stance: "Inconclusive", external_reference_id: recorded.external_reference_id }
      },
      validityByEvidenceId: { [recorded.evidence_id]: "Invalid" },
      exception: { id: recorded.exception_id!, outcome: "approve" }
    });
    expect(assessed).toMatchObject({ complete: true, reason: "exception" });
  });
});

describe("knowledge closure gate", () => {
  it("lists explainable blocking gaps and withholds ALLOW", () => {
    const obligations = collectKnowledgeObligations(sources(action("Update")), []);
    expect(obligations).toEqual([
      { source: "technical", requiredConclusion: "Update" }
    ]);
    const missing = evaluateKnowledgeObligation({
      source: "technical",
      requiredConclusion: "Update",
      updates: [],
      references: {},
      evidenceById: {},
      validityByEvidenceId: {}
    });
    if (missing.complete) throw new Error("expected knowledge gap");
    expect(evaluateKnowledgeClosureGate([missing.gap])).toMatchObject({
      result: "NEED_MORE_EVIDENCE",
      knowledge_complete: false,
      gaps: [{ obligation_key: "technical", blocking: true }]
    });
    expect(
      evaluateKnowledgeClosureGate([
        { obligation_key: "technical", summary: "引用已过期，需要核对或人工例外。", blocking: true }
      ])
    ).toMatchObject({ result: "REQUIRE_HUMAN", knowledge_complete: false });
    expect(evaluateKnowledgeClosureGate([])).toMatchObject({
      result: "ALLOW",
      knowledge_complete: true,
      gaps: []
    });
  });
});

describe("RecordKnowledgeUpdate", () => {
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
    source: { origin: "human_cli" as const, producer: "m5-knowledge-test" },
    payload
  });

  const bootstrap = (kernel: CimiLoopKernel) => {
    const initialized = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "InitializeProject",
        requested_at: now,
        actor_id: createInternalId(),
        project_id: createInternalId(),
        source: { origin: "human_cli" as const, producer: "m5-knowledge-test" },
        payload: {
          name: "M5 Knowledge",
          repository_kind: "directory",
          repository_path: "/tmp/m5-knowledge",
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
        source: { origin: "human_cli" as const, producer: "m5-knowledge-test" },
        payload: { title: "Knowledge" }
      })
    );
    if (!("change" in created.data)) throw new Error("missing change");
    return {
      projectId: initialized.data.project.id,
      actorId: initialized.data.actor.id,
      changeId: created.data.change.id,
      revision: created.data.change.revision
    };
  };

  const seedObligation = (
    store: SqliteProjectStore,
    projectId: InternalId,
    changeId: InternalId,
    conclusion: "Create" | "Update" | "Deprecate" | "Verify" = "Update"
  ) => {
    const taskId = createInternalId();
    const planId = createInternalId();
    const knowledge: KnowledgeImpactAssessment = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: projectId,
      change_id: changeId,
      revision: 1,
      created_at: now,
      updated_at: now,
      sources: sources(action(conclusion))
    };
    const plan: PlanVersion = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      plan_id: planId,
      project_id: projectId,
      change_id: changeId,
      domain_version: 1,
      candidate_id: createInternalId(),
      contract_id: createInternalId(),
      contract_version: 1,
      summary: "知识义务计划。",
      verification_strategy: "用 KnowledgeUpdateEvidence 证明闭环。",
      recovery_considerations: "缺口进入 Closure Gate。",
      task_ids: [taskId],
      created_at: now
    };
    const task: Task = {
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
    };
    const claim: Claim = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: projectId,
      change_id: changeId,
      claim_key: "KNOWLEDGE-TECH",
      statement: "技术知识已按结论更新。",
      category: "technical",
      obligation: "required",
      source: "plan",
      contract_id: plan.contract_id,
      contract_version: 1,
      created_at: now
    };
    const reference: ExternalReference = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: projectId,
      reference: "repo://docs/api.md#v2",
      digest: digest("external-reference"),
      summary: "技术说明 v2",
      created_at: now
    };
    const evidence: Evidence = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: projectId,
      change_id: changeId,
      claim_id: claim.id,
      stance: "Supports",
      subject_type: "plan",
      subject_id: plan.id,
      subject_digest: digest("plan"),
      content_reference: reference.reference,
      digest: digest("knowledge-evidence"),
      producer_role: "human",
      external_reference_id: reference.id,
      created_at: now
    };
    store.transaction((transaction) => {
      transaction.insertKnowledgeImpactAssessment(knowledge);
      transaction.insertPlanVersion(plan);
      transaction.insertTask(task);
      transaction.insertClaim(claim);
      transaction.insertExternalReference(reference);
      transaction.insertEvidence(evidence);
    });
    return { taskId, referenceId: reference.id, evidenceId: evidence.id };
  };

  it("records immutable knowledge update evidence for a matching obligation", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-knowledge-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const seeded = seedObligation(store, ctx.projectId, ctx.changeId, "Update");
    const recorded = success(
      kernel.execute(
        envelope(
          "RecordKnowledgeUpdate",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            task_id: seeded.taskId,
            knowledge_source: "technical",
            conclusion: "Update",
            external_reference_id: seeded.referenceId,
            evidence_id: seeded.evidenceId
          },
          ctx.revision,
          ctx.changeId
        )
      )
    );
    if (!("knowledge_update" in recorded.data)) throw new Error("missing knowledge_update");
    expect(recorded.data.knowledge_update).toMatchObject({
      task_id: seeded.taskId,
      knowledge_source: "technical",
      conclusion: "Update",
      external_reference_id: seeded.referenceId,
      evidence_id: seeded.evidenceId
    });
    expect(recorded.events[0]?.event_type).toBe("KnowledgeUpdateRecorded");
    expect(
      store.transaction((transaction) => transaction.listKnowledgeUpdateEvidenceByChange(ctx.changeId))
    ).toHaveLength(1);
  });

  it("rejects stale evidence, unavailable references, and NoImpact updates", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-knowledge-reject-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const seeded = seedObligation(store, ctx.projectId, ctx.changeId, "Verify");
    store.transaction((transaction) => {
      transaction.insertImpactAssessment({
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        project_id: ctx.projectId,
        change_id: ctx.changeId,
        trigger: "context",
        subject_type: "evidence",
        subject_id: seeded.evidenceId,
        rule: "knowledge_reference_stale",
        old_input_digest: digest("old"),
        new_input_digest: digest("new"),
        old_validity: "Valid",
        new_validity: "Stale",
        affected_ids: [seeded.evidenceId],
        created_at: now
      });
    });
    expect(
      failure(
        kernel.execute(
          envelope(
            "RecordKnowledgeUpdate",
            ctx.projectId,
            ctx.actorId,
            {
              change_id: ctx.changeId,
              task_id: seeded.taskId,
              knowledge_source: "technical",
              conclusion: "Verify",
              external_reference_id: seeded.referenceId,
              evidence_id: seeded.evidenceId
            },
            ctx.revision,
            ctx.changeId
          )
        )
      ).code
    ).toBe("KNOWLEDGE_REFERENCE_STALE");

    const unavailableId = createInternalId();
    store.transaction((transaction) => {
      transaction.insertExternalReference({
        schema_version: SCHEMA_VERSION,
        id: unavailableId,
        project_id: ctx.projectId,
        reference: "unavailable:docs/api.md",
        digest: digest("unavailable-reference"),
        summary: "来源不可访问",
        created_at: now
      });
    });
    expect(
      failure(
        kernel.execute(
          envelope(
            "RecordKnowledgeUpdate",
            ctx.projectId,
            ctx.actorId,
            {
              change_id: ctx.changeId,
              task_id: seeded.taskId,
              knowledge_source: "technical",
              conclusion: "Verify",
              external_reference_id: unavailableId,
              evidence_id: seeded.evidenceId
            },
            ctx.revision,
            ctx.changeId
          )
        )
      ).code
    ).toBe("KNOWLEDGE_REFERENCE_UNAVAILABLE");

    expect(
      failure(
        kernel.execute(
          envelope(
            "RecordKnowledgeUpdate",
            ctx.projectId,
            ctx.actorId,
            {
              change_id: ctx.changeId,
              task_id: seeded.taskId,
              knowledge_source: "technical",
              conclusion: "NoImpact",
              external_reference_id: seeded.referenceId,
              evidence_id: seeded.evidenceId
            },
            ctx.revision,
            ctx.changeId
          )
        )
      ).code
    ).toBe("KNOWLEDGE_NO_IMPACT_UPDATE");
  });

  it("records an approved knowledge exception without treating the reference as complete evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-knowledge-exception-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const seeded = seedObligation(store, ctx.projectId, ctx.changeId, "Update");
    const exceptionId = createInternalId();
    const decision: Decision = {
      schema_version: SCHEMA_VERSION,
      id: exceptionId,
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      request_id: createInternalId(),
      actor_id: ctx.actorId,
      acting_role_id: createInternalId(),
      outcome: "approve",
      reason: "知识来源暂时不可访问，批准有限例外。",
      created_at: now
    };
    store.transaction((transaction) => transaction.insertDecision(decision));
    const recorded = success(
      kernel.execute(
        envelope(
          "RecordKnowledgeUpdate",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            task_id: seeded.taskId,
            knowledge_source: "technical",
            conclusion: "Update",
            external_reference_id: seeded.referenceId,
            evidence_id: seeded.evidenceId,
            exception_id: exceptionId
          },
          ctx.revision,
          ctx.changeId
        )
      )
    );
    if (!("knowledge_update" in recorded.data)) throw new Error("missing knowledge_update");
    expect(recorded.data.knowledge_update.exception_id).toBe(exceptionId);
  });
});
