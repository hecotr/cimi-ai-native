import {
  ProtocolValidationError,
  parseExportManifest,
  type ExportManifest,
  type PortableObjectEntry
} from "@cimiloop/protocol";
import { contentDigest, digestOf, manifestDigest } from "./digest.js";
import { PortableImportError } from "./validator.js";

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new PortableImportError("OBJECT_MISSING", "portable object payload is missing");
  }
  return value as Record<string, unknown>;
};

const entryFacts = (entries: readonly PortableObjectEntry[]) =>
  entries.map((entry) => ({
    object_type: entry.object_type,
    schema_version: entry.schema_version,
    id: entry.id,
    ...(entry.domain_version ? { domain_version: entry.domain_version } : {}),
    payload: asRecord(entry.payload)
  }));

export const validatePortableManifest = (manifest: unknown): ExportManifest => {
  let parsed: ExportManifest;
  try {
    parsed = parseExportManifest(manifest);
  } catch (error) {
    if (error instanceof ProtocolValidationError) {
      throw new PortableImportError("IMPORT_INVALID", "bundle manifest failed protocol schema validation");
    }
    throw error;
  }

  for (const entry of parsed.entries) {
    if (entry.payload === undefined || entry.payload === null) {
      throw new PortableImportError("OBJECT_MISSING", `missing payload for ${entry.object_type}/${entry.id}`);
    }
    const actual = digestOf(entry.payload, "portable_entry");
    if (actual.value !== entry.digest.value) {
      throw new PortableImportError("DIGEST_MISMATCH", `tampered payload for ${entry.object_type}/${entry.id}`);
    }
  }

  const facts = entryFacts(parsed.entries);
  const events = parsed.entries
    .filter((entry) => entry.object_type === "event")
    .map((entry) => ({
      event_id: entry.id,
      event_sequence: Number(entry.payload.event_sequence ?? entry.domain_version ?? 0)
    }))
    .sort((left, right) => left.event_sequence - right.event_sequence);
  const outbox = parsed.entries
    .filter((entry) => entry.object_type === "outbox_message")
    .map((entry) => ({ id: entry.id, status: String(entry.payload.status ?? "") }));

  if (events.length > 0) {
    if (events[0]?.event_sequence !== parsed.event_sequence_start || events.at(-1)?.event_sequence !== parsed.event_sequence_end) {
      throw new PortableImportError("IMPORT_INVALID", "event history bounds do not match the manifest");
    }
    for (let index = 1; index < events.length; index += 1) {
      if (events[index]!.event_sequence !== events[index - 1]!.event_sequence + 1) {
        throw new PortableImportError("IMPORT_INVALID", "event revision sequence is not continuous");
      }
    }
  }

  const computedContent = contentDigest({ facts, events, outbox });
  if (computedContent.value !== parsed.content_digest.value) {
    throw new PortableImportError("DIGEST_MISMATCH", "content digest does not match canonicalized payloads");
  }
  const computedManifest = manifestDigest(parsed);
  if (computedManifest.value !== parsed.manifest_digest.value) {
    throw new PortableImportError("DIGEST_MISMATCH", "manifest digest does not match canonicalized manifest");
  }

  const ids = parsed.entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    throw new PortableImportError("IMPORT_INVALID", "bundle contains duplicate ids");
  }
  if ([...parsed.ids].sort().join(" ") !== [...ids].sort().join(" ")) {
    throw new PortableImportError("IMPORT_INVALID", "manifest ids do not match entries");
  }

  validateRelations(parsed);
  return parsed;
};

const requiredId = (payload: Record<string, unknown>, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const validateRelations = (manifest: ExportManifest): void => {
  const byType = new Map<string, Set<string>>();
  for (const entry of manifest.entries) {
    const bucket = byType.get(entry.object_type) ?? new Set<string>();
    bucket.add(entry.id);
    byType.set(entry.object_type, bucket);
  }
  const has = (type: string, id: string | undefined): boolean => !id || (byType.get(type)?.has(id) ?? false);
  const projectIds = byType.get("project") ?? new Set<string>();
  if (!projectIds.has(manifest.project_id)) {
    throw new PortableImportError("IMPORT_INVALID", "manifest project is not present in payloads");
  }

  for (const entry of manifest.entries) {
    const projectId = requiredId(entry.payload, "project_id");
    if (projectId && projectId !== manifest.project_id) {
      throw new PortableImportError("IMPORT_INVALID", `${entry.object_type} belongs to a different project`);
    }
    const changeId = requiredId(entry.payload, "change_id");
    if (changeId && !has("change", changeId) && entry.object_type !== "change") {
      throw new PortableImportError("IMPORT_INVALID", `${entry.object_type} references a missing change`);
    }
    if (entry.object_type === "evidence" && !has("claim", requiredId(entry.payload, "claim_id"))) {
      throw new PortableImportError("IMPORT_INVALID", "evidence references a missing claim");
    }
    if (entry.object_type === "independent_evaluation" && !has("requirement_set", requiredId(entry.payload, "requirement_set_id"))) {
      throw new PortableImportError("IMPORT_INVALID", "evaluation references a missing requirement set");
    }
    if (entry.object_type === "release" && !has("environment", requiredId(entry.payload, "environment_id"))) {
      throw new PortableImportError("IMPORT_INVALID", "release references a missing environment");
    }
    if (entry.object_type === "deployment") {
      if (!has("release", requiredId(entry.payload, "release_id")) || !has("environment", requiredId(entry.payload, "environment_id"))) {
        throw new PortableImportError("IMPORT_INVALID", "deployment references a missing parent");
      }
    }
    if (entry.object_type === "event") {
      const sequence = Number(entry.payload.event_sequence ?? 0);
      if (sequence < 1 || String(entry.payload.event_id) !== entry.id) {
        throw new PortableImportError("IMPORT_INVALID", "event identity or revision is invalid");
      }
    }
  }
};
