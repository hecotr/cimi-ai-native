import { type Digest, type RecoveryStrategyDraft, type ReleaseWindow } from "@cimiloop/protocol";
import { authorizationDigest } from "../work-item.js";

export const releaseAuthorizationDigest = (input: {
  artifactDigest: Digest;
  environmentId: string;
  scope: { in: string[]; out: string[] };
  window: ReleaseWindow;
  recovery: RecoveryStrategyDraft;
}): Digest =>
  authorizationDigest(
    {
      artifact_digest: input.artifactDigest,
      environment_id: input.environmentId,
      scope: input.scope,
      window: input.window,
      recovery: input.recovery
    },
    "release_authorization"
  );

export const recoveryStrategyDigest = (recovery: RecoveryStrategyDraft): Digest =>
  authorizationDigest(recovery, "recovery_strategy");
