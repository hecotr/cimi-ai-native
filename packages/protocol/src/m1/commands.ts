import { Type, type Static } from "typebox";
import { InternalIdSchema, mutatingCommandSchema } from "../schemas.js";
import {
  AcceptanceCriterionSchema,
  ChangeProfileKeySchema,
  DecisionOutcomeSchema,
  FeedbackCategorySchema,
  KnowledgeSourcesSchema,
  RiskDimensionsSchema,
  ScopeInOutSchema
} from "./common.js";
import { TaskDraftSchema } from "./domain.js";

const contractCommandBody = {
  profile_key: ChangeProfileKeySchema,
  intent: Type.String({ minLength: 1, maxLength: 2000 }),
  outcomes: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1 }),
  scope: ScopeInOutSchema,
  non_goals: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1 }),
  acceptance: Type.Array(AcceptanceCriterionSchema, { minItems: 1 }),
  constraints: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1 }),
  risk: RiskDimensionsSchema,
  knowledge_impact: KnowledgeSourcesSchema
};

const planCommandBody = {
  summary: Type.String({ minLength: 1, maxLength: 2000 }),
  verification_strategy: Type.String({ minLength: 1, maxLength: 2000 }),
  recovery_considerations: Type.String({ minLength: 1, maxLength: 2000 }),
  tasks: Type.Array(TaskDraftSchema, { minItems: 1 })
};

const feedbackItemSchema = Type.Object(
  {
    category: FeedbackCategorySchema,
    body: Type.String({ minLength: 1, maxLength: 4000 })
  },
  { additionalProperties: false }
);

export const BootstrapSoloGovernanceCommandSchema = mutatingCommandSchema(
  "BootstrapSoloGovernance",
  Type.Object(
    {
      change_id: InternalIdSchema,
      intent_owner_actor_id: InternalIdSchema,
      technical_owner_actor_id: InternalIdSchema
    },
    { additionalProperties: false }
  )
);

export const SubmitContractCandidateCommandSchema = mutatingCommandSchema(
  "SubmitContractCandidate",
  Type.Object(contractCommandBody, { additionalProperties: false })
);

export const RequestIntentDecisionCommandSchema = mutatingCommandSchema(
  "RequestIntentDecision",
  Type.Object({ change_id: InternalIdSchema }, { additionalProperties: false })
);

export const SubmitDecisionCommandSchema = mutatingCommandSchema(
  "SubmitDecision",
  Type.Union([
    Type.Object(
      {
        request_id: InternalIdSchema,
        outcome: Type.Literal("approve"),
        acting_role_id: InternalIdSchema,
        reason: Type.String({ minLength: 1, maxLength: 2000 }),
        feedback: Type.Optional(Type.Array(feedbackItemSchema))
      },
      { additionalProperties: false }
    ),
    Type.Object(
      {
        request_id: InternalIdSchema,
        outcome: Type.Literal("request_changes"),
        acting_role_id: InternalIdSchema,
        reason: Type.String({ minLength: 1, maxLength: 2000 }),
        feedback: Type.Array(feedbackItemSchema, { minItems: 1 })
      },
      { additionalProperties: false }
    ),
    Type.Object(
      {
        request_id: InternalIdSchema,
        outcome: Type.Literal("reject"),
        acting_role_id: InternalIdSchema,
        reason: Type.String({ minLength: 1, maxLength: 2000 }),
        feedback: Type.Optional(Type.Array(feedbackItemSchema))
      },
      { additionalProperties: false }
    )
  ])
);

export const SubmitContractAmendmentCommandSchema = mutatingCommandSchema(
  "SubmitContractAmendment",
  Type.Object(
    {
      ...contractCommandBody,
      base_version: Type.Integer({ minimum: 1 })
    },
    { additionalProperties: false }
  )
);

export const SubmitPlanCandidateCommandSchema = mutatingCommandSchema(
  "SubmitPlanCandidate",
  Type.Object(planCommandBody, { additionalProperties: false })
);

export const RequestPlanDecisionCommandSchema = mutatingCommandSchema(
  "RequestPlanDecision",
  Type.Object({ change_id: InternalIdSchema }, { additionalProperties: false })
);

export const SubmitPlanAmendmentCommandSchema = mutatingCommandSchema(
  "SubmitPlanAmendment",
  Type.Object(
    {
      ...planCommandBody,
      base_version: Type.Integer({ minimum: 1 })
    },
    { additionalProperties: false }
  )
);

export const RevokeProjectPolicyCommandSchema = mutatingCommandSchema(
  "RevokeProjectPolicy",
  Type.Object(
    {
      reason: Type.String({ minLength: 1, maxLength: 2000 })
    },
    { additionalProperties: false }
  )
);

export const m1CommandSchemas = {
  BootstrapSoloGovernanceCommand: BootstrapSoloGovernanceCommandSchema,
  SubmitContractCandidateCommand: SubmitContractCandidateCommandSchema,
  RequestIntentDecisionCommand: RequestIntentDecisionCommandSchema,
  SubmitDecisionCommand: SubmitDecisionCommandSchema,
  SubmitContractAmendmentCommand: SubmitContractAmendmentCommandSchema,
  SubmitPlanCandidateCommand: SubmitPlanCandidateCommandSchema,
  RequestPlanDecisionCommand: RequestPlanDecisionCommandSchema,
  SubmitPlanAmendmentCommand: SubmitPlanAmendmentCommandSchema,
  RevokeProjectPolicyCommand: RevokeProjectPolicyCommandSchema
} as const;

export type DecisionOutcomePayload = Static<typeof DecisionOutcomeSchema>;
export type BootstrapSoloGovernanceCommand = Static<typeof BootstrapSoloGovernanceCommandSchema>;
export type SubmitContractCandidateCommand = Static<typeof SubmitContractCandidateCommandSchema>;
export type RequestIntentDecisionCommand = Static<typeof RequestIntentDecisionCommandSchema>;
export type SubmitDecisionCommand = Static<typeof SubmitDecisionCommandSchema>;
export type SubmitContractAmendmentCommand = Static<typeof SubmitContractAmendmentCommandSchema>;
export type SubmitPlanCandidateCommand = Static<typeof SubmitPlanCandidateCommandSchema>;
export type RequestPlanDecisionCommand = Static<typeof RequestPlanDecisionCommandSchema>;
export type SubmitPlanAmendmentCommand = Static<typeof SubmitPlanAmendmentCommandSchema>;
export type RevokeProjectPolicyCommand = Static<typeof RevokeProjectPolicyCommandSchema>;
