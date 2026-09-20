import type {
  AttentionItem,
  EvidenceStance,
  EvidenceValidity,
  InternalId
} from "@cimiloop/protocol";
import type { StoreTransaction } from "@cimiloop/store";
import {
  collectKnowledgeObligations,
  evaluateKnowledgeObligation,
  type KnowledgeEvidenceFact,
  type KnowledgeReferenceFact
} from "../closure/knowledge.js";
import { projectValidity } from "../evidence/impact.js";
import { buildAttentionItems, type AttentionFacts } from "./attention.js";

export const collectAttentionFacts = (
  transaction: StoreTransaction,
  projectId: InternalId,
  now: string
): AttentionFacts => {
  const blockers = [];
  const failedRuns = [];
  const staleEvidence = [];
  const knowledgeGaps = [];
  for (const change of transaction.listChanges()) {
    blockers.push(...transaction.listOpenBlockers(change.id));
    failedRuns.push(
      ...transaction
        .listAgentRunsByChange(change.id)
        .filter((run) => run.status === "failed" || run.status === "unknown")
    );
    for (const evidence of transaction.listEvidenceByChange(change.id)) {
      if (projectValidity(transaction.listImpactAssessmentsBySubject(evidence.id)) === "Stale") {
        staleEvidence.push(evidence);
      }
    }
    const knowledge = transaction.getKnowledgeImpactAssessmentByChange(change.id);
    if (!knowledge) continue;
    const plan = transaction.getCurrentPlan(change.id);
    const tasks = plan ? transaction.listTasks(plan.plan_id, plan.domain_version) : [];
    const updates = transaction.listKnowledgeUpdateEvidenceByChange(change.id);
    for (const obligation of collectKnowledgeObligations(knowledge.sources, tasks)) {
      const related = updates.filter((update) => update.knowledge_source === obligation.source);
      const references: Record<string, KnowledgeReferenceFact> = {};
      const evidenceById: Record<string, KnowledgeEvidenceFact> = {};
      const validityByEvidenceId: Record<string, EvidenceValidity> = {};
      for (const update of related) {
        const reference = transaction.getExternalReference(update.external_reference_id);
        if (reference) references[reference.id] = { id: reference.id, reference: reference.reference };
        const evidence = transaction.getEvidence(update.evidence_id);
        if (!evidence) continue;
        const stance: EvidenceStance = evidence.stance;
        evidenceById[evidence.id] = {
          id: evidence.id,
          stance,
          ...(evidence.external_reference_id ? { external_reference_id: evidence.external_reference_id } : {})
        };
        validityByEvidenceId[evidence.id] = projectValidity(transaction.listImpactAssessmentsBySubject(evidence.id));
      }
      const assessed = evaluateKnowledgeObligation({
        source: obligation.source,
        requiredConclusion: obligation.requiredConclusion,
        ...(obligation.task
          ? {
              task: {
                id: obligation.task.id,
                kind: obligation.task.kind,
                ...(obligation.task.knowledge_source
                  ? { knowledge_source: obligation.task.knowledge_source }
                  : {})
              }
            }
          : {}),
        updates: related,
        references,
        evidenceById,
        validityByEvidenceId
      });
      if (!assessed.complete) {
        knowledgeGaps.push({
          change_id: change.id,
          subject_id: obligation.task?.id ?? change.id,
          summary: assessed.gap.summary
        });
      }
    }
  }
  return {
    now,
    projectId,
    blockers,
    failedRuns,
    staleEvidence,
    openRequests: transaction.listOpenDecisionRequests().filter((request) => request.project_id === projectId),
    unknownOperations: transaction
      .listUnknownExternalOperations()
      .filter((operation) => operation.project_id === projectId),
    knowledgeGaps
  };
};

export const persistAttentionProjection = (
  transaction: StoreTransaction,
  items: AttentionItem[],
  eventSequence: number
): void => {
  transaction.deleteReadModels();
  for (const item of items) transaction.insertAttentionItem(item);
  transaction.upsertReadModelCheckpoint("attention", eventSequence, { count: items.length });
};

export const rebuildWorkbenchProjections = (
  transaction: StoreTransaction,
  input: { projectId: InternalId; now: string; nextId: () => InternalId; eventSequence: number }
): AttentionItem[] => {
  void transaction.getReadModelCheckpoint("attention");
  const items = buildAttentionItems(collectAttentionFacts(transaction, input.projectId, input.now), input.nextId);
  persistAttentionProjection(transaction, items, input.eventSequence);
  return items;
};
