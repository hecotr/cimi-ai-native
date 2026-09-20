import type {
  Actor,
  AgentRunRecord,
  ArchiveRecord,
  Artifact,
  Assignment,
  AttentionItem,
  Blocker,
  CancellationRecord,
  CapabilityBinding,
  Change,
  ChangeProfile,
  Claim,
  ClaimAssessment,
  ClosureEvaluation,
  CommandSuccess,
  ContextPackManifest,
  ContractAmendment,
  ContractCandidate,
  ContractVersion,
  Decision,
  DecisionRequest,
  Deployment,
  DeploymentAttempt,
  Environment,
  EventEnvelope,
  Evidence,
  EvidencePackageManifest,
  ExternalOperation,
  ExternalReference,
  Feedback,
  GateEvaluation,
  GateRequirementSet,
  ImpactAssessment,
  ImportReport,
  IndependentEvaluation,
  InternalId,
  KnowledgeImpactAssessment,
  KnowledgeUpdateEvidence,
  LearningCandidate,
  Lease,
  PlanAmendment,
  PlanCandidate,
  PlanVersion,
  PolicySnapshot,
  Project,
  ProjectPolicy,
  ProviderDescriptor,
  Reconciliation,
  RecoveryExecution,
  RecoveryStrategy,
  Release,
  ReleasePackage,
  RepairWorkItemLink,
  ResourceLock,
  RiskAssessment,
  RiskProfile,
  Role,
  SourceSnapshot,
  SupersessionRecord,
  VerificationResult,
  Task,
  TransitionRecord,
  TypedReference,
  WorkItem
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
  getLatestPolicySnapshot(projectId: InternalId): PolicySnapshot | undefined;

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
  getLatestContractAmendment(changeId: InternalId): ContractAmendment | undefined;

  insertRiskProfile(profile: RiskProfile): void;
  updateRiskProfile(profile: RiskProfile, expectedRevision: number): void;
  getRiskProfileByChange(changeId: InternalId): RiskProfile | undefined;

  insertRiskAssessment(assessment: RiskAssessment): void;
  getRiskAssessment(id: InternalId): RiskAssessment | undefined;
  getLatestRiskAssessment(changeId: InternalId): RiskAssessment | undefined;

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
  getLatestPlanAmendment(changeId: InternalId): PlanAmendment | undefined;

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

  insertWorkItem(workItem: WorkItem): void;
  updateWorkItem(workItem: WorkItem, expectedRevision: number): void;
  getWorkItem(id: InternalId): WorkItem | undefined;
  listWorkItemsByChange(changeId: InternalId): WorkItem[];
  listReadyWorkItems(changeId: InternalId): WorkItem[];

  insertLease(lease: Lease): void;
  updateLease(lease: Lease, expectedRevision: number): void;
  getLease(id: InternalId): Lease | undefined;
  getActiveLeaseByWorkItem(workItemId: InternalId): Lease | undefined;

  insertResourceLock(lock: ResourceLock): void;
  updateResourceLock(lock: ResourceLock, expectedRevision: number): void;
  getHeldResourceLock(resourceType: ResourceLock["resource_type"], resourceKey: string): ResourceLock | undefined;

  insertProviderDescriptor(descriptor: ProviderDescriptor): void;
  getProviderDescriptor(id: InternalId): ProviderDescriptor | undefined;

  insertContextPackManifest(manifest: ContextPackManifest): void;
  getContextPackManifest(id: InternalId): ContextPackManifest | undefined;

  insertCapabilityBinding(binding: CapabilityBinding): void;
  getCapabilityBinding(id: InternalId): CapabilityBinding | undefined;

  insertAgentRun(run: AgentRunRecord): void;
  updateAgentRun(run: AgentRunRecord, expectedRevision: number): void;
  getAgentRun(id: InternalId): AgentRunRecord | undefined;
  listAgentRuns(workItemId: InternalId): AgentRunRecord[];

  insertSourceSnapshot(snapshot: SourceSnapshot): void;
  getSourceSnapshot(id: InternalId): SourceSnapshot | undefined;

  insertArtifact(artifact: Artifact): void;
  updateArtifact(artifact: Artifact): void;
  getArtifact(id: InternalId): Artifact | undefined;
  listArtifactsByChange(changeId: InternalId): Artifact[];

  insertBlocker(blocker: Blocker): void;
  updateBlocker(blocker: Blocker, expectedRevision: number): void;
  listOpenBlockers(changeId: InternalId): Blocker[];

  insertClaim(claim: Claim): void;
  getClaim(id: InternalId): Claim | undefined;
  listClaimsByChange(changeId: InternalId): Claim[];

  insertExternalReference(reference: ExternalReference): void;
  getExternalReference(id: InternalId): ExternalReference | undefined;

  insertEvidence(evidence: Evidence): void;
  getEvidence(id: InternalId): Evidence | undefined;
  listEvidenceByClaim(claimId: InternalId): Evidence[];
  listEvidenceByChange(changeId: InternalId): Evidence[];

  insertGateRequirementSet(requirementSet: GateRequirementSet): void;
  getGateRequirementSet(id: InternalId): GateRequirementSet | undefined;
  getLatestGateRequirementSet(changeId: InternalId): GateRequirementSet | undefined;

  insertIndependentEvaluation(evaluation: IndependentEvaluation): void;
  getIndependentEvaluation(id: InternalId): IndependentEvaluation | undefined;
  listIndependentEvaluationsByChange(changeId: InternalId): IndependentEvaluation[];

  insertClaimAssessment(assessment: ClaimAssessment): void;
  listClaimAssessmentsByEvaluation(evaluationId: InternalId): ClaimAssessment[];

  insertEvidencePackageManifest(manifest: EvidencePackageManifest): void;
  getEvidencePackageManifest(id: InternalId): EvidencePackageManifest | undefined;

  insertImpactAssessment(assessment: ImpactAssessment): void;
  listImpactAssessmentsBySubject(subjectId: InternalId): ImpactAssessment[];

  insertRepairWorkItemLink(link: RepairWorkItemLink): void;
  listRepairWorkItemLinksByChange(changeId: InternalId): RepairWorkItemLink[];

  insertEnvironment(environment: Environment): void;
  updateEnvironment(environment: Environment, expectedRevision: number): void;
  getEnvironment(id: InternalId): Environment | undefined;
  getEnvironmentByKey(projectId: InternalId, environmentKey: string): Environment | undefined;
  listEnvironments(projectId: InternalId): Environment[];

  insertRelease(release: Release): void;
  updateRelease(release: Release, expectedRevision: number): void;
  getRelease(id: InternalId): Release | undefined;
  listReleasesByChange(changeId: InternalId): Release[];

  insertReleasePackage(releasePackage: ReleasePackage): void;
  getReleasePackage(id: InternalId): ReleasePackage | undefined;

  insertDeployment(deployment: Deployment): void;
  updateDeployment(deployment: Deployment, expectedRevision: number): void;
  getDeployment(id: InternalId): Deployment | undefined;
  listDeploymentsByRelease(releaseId: InternalId): Deployment[];

  insertDeploymentAttempt(attempt: DeploymentAttempt): void;
  listDeploymentAttempts(deploymentId: InternalId): DeploymentAttempt[];

  insertVerificationResult(result: VerificationResult): void;
  getVerificationResult(id: InternalId): VerificationResult | undefined;
  listVerificationResultsByDeployment(deploymentId: InternalId): VerificationResult[];

  insertRecoveryStrategy(strategy: RecoveryStrategy): void;
  getRecoveryStrategy(id: InternalId): RecoveryStrategy | undefined;

  insertRecoveryExecution(execution: RecoveryExecution): void;
  updateRecoveryExecution(execution: RecoveryExecution, expectedRevision: number): void;
  getRecoveryExecution(id: InternalId): RecoveryExecution | undefined;
  listRecoveryExecutionsByRelease(releaseId: InternalId): RecoveryExecution[];

  insertReconciliation(reconciliation: Reconciliation): void;
  listReconciliationsByOperation(operationId: InternalId): Reconciliation[];

  insertExternalOperation(operation: ExternalOperation): void;
  updateExternalOperation(operation: ExternalOperation, expectedRevision: number): void;
  getExternalOperation(id: InternalId): ExternalOperation | undefined;
  getExternalOperationByKey(operationKey: string): ExternalOperation | undefined;
  listExternalOperationsByChange(changeId: InternalId): ExternalOperation[];
  listUnknownExternalOperations(): ExternalOperation[];

  insertLearningCandidate(candidate: LearningCandidate): void;
  getLearningCandidate(id: InternalId): LearningCandidate | undefined;
  listLearningCandidatesByChange(changeId: InternalId): LearningCandidate[];

  insertKnowledgeUpdateEvidence(evidence: KnowledgeUpdateEvidence): void;
  listKnowledgeUpdateEvidenceByChange(changeId: InternalId): KnowledgeUpdateEvidence[];

  insertClosureEvaluation(evaluation: ClosureEvaluation): void;
  getClosureEvaluation(id: InternalId): ClosureEvaluation | undefined;
  listClosureEvaluationsByChange(changeId: InternalId): ClosureEvaluation[];

  insertArchiveRecord(record: ArchiveRecord): void;
  listArchiveRecordsByChange(changeId: InternalId): ArchiveRecord[];

  insertCancellationRecord(record: CancellationRecord): void;
  listCancellationRecordsByChange(changeId: InternalId): CancellationRecord[];

  insertSupersessionRecord(record: SupersessionRecord): void;
  listSupersessionRecordsByChange(changeId: InternalId): SupersessionRecord[];

  insertAttentionItem(item: AttentionItem): void;
  updateAttentionItem(item: AttentionItem, expectedRevision: number): void;
  listOpenAttentionItems(projectId: InternalId): AttentionItem[];

  insertImportReport(report: ImportReport): void;
  getImportReport(id: InternalId): ImportReport | undefined;

  upsertReadModelCheckpoint(projectionName: string, eventSequence: number, payload: Record<string, unknown>): void;
  getReadModelCheckpoint(projectionName: string): { event_sequence: number; payload: Record<string, unknown> } | undefined;
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
