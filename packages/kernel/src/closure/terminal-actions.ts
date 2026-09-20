import type {
  ChangeProfileKey,
  ClosureGap,
  GateResult,
  ReleaseKind,
  ReleaseStatus
} from "@cimiloop/protocol";
import type { KnowledgeClosureGateResult } from "./gate.js";

export type DeliveryCloseAssessment = {
  ready: boolean;
  reason: "production_verified" | "incident_test_endpoint" | "release_not_verified";
};

export const deliveryCloseReady = (
  profileKey: ChangeProfileKey,
  releases: readonly { kind: ReleaseKind; status: ReleaseStatus }[]
): DeliveryCloseAssessment => {
  if (releases.some((item) => item.kind === "production" && item.status === "verified")) {
    return { ready: true, reason: "production_verified" };
  }
  if (profileKey === "incident" && releases.some((item) => item.kind === "test" && item.status === "verified")) {
    return { ready: true, reason: "incident_test_endpoint" };
  }
  return { ready: false, reason: "release_not_verified" };
};

export const classifyCloseNotes = (
  residualRisk: string,
  knownIssues: readonly string[]
): { classified: boolean } => ({
  classified: residualRisk.trim().length > 0 && knownIssues.every((item) => item.trim().length > 0)
});

export const hasUnresolvedExternalSideEffects = (
  operations: readonly { state: string }[]
): boolean => operations.some((item) => item.state === "unknown" || item.state === "pending");

export const evaluateCloseProposal = (input: {
  knowledge: KnowledgeClosureGateResult;
  profileKey: ChangeProfileKey;
  releases: readonly { kind: ReleaseKind; status: ReleaseStatus }[];
  residualRisk: string;
  knownIssues: readonly string[];
  unresolvedExternal?: boolean;
}): KnowledgeClosureGateResult & { delivery_ready: boolean } => {
  const notes = classifyCloseNotes(input.residualRisk, input.knownIssues);
  const delivery = deliveryCloseReady(input.profileKey, input.releases);
  const gaps: ClosureGap[] = [...input.knowledge.gaps];
  if (!delivery.ready) {
    gaps.push({
      obligation_key: "delivery",
      summary: "关闭需要已验证的生产 Release，或 Profile 合法终点。",
      blocking: true
    });
  }
  if (!notes.classified) {
    gaps.push({
      obligation_key: "residual_risk",
      summary: "残余风险与 known issues 必须完成分类。",
      blocking: true
    });
  }
  if (input.unresolvedExternal) {
    gaps.push({
      obligation_key: "external_side_effects",
      summary: "关闭前必须核对未知或未完成的外部副作用。",
      blocking: true
    });
  }
  return {
    result:
      input.unresolvedExternal || !notes.classified
        ? "REQUIRE_HUMAN"
        : combineCloseResult(input.knowledge, delivery.ready),
    knowledge_complete: input.knowledge.knowledge_complete,
    gaps,
    delivery_ready: delivery.ready
  };
};

export const combineCloseResult = (knowledge: KnowledgeClosureGateResult, deliveryReady: boolean): GateResult => {
  if (!knowledge.knowledge_complete) return knowledge.result;
  if (!deliveryReady) return "REQUIRE_HUMAN";
  return "ALLOW";
};
