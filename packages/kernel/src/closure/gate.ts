import type { ClosureGap, GateResult } from "@cimiloop/protocol";

export type KnowledgeClosureGateResult = {
  result: GateResult;
  knowledge_complete: boolean;
  gaps: ClosureGap[];
};

const requiresHuman = (gap: ClosureGap): boolean =>
  gap.summary.includes("过期") || gap.summary.includes("不可访问") || gap.summary.includes("例外未经");

export const evaluateKnowledgeClosureGate = (gaps: ClosureGap[]): KnowledgeClosureGateResult => {
  const blocking = gaps.filter((item) => item.blocking);
  if (blocking.length === 0) {
    return { result: "ALLOW", knowledge_complete: true, gaps: [] };
  }
  return {
    result: blocking.some(requiresHuman) ? "REQUIRE_HUMAN" : "NEED_MORE_EVIDENCE",
    knowledge_complete: false,
    gaps: blocking
  };
};
