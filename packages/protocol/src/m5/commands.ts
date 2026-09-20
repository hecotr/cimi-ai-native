import { Type, type Static } from "typebox";
import { DigestSchema, KnowledgeConclusionSchema, KnowledgeSourceKeySchema } from "../m1/common.js";
import { ContentReferenceSchema } from "../m2/common.js";
import { InternalIdSchema, mutatingCommandSchema } from "../schemas.js";
import { LearningSourceKindSchema } from "./common.js";

export const RecordKnowledgeUpdateCommandSchema = mutatingCommandSchema(
  "RecordKnowledgeUpdate",
  Type.Object(
    {
      change_id: InternalIdSchema,
      task_id: InternalIdSchema,
      knowledge_source: KnowledgeSourceKeySchema,
      conclusion: KnowledgeConclusionSchema,
      external_reference_id: InternalIdSchema,
      evidence_id: InternalIdSchema,
      exception_id: Type.Optional(InternalIdSchema)
    },
    { additionalProperties: false }
  )
);

export const ProposeCloseCommandSchema = mutatingCommandSchema(
  "ProposeClose",
  Type.Object(
    {
      change_id: InternalIdSchema,
      residual_risk: Type.String({ minLength: 1, maxLength: 2000 }),
      known_issues: Type.Array(Type.String({ minLength: 1, maxLength: 500 }))
    },
    { additionalProperties: false }
  )
);

export const CloseChangeCommandSchema = mutatingCommandSchema(
  "CloseChange",
  Type.Object(
    {
      change_id: InternalIdSchema,
      closure_evaluation_id: InternalIdSchema
    },
    { additionalProperties: false }
  )
);

export const CancelChangeCommandSchema = mutatingCommandSchema(
  "CancelChange",
  Type.Object(
    {
      change_id: InternalIdSchema,
      reason: Type.String({ minLength: 1, maxLength: 2000 }),
      cleanup_summary: Type.String({ minLength: 1, maxLength: 2000 })
    },
    { additionalProperties: false }
  )
);

export const SupersedeChangeCommandSchema = mutatingCommandSchema(
  "SupersedeChange",
  Type.Object(
    {
      change_id: InternalIdSchema,
      successor_change_id: InternalIdSchema,
      reason: Type.String({ minLength: 1, maxLength: 2000 })
    },
    { additionalProperties: false }
  )
);

export const ArchiveChangeCommandSchema = mutatingCommandSchema(
  "ArchiveChange",
  Type.Object(
    {
      change_id: InternalIdSchema,
      reason: Type.String({ minLength: 1, maxLength: 2000 })
    },
    { additionalProperties: false }
  )
);

export const CreateLearningCandidateCommandSchema = mutatingCommandSchema(
  "CreateLearningCandidate",
  Type.Object(
    {
      change_id: InternalIdSchema,
      source_kind: LearningSourceKindSchema,
      source_id: InternalIdSchema,
      summary: Type.String({ minLength: 1, maxLength: 2000 })
    },
    { additionalProperties: false }
  )
);

export const ExportProjectCommandSchema = mutatingCommandSchema(
  "ExportProject",
  Type.Object(
    {
      scope: Type.Union([Type.Literal("project"), Type.Literal("change")]),
      change_id: Type.Optional(InternalIdSchema)
    },
    { additionalProperties: false }
  )
);

export const StageImportCommandSchema = mutatingCommandSchema(
  "StageImport",
  Type.Object(
    {
      bundle_reference: ContentReferenceSchema,
      bundle_digest: DigestSchema
    },
    { additionalProperties: false }
  )
);

export const CommitImportCommandSchema = mutatingCommandSchema(
  "CommitImport",
  Type.Object({ import_report_id: InternalIdSchema }, { additionalProperties: false })
);

export const m5CommandSchemas = {
  RecordKnowledgeUpdateCommand: RecordKnowledgeUpdateCommandSchema,
  ProposeCloseCommand: ProposeCloseCommandSchema,
  CloseChangeCommand: CloseChangeCommandSchema,
  CancelChangeCommand: CancelChangeCommandSchema,
  SupersedeChangeCommand: SupersedeChangeCommandSchema,
  ArchiveChangeCommand: ArchiveChangeCommandSchema,
  CreateLearningCandidateCommand: CreateLearningCandidateCommandSchema,
  ExportProjectCommand: ExportProjectCommandSchema,
  StageImportCommand: StageImportCommandSchema,
  CommitImportCommand: CommitImportCommandSchema
} as const;

export type RecordKnowledgeUpdateCommand = Static<typeof RecordKnowledgeUpdateCommandSchema>;
export type ProposeCloseCommand = Static<typeof ProposeCloseCommandSchema>;
export type CloseChangeCommand = Static<typeof CloseChangeCommandSchema>;
export type CancelChangeCommand = Static<typeof CancelChangeCommandSchema>;
export type SupersedeChangeCommand = Static<typeof SupersedeChangeCommandSchema>;
export type ArchiveChangeCommand = Static<typeof ArchiveChangeCommandSchema>;
export type CreateLearningCandidateCommand = Static<typeof CreateLearningCandidateCommandSchema>;
export type ExportProjectCommand = Static<typeof ExportProjectCommandSchema>;
export type StageImportCommand = Static<typeof StageImportCommandSchema>;
export type CommitImportCommand = Static<typeof CommitImportCommandSchema>;
