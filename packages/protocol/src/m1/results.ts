import { Type, type Static } from "typebox";
import {
  AssignmentSchema,
  ChangeSchema,
  DomainErrorSchema,
  EventEnvelopeSchema,
  InternalIdSchema,
  M0CommandSuccessDataSchema,
  RoleSchema,
  TypedReferenceSchema,
  UtcTimestampSchema
} from "../schemas.js";
import { M2CommandSuccessDataSchema } from "../m2/results.js";
import { M3CommandSuccessDataSchema } from "../m3/results.js";
import { M4CommandSuccessDataSchema } from "../m4/results.js";
import { M5CommandSuccessDataSchema } from "../m5/results.js";
import {
  ChangeRoomViewSchema,
  ContractCandidateSchema,
  ContractVersionSchema,
  DecisionInboxItemSchema,
  DecisionRequestSchema,
  DecisionSchema,
  GateEvaluationSchema,
  KnowledgeImpactAssessmentSchema,
  PlanCandidateSchema,
  PlanVersionSchema,
  ProjectPolicySchema,
  RiskAssessmentSchema,
  TaskSchema
} from "./domain.js";

export const TimelineEventSummarySchema = Type.Object(
  {
    event_id: InternalIdSchema,
    event_type: Type.String({ minLength: 1 }),
    event_sequence: Type.Integer({ minimum: 1 }),
    occurred_at: UtcTimestampSchema,
    summary: Type.String({ minLength: 1, maxLength: 300 })
  },
  { additionalProperties: false }
);

export const CommandSuccessDataSchema = Type.Union([
  M0CommandSuccessDataSchema,
  Type.Object(
    {
      change: ChangeSchema,
      roles: Type.Array(RoleSchema, { minItems: 1 }),
      assignments: Type.Array(AssignmentSchema, { minItems: 1 }),
      policy: ProjectPolicySchema
    },
    { additionalProperties: false }
  ),
  Type.Object({ policy: ProjectPolicySchema }, { additionalProperties: false }),
  Type.Object(
    {
      candidate: ContractCandidateSchema,
      risk_assessment: RiskAssessmentSchema,
      knowledge_assessment: KnowledgeImpactAssessmentSchema
    },
    { additionalProperties: false }
  ),
  Type.Object({ candidate: PlanCandidateSchema }, { additionalProperties: false }),
  Type.Object({ request: DecisionRequestSchema }, { additionalProperties: false }),
  Type.Object(
    {
      decision: DecisionSchema,
      change: ChangeSchema,
      gate: GateEvaluationSchema,
      contract: Type.Optional(ContractVersionSchema),
      plan: Type.Optional(PlanVersionSchema),
      tasks: Type.Optional(Type.Array(TaskSchema))
    },
    { additionalProperties: false }
  ),
  M2CommandSuccessDataSchema,
  M3CommandSuccessDataSchema,
  M4CommandSuccessDataSchema,
  M5CommandSuccessDataSchema
]);

export const CommandSuccessSchema = Type.Object(
  {
    ok: Type.Literal(true),
    command_id: InternalIdSchema,
    correlation_id: InternalIdSchema,
    aggregate: TypedReferenceSchema,
    revision: Type.Integer({ minimum: 1 }),
    events: Type.Array(EventEnvelopeSchema),
    data: CommandSuccessDataSchema
  },
  { additionalProperties: false }
);

export const CommandResultSchema = Type.Union([CommandSuccessSchema, DomainErrorSchema]);

export const GetContractCandidateResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    candidate: ContractCandidateSchema
  },
  { additionalProperties: false }
);

export const GetCurrentContractResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    contract: ContractVersionSchema
  },
  { additionalProperties: false }
);

export const GetPlanCandidateResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    candidate: PlanCandidateSchema
  },
  { additionalProperties: false }
);

export const GetCurrentPlanResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    plan: PlanVersionSchema,
    tasks: Type.Array(TaskSchema)
  },
  { additionalProperties: false }
);

export const GetDecisionRequestResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    request: DecisionRequestSchema
  },
  { additionalProperties: false }
);

export const DecisionInboxResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    items: Type.Array(DecisionInboxItemSchema)
  },
  { additionalProperties: false }
);

export const ChangeRoomResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    room: ChangeRoomViewSchema
  },
  { additionalProperties: false }
);

export const TimelineResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    events: Type.Array(TimelineEventSummarySchema)
  },
  { additionalProperties: false }
);

export const m1ResultSchemas = {
  CommandSuccess: CommandSuccessSchema,
  CommandResult: CommandResultSchema,
  GetContractCandidateResult: GetContractCandidateResultSchema,
  GetCurrentContractResult: GetCurrentContractResultSchema,
  GetPlanCandidateResult: GetPlanCandidateResultSchema,
  GetCurrentPlanResult: GetCurrentPlanResultSchema,
  GetDecisionRequestResult: GetDecisionRequestResultSchema,
  DecisionInboxResult: DecisionInboxResultSchema,
  ChangeRoomResult: ChangeRoomResultSchema,
  TimelineResult: TimelineResultSchema,
  TimelineEventSummary: TimelineEventSummarySchema
} as const;

export type CommandSuccess = Static<typeof CommandSuccessSchema>;
export type CommandResult = Static<typeof CommandResultSchema>;
export type GetContractCandidateResult = Static<typeof GetContractCandidateResultSchema>;
export type GetCurrentContractResult = Static<typeof GetCurrentContractResultSchema>;
export type GetPlanCandidateResult = Static<typeof GetPlanCandidateResultSchema>;
export type GetCurrentPlanResult = Static<typeof GetCurrentPlanResultSchema>;
export type GetDecisionRequestResult = Static<typeof GetDecisionRequestResultSchema>;
export type DecisionInboxResult = Static<typeof DecisionInboxResultSchema>;
export type ChangeRoomResult = Static<typeof ChangeRoomResultSchema>;
export type TimelineResult = Static<typeof TimelineResultSchema>;
export type TimelineEventSummary = Static<typeof TimelineEventSummarySchema>;
