import type { Claim, ClaimAssessmentResult, Digest, GateResult, IndependentEvaluation } from "@cimiloop/protocol";
import { requestDigest } from "../canonical.js";

export const evaluationInputDigest = (input: {
  artifactDigest: Digest;
  requirementSetDigest: Digest;
  evidenceDigests: readonly Digest[];
}): Digest => {
  const value = requestDigest({
    artifact: input.artifactDigest.value,
    requirement_set: input.requirementSetDigest.value,
    evidence: input.evidenceDigests.map((item) => item.value).sort((left, right) => left.localeCompare(right))
  });
  return { algorithm: "sha256", value, subject: "evaluation_input" };
};

export const findReusableEvaluation = (
  existing: readonly IndependentEvaluation[],
  inputDigest: Digest
): IndependentEvaluation | undefined => existing.find((item) => item.input_digest.value === inputDigest.value);

export const evaluateEvidenceGate = (input: {
  assessments: readonly { claim: Claim; result: ClaimAssessmentResult }[];
  unresolvedRefutes: boolean;
}): { result: GateResult; reason: string } => {
  const required = input.assessments.filter((item) => item.claim.obligation === "required");
  if (required.length === 0) {
    return { result: "NEED_MORE_EVIDENCE", reason: "no required claims were assessed" };
  }
  const hardRefuted = required.find(
    (item) => item.result === "Refuted" && (item.claim.source === "policy" || item.claim.source === "risk")
  );
  if (hardRefuted) {
    return { result: "DENY", reason: `hard policy or risk claim ${hardRefuted.claim.claim_key} is refuted` };
  }
  const conflicted = required.find((item) => item.result === "Conflicted");
  if (conflicted) {
    return { result: "REQUIRE_HUMAN", reason: `claim ${conflicted.claim.claim_key} has unresolved evidence conflict` };
  }
  const needsHuman = required.find(
    (item) =>
      item.result === "Insufficient" && (item.claim.source === "policy" || item.claim.claim_key.startsWith("policy."))
  );
  if (needsHuman) {
    return { result: "REQUIRE_HUMAN", reason: `claim ${needsHuman.claim.claim_key} requires human judgment` };
  }
  const insufficient = required.find((item) => item.result === "Insufficient" || item.result === "Refuted");
  if (insufficient || input.unresolvedRefutes) {
    return {
      result: "NEED_MORE_EVIDENCE",
      reason: input.unresolvedRefutes
        ? "unresolved refutes block ALLOW"
        : `required claim ${insufficient?.claim.claim_key ?? "unknown"} is not satisfied`
    };
  }
  return { result: "ALLOW", reason: "required claims satisfied" };
};
