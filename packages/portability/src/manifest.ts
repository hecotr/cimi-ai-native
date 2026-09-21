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
      payload_reference: `cimi-object://export/${fact.object_type}/${fact.id}`,
      payload: { ...fact.payload }
    }));

export const canonicalExportContent = (input: ExportContentInput): ExportContentInput => {
  const facts = [...input.facts];
  for (const event of input.events) {
    if (!facts.some((fact) => fact.object_type === "event" && fact.id === event.event_id)) {
      facts.push({
        object_type: "event",
        schema_version: SCHEMA_VERSION,
        id: event.event_id,
        domain_version: event.event_sequence,
        payload: { event_id: event.event_id, event_sequence: event.event_sequence }
      });
    }
  }
  for (const item of input.outbox) {
    if (!facts.some((fact) => fact.object_type === "outbox_message" && fact.id === item.id)) {
      facts.push({
        object_type: "outbox_message",
        schema_version: SCHEMA_VERSION,
        id: item.id,
        payload: { id: item.id, status: item.status }
      });
    }
  }
  return {
    facts,
    events: facts
      .filter((fact) => fact.object_type === "event")
      .map((fact) => ({
        event_id: fact.id,
        event_sequence: Number(fact.payload.event_sequence ?? fact.domain_version ?? 0)
      })),
    outbox: facts
      .filter((fact) => fact.object_type === "outbox_message")
      .map((fact) => ({ id: fact.id, status: String(fact.payload.status ?? "") })),
    ...(input.objectDigests ? { objectDigests: input.objectDigests } : {})
  };
};

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
  const content = canonicalExportContent(input);
  const entries = toPortableEntries(content.facts);
  const sequences = content.events.map((item) => item.event_sequence);
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
    content_digest: contentDigest(content),
    manifest_digest: digestOf({}, "export_manifest")
  };
  return { ...draft, manifest_digest: manifestDigest(draft) };
};

export const protocolSchemaVersion = SCHEMA_VERSION;
