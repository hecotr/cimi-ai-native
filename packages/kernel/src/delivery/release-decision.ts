import type { DecisionRequest, Release } from "@cimiloop/protocol";

export const releaseDecisionIsCurrent = (request: DecisionRequest, release: Release): boolean =>
  request.candidate_id === release.id && request.digest.value === release.authorization_digest.value;

export const approveAuthorizesOnlyThisRelease = (release: Release, approvedReleaseId: string): boolean =>
  release.id === approvedReleaseId && release.status === "authorized";
