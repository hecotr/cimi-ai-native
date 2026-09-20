import type {
  Actor,
  Assignment,
  Change,
  ChangeProfile,
  CommandSuccess,
  ContractAmendment,
  ContractCandidate,
  ContractVersion,
  Decision,
  DecisionRequest,
  EventEnvelope,
  Feedback,
  GateEvaluation,
  InternalId,
  KnowledgeImpactAssessment,
  PlanAmendment,
  PlanCandidate,
  PlanVersion,
  PolicySnapshot,
  Project,
  ProjectPolicy,
  RiskAssessment,
  RiskProfile,
  Role,
  Task,
  TransitionRecord,
  TypedReference
} from "@cimiloop/protocol";

export interface ProposedEvent {
  event_id: InternalId;
  event_type: string;
  project_id: InternalId;
  aggregate: TypedReference;
  aggregate_revision: number;
  occurred_at: string;
  actor_id: InternalId;
  command_id: InternalId;
  correlation_id: InternalId;
  payload: Record<string, unknown>;
}

export interface CommandReceipt {
  command_id: InternalId;
  request_digest: string;
  result: CommandSuccess;
  created_at: string;
}

export interface OutboxMessage {
  id: InternalId;
  project_id: InternalId;
  event_id: InternalId;
  status: "pending" | "processing" | "delivered";
  attempt_count: number;
  available_at: string;
  lease_until?: string;
  created_at: string;
  delivered_at?: string;
}

export interface StoreTransaction {
  getCommandReceipt(commandId: InternalId): CommandReceipt | undefined;
  saveCommandReceipt(receipt: CommandReceipt): void;

  getCurrentProject(): Project | undefined;
  getProject(projectId: InternalId): Project | undefined;
  insertProject(project: Project): void;
  insertActor(actor: Actor): void;
  insertRole(role: Role): void;
  insertAssignment(assignment: Assignment): void;

  getChange(idOrKey: string): Change | undefined;
  nextChangeDisplayKey(projectId: InternalId): string;
  insertChange(change: Change): void;
  updateChange(change: Change, expectedRevision: number): void;
  insertTransition(record: TransitionRecord): void;

  appendEvent(event: ProposedEvent): EventEnvelope;
  enqueueOutbox(message: OutboxMessage): void;

  getRoleByKey(roleKey: Role["role_key"]): Role | undefined;
  listRoles(): Role[];
  listAssignments(projectId: InternalId): Assignment[];

  insertChangeProfile(profile: ChangeProfile): void;
  getChangeProfile(id: InternalId): ChangeProfile | undefined;
  listChangeProfiles(projectId: InternalId): ChangeProfile[];

  insertProjectPolicy(policy: ProjectPolicy): void;
  updateProjectPolicy(policy: ProjectPolicy, expectedRevision: number): void;
  getProjectPolicy(projectId: InternalId): ProjectPolicy | undefined;

  insertPolicySnapshot(snapshot: PolicySnapshot): void;
  getPolicySnapshot(id: InternalId): PolicySnapshot | undefined;

  insertContractCandidate(candidate: ContractCandidate): void;
  updateContractCandidate(candidate: ContractCandidate, expectedRevision: number): void;
  getContractCandidate(id: InternalId): ContractCandidate | undefined;
  getContractCandidateByChange(changeId: InternalId): ContractCandidate | undefined;

  insertContractVersion(version: ContractVersion): void;
  getContractVersion(id: InternalId): ContractVersion | undefined;
  getCurrentContract(changeId: InternalId): ContractVersion | undefined;

  insertContractAmendment(amendment: ContractAmendment): void;
  updateContractAmendment(amendment: ContractAmendment, expectedRevision: number): void;
  getContractAmendment(id: InternalId): ContractAmendment | undefined;

  insertRiskProfile(profile: RiskProfile): void;
  updateRiskProfile(profile: RiskProfile, expectedRevision: number): void;
  getRiskProfileByChange(changeId: InternalId): RiskProfile | undefined;

  insertRiskAssessment(assessment: RiskAssessment): void;
  getRiskAssessment(id: InternalId): RiskAssessment | undefined;

  insertKnowledgeImpactAssessment(assessment: KnowledgeImpactAssessment): void;
  updateKnowledgeImpactAssessment(assessment: KnowledgeImpactAssessment, expectedRevision: number): void;
  getKnowledgeImpactAssessment(id: InternalId): KnowledgeImpactAssessment | undefined;
  getKnowledgeImpactAssessmentByChange(changeId: InternalId): KnowledgeImpactAssessment | undefined;

  insertPlanCandidate(candidate: PlanCandidate): void;
  updatePlanCandidate(candidate: PlanCandidate, expectedRevision: number): void;
  getPlanCandidate(id: InternalId): PlanCandidate | undefined;
  getPlanCandidateByChange(changeId: InternalId): PlanCandidate | undefined;

  insertPlanVersion(version: PlanVersion): void;
  getPlanVersion(id: InternalId): PlanVersion | undefined;
  getCurrentPlan(changeId: InternalId): PlanVersion | undefined;

  insertPlanAmendment(amendment: PlanAmendment): void;
  updatePlanAmendment(amendment: PlanAmendment, expectedRevision: number): void;
  getPlanAmendment(id: InternalId): PlanAmendment | undefined;

  insertTask(task: Task): void;
  listTasks(planId: InternalId, planVersion: number): Task[];

  insertDecisionRequest(request: DecisionRequest): void;
  updateDecisionRequest(request: DecisionRequest, expectedRevision: number): void;
  getDecisionRequest(id: InternalId): DecisionRequest | undefined;
  listOpenDecisionRequests(): DecisionRequest[];

  insertDecision(decision: Decision): void;
  getDecision(id: InternalId): Decision | undefined;
  listDecisions(changeId: InternalId): Decision[];

  insertFeedback(feedback: Feedback): void;
  listFeedback(decisionId: InternalId): Feedback[];

  insertGateEvaluation(evaluation: GateEvaluation): void;
  getGateEvaluation(id: InternalId): GateEvaluation | undefined;
  listGateEvaluations(changeId: InternalId): GateEvaluation[];
}

export interface ProjectStore {
  transaction<T>(work: (transaction: StoreTransaction) => T): T;
  getProject(): Project | undefined;
  getChange(idOrKey: string): Change | undefined;
  listChanges(): Change[];
  listEvents(): EventEnvelope[];
  listOutbox(status?: OutboxMessage["status"]): OutboxMessage[];
  claimOutbox(now: string, leaseUntil: string): OutboxMessage | undefined;
  markOutboxDelivered(messageId: InternalId, deliveredAt: string): void;
  releaseOutbox(messageId: InternalId, availableAt: string): void;
  close(): void;
}

export interface RegistryProject {
  project_id: InternalId;
  repository_path: string;
  database_path: string;
  last_opened_at: string;
}

export interface ProjectRegistry {
  register(project: RegistryProject): void;
  findByRepository(repositoryPath: string): RegistryProject | undefined;
  list(): RegistryProject[];
  close(): void;
}

export class StoreConflictError extends Error {
  constructor(
    message: string,
    readonly currentRevision?: number
  ) {
    super(message);
    this.name = "StoreConflictError";
  }
}
