import type { Digest, IndependentEvaluation, Release } from "@cimiloop/protocol";

export const latestEvaluationAllowsArtifact = (
  evaluations: readonly IndependentEvaluation[],
  artifactId: string,
  digest: Digest
): boolean => {
  const latest = [...evaluations]
    .reverse()
    .find(
      (evaluation) =>
        evaluation.artifact_id === artifactId &&
        evaluation.artifact_digest.algorithm === digest.algorithm &&
        evaluation.artifact_digest.value === digest.value
    );
  return latest?.result === "ALLOW";
};

export const releaseDigestMatches = (release: Release, actual?: Digest): boolean =>
  actual !== undefined &&
  release.artifact_digest.algorithm === actual.algorithm &&
  release.artifact_digest.value === actual.value;

export const verificationFailed = (input: {
  state: string;
  health?: "healthy" | "unhealthy" | "unknown";
  core_path?: "pass" | "fail" | "unknown";
}): boolean =>
  input.state === "failed" ||
  (input.health !== undefined && input.health !== "healthy") ||
  (input.core_path !== undefined && input.core_path !== "pass");
