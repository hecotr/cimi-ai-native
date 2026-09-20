import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { TSchema } from "typebox";
import {
  ChangeProfileSchema,
  ChangeRoomViewSchema,
  ContractAmendmentSchema,
  ContractCandidateSchema,
  ContractVersionSchema,
  DecisionInboxItemSchema,
  DecisionRequestSchema,
  DecisionSchema,
  FeedbackSchema,
  GateEvaluationSchema,
  KnowledgeImpactAssessmentSchema,
  PlanAmendmentSchema,
  PlanCandidateSchema,
  PlanVersionSchema,
  PolicySnapshotSchema,
  ProjectPolicySchema,
  RiskAssessmentSchema,
  RiskProfileSchema,
  TaskSchema,
  type ChangeProfile,
  type ChangeRoomView,
  type ContractAmendment,
  type ContractCandidate,
  type ContractVersion,
  type Decision,
  type DecisionInboxItem,
  type DecisionRequest,
  type Feedback,
  type GateEvaluation,
  type KnowledgeImpactAssessment,
  type PlanAmendment,
  type PlanCandidate,
  type PlanVersion,
  type PolicySnapshot,
  type ProjectPolicy,
  type RiskAssessment,
  type RiskProfile,
  type Task
} from "./m1/domain.js";
import {
  AnyCommandSchema,
  ChangeListResultSchema,
  ChangeShowResultSchema,
  CommandResultSchema,
  DoctorResultSchema,
  ErrorResultSchema,
  type AnyCommand,
  type ChangeListResult,
  type ChangeShowResult,
  type CommandResult,
  type DoctorResult,
  type ErrorResult
} from "./schemas.js";

export class ProtocolValidationError extends Error {
  readonly errors: ErrorObject[];

  constructor(errors: ErrorObject[]) {
    super("Protocol validation failed");
    this.name = "ProtocolValidationError";
    this.errors = errors;
  }
}

export const compileValidator = <T>(schema: TSchema): ((value: unknown) => T) => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: false
  });
  const validate = ajv.compile(schema as object) as ValidateFunction<T>;
  return (value: unknown): T => {
    if (!validate(value)) {
      throw new ProtocolValidationError(validate.errors ? [...validate.errors] : []);
    }
    return value as T;
  };
};

export const parseCommand = compileValidator<AnyCommand>(AnyCommandSchema);
export const parseCommandResult = compileValidator<CommandResult>(CommandResultSchema);
export const parseChangeListResult = compileValidator<ChangeListResult>(ChangeListResultSchema);
export const parseChangeShowResult = compileValidator<ChangeShowResult>(ChangeShowResultSchema);
export const parseDoctorResult = compileValidator<DoctorResult>(DoctorResultSchema);
export const parseErrorResult = compileValidator<ErrorResult>(ErrorResultSchema);
export const parseChangeProfile = compileValidator<ChangeProfile>(ChangeProfileSchema);
export const parseProjectPolicy = compileValidator<ProjectPolicy>(ProjectPolicySchema);
export const parsePolicySnapshot = compileValidator<PolicySnapshot>(PolicySnapshotSchema);
export const parseContractCandidate = compileValidator<ContractCandidate>(ContractCandidateSchema);
export const parseContractVersion = compileValidator<ContractVersion>(ContractVersionSchema);
export const parseContractAmendment = compileValidator<ContractAmendment>(ContractAmendmentSchema);
export const parseRiskProfile = compileValidator<RiskProfile>(RiskProfileSchema);
export const parseRiskAssessment = compileValidator<RiskAssessment>(RiskAssessmentSchema);
export const parseKnowledgeImpactAssessment = compileValidator<KnowledgeImpactAssessment>(
  KnowledgeImpactAssessmentSchema
);
export const parsePlanCandidate = compileValidator<PlanCandidate>(PlanCandidateSchema);
export const parsePlanVersion = compileValidator<PlanVersion>(PlanVersionSchema);
export const parsePlanAmendment = compileValidator<PlanAmendment>(PlanAmendmentSchema);
export const parseTask = compileValidator<Task>(TaskSchema);
export const parseDecisionRequest = compileValidator<DecisionRequest>(DecisionRequestSchema);
export const parseDecision = compileValidator<Decision>(DecisionSchema);
export const parseFeedback = compileValidator<Feedback>(FeedbackSchema);
export const parseGateEvaluation = compileValidator<GateEvaluation>(GateEvaluationSchema);
export const parseChangeRoomView = compileValidator<ChangeRoomView>(ChangeRoomViewSchema);
export const parseDecisionInboxItem = compileValidator<DecisionInboxItem>(DecisionInboxItemSchema);

export const formatValidationErrors = (errors: readonly ErrorObject[]): string[] =>
  errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "校验失败"}`);
