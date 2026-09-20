import {
  SCHEMA_VERSION,
  type InternalId,
  type KnowledgeImpactAssessment,
  type PlanCandidate,
  type SubmitPlanCandidateCommand,
  type TaskDraft
} from "@cimiloop/protocol";

type KnowledgeSources = KnowledgeImpactAssessment["sources"];
type KnowledgeSourceKey = keyof KnowledgeSources;

export const requiredKnowledgeSources = (sources: KnowledgeSources): KnowledgeSourceKey[] =>
  (Object.keys(sources) as KnowledgeSourceKey[]).filter((key) => sources[key].conclusion !== "NoImpact");

export const validateKnowledgeTasks = (tasks: TaskDraft[], sources: KnowledgeSources): void => {
  const covered = new Set(
    tasks
      .filter((task) => task.kind === "knowledge" && task.knowledge_source)
      .map((task) => task.knowledge_source)
  );
  const missing = requiredKnowledgeSources(sources).filter((source) => !covered.has(source));
  if (missing.length > 0) {
    throw new Error(`Knowledge sources require knowledge tasks: ${missing.join(", ")}`);
  }
};

export const createPlanCandidate = (
  id: InternalId,
  projectId: InternalId,
  changeId: InternalId,
  contractId: InternalId,
  contractVersion: number,
  payload: SubmitPlanCandidateCommand["payload"],
  now: string,
  revision = 1
): PlanCandidate => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  change_id: changeId,
  revision,
  created_at: now,
  updated_at: now,
  contract_id: contractId,
  contract_version: contractVersion,
  summary: payload.summary,
  verification_strategy: payload.verification_strategy,
  recovery_considerations: payload.recovery_considerations,
  tasks: payload.tasks
});
