import { Type, type Static } from "typebox";

export const EvidenceStanceSchema = Type.Union([
  Type.Literal("Supports"),
  Type.Literal("Refutes"),
  Type.Literal("Inconclusive")
]);

export const EvidenceValiditySchema = Type.Union([
  Type.Literal("Valid"),
  Type.Literal("Stale"),
  Type.Literal("Superseded"),
  Type.Literal("Invalid")
]);

export const ClaimCategorySchema = Type.Union([
  Type.Literal("intent"),
  Type.Literal("boundary"),
  Type.Literal("technical"),
  Type.Literal("integrity"),
  Type.Literal("risk"),
  Type.Literal("environment"),
  Type.Literal("recovery"),
  Type.Literal("outcome")
]);

export const ClaimObligationSchema = Type.Union([
  Type.Literal("required"),
  Type.Literal("conditional"),
  Type.Literal("advisory")
]);

export const ClaimSourceSchema = Type.Union([
  Type.Literal("acceptance"),
  Type.Literal("policy"),
  Type.Literal("risk"),
  Type.Literal("plan"),
  Type.Literal("contract")
]);

export const EvidenceSubjectTypeSchema = Type.Union([
  Type.Literal("artifact"),
  Type.Literal("contract"),
  Type.Literal("plan"),
  Type.Literal("environment"),
  Type.Literal("context_pack"),
  Type.Literal("run"),
  Type.Literal("evidence")
]);

export const EvidenceProducerRoleSchema = Type.Union([
  Type.Literal("executor"),
  Type.Literal("evaluator"),
  Type.Literal("human"),
  Type.Literal("system"),
  Type.Literal("deterministic_test")
]);

export const ClaimAssessmentResultSchema = Type.Union([
  Type.Literal("Satisfied"),
  Type.Literal("Refuted"),
  Type.Literal("Insufficient"),
  Type.Literal("Conflicted")
]);

export const TestResultFormatSchema = Type.Union([
  Type.Literal("junit"),
  Type.Literal("tap"),
  Type.Literal("cimiloop_test_v1")
]);

export const ImpactTriggerSchema = Type.Union([
  Type.Literal("contract"),
  Type.Literal("artifact"),
  Type.Literal("environment"),
  Type.Literal("policy"),
  Type.Literal("context")
]);

export const EvidencePackageKindSchema = Type.Union([
  Type.Literal("delivery"),
  Type.Literal("test"),
  Type.Literal("release"),
  Type.Literal("recovery"),
  Type.Literal("learning")
]);

export type EvidenceStance = Static<typeof EvidenceStanceSchema>;
export type EvidenceValidity = Static<typeof EvidenceValiditySchema>;
export type ClaimCategory = Static<typeof ClaimCategorySchema>;
export type ClaimObligation = Static<typeof ClaimObligationSchema>;
export type EvidenceProducerRole = Static<typeof EvidenceProducerRoleSchema>;
export type ClaimAssessmentResult = Static<typeof ClaimAssessmentResultSchema>;
export type TestResultFormat = Static<typeof TestResultFormatSchema>;
