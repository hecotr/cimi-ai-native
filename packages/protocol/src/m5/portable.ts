import { Type, type Static } from "typebox";
import { InternalIdSchema, UtcTimestampSchema } from "../schemas.js";
import { DigestSchema } from "../m1/common.js";
import { ContentReferenceSchema } from "../m2/common.js";
import {
  ExportExclusionSchema,
  ImportReportStatusSchema,
  OwnershipStateSchema,
  PORTABLE_SCHEMA_VERSION
} from "./common.js";

export const PortableObjectEntrySchema = Type.Object(
  {
    object_type: Type.String({ minLength: 1, maxLength: 64 }),
    schema_version: Type.String({ minLength: 1, maxLength: 32 }),
    id: InternalIdSchema,
    domain_version: Type.Optional(Type.Integer({ minimum: 1 })),
    digest: DigestSchema,
    payload_reference: ContentReferenceSchema,
    payload: Type.Record(Type.String(), Type.Unknown())
  },
  { additionalProperties: false }
);

export const ExportManifestSchema = Type.Object(
  {
    portable_schema_version: Type.Literal(PORTABLE_SCHEMA_VERSION),
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    exported_at: UtcTimestampSchema,
    exporter_actor_id: InternalIdSchema,
    source_instance_id: InternalIdSchema,
    ids: Type.Array(InternalIdSchema, { uniqueItems: true }),
    entries: Type.Array(PortableObjectEntrySchema),
    event_sequence_start: Type.Integer({ minimum: 1 }),
    event_sequence_end: Type.Integer({ minimum: 1 }),
    latest_revision: Type.Integer({ minimum: 1 }),
    ownership_state: OwnershipStateSchema,
    excluded: Type.Array(ExportExclusionSchema),
    content_digest: DigestSchema,
    manifest_digest: DigestSchema
  },
  { additionalProperties: false }
);

export const ImportReportSchema = Type.Object(
  {
    portable_schema_version: Type.Literal(PORTABLE_SCHEMA_VERSION),
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    staged_at: UtcTimestampSchema,
    status: ImportReportStatusSchema,
    runtime_ownership: Type.Literal("dormant"),
    conflicts: Type.Array(Type.String({ minLength: 1, maxLength: 500 })),
    duplicate_ids: Type.Array(InternalIdSchema),
    digest_mismatches: Type.Array(Type.String({ minLength: 1, maxLength: 200 })),
    summary: Type.String({ minLength: 1, maxLength: 2000 })
  },
  { additionalProperties: false }
);

export const m5PortableSchemas = {
  PortableObjectEntry: PortableObjectEntrySchema,
  ExportManifest: ExportManifestSchema,
  ImportReport: ImportReportSchema
} as const;

export type PortableObjectEntry = Static<typeof PortableObjectEntrySchema>;
export type ExportManifest = Static<typeof ExportManifestSchema>;
export type ImportReport = Static<typeof ImportReportSchema>;
