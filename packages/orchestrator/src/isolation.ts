import { denyProductionWrite } from "@cimiloop/evaluator";
import type { WorkItem } from "@cimiloop/protocol";

export const isolateEvaluatorWorkItem = (workItem: WorkItem) => denyProductionWrite(workItem);

export const evaluationCapabilityRequirement = () =>
  ({
    capability_id: "evidence.evaluate",
    required: true,
    side_effect: "none" as const
  });
