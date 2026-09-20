import { Type, type Static } from "typebox";
import {
  ClaimAssessmentSchema,
  ClaimSchema,
  EvidencePackageManifestSchema,
  EvidenceSchema,
  GateRequirementSetSchema,
  ImpactAssessmentSchema,
  IndependentEvaluationSchema,
  RepairWorkItemLinkSchema
} from "./domain.js";

export const M3CommandSuccessDataSchema = Type.Union([
  Type.Object({ claim: ClaimSchema }, { additionalProperties: false }),
  Type.Object({ evidence: EvidenceSchema }, { additionalProperties: false }),
  Type.Object({ requirement_set: GateRequirementSetSchema }, { additionalProperties: false }),
  Type.Object(
    {
      evaluation: IndependentEvaluationSchema,
      assessments: Type.Optional(Type.Array(ClaimAssessmentSchema))
    },
    { additionalProperties: false }
  ),
  Type.Object({ impact: ImpactAssessmentSchema }, { additionalProperties: false }),
  Type.Object({ repair_link: RepairWorkItemLinkSchema }, { additionalProperties: false }),
  Type.Object({ package: EvidencePackageManifestSchema }, { additionalProperties: false })
]);

export const ClaimShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    claim: ClaimSchema
  },
  { additionalProperties: false }
);

export const EvidenceShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    evidence: EvidenceSchema
  },
  { additionalProperties: false }
);

export const RequirementSetShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    requirement_set: GateRequirementSetSchema
  },
  { additionalProperties: false }
);

export const EvaluationShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    evaluation: IndependentEvaluationSchema,
    assessments: Type.Array(ClaimAssessmentSchema)
  },
  { additionalProperties: false }
);

export const EvidencePackageShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    package: EvidencePackageManifestSchema
  },
  { additionalProperties: false }
);

export const m3ResultSchemas = {
  ClaimShowResult: ClaimShowResultSchema,
  EvidenceShowResult: EvidenceShowResultSchema,
  RequirementSetShowResult: RequirementSetShowResultSchema,
  EvaluationShowResult: EvaluationShowResultSchema,
  EvidencePackageShowResult: EvidencePackageShowResultSchema
} as const;

export type M3CommandSuccessData = Static<typeof M3CommandSuccessDataSchema>;
export type ClaimShowResult = Static<typeof ClaimShowResultSchema>;
export type EvidenceShowResult = Static<typeof EvidenceShowResultSchema>;
export type RequirementSetShowResult = Static<typeof RequirementSetShowResultSchema>;
export type EvaluationShowResult = Static<typeof EvaluationShowResultSchema>;
export type EvidencePackageShowResult = Static<typeof EvidencePackageShowResultSchema>;
