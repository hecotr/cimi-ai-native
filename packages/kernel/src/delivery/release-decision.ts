import type { DecisionRequest, Release } from "@cimiloop/protocol";

export const releaseDecisionIsCurrent = (
  request: DecisionRequest,
  release: Release,
  liveDigest: { value: string } = release.authorization_digest
): boolean =>
  request.candidate_id === release.id &&
  request.digest.value === release.authorization_digest.value &&
  request.digest.value === liveDigest.value;

export const approveAuthorizesOnlyThisRelease = (release: Release, approvedReleaseId: string): boolean =>
  release.id === approvedReleaseId && release.status === "authorized";
