import { SCHEMA_VERSION, type Evidence, type EvidenceProducerRole, type RecordEvidenceCommand } from "@cimiloop/protocol";
import type { Claim } from "@cimiloop/protocol";

export const isIndependentProducer = (role: EvidenceProducerRole): boolean =>
  role === "evaluator" || role === "deterministic_test" || role === "system";

export const producerRoleAllowedForOrigin = (
  origin: string,
  role: EvidenceProducerRole
): boolean => {
  if (origin === "human_cli" || origin === "human_workbench") return role === "human";
  if (origin === "agent") return role === "executor";
  if (origin === "system") return role === "system" || role === "deterministic_test" || role === "evaluator";
  return false;
};

export const createEvidenceFromCommand = (input: {
  id: Evidence["id"];
  claim: Claim;
  command: RecordEvidenceCommand;
  now: string;
}): Evidence => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.claim.project_id,
  change_id: input.claim.change_id,
  claim_id: input.claim.id,
  stance: input.command.payload.stance,
  subject_type: input.command.payload.subject_type,
  subject_id: input.command.payload.subject_id,
  subject_digest: input.command.payload.subject_digest,
  content_reference: input.command.payload.content_reference,
  digest: input.command.payload.digest,
  producer_role: input.command.payload.producer_role,
  created_at: input.now,
  ...(input.command.payload.environment_ref ? { environment_ref: input.command.payload.environment_ref } : {}),
  ...(input.command.payload.context_pack_id ? { context_pack_id: input.command.payload.context_pack_id } : {}),
  ...(input.command.payload.external_reference_id
    ? { external_reference_id: input.command.payload.external_reference_id }
    : {})
});
