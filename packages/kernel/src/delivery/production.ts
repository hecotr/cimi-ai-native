import type { Digest, ExternalOperation, Release } from "@cimiloop/protocol";

export type DeliveryOperationKind = "deploy" | "status" | "verify";

export const canPromoteProductionDigest = (
  releases: readonly Pick<Release, "kind" | "status" | "artifact_digest">[],
  digest: Digest
): boolean =>
  releases.some(
    (release) =>
      release.kind === "test" &&
      release.status === "verified" &&
      release.artifact_digest.algorithm === digest.algorithm &&
      release.artifact_digest.value === digest.value
  );

export const releaseIsVerified = (release: Pick<Release, "status">): boolean => release.status === "verified";

export const productionNeedsRecovery = (input: {
  state: string;
  health?: string;
  core_path?: string;
  digest_matches?: boolean;
}): boolean =>
  input.state === "failed" ||
  input.digest_matches === false ||
  (input.health !== undefined && input.health !== "healthy") ||
  (input.core_path !== undefined && input.core_path !== "pass");

export const nextDeliveryOperationKind = (
  operations: readonly Pick<ExternalOperation, "operation_kind" | "state">[]
): DeliveryOperationKind => {
  const latest = (kind: DeliveryOperationKind) =>
    [...operations].reverse().find((item) => item.operation_kind === kind);
  const deploy = latest("deploy");
  if (!deploy || deploy.state !== "succeeded") return "deploy";
  const status = latest("status");
  if (!status || status.state !== "succeeded") return "status";
  return "verify";
};
