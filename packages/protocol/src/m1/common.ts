import { Type, type Static } from "typebox";
import { SCHEMA_VERSION, UtcTimestampSchema } from "../schemas.js";

export const DecisionOutcomeSchema = Type.Union([
  Type.Literal("approve"),
  Type.Literal("request_changes"),
  Type.Literal("reject")
]);

export const ChangeProfileKeySchema = Type.Union([
  Type.Literal("feature"),
  Type.Literal("bugfix"),
  Type.Literal("incident")
]);

export const KnowledgeConclusionSchema = Type.Union([
  Type.Literal("Create"),
  Type.Literal("Update"),
  Type.Literal("Deprecate"),
  Type.Literal("Verify"),
  Type.Literal("NoImpact")
]);

export const KnowledgeSourceKeySchema = Type.Union([
  Type.Literal("product_business"),
  Type.Literal("technical"),
  Type.Literal("operations"),
  Type.Literal("communication")
]);

export const KnowledgeOwnerRoleSchema = Type.Union([
  Type.Literal("change_owner"),
  Type.Literal("intent_owner"),
  Type.Literal("technical_owner")
]);

export const KnowledgeGateSchema = Type.Union([
  Type.Literal("intent"),
  Type.Literal("plan"),
  Type.Literal("production_release"),
  Type.Literal("change_closure")
]);

export const FeedbackCategorySchema = Type.Union([
  Type.Literal("scope"),
  Type.Literal("acceptance"),
  Type.Literal("risk"),
  Type.Literal("plan"),
  Type.Literal("knowledge"),
  Type.Literal("other")
]);

export const GateResultSchema = Type.Union([
  Type.Literal("ALLOW"),
  Type.Literal("NEED_MORE_EVIDENCE"),
  Type.Literal("REQUIRE_HUMAN"),
  Type.Literal("DENY")
]);

export const GovernanceRoleKeySchema = Type.Union([
  Type.Literal("project_owner"),
  Type.Literal("change_owner"),
  Type.Literal("intent_owner"),
  Type.Literal("technical_owner")
]);

export const DecisionRequestTypeSchema = Type.Union([
  Type.Literal("intent"),
  Type.Literal("plan"),
  Type.Literal("release")
]);

export const DecisionRequestStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("decided"),
  Type.Literal("expired")
]);

export const AmendmentStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("approved"),
  Type.Literal("rejected"),
  Type.Literal("withdrawn")
]);

export const TaskKindSchema = Type.Union([
  Type.Literal("governance"),
  Type.Literal("implementation"),
  Type.Literal("verification"),
  Type.Literal("knowledge")
]);

export const LifecycleStateSchema = Type.Union([
  Type.Literal("Draft"),
  Type.Literal("IntentReady"),
  Type.Literal("Planned"),
  Type.Literal("Executing")
]);

export const DigestSchema = Type.Object(
  {
    algorithm: Type.Literal("sha256"),
    value: Type.String({ pattern: "^[0-9a-f]{64}$" }),
    subject: Type.String({ minLength: 1, maxLength: 200 })
  },
  { additionalProperties: false }
);

export const NamespacedExtensionsSchema = Type.Record(
  Type.String({ pattern: "^[a-z][a-z0-9_]*\\.[a-z0-9][a-z0-9_.]*$" }),
  Type.Unknown(),
  { additionalProperties: false }
);

export const ScopeInOutSchema = Type.Object(
  {
    in: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 1 }),
    out: Type.Array(Type.String({ minLength: 1, maxLength: 300 }))
  },
  { additionalProperties: false }
);

export const AcceptanceCriterionSchema = Type.Object(
  {
    key: Type.String({ minLength: 1, maxLength: 64 }),
    statement: Type.String({ minLength: 1, maxLength: 1000 })
  },
  { additionalProperties: false }
);

export const KnowledgeNoImpactItemSchema = Type.Object(
  {
    conclusion: Type.Literal("NoImpact"),
    rationale: Type.String({ minLength: 1, maxLength: 1000 })
  },
  { additionalProperties: false }
);

export const KnowledgeActionItemSchema = Type.Object(
  {
    conclusion: Type.Union([
      Type.Literal("Create"),
      Type.Literal("Update"),
      Type.Literal("Deprecate"),
      Type.Literal("Verify")
    ]),
    owner_role: KnowledgeOwnerRoleSchema,
    gate: KnowledgeGateSchema,
    summary: Type.String({ minLength: 1, maxLength: 1000 })
  },
  { additionalProperties: false }
);

export const KnowledgeSourceItemSchema = Type.Union([KnowledgeNoImpactItemSchema, KnowledgeActionItemSchema]);

export const KnowledgeSourcesSchema = Type.Object(
  {
    product_business: KnowledgeSourceItemSchema,
    technical: KnowledgeSourceItemSchema,
    operations: KnowledgeSourceItemSchema,
    communication: KnowledgeSourceItemSchema
  },
  { additionalProperties: false }
);

export const RiskDimensionsSchema = Type.Object(
  {
    data_exposure: Type.String({ minLength: 1, maxLength: 200 }),
    security: Type.String({ minLength: 1, maxLength: 200 }),
    reliability: Type.String({ minLength: 1, maxLength: 200 }),
    reversibility: Type.String({ minLength: 1, maxLength: 200 })
  },
  { additionalProperties: false }
);

export const ImmutableMetadata = {
  schema_version: Type.Literal(SCHEMA_VERSION),
  created_at: UtcTimestampSchema
};

export const MutableMetadata = {
  schema_version: Type.Literal(SCHEMA_VERSION),
  created_at: UtcTimestampSchema,
  updated_at: UtcTimestampSchema,
  revision: Type.Integer({ minimum: 1 })
};

export const optionalExtensions = {
  extensions: Type.Optional(NamespacedExtensionsSchema)
};

export type DecisionOutcome = Static<typeof DecisionOutcomeSchema>;
export type ChangeProfileKey = Static<typeof ChangeProfileKeySchema>;
export type KnowledgeConclusion = Static<typeof KnowledgeConclusionSchema>;
export type KnowledgeSourceKey = Static<typeof KnowledgeSourceKeySchema>;
export type GateResult = Static<typeof GateResultSchema>;
export type Digest = Static<typeof DigestSchema>;
export type LifecycleState = Static<typeof LifecycleStateSchema>;
