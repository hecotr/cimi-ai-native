import {
  SCHEMA_VERSION,
  type InternalId,
  type KnowledgeImpactAssessment,
  type PlanCandidate,
  type PlanVersion,
  type SubmitPlanCandidateCommand,
  type Task,
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

export const createPlanTasks = (
  drafts: TaskDraft[],
  ids: () => InternalId,
  projectId: InternalId,
  changeId: InternalId,
  planId: InternalId,
  planVersion: number,
  now: string
): Task[] =>
  [...drafts]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((draft) => ({
      schema_version: SCHEMA_VERSION,
      id: ids(),
      project_id: projectId,
      change_id: changeId,
      plan_id: planId,
      plan_version: planVersion,
      revision: 1,
      created_at: now,
      updated_at: now,
      key: draft.key,
      title: draft.title,
      kind: draft.kind,
      dependencies: draft.dependencies,
      ...(draft.knowledge_source ? { knowledge_source: draft.knowledge_source } : {})
    }));

export const createPlanVersion = (
  id: InternalId,
  planId: InternalId,
  candidate: PlanCandidate,
  tasks: Task[],
  now: string,
  domainVersion = 1
): PlanVersion => ({
  schema_version: SCHEMA_VERSION,
  id,
  plan_id: planId,
  project_id: candidate.project_id,
  change_id: candidate.change_id,
  domain_version: domainVersion,
  candidate_id: candidate.id,
  contract_id: candidate.contract_id,
  contract_version: candidate.contract_version,
  summary: candidate.summary,
  verification_strategy: candidate.verification_strategy,
  recovery_considerations: candidate.recovery_considerations,
  task_ids: tasks.map((task) => task.id),
  created_at: now
});
