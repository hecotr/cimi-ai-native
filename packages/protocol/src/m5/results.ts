import { Type, type Static } from "typebox";
import {
  ArchiveRecordSchema,
  AttentionItemSchema,
  CancellationRecordSchema,
  ClosureEvaluationSchema,
  KnowledgeUpdateEvidenceSchema,
  LearningCandidateSchema,
  SupersessionRecordSchema
} from "./domain.js";
import { ExportManifestSchema, ImportReportSchema } from "./portable.js";

export const M5CommandSuccessDataSchema = Type.Union([
  Type.Object({ knowledge_update: KnowledgeUpdateEvidenceSchema }, { additionalProperties: false }),
  Type.Object({ closure_evaluation: ClosureEvaluationSchema }, { additionalProperties: false }),
  Type.Object({ learning_candidate: LearningCandidateSchema }, { additionalProperties: false }),
  Type.Object({ archive_record: ArchiveRecordSchema }, { additionalProperties: false }),
  Type.Object({ cancellation_record: CancellationRecordSchema }, { additionalProperties: false }),
  Type.Object({ supersession_record: SupersessionRecordSchema }, { additionalProperties: false }),
  Type.Object({ attention_item: AttentionItemSchema }, { additionalProperties: false }),
  Type.Object({ export_manifest: ExportManifestSchema }, { additionalProperties: false }),
  Type.Object({ import_report: ImportReportSchema }, { additionalProperties: false }),
  Type.Object(
    {
      import_report: ImportReportSchema,
      export_manifest: Type.Optional(ExportManifestSchema)
    },
    { additionalProperties: false }
  )
]);

export const ClosureEvaluationShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    evaluation: ClosureEvaluationSchema
  },
  { additionalProperties: false }
);

export const ExportManifestShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    manifest: ExportManifestSchema
  },
  { additionalProperties: false }
);

export const ImportReportShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    report: ImportReportSchema
  },
  { additionalProperties: false }
);

export const m5ResultSchemas = {
  ClosureEvaluationShowResult: ClosureEvaluationShowResultSchema,
  ExportManifestShowResult: ExportManifestShowResultSchema,
  ImportReportShowResult: ImportReportShowResultSchema
} as const;

export type M5CommandSuccessData = Static<typeof M5CommandSuccessDataSchema>;
export type ClosureEvaluationShowResult = Static<typeof ClosureEvaluationShowResultSchema>;
export type ExportManifestShowResult = Static<typeof ExportManifestShowResultSchema>;
export type ImportReportShowResult = Static<typeof ImportReportShowResultSchema>;
