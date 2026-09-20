import type { RecoveryStrategy } from "@cimiloop/protocol";

export const recoveryRequiresHuman = (input: {
  authorization: RecoveryStrategy["authorization"];
  targetAvailable: boolean;
  strategyCurrent: boolean;
  scopeExceeded: boolean;
}): boolean =>
  input.authorization !== "preauthorized" ||
  !input.targetAvailable ||
  !input.strategyCurrent ||
  input.scopeExceeded;

export const recoveryScopeExceeded = (
  strategyScope: { in: readonly string[]; out: readonly string[] },
  authorizedScope: { in: readonly string[]; out: readonly string[] }
): boolean => strategyScope.in.some((item) => !authorizedScope.in.includes(item));

export const failedDeploymentPreserved = (
  failed: { id: string; status: string },
  recoveryDeployment: { id: string }
): boolean => failed.status === "failed" && failed.id !== recoveryDeployment.id;
