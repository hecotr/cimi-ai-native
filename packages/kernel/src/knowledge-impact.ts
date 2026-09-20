import { SCHEMA_VERSION, type InternalId, type KnowledgeImpactAssessment } from "@cimiloop/protocol";

type KnowledgeSources = KnowledgeImpactAssessment["sources"];
type KnowledgeItem = KnowledgeSources[keyof KnowledgeSources];

const assertItem = (source: string, item: KnowledgeItem): KnowledgeItem => {
  if (item.conclusion === "NoImpact") {
    if (item.rationale.trim().length === 0) {
      throw new Error(`Knowledge source ${source} NoImpact requires rationale`);
    }
    return item;
  }
  if (item.summary.trim().length === 0) {
    throw new Error(`Knowledge source ${source} ${item.conclusion} requires summary`);
  }
  return item;
};

export const validateKnowledgeImpact = (sources: KnowledgeSources): KnowledgeSources => ({
  product_business: assertItem("product_business", sources.product_business),
  technical: assertItem("technical", sources.technical),
  operations: assertItem("operations", sources.operations),
  communication: assertItem("communication", sources.communication)
});

export const createKnowledgeImpactAssessment = (
  id: InternalId,
  projectId: InternalId,
  changeId: InternalId,
  sources: KnowledgeSources,
  now: string,
  revision = 1
): KnowledgeImpactAssessment => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  change_id: changeId,
  revision,
  created_at: now,
  updated_at: now,
  sources: validateKnowledgeImpact(sources)
});
