import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION, type AgentRunRecord, type Artifact, type Digest, type SourceSnapshot, type WorkItem } from "@cimiloop/protocol";

export const artifactDigestImmutable = (current: Digest, next: Digest): boolean =>
  current.algorithm === next.algorithm && current.value === next.value && current.subject === next.subject;

export const localReferenceExists = (reference: string): boolean => {
  if (!reference.startsWith("file:")) return true;
  try {
    return existsSync(fileURLToPath(reference));
  } catch {
    return false;
  }
};

export const createArtifact = (input: {
  id: Artifact["id"];
  run: AgentRunRecord;
  workItem: WorkItem;
  snapshot: SourceSnapshot;
  contextPackId: Artifact["context_pack_id"];
  bindingId: Artifact["binding_id"];
  digest: Digest;
  contentReference: string;
  summary: string;
  now: string;
}): Artifact => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.run.project_id,
  change_id: input.run.change_id,
  work_item_id: input.run.work_item_id,
  run_id: input.run.id,
  context_pack_id: input.contextPackId,
  binding_id: input.bindingId,
  source_snapshot_id: input.snapshot.id,
  contract_id: input.workItem.contract_id,
  contract_version: input.workItem.contract_version,
  plan_id: input.workItem.plan_id as Artifact["plan_id"],
  plan_version: input.workItem.plan_version as Artifact["plan_version"],
  status: "candidate",
  summary: input.summary,
  digest: input.digest,
  content_reference: input.contentReference,
  created_at: input.now
});
