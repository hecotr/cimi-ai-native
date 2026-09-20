import { type Digest, type RecoveryStrategyDraft, type ReleaseWindow } from "@cimiloop/protocol";
import { authorizationDigest } from "../work-item.js";

export const releaseAuthorizationDigest = (input: {
  artifactDigest: Digest;
  environmentId: string;
  scope: { in: string[]; out: string[] };
  window: ReleaseWindow;
  recovery: RecoveryStrategyDraft;
  evidenceFingerprint: string;
  evaluationInputDigest?: Digest;
}): Digest =>
  authorizationDigest(
    {
      artifact_digest: input.artifactDigest,
      environment_id: input.environmentId,
      scope: input.scope,
      window: input.window,
      recovery: input.recovery,
      evidence_fingerprint: input.evidenceFingerprint,
      evaluation_input_digest: input.evaluationInputDigest?.value ?? ""
    },
    "release_authorization"
  );

export const recoveryStrategyDigest = (recovery: RecoveryStrategyDraft): Digest =>
  authorizationDigest(recovery, "recovery_strategy");
