import { Type, type Static } from "typebox";
import { InternalIdSchema } from "../schemas.js";
import {
  ChangeProfileKeySchema,
  DigestSchema,
  GateResultSchema,
  ImmutableMetadata,
  optionalExtensions
} from "../m1/common.js";
import { ContentReferenceSchema } from "../m2/common.js";
import {
  ClaimAssessmentResultSchema,
  ClaimCategorySchema,
  ClaimObligationSchema,
  ClaimSourceSchema,
  EvidencePackageKindSchema,
  EvidenceProducerRoleSchema,
  EvidenceStanceSchema,
  EvidenceSubjectTypeSchema,
  EvidenceValiditySchema,
  ImpactTriggerSchema
} from "./common.js";

export const ClaimSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    claim_key: Type.String({ minLength: 1, maxLength: 64 }),
    statement: Type.String({ minLength: 1, maxLength: 2000 }),
    category: ClaimCategorySchema,
    obligation: ClaimObligationSchema,
    source: ClaimSourceSchema,
    contract_id: InternalIdSchema,
    contract_version: Type.Integer({ minimum: 1 }),
    requirement_set_id: Type.Optional(InternalIdSchema),
    artifact_id: Type.Optional(InternalIdSchema),
    artifact_digest: Type.Optional(DigestSchema),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ExternalReferenceSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    reference: ContentReferenceSchema,
    digest: DigestSchema,
    media_type: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    summary: Type.String({ minLength: 1, maxLength: 1000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const EvidenceSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
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
    external_reference_id: Type.Optional(InternalIdSchema),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const GateRequirementItemSchema = Type.Object(
  {
    claim_key: Type.String({ minLength: 1, maxLength: 64 }),
    obligation: ClaimObligationSchema,
    source: ClaimSourceSchema,
    accepted_evidence_kinds: Type.Array(EvidenceProducerRoleSchema, { minItems: 1 })
  },
  { additionalProperties: false }
);

export const GateRequirementSetSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    version: Type.Integer({ minimum: 1 }),
    profile_key: ChangeProfileKeySchema,
    policy_snapshot_id: InternalIdSchema,
    contract_id: InternalIdSchema,
    contract_version: Type.Integer({ minimum: 1 }),
    items: Type.Array(GateRequirementItemSchema, { minItems: 1 }),
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ClaimAssessmentSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    claim_id: InternalIdSchema,
    evaluation_id: InternalIdSchema,
    result: ClaimAssessmentResultSchema,
    evidence_ids: Type.Array(InternalIdSchema, { minItems: 1 }),
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const IndependentEvaluationSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    artifact_id: InternalIdSchema,
    artifact_digest: DigestSchema,
    requirement_set_id: InternalIdSchema,
    input_digest: DigestSchema,
    result: GateResultSchema,
    reason: Type.String({ minLength: 1, maxLength: 2000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const EvidencePackageManifestSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    package_kind: EvidencePackageKindSchema,
    claim_ids: Type.Array(InternalIdSchema),
    evidence_ids: Type.Array(InternalIdSchema),
    evaluation_ids: Type.Array(InternalIdSchema),
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ImpactAssessmentSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    trigger: ImpactTriggerSchema,
    subject_type: EvidenceSubjectTypeSchema,
    subject_id: InternalIdSchema,
    rule: Type.String({ minLength: 1, maxLength: 200 }),
    old_input_digest: DigestSchema,
    new_input_digest: DigestSchema,
    old_validity: EvidenceValiditySchema,
    new_validity: EvidenceValiditySchema,
    affected_ids: Type.Array(InternalIdSchema, { minItems: 1 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const RepairWorkItemLinkSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    failed_evidence_id: InternalIdSchema,
    source_work_item_id: InternalIdSchema,
    task_id: InternalIdSchema,
    artifact_id: InternalIdSchema,
    repair_work_item_id: InternalIdSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const m3ProtocolSchemas = {
  Claim: ClaimSchema,
  Evidence: EvidenceSchema,
  ExternalReference: ExternalReferenceSchema,
  GateRequirementSet: GateRequirementSetSchema,
  GateRequirementItem: GateRequirementItemSchema,
  ClaimAssessment: ClaimAssessmentSchema,
  IndependentEvaluation: IndependentEvaluationSchema,
  EvidencePackageManifest: EvidencePackageManifestSchema,
  ImpactAssessment: ImpactAssessmentSchema,
  RepairWorkItemLink: RepairWorkItemLinkSchema
} as const;

export type Claim = Static<typeof ClaimSchema>;
export type Evidence = Static<typeof EvidenceSchema>;
export type ExternalReference = Static<typeof ExternalReferenceSchema>;
export type GateRequirementSet = Static<typeof GateRequirementSetSchema>;
export type ClaimAssessment = Static<typeof ClaimAssessmentSchema>;
export type IndependentEvaluation = Static<typeof IndependentEvaluationSchema>;
export type EvidencePackageManifest = Static<typeof EvidencePackageManifestSchema>;
export type ImpactAssessment = Static<typeof ImpactAssessmentSchema>;
export type RepairWorkItemLink = Static<typeof RepairWorkItemLinkSchema>;
