import type { ExternalOperation, Reconciliation } from "@cimiloop/protocol";

export const conclusionToOperationState = (
  conclusion: Reconciliation["conclusion"]
): ExternalOperation["state"] => {
  if (conclusion === "confirmed_success") return "succeeded";
  if (conclusion === "confirmed_failure") return "failed";
  if (conclusion === "not_found") return "not_found";
  return "unknown";
};

export const reconciliationResolvesBlocker = (conclusion: Reconciliation["conclusion"]): boolean =>
  conclusion !== "still_unknown";

export const redeployBlockedReason = (
  operations: readonly Pick<ExternalOperation, "operation_kind" | "state">[]
): "EXTERNAL_OPERATION_UNKNOWN" | "EXTERNAL_OPERATION_NOT_RETRYABLE" | undefined => {
  const deploys = operations.filter((item) => item.operation_kind === "deploy");
  if (deploys.some((item) => item.state === "unknown" || item.state === "pending")) {
    return "EXTERNAL_OPERATION_UNKNOWN";
  }
  if (deploys.some((item) => item.state === "not_found")) {
    return "EXTERNAL_OPERATION_NOT_RETRYABLE";
  }
  return undefined;
};
