import { PORTABLE_SCHEMA_VERSION, type ImportReport, type InternalId } from "@cimiloop/protocol";

export const createImportReport = (input: {
  id: InternalId;
  projectId: InternalId;
  stagedAt: string;
  status: ImportReport["status"];
  conflicts?: string[];
  duplicateIds?: InternalId[];
  digestMismatches?: string[];
  summary: string;
}): ImportReport => ({
  portable_schema_version: PORTABLE_SCHEMA_VERSION,
  id: input.id,
  project_id: input.projectId,
  staged_at: input.stagedAt,
  status: input.status,
  runtime_ownership: "dormant",
  conflicts: input.conflicts ?? [],
  duplicate_ids: input.duplicateIds ?? [],
  digest_mismatches: input.digestMismatches ?? [],
  summary: input.summary
});
