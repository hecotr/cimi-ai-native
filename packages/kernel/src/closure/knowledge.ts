import type {
  ClosureGap,
  DecisionOutcome,
  EvidenceStance,
  EvidenceValidity,
  InternalId,
  KnowledgeConclusion,
  KnowledgeImpactAssessment,
  KnowledgeSourceKey,
  KnowledgeUpdateEvidence,
  Task
} from "@cimiloop/protocol";

type KnowledgeSources = KnowledgeImpactAssessment["sources"];

export type KnowledgeReferenceFact = {
  id: InternalId;
  reference: string;
};

export type KnowledgeEvidenceFact = {
  id: InternalId;
  stance: EvidenceStance;
  external_reference_id?: InternalId;
};

export type KnowledgeObligationInput = {
  source: KnowledgeSourceKey;
  requiredConclusion: KnowledgeConclusion;
  task?: Pick<Task, "id" | "kind" | "knowledge_source">;
  updates: KnowledgeUpdateEvidence[];
  references: Record<string, KnowledgeReferenceFact>;
  evidenceById: Record<string, KnowledgeEvidenceFact>;
  validityByEvidenceId: Record<string, EvidenceValidity>;
  exception?: { id: InternalId; outcome: DecisionOutcome };
};

export type KnowledgeObligationResult =
  | { complete: true; reason: "no_impact" | "evidence" | "exception" }
  | { complete: false; reason: KnowledgeGapReason; gap: ClosureGap };

export type KnowledgeGapReason =
  | "missing_evidence"
  | "stale_reference"
  | "unavailable_reference"
  | "conclusion_mismatch"
  | "invalid_exception";

export type KnowledgeObligation = {
  source: KnowledgeSourceKey;
  requiredConclusion: KnowledgeConclusion;
  task?: Task;
};

const SOURCE_ORDER: KnowledgeSourceKey[] = ["product_business", "technical", "operations", "communication"];

const gapSummaries: Record<KnowledgeGapReason, string> = {
  missing_evidence: "缺少 Mandatory Knowledge Task 的版本化引用与 Evidence。",
  stale_reference: "引用已过期，需要核对或人工例外。",
  unavailable_reference: "知识来源不可访问，需要核对、Blocker 或人工例外。",
  conclusion_mismatch: "知识更新结论与 Mandatory Knowledge Impact 不一致。",
  invalid_exception: "知识例外未经合格角色批准。"
};

export const isUnavailableReference = (reference: string): boolean => reference.startsWith("unavailable:");

export const collectKnowledgeObligations = (sources: KnowledgeSources, tasks: Task[]): KnowledgeObligation[] =>
  SOURCE_ORDER.filter((source) => sources[source].conclusion !== "NoImpact").map((source) => {
    const task = tasks.find((item) => item.kind === "knowledge" && item.knowledge_source === source);
    return {
      source,
      requiredConclusion: sources[source].conclusion,
      ...(task ? { task } : {})
    };
  });

const gap = (source: KnowledgeSourceKey, reason: KnowledgeGapReason): ClosureGap => ({
  obligation_key: source,
  summary: gapSummaries[reason],
  blocking: true
});

const matchingUpdates = (input: KnowledgeObligationInput): KnowledgeUpdateEvidence[] =>
  input.updates.filter(
    (item) =>
      item.knowledge_source === input.source &&
      (!input.task || item.task_id === input.task.id)
  );

export const evaluateKnowledgeObligation = (input: KnowledgeObligationInput): KnowledgeObligationResult => {
  if (input.requiredConclusion === "NoImpact") {
    return { complete: true, reason: "no_impact" };
  }
  const updates = matchingUpdates(input);
  const latest = updates.at(-1);
  if (input.exception && latest?.exception_id === input.exception.id) {
    if (input.exception.outcome !== "approve") {
      return { complete: false, reason: "invalid_exception", gap: gap(input.source, "invalid_exception") };
    }
    return { complete: true, reason: "exception" };
  }
  if (!latest) {
    return { complete: false, reason: "missing_evidence", gap: gap(input.source, "missing_evidence") };
  }
  if (latest.conclusion !== input.requiredConclusion) {
    return { complete: false, reason: "conclusion_mismatch", gap: gap(input.source, "conclusion_mismatch") };
  }
  const reference = input.references[latest.external_reference_id];
  if (!reference) {
    return { complete: false, reason: "missing_evidence", gap: gap(input.source, "missing_evidence") };
  }
  if (isUnavailableReference(reference.reference)) {
    return { complete: false, reason: "unavailable_reference", gap: gap(input.source, "unavailable_reference") };
  }
  const evidence = input.evidenceById[latest.evidence_id];
  if (!evidence) {
    return { complete: false, reason: "missing_evidence", gap: gap(input.source, "missing_evidence") };
  }
  const validity = input.validityByEvidenceId[evidence.id] ?? "Valid";
  if (validity !== "Valid") {
    return { complete: false, reason: "stale_reference", gap: gap(input.source, "stale_reference") };
  }
  if (evidence.stance !== "Supports") {
    return { complete: false, reason: "missing_evidence", gap: gap(input.source, "missing_evidence") };
  }
  return { complete: true, reason: "evidence" };
};
