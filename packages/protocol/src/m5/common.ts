import { Type, type Static } from "typebox";

export const PORTABLE_SCHEMA_VERSION = "portable-1.0.0" as const;

export const ClosureDispositionSchema = Type.Union([
  Type.Literal("closed"),
  Type.Literal("cancelled"),
  Type.Literal("superseded"),
  Type.Literal("archived")
]);

export const LearningSourceKindSchema = Type.Union([
  Type.Literal("failure"),
  Type.Literal("exception"),
  Type.Literal("decision"),
  Type.Literal("recovery")
]);

export const LearningCandidateStatusSchema = Type.Union([
  Type.Literal("proposed"),
  Type.Literal("accepted"),
  Type.Literal("rejected"),
  Type.Literal("deferred")
]);

export const AttentionKindSchema = Type.Union([
  Type.Literal("blocker"),
  Type.Literal("failure"),
  Type.Literal("stale_evidence"),
  Type.Literal("decision"),
  Type.Literal("unknown_deployment"),
  Type.Literal("knowledge_gap")
]);

export const AttentionStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("acknowledged"),
  Type.Literal("resolved")
]);

export const OwnershipStateSchema = Type.Union([Type.Literal("dormant"), Type.Literal("active")]);

export const ImportReportStatusSchema = Type.Union([
  Type.Literal("staged"),
  Type.Literal("accepted"),
  Type.Literal("rejected")
]);

export const ClosureGapSchema = Type.Object(
  {
    obligation_key: Type.String({ minLength: 1, maxLength: 64 }),
    summary: Type.String({ minLength: 1, maxLength: 1000 }),
    blocking: Type.Boolean()
  },
  { additionalProperties: false }
);

export const ExportExclusionSchema = Type.Object(
  {
    kind: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.String({ minLength: 1, maxLength: 500 })
  },
  { additionalProperties: false }
);

export type ClosureDisposition = Static<typeof ClosureDispositionSchema>;
export type ClosureGap = Static<typeof ClosureGapSchema>;
export type LearningSourceKind = Static<typeof LearningSourceKindSchema>;
export type LearningCandidateStatus = Static<typeof LearningCandidateStatusSchema>;
export type AttentionKind = Static<typeof AttentionKindSchema>;
export type AttentionStatus = Static<typeof AttentionStatusSchema>;
export type OwnershipState = Static<typeof OwnershipStateSchema>;
export type ImportReportStatus = Static<typeof ImportReportStatusSchema>;
