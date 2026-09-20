import { Type, type Static } from "typebox";
import { InternalIdSchema } from "../schemas.js";
import {
  AcceptanceCriterionSchema,
  AmendmentStatusSchema,
  ChangeProfileKeySchema,
  DecisionOutcomeSchema,
  DecisionRequestStatusSchema,
  DecisionRequestTypeSchema,
  DigestSchema,
  FeedbackCategorySchema,
  GateResultSchema,
  GovernanceRoleKeySchema,
  ImmutableMetadata,
  KnowledgeSourcesSchema,
  LifecycleStateSchema,
  MutableMetadata,
  RiskDimensionsSchema,
  ScopeInOutSchema,
  TaskKindSchema,
  KnowledgeSourceKeySchema,
  optionalExtensions
} from "./common.js";

const contractBody = {
  profile_key: ChangeProfileKeySchema,
  intent: Type.String({ minLength: 1, maxLength: 2000 }),
  outcomes: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1 }),
  scope: ScopeInOutSchema,
  non_goals: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1 }),
  acceptance: Type.Array(AcceptanceCriterionSchema, { minItems: 1 }),
  constraints: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1 })
};

const planBody = {
  summary: Type.String({ minLength: 1, maxLength: 2000 }),
  verification_strategy: Type.String({ minLength: 1, maxLength: 2000 }),
  recovery_considerations: Type.String({ minLength: 1, maxLength: 2000 })
};

export const TaskDraftSchema = Type.Object(
  {
    key: Type.String({ minLength: 1, maxLength: 64 }),
    title: Type.String({ minLength: 1, maxLength: 300 }),
    kind: TaskKindSchema,
    dependencies: Type.Array(Type.String({ minLength: 1, maxLength: 64 })),
    knowledge_source: Type.Optional(KnowledgeSourceKeySchema)
  },
  { additionalProperties: false }
);

export const ChangeProfileSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    profile_key: ChangeProfileKeySchema,
    display_name: Type.String({ minLength: 1, maxLength: 200 }),
    domain_version: Type.Integer({ minimum: 1 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ProjectPolicySchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    intent_required_role: Type.Literal("intent_owner"),
    plan_required_role: Type.Literal("technical_owner"),
    decisions_human_only: Type.Literal(true),
    knowledge_tasks_required: Type.Literal(true),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const PolicySnapshotSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    policy_id: InternalIdSchema,
    policy_revision: Type.Integer({ minimum: 1 }),
    digest: DigestSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ContractCandidateSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    ...contractBody,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ContractVersionSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    contract_id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    domain_version: Type.Integer({ minimum: 1 }),
    candidate_id: InternalIdSchema,
    ...contractBody,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const ContractAmendmentSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    contract_id: InternalIdSchema,
    base_version: Type.Integer({ minimum: 1 }),
    status: AmendmentStatusSchema,
    ...contractBody,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const RiskProfileSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    dimensions: RiskDimensionsSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const RiskAssessmentSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    risk_profile_id: InternalIdSchema,
    profile_revision: Type.Integer({ minimum: 1 }),
    dimensions: RiskDimensionsSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const KnowledgeImpactAssessmentSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    sources: KnowledgeSourcesSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const PlanCandidateSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    contract_id: InternalIdSchema,
    contract_version: Type.Integer({ minimum: 1 }),
    ...planBody,
    tasks: Type.Array(TaskDraftSchema, { minItems: 1 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const PlanVersionSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    plan_id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    domain_version: Type.Integer({ minimum: 1 }),
    candidate_id: InternalIdSchema,
    contract_id: InternalIdSchema,
    contract_version: Type.Integer({ minimum: 1 }),
    ...planBody,
    task_ids: Type.Array(InternalIdSchema, { minItems: 1 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const PlanAmendmentSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    plan_id: InternalIdSchema,
    base_version: Type.Integer({ minimum: 1 }),
    contract_id: InternalIdSchema,
    contract_version: Type.Integer({ minimum: 1 }),
    status: AmendmentStatusSchema,
    ...planBody,
    tasks: Type.Array(TaskDraftSchema, { minItems: 1 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const TaskSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    plan_id: InternalIdSchema,
    plan_version: Type.Integer({ minimum: 1 }),
    key: Type.String({ minLength: 1, maxLength: 64 }),
    title: Type.String({ minLength: 1, maxLength: 300 }),
    kind: TaskKindSchema,
    dependencies: Type.Array(Type.String({ minLength: 1, maxLength: 64 })),
    knowledge_source: Type.Optional(KnowledgeSourceKeySchema),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const DecisionRequestSchema = Type.Object(
  {
    ...MutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    request_type: DecisionRequestTypeSchema,
    required_role_key: Type.Union([
      Type.Literal("intent_owner"),
      Type.Literal("technical_owner"),
      Type.Literal("project_owner")
    ]),
    candidate_id: InternalIdSchema,
    candidate_revision: Type.Integer({ minimum: 1 }),
    profile_id: InternalIdSchema,
    profile_version: Type.Integer({ minimum: 1 }),
    risk_assessment_id: InternalIdSchema,
    knowledge_assessment_id: InternalIdSchema,
    policy_snapshot_id: InternalIdSchema,
    digest: DigestSchema,
    status: DecisionRequestStatusSchema,
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const DecisionSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    request_id: InternalIdSchema,
    actor_id: InternalIdSchema,
    acting_role_id: InternalIdSchema,
    outcome: DecisionOutcomeSchema,
    reason: Type.String({ minLength: 1, maxLength: 2000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const FeedbackSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    decision_id: InternalIdSchema,
    category: FeedbackCategorySchema,
    body: Type.String({ minLength: 1, maxLength: 4000 }),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const GateEvaluationSchema = Type.Object(
  {
    ...ImmutableMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    gate_type: DecisionRequestTypeSchema,
    result: GateResultSchema,
    policy_snapshot_id: InternalIdSchema,
    digest: DigestSchema,
    request_id: Type.Optional(InternalIdSchema),
    decision_id: Type.Optional(InternalIdSchema),
    requirement_set_id: Type.Optional(InternalIdSchema),
    artifact_id: Type.Optional(InternalIdSchema),
    artifact_digest: Type.Optional(DigestSchema),
    independent_evaluation_id: Type.Optional(InternalIdSchema),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    ...optionalExtensions
  },
  { additionalProperties: false }
);

export const DecisionInboxItemSchema = Type.Object(
  {
    request_id: InternalIdSchema,
    change_id: InternalIdSchema,
    display_key: Type.String({ pattern: "^CHG-\\d{4,}$" }),
    request_type: DecisionRequestTypeSchema,
    required_role_key: Type.Union([
      Type.Literal("intent_owner"),
      Type.Literal("technical_owner"),
      Type.Literal("project_owner")
    ]),
    status: Type.Literal("open"),
    created_at: ImmutableMetadata.created_at,
    summary: Type.String({ minLength: 1, maxLength: 300 })
  },
  { additionalProperties: false }
);

export const ChangeRoomViewSchema = Type.Object(
  {
    change_id: InternalIdSchema,
    display_key: Type.String({ pattern: "^CHG-\\d{4,}$" }),
    title: Type.String({ minLength: 1, maxLength: 300 }),
    lifecycle_state: LifecycleStateSchema,
    operating_status: Type.Union([Type.Literal("Active"), Type.Literal("Paused")]),
    focus: Type.String({ minLength: 1, maxLength: 200 }),
    next_action: Type.String({ minLength: 1, maxLength: 300 }),
    contract: Type.Optional(
      Type.Object(
        {
          domain_version: Type.Integer({ minimum: 1 }),
          intent: Type.String({ minLength: 1, maxLength: 2000 })
        },
        { additionalProperties: false }
      )
    ),
    plan: Type.Optional(
      Type.Object(
        {
          domain_version: Type.Integer({ minimum: 1 }),
          summary: Type.String({ minLength: 1, maxLength: 2000 })
        },
        { additionalProperties: false }
      )
    ),
    open_request_ids: Type.Array(InternalIdSchema),
    decision_ids: Type.Array(InternalIdSchema),
    feedback_ids: Type.Array(InternalIdSchema),
    timeline_event_ids: Type.Array(InternalIdSchema)
  },
  { additionalProperties: false }
);

export const m1ProtocolSchemas = {
  ChangeProfile: ChangeProfileSchema,
  ProjectPolicy: ProjectPolicySchema,
  PolicySnapshot: PolicySnapshotSchema,
  ContractCandidate: ContractCandidateSchema,
  ContractVersion: ContractVersionSchema,
  ContractAmendment: ContractAmendmentSchema,
  RiskProfile: RiskProfileSchema,
  RiskAssessment: RiskAssessmentSchema,
  KnowledgeImpactAssessment: KnowledgeImpactAssessmentSchema,
  PlanCandidate: PlanCandidateSchema,
  PlanVersion: PlanVersionSchema,
  PlanAmendment: PlanAmendmentSchema,
  Task: TaskSchema,
  DecisionRequest: DecisionRequestSchema,
  Decision: DecisionSchema,
  Feedback: FeedbackSchema,
  GateEvaluation: GateEvaluationSchema,
  ChangeRoomView: ChangeRoomViewSchema,
  DecisionInboxItem: DecisionInboxItemSchema
} as const;

export type ChangeProfile = Static<typeof ChangeProfileSchema>;
export type ProjectPolicy = Static<typeof ProjectPolicySchema>;
export type PolicySnapshot = Static<typeof PolicySnapshotSchema>;
export type ContractCandidate = Static<typeof ContractCandidateSchema>;
export type ContractVersion = Static<typeof ContractVersionSchema>;
export type ContractAmendment = Static<typeof ContractAmendmentSchema>;
export type RiskProfile = Static<typeof RiskProfileSchema>;
export type RiskAssessment = Static<typeof RiskAssessmentSchema>;
export type KnowledgeImpactAssessment = Static<typeof KnowledgeImpactAssessmentSchema>;
export type PlanCandidate = Static<typeof PlanCandidateSchema>;
export type PlanVersion = Static<typeof PlanVersionSchema>;
export type PlanAmendment = Static<typeof PlanAmendmentSchema>;
export type Task = Static<typeof TaskSchema>;
export type TaskDraft = Static<typeof TaskDraftSchema>;
export type DecisionRequest = Static<typeof DecisionRequestSchema>;
export type Decision = Static<typeof DecisionSchema>;
export type Feedback = Static<typeof FeedbackSchema>;
export type GateEvaluation = Static<typeof GateEvaluationSchema>;
export type ChangeRoomView = Static<typeof ChangeRoomViewSchema>;
export type DecisionInboxItem = Static<typeof DecisionInboxItemSchema>;
