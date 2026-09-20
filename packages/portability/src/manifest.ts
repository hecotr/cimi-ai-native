import { PORTABLE_SCHEMA_VERSION, SCHEMA_VERSION, type ExportManifest, type PortableObjectEntry } from "@cimiloop/protocol";
import { contentDigest, digestOf, manifestDigest, type ExportContentInput } from "./digest.js";

export const DEFAULT_EXPORT_EXCLUSIONS = [
  { kind: "secret", reason: "credentials are never exported" },
  { kind: "cache", reason: "derived caches are rebuilt on import" },
  { kind: "runtime_transcript", reason: "raw runtime transcripts are not exported" }
] as const;

export const toPortableEntries = (facts: ExportContentInput["facts"]): PortableObjectEntry[] =>
  [...facts]
    .sort((left, right) =>
      left.object_type === right.object_type ? left.id.localeCompare(right.id) : left.object_type.localeCompare(right.object_type)
    )
    .map((fact) => ({
      object_type: fact.object_type,
      schema_version: fact.schema_version,
      id: fact.id,
      ...(fact.domain_version ? { domain_version: fact.domain_version } : {}),
      digest: digestOf(fact.payload, "portable_entry"),
      payload_reference: `cimi-object://export/${fact.object_type}/${fact.id}`
    }));

export const assembleExportManifest = (
  input: ExportContentInput & {
    id: ExportManifest["id"];
    projectId: ExportManifest["project_id"];
    exportedAt: ExportManifest["exported_at"];
    exporterActorId: ExportManifest["exporter_actor_id"];
    sourceInstanceId: ExportManifest["source_instance_id"];
    ownershipState: ExportManifest["ownership_state"];
    latestRevision: number;
  }
): ExportManifest => {
  const entries = toPortableEntries(input.facts);
  const sequences = input.events.map((item) => item.event_sequence);
  const draft: ExportManifest = {
    portable_schema_version: PORTABLE_SCHEMA_VERSION,
    id: input.id,
    project_id: input.projectId,
    exported_at: input.exportedAt,
    exporter_actor_id: input.exporterActorId,
    source_instance_id: input.sourceInstanceId,
    ids: [...new Set(entries.map((entry) => entry.id))].sort(),
    entries,
    event_sequence_start: sequences.length > 0 ? Math.min(...sequences) : 1,
    event_sequence_end: sequences.length > 0 ? Math.max(...sequences) : 1,
    latest_revision: input.latestRevision,
    ownership_state: input.ownershipState,
    excluded: [...DEFAULT_EXPORT_EXCLUSIONS],
    content_digest: contentDigest(input),
    manifest_digest: digestOf({}, "export_manifest")
  };
  return { ...draft, manifest_digest: manifestDigest(draft) };
};

export const protocolSchemaVersion = SCHEMA_VERSION;
