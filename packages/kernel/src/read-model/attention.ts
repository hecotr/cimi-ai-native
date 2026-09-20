import {
  SCHEMA_VERSION,
  type AgentRunRecord,
  type AttentionItem,
  type Blocker,
  type DecisionRequest,
  type Evidence,
  type ExternalOperation,
  type InternalId
} from "@cimiloop/protocol";

export type KnowledgeGapFact = {
  change_id: InternalId;
  subject_id: InternalId;
  summary: string;
};

export type AttentionFacts = {
  now: string;
  projectId: InternalId;
  blockers: Blocker[];
  failedRuns: AgentRunRecord[];
  staleEvidence: Evidence[];
  openRequests: DecisionRequest[];
  unknownOperations: ExternalOperation[];
  knowledgeGaps: KnowledgeGapFact[];
};

const item = (
  id: InternalId,
  facts: AttentionFacts,
  kind: AttentionItem["kind"],
  subjectId: InternalId,
  summary: string,
  changeId?: InternalId
): AttentionItem => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: facts.projectId,
  ...(changeId ? { change_id: changeId } : {}),
  kind,
  subject_id: subjectId,
  summary,
  status: "open",
  created_at: facts.now,
  updated_at: facts.now,
  revision: 1
});

const decisionSummary = (request: DecisionRequest): string => {
  if (request.request_type === "intent") return "待批准 Feature Contract";
  if (request.request_type === "plan") return "待批准 Feature Plan";
  return "待批准 Production Release";
};

export const buildAttentionItems = (facts: AttentionFacts, nextId: () => InternalId): AttentionItem[] => [
  ...facts.blockers.map((blocker) =>
    item(nextId(), facts, "blocker", blocker.id, blocker.summary, blocker.change_id)
  ),
  ...facts.failedRuns.map((run) => item(nextId(), facts, "failure", run.id, run.summary, run.change_id)),
  ...facts.staleEvidence.map((evidence) =>
    item(nextId(), facts, "stale_evidence", evidence.id, "Evidence is stale and must be re-collected.", evidence.change_id)
  ),
  ...facts.openRequests.map((request) =>
    item(nextId(), facts, "decision", request.id, decisionSummary(request), request.change_id)
  ),
  ...facts.unknownOperations.map((operation) =>
    item(nextId(), facts, "unknown_deployment", operation.id, operation.summary, operation.change_id)
  ),
  ...facts.knowledgeGaps.map((gap) =>
    item(nextId(), facts, "knowledge_gap", gap.subject_id, gap.summary, gap.change_id)
  )
];
