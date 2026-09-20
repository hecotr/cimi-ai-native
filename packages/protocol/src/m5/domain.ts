import { Type, type Static } from "typebox";
import { InternalIdSchema } from "../schemas.js";
import {
  DigestSchema,
  GateResultSchema,
  ImmutableMetadata,
  KnowledgeConclusionSchema,
  KnowledgeSourceKeySchema,
  MutableMetadata,
  optionalExtensions
} from "../m1/common.js";
import {
  AttentionKindSchema,
  AttentionStatusSchema,
  ClosureDispositionSchema,
  ClosureGapSchema,
  LearningSourceKindSchema
} from "./common.js";

const learningCandidateShared = {
  ...ImmutableMetadata,
  id: InternalIdSchema,
  project_id: InternalIdSchema,
  change_id: InternalIdSchema,
  source_kind: LearningSourceKindSchema,
  source_id: InternalIdSchema,
  summary: Type.String({ minLength: 1, maxLength: 2000 }),
  digest: DigestSchema,
  ...optionalExtensions
};

export const LearningCandidateSchema = Type.Union([
  Type.Object(
    {
      ...learningCandidateShared,
      status: Type.Union([Type.Literal("proposed"), Type.Literal("rejected"), Type.Literal("deferred")]),
      promoted: Type.Literal(false)
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      ...learningCandidateShared,
      status: Type.Literal("accepted"),
      promoted: Type.Boolean(),
      decision_id: InternalIdSchema
    },
    { additionalProperties: false }
  )
]);

export const KnowledgeUpdateEvidenceSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    task_id: InternalIdSchema,
    knowledge_source: KnowledgeSourceKeySchema,
    conclusion: KnowledgeConclusionSchema,
    external_reference_id: InternalIdSchema,
    evidence_id: InternalIdSchema,
    exception_id: Type.Optional(InternalIdSchema),
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ClosureEvaluationSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    disposition: ClosureDispositionSchema,
    result: GateResultSchema,
    knowledge_complete: Type.Boolean(),
    residual_risk: Type.String({ minLength: 1, maxLength: 2000 }),
    known_issues: Type.Array(Type.String({ minLength: 1, maxLength: 500 })),
    gaps: Type.Array(ClosureGapSchema),
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const AttentionItemSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: Type.Optional(InternalIdSchema),
    kind: AttentionKindSchema,
    subject_id: InternalIdSchema,
    summary: Type.String({ minLength: 1, maxLength: 1000 }),
    status: AttentionStatusSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ArchiveRecordSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    disposition: Type.Literal("archived"),
    reason: Type.String({ minLength: 1, maxLength: 2000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const CancellationRecordSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    disposition: Type.Literal("cancelled"),
    reason: Type.String({ minLength: 1, maxLength: 2000 }),
    cleanup_summary: Type.String({ minLength: 1, maxLength: 2000 }),
    residual_responsibility: Type.String({ minLength: 1, maxLength: 2000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const SupersessionRecordSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    successor_change_id: InternalIdSchema,
    disposition: Type.Literal("superseded"),
    reason: Type.String({ minLength: 1, maxLength: 2000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const m5ProtocolSchemas = {
  LearningCandidate: LearningCandidateSchema,
  KnowledgeUpdateEvidence: KnowledgeUpdateEvidenceSchema,
  ClosureEvaluation: ClosureEvaluationSchema,
  AttentionItem: AttentionItemSchema,
  ArchiveRecord: ArchiveRecordSchema,
  CancellationRecord: CancellationRecordSchema,
  SupersessionRecord: SupersessionRecordSchema
} as const;

export type LearningCandidate = Static<typeof LearningCandidateSchema>;
export type KnowledgeUpdateEvidence = Static<typeof KnowledgeUpdateEvidenceSchema>;
export type ClosureEvaluation = Static<typeof ClosureEvaluationSchema>;
export type AttentionItem = Static<typeof AttentionItemSchema>;
export type ArchiveRecord = Static<typeof ArchiveRecordSchema>;
export type CancellationRecord = Static<typeof CancellationRecordSchema>;
export type SupersessionRecord = Static<typeof SupersessionRecordSchema>;
