import { Type, type Static } from "typebox";
import { InternalIdSchema, mutatingCommandSchema } from "../schemas.js";
import { DigestSchema, GateResultSchema } from "../m1/common.js";
import { ContentReferenceSchema } from "../m2/common.js";
import {
  ClaimCategorySchema,
  ClaimObligationSchema,
  ClaimSourceSchema,
  EvidenceProducerRoleSchema,
  EvidenceStanceSchema,
  EvidenceSubjectTypeSchema,
  EvidenceValiditySchema,
  ImpactTriggerSchema,
  TestResultFormatSchema
} from "./common.js";

export const SubmitClaimCommandSchema = mutatingCommandSchema(
  "SubmitClaim",
  Type.Object(
    {
      change_id: InternalIdSchema,
      claim_key: Type.String({ minLength: 1, maxLength: 64 }),
      statement: Type.String({ minLength: 1, maxLength: 2000 }),
      category: ClaimCategorySchema,
      obligation: ClaimObligationSchema,
      source: ClaimSourceSchema,
      requirement_set_id: Type.Optional(InternalIdSchema),
      artifact_id: Type.Optional(InternalIdSchema),
      artifact_digest: Type.Optional(DigestSchema)
    },
    { additionalProperties: false }
  )
);

export const RecordEvidenceCommandSchema = mutatingCommandSchema(
  "RecordEvidence",
  Type.Object(
    {
      change_id: InternalIdSchema,
      claim_id: InternalIdSchema,
      stance: EvidenceStanceSchema,
      subject_type: EvidenceSubjectTypeSchema,
      subject_id: InternalIdSchema,
      subject_digest: DigestSchema,
      content_reference: ContentReferenceSchema,
      digest: DigestSchema,
      producer_role: EvidenceProducerRoleSchema,
      environment_ref: Type.Optional(ContentReferenceSchema),
      context_pack_id: Type.Optional(InternalIdSchema),
      external_reference_id: Type.Optional(InternalIdSchema)
    },
    { additionalProperties: false }
  )
);

export const PromoteTestResultCommandSchema = mutatingCommandSchema(
  "PromoteTestResult",
  Type.Object(
    {
      change_id: InternalIdSchema,
      claim_id: InternalIdSchema,
      artifact_id: InternalIdSchema,
      artifact_digest: DigestSchema,
      format: TestResultFormatSchema,
      content_reference: ContentReferenceSchema,
      digest: DigestSchema,
      environment_ref: Type.Optional(ContentReferenceSchema)
    },
    { additionalProperties: false }
  )
);

export const RequestEvaluationCommandSchema = mutatingCommandSchema(
  "RequestEvaluation",
  Type.Object(
    {
      change_id: InternalIdSchema,
      artifact_id: InternalIdSchema,
      artifact_digest: DigestSchema,
      requirement_set_id: InternalIdSchema
    },
    { additionalProperties: false }
  )
);

export const CompleteEvaluationCommandSchema = mutatingCommandSchema(
  "CompleteEvaluation",
  Type.Object(
    {
      change_id: InternalIdSchema,
      evaluation_id: InternalIdSchema,
      artifact_id: InternalIdSchema,
      artifact_digest: DigestSchema,
      requirement_set_id: InternalIdSchema,
      input_digest: DigestSchema,
      result: GateResultSchema,
      reason: Type.String({ minLength: 1, maxLength: 2000 })
    },
    { additionalProperties: false }
  )
);

export const AssessImpactCommandSchema = mutatingCommandSchema(
  "AssessImpact",
  Type.Object(
    {
      change_id: InternalIdSchema,
      trigger: ImpactTriggerSchema,
      subject_type: EvidenceSubjectTypeSchema,
      subject_id: InternalIdSchema,
      rule: Type.String({ minLength: 1, maxLength: 200 }),
      old_input_digest: DigestSchema,
      new_input_digest: DigestSchema,
      old_validity: Type.Optional(EvidenceValiditySchema),
      new_validity: EvidenceValiditySchema,
      affected_ids: Type.Array(InternalIdSchema, { minItems: 1 })
    },
    { additionalProperties: false }
  )
);

export const CreateRepairWorkItemCommandSchema = mutatingCommandSchema(
  "CreateRepairWorkItem",
  Type.Object(
    {
      change_id: InternalIdSchema,
      failed_evidence_id: InternalIdSchema,
      source_work_item_id: InternalIdSchema,
      artifact_id: InternalIdSchema,
      task_id: InternalIdSchema
    },
    { additionalProperties: false }
  )
);

export const m3CommandSchemas = {
  SubmitClaimCommand: SubmitClaimCommandSchema,
  RecordEvidenceCommand: RecordEvidenceCommandSchema,
  PromoteTestResultCommand: PromoteTestResultCommandSchema,
  RequestEvaluationCommand: RequestEvaluationCommandSchema,
  CompleteEvaluationCommand: CompleteEvaluationCommandSchema,
  AssessImpactCommand: AssessImpactCommandSchema,
  CreateRepairWorkItemCommand: CreateRepairWorkItemCommandSchema
} as const;

export type SubmitClaimCommand = Static<typeof SubmitClaimCommandSchema>;
export type RecordEvidenceCommand = Static<typeof RecordEvidenceCommandSchema>;
export type PromoteTestResultCommand = Static<typeof PromoteTestResultCommandSchema>;
export type RequestEvaluationCommand = Static<typeof RequestEvaluationCommandSchema>;
export type CompleteEvaluationCommand = Static<typeof CompleteEvaluationCommandSchema>;
export type AssessImpactCommand = Static<typeof AssessImpactCommandSchema>;
export type CreateRepairWorkItemCommand = Static<typeof CreateRepairWorkItemCommandSchema>;
