import { SCHEMA_VERSION, createInternalId, type Failure, type WorkItem } from "@cimiloop/protocol";

export const denyProductionWrite = (
  workItem: WorkItem
): { kind: "denied"; failure: Failure } | { kind: "allowed" } => {
  if (workItem.permission_scope.includes("workspace.write") || workItem.permission_scope.includes("git.commit")) {
    return { kind: "allowed" };
  }
  const now = new Date().toISOString();
  return {
    kind: "denied",
    failure: {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: workItem.project_id,
      change_id: workItem.change_id,
      work_item_id: workItem.id,
      code: "EVALUATOR_WRITE_DENIED",
      summary: "Evaluator capability forbids production code writes",
      details_reference: "cimi://evaluator/write-denied",
      created_at: now
    }
  };
};
