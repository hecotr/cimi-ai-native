import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  ActorSchema,
  AgentRunRecordSchema,
  ArchiveRecordSchema,
  ArtifactSchema,
  AttentionItemSchema,
  AssignmentSchema,
  BlockerSchema,
  CancellationRecordSchema,
  ClosureEvaluationSchema,
  CapabilityBindingSchema,
  ChangeProfileSchema,
  ChangeSchema,
  ClaimAssessmentSchema,
  ClaimSchema,
  CommandSuccessSchema,
  ContextPackManifestSchema,
  ContractAmendmentSchema,
  ContractCandidateSchema,
  ContractVersionSchema,
  DecisionRequestSchema,
  DecisionSchema,
  DeploymentAttemptSchema,
  DeploymentSchema,
  EnvironmentSchema,
  EventEnvelopeSchema,
  ExternalOperationSchema,
  EvidencePackageManifestSchema,
  EvidenceSchema,
  ExternalReferenceSchema,
  FeedbackSchema,
  GateEvaluationSchema,
  GateRequirementSetSchema,
  ImpactAssessmentSchema,
  ImportReportSchema,
  IndependentEvaluationSchema,
  KnowledgeImpactAssessmentSchema,
  KnowledgeUpdateEvidenceSchema,
  LearningCandidateSchema,
  LeaseSchema,
  PlanAmendmentSchema,
  PlanCandidateSchema,
  PlanVersionSchema,
  PolicySnapshotSchema,
  ProjectPolicySchema,
  ProjectSchema,
  ProviderDescriptorSchema,
  ReconciliationSchema,
  RecoveryExecutionSchema,
  RecoveryStrategySchema,
  ReleasePackageSchema,
  ReleaseSchema,
  RepairWorkItemLinkSchema,
  ResourceLockSchema,
  RiskAssessmentSchema,
  RiskProfileSchema,
  RoleSchema,
  SCHEMA_VERSION,
  SourceSnapshotSchema,
  SupersessionRecordSchema,
  TaskSchema,
  VerificationResultSchema,
  WorkItemSchema,
  compileValidator,
  type Actor,
  type ArchiveRecord,
  type AttentionItem,
  type AgentRunRecord,
  type Artifact,
  type Assignment,
  type Blocker,
  type CancellationRecord,
  type ClosureEvaluation,
  type CapabilityBinding,
  type Change,
  type ChangeProfile,
  type Claim,
  type ClaimAssessment,
  type CommandSuccess,
  type ContextPackManifest,
  type ContractAmendment,
  type ContractCandidate,
  type ContractVersion,
  type Decision,
  type DecisionRequest,
  type Deployment,
  type DeploymentAttempt,
  type Environment,
  type EventEnvelope,
  type ExternalOperation,
  type Evidence,
  type EvidencePackageManifest,
  type ExternalReference,
  type Feedback,
  type GateEvaluation,
  type GateRequirementSet,
  type ImpactAssessment,
  type ImportReport,
  type IndependentEvaluation,
  type InternalId,
  type KnowledgeImpactAssessment,
  type KnowledgeUpdateEvidence,
  type LearningCandidate,
  type Lease,
  type PlanAmendment,
  type PlanCandidate,
  type PlanVersion,
  type PolicySnapshot,
  type Project,
  type ProjectPolicy,
  type ProviderDescriptor,
  type Reconciliation,
  type RecoveryExecution,
  type RecoveryStrategy,
  type Release,
  type ReleasePackage,
  type RepairWorkItemLink,
  type VerificationResult,
  type ResourceLock,
  type RiskAssessment,
  type RiskProfile,
  type Role,
  type SourceSnapshot,
  type SupersessionRecord,
  type Task,
  type TransitionRecord,
  type WorkItem
} from "@cimiloop/protocol";
import {
  StoreConflictError,
  type CommandReceipt,
  type ExternalOperationLease,
  type OutboxMessage,
  type ProjectStore,
  type ProposedEvent,
  type StoreTransaction
} from "@cimiloop/store";
import { applyProjectStoreMigrations } from "./migrations.js";
import { importPortableSnapshot, listOutboxRows, listPortableFacts } from "./portable-snapshot.js";

const parseActor = compileValidator<Actor>(ActorSchema);
const parseProject = compileValidator<Project>(ProjectSchema);
const parseChange = compileValidator<Change>(ChangeSchema);
const parseEvent = compileValidator<EventEnvelope>(EventEnvelopeSchema);
const parseCommandSuccess = compileValidator<CommandSuccess>(CommandSuccessSchema);
const parseRole = compileValidator<Role>(RoleSchema);
const parseAssignment = compileValidator<Assignment>(AssignmentSchema);
const parseChangeProfile = compileValidator<ChangeProfile>(ChangeProfileSchema);
const parseProjectPolicy = compileValidator<ProjectPolicy>(ProjectPolicySchema);
const parsePolicySnapshot = compileValidator<PolicySnapshot>(PolicySnapshotSchema);
const parseContractCandidate = compileValidator<ContractCandidate>(ContractCandidateSchema);
const parseContractVersion = compileValidator<ContractVersion>(ContractVersionSchema);
const parseContractAmendment = compileValidator<ContractAmendment>(ContractAmendmentSchema);
const parseRiskProfile = compileValidator<RiskProfile>(RiskProfileSchema);
const parseRiskAssessment = compileValidator<RiskAssessment>(RiskAssessmentSchema);
const parseKnowledge = compileValidator<KnowledgeImpactAssessment>(KnowledgeImpactAssessmentSchema);
const parsePlanCandidate = compileValidator<PlanCandidate>(PlanCandidateSchema);
const parsePlanVersion = compileValidator<PlanVersion>(PlanVersionSchema);
const parsePlanAmendment = compileValidator<PlanAmendment>(PlanAmendmentSchema);
const parseTask = compileValidator<Task>(TaskSchema);
const parseDecisionRequest = compileValidator<DecisionRequest>(DecisionRequestSchema);
const parseDecision = compileValidator<Decision>(DecisionSchema);
const parseFeedback = compileValidator<Feedback>(FeedbackSchema);
const parseGateEvaluation = compileValidator<GateEvaluation>(GateEvaluationSchema);
const parseWorkItem = compileValidator<WorkItem>(WorkItemSchema);
const parseLease = compileValidator<Lease>(LeaseSchema);
const parseResourceLock = compileValidator<ResourceLock>(ResourceLockSchema);
const parseProviderDescriptor = compileValidator<ProviderDescriptor>(ProviderDescriptorSchema);
const parseContextPack = compileValidator<ContextPackManifest>(ContextPackManifestSchema);
const parseCapabilityBinding = compileValidator<CapabilityBinding>(CapabilityBindingSchema);
const parseAgentRun = compileValidator<AgentRunRecord>(AgentRunRecordSchema);
const parseSourceSnapshot = compileValidator<SourceSnapshot>(SourceSnapshotSchema);
const parseArtifact = compileValidator<Artifact>(ArtifactSchema);
const parseBlocker = compileValidator<Blocker>(BlockerSchema);
const parseClaim = compileValidator<Claim>(ClaimSchema);
const parseExternalReference = compileValidator<ExternalReference>(ExternalReferenceSchema);
const parseEvidence = compileValidator<Evidence>(EvidenceSchema);
const parseGateRequirementSet = compileValidator<GateRequirementSet>(GateRequirementSetSchema);
const parseIndependentEvaluation = compileValidator<IndependentEvaluation>(IndependentEvaluationSchema);
const parseClaimAssessment = compileValidator<ClaimAssessment>(ClaimAssessmentSchema);
const parseEvidencePackage = compileValidator<EvidencePackageManifest>(EvidencePackageManifestSchema);
const parseImpactAssessment = compileValidator<ImpactAssessment>(ImpactAssessmentSchema);
const parseRepairLink = compileValidator<RepairWorkItemLink>(RepairWorkItemLinkSchema);
const parseEnvironment = compileValidator<Environment>(EnvironmentSchema);
const parseRelease = compileValidator<Release>(ReleaseSchema);
const parseReleasePackage = compileValidator<ReleasePackage>(ReleasePackageSchema);
const parseDeployment = compileValidator<Deployment>(DeploymentSchema);
const parseDeploymentAttempt = compileValidator<DeploymentAttempt>(DeploymentAttemptSchema);
const parseVerificationResult = compileValidator<VerificationResult>(VerificationResultSchema);
const parseRecoveryStrategy = compileValidator<RecoveryStrategy>(RecoveryStrategySchema);
const parseRecoveryExecution = compileValidator<RecoveryExecution>(RecoveryExecutionSchema);
const parseReconciliation = compileValidator<Reconciliation>(ReconciliationSchema);
const parseExternalOperation = compileValidator<ExternalOperation>(ExternalOperationSchema);
const parseLearningCandidate = compileValidator<LearningCandidate>(LearningCandidateSchema);
const parseKnowledgeUpdate = compileValidator<KnowledgeUpdateEvidence>(KnowledgeUpdateEvidenceSchema);
const parseClosureEvaluation = compileValidator<ClosureEvaluation>(ClosureEvaluationSchema);
const parseArchiveRecord = compileValidator<ArchiveRecord>(ArchiveRecordSchema);
const parseCancellationRecord = compileValidator<CancellationRecord>(CancellationRecordSchema);
const parseSupersessionRecord = compileValidator<SupersessionRecord>(SupersessionRecordSchema);
const parseAttentionItem = compileValidator<AttentionItem>(AttentionItemSchema);
const parseImportReport = compileValidator<ImportReport>(ImportReportSchema);

const isUniqueConstraint = (error: unknown): boolean =>
  error instanceof Error && /UNIQUE constraint failed/i.test(error.message);

type SqlRow = Record<string, unknown>;
type SqlValue = string | number | bigint | null;

const json = (value: unknown): string => JSON.stringify(value);
const parseJson = (value: unknown): unknown => JSON.parse(String(value));

class SqliteTransaction implements StoreTransaction {
  constructor(private readonly database: DatabaseSync) {}

  getCommandReceipt(commandId: InternalId): CommandReceipt | undefined {
    const row = this.database
      .prepare("SELECT command_id, request_digest, result_json, created_at FROM command_receipts WHERE command_id = ?")
      .get(commandId) as SqlRow | undefined;
    if (!row) return undefined;
    return {
      command_id: String(row.command_id),
      request_digest: String(row.request_digest),
      result: parseCommandSuccess(parseJson(row.result_json)),
      created_at: String(row.created_at)
    };
  }

  saveCommandReceipt(receipt: CommandReceipt): void {
    this.database
      .prepare(
        "INSERT INTO command_receipts(command_id, request_digest, result_json, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(receipt.command_id, receipt.request_digest, json(receipt.result), receipt.created_at);
  }

  getCurrentProject(): Project | undefined {
    const row = this.database.prepare("SELECT payload_json FROM projects LIMIT 1").get() as SqlRow | undefined;
    return row ? parseProject(parseJson(row.payload_json)) : undefined;
  }

  getProject(projectId: InternalId): Project | undefined {
    const row = this.database.prepare("SELECT payload_json FROM projects WHERE id = ?").get(projectId) as
      | SqlRow
      | undefined;
    return row ? parseProject(parseJson(row.payload_json)) : undefined;
  }

  insertProject(project: Project): void {
    this.database
      .prepare("INSERT INTO projects(id, revision, payload_json) VALUES (?, ?, ?)")
      .run(project.id, project.revision, json(project));
    this.database
      .prepare("INSERT INTO project_counters(project_id, change_number, event_sequence) VALUES (?, 0, 0)")
      .run(project.id);
  }

  insertActor(actor: Actor): void {
    this.database
      .prepare("INSERT INTO actors(id, revision, payload_json) VALUES (?, ?, ?)")
      .run(actor.id, actor.revision, json(actor));
  }

  getActor(id: InternalId): Actor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM actors WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? parseActor(parseJson(row.payload_json)) : undefined;
  }

  insertRole(role: Role): void {
    this.database
      .prepare("INSERT INTO roles(id, role_key, revision, payload_json) VALUES (?, ?, ?, ?)")
      .run(role.id, role.role_key, role.revision, json(role));
  }

  insertAssignment(assignment: Assignment): void {
    this.database
      .prepare(
        "INSERT INTO assignments(id, project_id, actor_id, role_id, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        assignment.id,
        assignment.project_id,
        assignment.actor_id,
        assignment.role_id,
        assignment.revision,
        json(assignment)
      );
  }

  getChange(idOrKey: string): Change | undefined {
    const row = this.database
      .prepare("SELECT payload_json FROM changes WHERE id = ? OR display_key = ? LIMIT 1")
      .get(idOrKey, idOrKey) as SqlRow | undefined;
    return row ? parseChange(parseJson(row.payload_json)) : undefined;
  }

  listChanges(): Change[] {
    return this.listPayload(
      "SELECT payload_json FROM changes ORDER BY CAST(SUBSTR(display_key, 5) AS INTEGER)",
      parseChange
    );
  }

  nextChangeDisplayKey(projectId: InternalId): string {
    const row = this.database
      .prepare("UPDATE project_counters SET change_number = change_number + 1 WHERE project_id = ? RETURNING change_number")
      .get(projectId) as SqlRow | undefined;
    if (!row) throw new Error("Project counter not found");
    return `CHG-${String(Number(row.change_number)).padStart(4, "0")}`;
  }

  insertChange(change: Change): void {
    this.database
      .prepare(
        `INSERT INTO changes(
          id, project_id, display_key, lifecycle_state, operating_status, revision, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        change.id,
        change.project_id,
        change.display_key,
        change.lifecycle_state,
        change.operating_status,
        change.revision,
        json(change)
      );
  }

  updateChange(change: Change, expectedRevision: number): void {
    const result = this.database
      .prepare(
        `UPDATE changes
         SET lifecycle_state = ?, operating_status = ?, revision = ?, payload_json = ?
         WHERE id = ? AND revision = ?`
      )
      .run(
        change.lifecycle_state,
        change.operating_status,
        change.revision,
        json(change),
        change.id,
        expectedRevision
      );
    if (Number(result.changes) !== 1) {
      const row = this.database.prepare("SELECT revision FROM changes WHERE id = ?").get(change.id) as SqlRow | undefined;
      throw new StoreConflictError("Change revision conflict", row ? Number(row.revision) : undefined);
    }
  }

  insertTransition(record: TransitionRecord): void {
    this.database
      .prepare(
        `INSERT INTO transition_records(id, project_id, change_id, command_id, occurred_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(record.id, record.project_id, record.change_id, record.command_id, record.occurred_at, json(record));
  }

  appendEvent(proposed: ProposedEvent): EventEnvelope {
    const sequenceRow = this.database
      .prepare(
        "UPDATE project_counters SET event_sequence = event_sequence + 1 WHERE project_id = ? RETURNING event_sequence"
      )
      .get(proposed.project_id) as SqlRow | undefined;
    if (!sequenceRow) throw new Error("Project event counter not found");
    const event = parseEvent({
      schema_version: SCHEMA_VERSION,
      ...proposed,
      event_sequence: Number(sequenceRow.event_sequence)
    });
    this.database
      .prepare(
        `INSERT INTO event_ledger(
          event_id, project_id, event_sequence, aggregate_type, aggregate_id,
          aggregate_revision, event_type, occurred_at, envelope_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.event_id,
        event.project_id,
        event.event_sequence,
        event.aggregate.object_type,
        event.aggregate.id,
        event.aggregate_revision,
        event.event_type,
        event.occurred_at,
        json(event)
      );
    return event;
  }

  enqueueOutbox(message: OutboxMessage): void {
    this.database
      .prepare(
        `INSERT INTO outbox_messages(
          id, project_id, event_id, status, attempt_count, available_at, lease_until, created_at, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        message.id,
        message.project_id,
        message.event_id,
        message.status,
        message.attempt_count,
        message.available_at,
        message.lease_until ?? null,
        message.created_at,
        message.delivered_at ?? null
      );
  }

  getRoleByKey(roleKey: Role["role_key"]): Role | undefined {
    return this.getPayload("SELECT payload_json FROM roles WHERE role_key = ?", parseRole, roleKey);
  }

  listRoles(): Role[] {
    return this.listPayload("SELECT payload_json FROM roles ORDER BY role_key", parseRole);
  }

  listAssignments(projectId: InternalId): Assignment[] {
    return this.listPayload(
      "SELECT payload_json FROM assignments WHERE project_id = ? ORDER BY rowid",
      parseAssignment,
      projectId
    );
  }

  insertChangeProfile(profile: ChangeProfile): void {
    this.database
      .prepare(
        "INSERT INTO change_profiles(id, project_id, profile_key, domain_version, payload_json) VALUES (?, ?, ?, ?, ?)"
      )
      .run(profile.id, profile.project_id, profile.profile_key, profile.domain_version, json(profile));
  }

  getChangeProfile(id: InternalId): ChangeProfile | undefined {
    return this.getPayload("SELECT payload_json FROM change_profiles WHERE id = ?", parseChangeProfile, id);
  }

  listChangeProfiles(projectId: InternalId): ChangeProfile[] {
    return this.listPayload(
      "SELECT payload_json FROM change_profiles WHERE project_id = ? ORDER BY profile_key, domain_version",
      parseChangeProfile,
      projectId
    );
  }

  insertProjectPolicy(policy: ProjectPolicy): void {
    this.database
      .prepare("INSERT INTO project_policies(id, project_id, revision, payload_json) VALUES (?, ?, ?, ?)")
      .run(policy.id, policy.project_id, policy.revision, json(policy));
  }

  updateProjectPolicy(policy: ProjectPolicy, expectedRevision: number): void {
    this.updateRevision("project_policies", policy.id, policy.revision, expectedRevision, policy);
  }

  getProjectPolicy(projectId: InternalId): ProjectPolicy | undefined {
    return this.getPayload("SELECT payload_json FROM project_policies WHERE project_id = ?", parseProjectPolicy, projectId);
  }

  insertPolicySnapshot(snapshot: PolicySnapshot): void {
    this.database
      .prepare(
        "INSERT INTO policy_snapshots(id, project_id, policy_id, policy_revision, digest, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(snapshot.id, snapshot.project_id, snapshot.policy_id, snapshot.policy_revision, snapshot.digest.value, json(snapshot));
  }

  getPolicySnapshot(id: InternalId): PolicySnapshot | undefined {
    return this.getPayload("SELECT payload_json FROM policy_snapshots WHERE id = ?", parsePolicySnapshot, id);
  }

  getLatestPolicySnapshot(projectId: InternalId): PolicySnapshot | undefined {
    return this.getPayload(
      "SELECT payload_json FROM policy_snapshots WHERE project_id = ? ORDER BY policy_revision DESC, rowid DESC LIMIT 1",
      parsePolicySnapshot,
      projectId
    );
  }

  insertContractCandidate(candidate: ContractCandidate): void {
    this.database
      .prepare(
        "INSERT INTO contract_candidates(id, project_id, change_id, revision, payload_json) VALUES (?, ?, ?, ?, ?)"
      )
      .run(candidate.id, candidate.project_id, candidate.change_id, candidate.revision, json(candidate));
  }

  updateContractCandidate(candidate: ContractCandidate, expectedRevision: number): void {
    this.updateRevision("contract_candidates", candidate.id, candidate.revision, expectedRevision, candidate);
  }

  getContractCandidate(id: InternalId): ContractCandidate | undefined {
    return this.getPayload("SELECT payload_json FROM contract_candidates WHERE id = ?", parseContractCandidate, id);
  }

  getContractCandidateByChange(changeId: InternalId): ContractCandidate | undefined {
    return this.getPayload(
      "SELECT payload_json FROM contract_candidates WHERE change_id = ?",
      parseContractCandidate,
      changeId
    );
  }

  insertContractVersion(version: ContractVersion): void {
    this.database
      .prepare(
        "INSERT INTO contract_versions(id, contract_id, project_id, change_id, domain_version, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(version.id, version.contract_id, version.project_id, version.change_id, version.domain_version, json(version));
  }

  getContractVersion(id: InternalId): ContractVersion | undefined {
    return this.getPayload("SELECT payload_json FROM contract_versions WHERE id = ?", parseContractVersion, id);
  }

  getCurrentContract(changeId: InternalId): ContractVersion | undefined {
    return this.getPayload(
      "SELECT payload_json FROM contract_versions WHERE change_id = ? ORDER BY domain_version DESC LIMIT 1",
      parseContractVersion,
      changeId
    );
  }

  insertContractAmendment(amendment: ContractAmendment): void {
    this.database
      .prepare(
        "INSERT INTO contract_amendments(id, project_id, change_id, contract_id, revision, status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        amendment.id,
        amendment.project_id,
        amendment.change_id,
        amendment.contract_id,
        amendment.revision,
        amendment.status,
        json(amendment)
      );
  }

  updateContractAmendment(amendment: ContractAmendment, expectedRevision: number): void {
    this.updateRevision(
      "contract_amendments",
      amendment.id,
      amendment.revision,
      expectedRevision,
      amendment,
      ", status = ?",
      [amendment.status]
    );
  }

  getContractAmendment(id: InternalId): ContractAmendment | undefined {
    return this.getPayload("SELECT payload_json FROM contract_amendments WHERE id = ?", parseContractAmendment, id);
  }

  getLatestContractAmendment(changeId: InternalId): ContractAmendment | undefined {
    return this.getPayload(
      "SELECT payload_json FROM contract_amendments WHERE change_id = ? ORDER BY revision DESC, rowid DESC LIMIT 1",
      parseContractAmendment,
      changeId
    );
  }

  insertRiskProfile(profile: RiskProfile): void {
    this.database
      .prepare("INSERT INTO risk_profiles(id, change_id, revision, payload_json) VALUES (?, ?, ?, ?)")
      .run(profile.id, profile.change_id, profile.revision, json(profile));
  }

  updateRiskProfile(profile: RiskProfile, expectedRevision: number): void {
    this.updateRevision("risk_profiles", profile.id, profile.revision, expectedRevision, profile);
  }

  getRiskProfileByChange(changeId: InternalId): RiskProfile | undefined {
    return this.getPayload("SELECT payload_json FROM risk_profiles WHERE change_id = ?", parseRiskProfile, changeId);
  }

  insertRiskAssessment(assessment: RiskAssessment): void {
    this.database
      .prepare("INSERT INTO risk_assessments(id, change_id, risk_profile_id, payload_json) VALUES (?, ?, ?, ?)")
      .run(assessment.id, assessment.change_id, assessment.risk_profile_id, json(assessment));
  }

  getRiskAssessment(id: InternalId): RiskAssessment | undefined {
    return this.getPayload("SELECT payload_json FROM risk_assessments WHERE id = ?", parseRiskAssessment, id);
  }

  getLatestRiskAssessment(changeId: InternalId): RiskAssessment | undefined {
    return this.getPayload(
      "SELECT payload_json FROM risk_assessments WHERE change_id = ? ORDER BY rowid DESC LIMIT 1",
      parseRiskAssessment,
      changeId
    );
  }

  insertKnowledgeImpactAssessment(assessment: KnowledgeImpactAssessment): void {
    this.database
      .prepare("INSERT INTO knowledge_impact_assessments(id, change_id, revision, payload_json) VALUES (?, ?, ?, ?)")
      .run(assessment.id, assessment.change_id, assessment.revision, json(assessment));
  }

  updateKnowledgeImpactAssessment(assessment: KnowledgeImpactAssessment, expectedRevision: number): void {
    this.updateRevision("knowledge_impact_assessments", assessment.id, assessment.revision, expectedRevision, assessment);
  }

  getKnowledgeImpactAssessment(id: InternalId): KnowledgeImpactAssessment | undefined {
    return this.getPayload("SELECT payload_json FROM knowledge_impact_assessments WHERE id = ?", parseKnowledge, id);
  }

  getKnowledgeImpactAssessmentByChange(changeId: InternalId): KnowledgeImpactAssessment | undefined {
    return this.getPayload(
      "SELECT payload_json FROM knowledge_impact_assessments WHERE change_id = ? ORDER BY revision DESC LIMIT 1",
      parseKnowledge,
      changeId
    );
  }

  insertPlanCandidate(candidate: PlanCandidate): void {
    this.database
      .prepare("INSERT INTO plan_candidates(id, change_id, revision, payload_json) VALUES (?, ?, ?, ?)")
      .run(candidate.id, candidate.change_id, candidate.revision, json(candidate));
  }

  updatePlanCandidate(candidate: PlanCandidate, expectedRevision: number): void {
    this.updateRevision("plan_candidates", candidate.id, candidate.revision, expectedRevision, candidate);
  }

  getPlanCandidate(id: InternalId): PlanCandidate | undefined {
    return this.getPayload("SELECT payload_json FROM plan_candidates WHERE id = ?", parsePlanCandidate, id);
  }

  getPlanCandidateByChange(changeId: InternalId): PlanCandidate | undefined {
    return this.getPayload("SELECT payload_json FROM plan_candidates WHERE change_id = ?", parsePlanCandidate, changeId);
  }

  insertPlanVersion(version: PlanVersion): void {
    this.database
      .prepare(
        "INSERT INTO plan_versions(id, plan_id, change_id, domain_version, payload_json) VALUES (?, ?, ?, ?, ?)"
      )
      .run(version.id, version.plan_id, version.change_id, version.domain_version, json(version));
  }

  getPlanVersion(id: InternalId): PlanVersion | undefined {
    return this.getPayload("SELECT payload_json FROM plan_versions WHERE id = ?", parsePlanVersion, id);
  }

  getCurrentPlan(changeId: InternalId): PlanVersion | undefined {
    return this.getPayload(
      "SELECT payload_json FROM plan_versions WHERE change_id = ? ORDER BY domain_version DESC LIMIT 1",
      parsePlanVersion,
      changeId
    );
  }

  insertPlanAmendment(amendment: PlanAmendment): void {
    this.database
      .prepare(
        "INSERT INTO plan_amendments(id, change_id, plan_id, revision, status, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(amendment.id, amendment.change_id, amendment.plan_id, amendment.revision, amendment.status, json(amendment));
  }

  updatePlanAmendment(amendment: PlanAmendment, expectedRevision: number): void {
    this.updateRevision(
      "plan_amendments",
      amendment.id,
      amendment.revision,
      expectedRevision,
      amendment,
      ", status = ?",
      [amendment.status]
    );
  }

  getPlanAmendment(id: InternalId): PlanAmendment | undefined {
    return this.getPayload("SELECT payload_json FROM plan_amendments WHERE id = ?", parsePlanAmendment, id);
  }

  getLatestPlanAmendment(changeId: InternalId): PlanAmendment | undefined {
    return this.getPayload(
      "SELECT payload_json FROM plan_amendments WHERE change_id = ? ORDER BY revision DESC, rowid DESC LIMIT 1",
      parsePlanAmendment,
      changeId
    );
  }

  insertTask(task: Task): void {
    this.database
      .prepare(
        "INSERT INTO tasks(id, change_id, plan_id, plan_version, task_key, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(task.id, task.change_id, task.plan_id, task.plan_version, task.key, task.revision, json(task));
  }

  listTasks(planId: InternalId, planVersion: number): Task[] {
    return this.listPayload(
      "SELECT payload_json FROM tasks WHERE plan_id = ? AND plan_version = ? ORDER BY task_key",
      parseTask,
      planId,
      planVersion
    );
  }

  insertDecisionRequest(request: DecisionRequest): void {
    this.database
      .prepare(
        "INSERT INTO decision_requests(id, change_id, request_type, status, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(request.id, request.change_id, request.request_type, request.status, request.revision, json(request));
  }

  updateDecisionRequest(request: DecisionRequest, expectedRevision: number): void {
    this.updateRevision(
      "decision_requests",
      request.id,
      request.revision,
      expectedRevision,
      request,
      ", status = ?",
      [request.status]
    );
  }

  getDecisionRequest(id: InternalId): DecisionRequest | undefined {
    return this.getPayload("SELECT payload_json FROM decision_requests WHERE id = ?", parseDecisionRequest, id);
  }

  listOpenDecisionRequests(): DecisionRequest[] {
    return this.listPayload(
      "SELECT payload_json FROM decision_requests WHERE status = 'open' ORDER BY rowid",
      parseDecisionRequest
    );
  }

  insertDecision(decision: Decision): void {
    this.database
      .prepare("INSERT INTO decisions(id, change_id, request_id, payload_json) VALUES (?, ?, ?, ?)")
      .run(decision.id, decision.change_id, decision.request_id, json(decision));
  }

  getDecision(id: InternalId): Decision | undefined {
    return this.getPayload("SELECT payload_json FROM decisions WHERE id = ?", parseDecision, id);
  }

  listDecisions(changeId: InternalId): Decision[] {
    return this.listPayload("SELECT payload_json FROM decisions WHERE change_id = ? ORDER BY rowid", parseDecision, changeId);
  }

  insertFeedback(feedback: Feedback): void {
    this.database
      .prepare("INSERT INTO feedback(id, decision_id, change_id, payload_json) VALUES (?, ?, ?, ?)")
      .run(feedback.id, feedback.decision_id, feedback.change_id, json(feedback));
  }

  listFeedback(decisionId: InternalId): Feedback[] {
    return this.listPayload("SELECT payload_json FROM feedback WHERE decision_id = ? ORDER BY rowid", parseFeedback, decisionId);
  }

  insertGateEvaluation(evaluation: GateEvaluation): void {
    this.database
      .prepare("INSERT INTO gate_evaluations(id, change_id, gate_type, result, payload_json) VALUES (?, ?, ?, ?, ?)")
      .run(evaluation.id, evaluation.change_id, evaluation.gate_type, evaluation.result, json(evaluation));
  }

  getGateEvaluation(id: InternalId): GateEvaluation | undefined {
    return this.getPayload("SELECT payload_json FROM gate_evaluations WHERE id = ?", parseGateEvaluation, id);
  }

  listGateEvaluations(changeId: InternalId): GateEvaluation[] {
    return this.listPayload(
      "SELECT payload_json FROM gate_evaluations WHERE change_id = ? ORDER BY rowid",
      parseGateEvaluation,
      changeId
    );
  }

  insertWorkItem(workItem: WorkItem): void {
    this.database
      .prepare(
        "INSERT INTO work_items(id, project_id, change_id, kind, status, task_id, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        workItem.id,
        workItem.project_id,
        workItem.change_id,
        workItem.kind,
        workItem.status,
        workItem.task_id ?? null,
        workItem.revision,
        json(workItem)
      );
  }

  updateWorkItem(workItem: WorkItem, expectedRevision: number): void {
    this.updateRevision(
      "work_items",
      workItem.id,
      workItem.revision,
      expectedRevision,
      workItem,
      ", status = ?, task_id = ?",
      [workItem.status, workItem.task_id ?? null]
    );
  }

  getWorkItem(id: InternalId): WorkItem | undefined {
    return this.getPayload("SELECT payload_json FROM work_items WHERE id = ?", parseWorkItem, id);
  }

  listWorkItemsByChange(changeId: InternalId): WorkItem[] {
    return this.listPayload(
      "SELECT payload_json FROM work_items WHERE change_id = ? ORDER BY rowid",
      parseWorkItem,
      changeId
    );
  }

  listReadyWorkItems(changeId: InternalId): WorkItem[] {
    return this.listPayload(
      "SELECT payload_json FROM work_items WHERE change_id = ? AND status = 'ready' ORDER BY rowid",
      parseWorkItem,
      changeId
    );
  }

  insertLease(lease: Lease): void {
    this.insertUnique(
      "INSERT INTO leases(id, project_id, work_item_id, owner_actor_id, status, acquired_at, expires_at, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        lease.id,
        lease.project_id,
        lease.work_item_id,
        lease.owner_actor_id,
        lease.status,
        lease.acquired_at,
        lease.expires_at,
        lease.revision,
        json(lease)
      ],
      "Lease already held for work item"
    );
  }

  updateLease(lease: Lease, expectedRevision: number): void {
    this.updateRevision(
      "leases",
      lease.id,
      lease.revision,
      expectedRevision,
      lease,
      ", status = ?, owner_actor_id = ?, expires_at = ?",
      [lease.status, lease.owner_actor_id, lease.expires_at]
    );
  }

  getLease(id: InternalId): Lease | undefined {
    return this.getPayload("SELECT payload_json FROM leases WHERE id = ?", parseLease, id);
  }

  getActiveLeaseByWorkItem(workItemId: InternalId): Lease | undefined {
    return this.getPayload(
      "SELECT payload_json FROM leases WHERE work_item_id = ? AND status = 'active' LIMIT 1",
      parseLease,
      workItemId
    );
  }

  insertResourceLock(lock: ResourceLock): void {
    this.insertUnique(
      "INSERT INTO resource_locks(id, project_id, resource_type, resource_key, holder_work_item_id, status, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        lock.id,
        lock.project_id,
        lock.resource_type,
        lock.resource_key,
        lock.holder_work_item_id,
        lock.status,
        lock.revision,
        json(lock)
      ],
      "Resource lock already held"
    );
  }

  updateResourceLock(lock: ResourceLock, expectedRevision: number): void {
    this.updateRevision(
      "resource_locks",
      lock.id,
      lock.revision,
      expectedRevision,
      lock,
      ", status = ?",
      [lock.status]
    );
  }

  getHeldResourceLock(resourceType: ResourceLock["resource_type"], resourceKey: string): ResourceLock | undefined {
    return this.getPayload(
      "SELECT payload_json FROM resource_locks WHERE resource_type = ? AND resource_key = ? AND status = 'held' LIMIT 1",
      parseResourceLock,
      resourceType,
      resourceKey
    );
  }

  insertProviderDescriptor(descriptor: ProviderDescriptor): void {
    this.database
      .prepare("INSERT INTO provider_descriptors(id, project_id, provider_type, payload_json) VALUES (?, ?, ?, ?)")
      .run(descriptor.id, descriptor.project_id, descriptor.provider_type, json(descriptor));
  }

  getProviderDescriptor(id: InternalId): ProviderDescriptor | undefined {
    return this.getPayload("SELECT payload_json FROM provider_descriptors WHERE id = ?", parseProviderDescriptor, id);
  }

  insertContextPackManifest(manifest: ContextPackManifest): void {
    this.database
      .prepare(
        "INSERT INTO context_pack_manifests(id, project_id, change_id, work_item_id, digest, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(manifest.id, manifest.project_id, manifest.change_id, manifest.work_item_id, manifest.digest.value, json(manifest));
  }

  getContextPackManifest(id: InternalId): ContextPackManifest | undefined {
    return this.getPayload("SELECT payload_json FROM context_pack_manifests WHERE id = ?", parseContextPack, id);
  }

  insertCapabilityBinding(binding: CapabilityBinding): void {
    this.database
      .prepare(
        "INSERT INTO capability_bindings(id, project_id, work_item_id, run_id, digest, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(binding.id, binding.project_id, binding.work_item_id, binding.run_id, binding.digest.value, json(binding));
  }

  getCapabilityBinding(id: InternalId): CapabilityBinding | undefined {
    return this.getPayload("SELECT payload_json FROM capability_bindings WHERE id = ?", parseCapabilityBinding, id);
  }

  insertAgentRun(run: AgentRunRecord): void {
    this.database
      .prepare(
        "INSERT INTO agent_runs(id, project_id, change_id, work_item_id, status, attempt, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(run.id, run.project_id, run.change_id, run.work_item_id, run.status, run.attempt, run.revision, json(run));
  }

  updateAgentRun(run: AgentRunRecord, expectedRevision: number): void {
    this.updateRevision(
      "agent_runs",
      run.id,
      run.revision,
      expectedRevision,
      run,
      ", status = ?, attempt = ?",
      [run.status, run.attempt]
    );
  }

  getAgentRun(id: InternalId): AgentRunRecord | undefined {
    return this.getPayload("SELECT payload_json FROM agent_runs WHERE id = ?", parseAgentRun, id);
  }

  listAgentRuns(workItemId: InternalId): AgentRunRecord[] {
    return this.listPayload(
      "SELECT payload_json FROM agent_runs WHERE work_item_id = ? ORDER BY attempt, rowid",
      parseAgentRun,
      workItemId
    );
  }

  listAgentRunsByChange(changeId: InternalId): AgentRunRecord[] {
    return this.listPayload(
      "SELECT payload_json FROM agent_runs WHERE change_id = ? ORDER BY attempt, rowid",
      parseAgentRun,
      changeId
    );
  }

  insertSourceSnapshot(snapshot: SourceSnapshot): void {
    this.database
      .prepare(
        "INSERT INTO source_snapshots(id, project_id, change_id, work_item_id, run_id, digest, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        snapshot.id,
        snapshot.project_id,
        snapshot.change_id,
        snapshot.work_item_id,
        snapshot.run_id,
        snapshot.digest.value,
        json(snapshot)
      );
  }

  getSourceSnapshot(id: InternalId): SourceSnapshot | undefined {
    return this.getPayload("SELECT payload_json FROM source_snapshots WHERE id = ?", parseSourceSnapshot, id);
  }

  insertArtifact(artifact: Artifact): void {
    this.database
      .prepare(
        "INSERT INTO artifacts(id, project_id, change_id, work_item_id, run_id, digest, status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        artifact.id,
        artifact.project_id,
        artifact.change_id,
        artifact.work_item_id,
        artifact.run_id,
        artifact.digest.value,
        artifact.status,
        json(artifact)
      );
  }

  updateArtifact(artifact: Artifact): void {
    const result = this.database
      .prepare("UPDATE artifacts SET status = ?, payload_json = ? WHERE id = ?")
      .run(artifact.status, json(artifact), artifact.id);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Artifact not found");
  }

  getArtifact(id: InternalId): Artifact | undefined {
    return this.getPayload("SELECT payload_json FROM artifacts WHERE id = ?", parseArtifact, id);
  }

  listArtifactsByChange(changeId: InternalId): Artifact[] {
    return this.listPayload(
      "SELECT payload_json FROM artifacts WHERE change_id = ? ORDER BY rowid",
      parseArtifact,
      changeId
    );
  }

  insertBlocker(blocker: Blocker): void {
    this.database
      .prepare(
        "INSERT INTO blockers(id, project_id, change_id, work_item_id, status, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        blocker.id,
        blocker.project_id,
        blocker.change_id,
        blocker.work_item_id ?? null,
        blocker.status,
        blocker.revision,
        json(blocker)
      );
  }

  updateBlocker(blocker: Blocker, expectedRevision: number): void {
    this.updateRevision(
      "blockers",
      blocker.id,
      blocker.revision,
      expectedRevision,
      blocker,
      ", status = ?",
      [blocker.status]
    );
  }

  listOpenBlockers(changeId: InternalId): Blocker[] {
    return this.listPayload(
      "SELECT payload_json FROM blockers WHERE change_id = ? AND status = 'open' ORDER BY rowid",
      parseBlocker,
      changeId
    );
  }

  insertClaim(claim: Claim): void {
    this.database
      .prepare("INSERT INTO claims(id, project_id, change_id, claim_key, payload_json) VALUES (?, ?, ?, ?, ?)")
      .run(claim.id, claim.project_id, claim.change_id, claim.claim_key, json(claim));
  }

  getClaim(id: InternalId): Claim | undefined {
    return this.getPayload("SELECT payload_json FROM claims WHERE id = ?", parseClaim, id);
  }

  listClaimsByChange(changeId: InternalId): Claim[] {
    return this.listPayload("SELECT payload_json FROM claims WHERE change_id = ? ORDER BY rowid", parseClaim, changeId);
  }

  insertExternalReference(reference: ExternalReference): void {
    this.database
      .prepare("INSERT INTO external_references(id, project_id, digest, payload_json) VALUES (?, ?, ?, ?)")
      .run(reference.id, reference.project_id, reference.digest.value, json(reference));
  }

  getExternalReference(id: InternalId): ExternalReference | undefined {
    return this.getPayload("SELECT payload_json FROM external_references WHERE id = ?", parseExternalReference, id);
  }

  insertEvidence(evidence: Evidence): void {
    this.insertUnique(
      "INSERT INTO evidence(id, project_id, change_id, claim_id, stance, subject_type, subject_id, subject_digest, environment_ref, context_pack_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        evidence.id,
        evidence.project_id,
        evidence.change_id,
        evidence.claim_id,
        evidence.stance,
        evidence.subject_type,
        evidence.subject_id,
        evidence.subject_digest.value,
        evidence.environment_ref ?? null,
        evidence.context_pack_id ?? null,
        json(evidence)
      ],
      "Evidence subject binding already recorded"
    );
  }

  getEvidence(id: InternalId): Evidence | undefined {
    return this.getPayload("SELECT payload_json FROM evidence WHERE id = ?", parseEvidence, id);
  }

  listEvidenceByClaim(claimId: InternalId): Evidence[] {
    return this.listPayload("SELECT payload_json FROM evidence WHERE claim_id = ? ORDER BY rowid", parseEvidence, claimId);
  }

  listEvidenceByChange(changeId: InternalId): Evidence[] {
    return this.listPayload("SELECT payload_json FROM evidence WHERE change_id = ? ORDER BY rowid", parseEvidence, changeId);
  }

  insertGateRequirementSet(requirementSet: GateRequirementSet): void {
    this.database
      .prepare(
        "INSERT INTO gate_requirement_sets(id, project_id, change_id, version, digest, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        requirementSet.id,
        requirementSet.project_id,
        requirementSet.change_id,
        requirementSet.version,
        requirementSet.digest.value,
        json(requirementSet)
      );
  }

  getGateRequirementSet(id: InternalId): GateRequirementSet | undefined {
    return this.getPayload("SELECT payload_json FROM gate_requirement_sets WHERE id = ?", parseGateRequirementSet, id);
  }

  getLatestGateRequirementSet(changeId: InternalId): GateRequirementSet | undefined {
    return this.getPayload(
      "SELECT payload_json FROM gate_requirement_sets WHERE change_id = ? ORDER BY version DESC LIMIT 1",
      parseGateRequirementSet,
      changeId
    );
  }

  insertIndependentEvaluation(evaluation: IndependentEvaluation): void {
    this.database
      .prepare(
        "INSERT INTO independent_evaluations(id, project_id, change_id, artifact_id, artifact_digest, requirement_set_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        evaluation.id,
        evaluation.project_id,
        evaluation.change_id,
        evaluation.artifact_id,
        evaluation.artifact_digest.value,
        evaluation.requirement_set_id,
        json(evaluation)
      );
  }

  getIndependentEvaluation(id: InternalId): IndependentEvaluation | undefined {
    return this.getPayload("SELECT payload_json FROM independent_evaluations WHERE id = ?", parseIndependentEvaluation, id);
  }

  listIndependentEvaluationsByChange(changeId: InternalId): IndependentEvaluation[] {
    return this.listPayload(
      "SELECT payload_json FROM independent_evaluations WHERE change_id = ? ORDER BY rowid",
      parseIndependentEvaluation,
      changeId
    );
  }

  insertClaimAssessment(assessment: ClaimAssessment): void {
    this.database
      .prepare(
        "INSERT INTO claim_assessments(id, project_id, change_id, claim_id, evaluation_id, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        assessment.id,
        assessment.project_id,
        assessment.change_id,
        assessment.claim_id,
        assessment.evaluation_id,
        json(assessment)
      );
  }

  listClaimAssessmentsByEvaluation(evaluationId: InternalId): ClaimAssessment[] {
    return this.listPayload(
      "SELECT payload_json FROM claim_assessments WHERE evaluation_id = ? ORDER BY rowid",
      parseClaimAssessment,
      evaluationId
    );
  }

  insertEvidencePackageManifest(manifest: EvidencePackageManifest): void {
    this.database
      .prepare(
        "INSERT INTO evidence_package_manifests(id, project_id, change_id, package_kind, digest, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(manifest.id, manifest.project_id, manifest.change_id, manifest.package_kind, manifest.digest.value, json(manifest));
  }

  getEvidencePackageManifest(id: InternalId): EvidencePackageManifest | undefined {
    return this.getPayload("SELECT payload_json FROM evidence_package_manifests WHERE id = ?", parseEvidencePackage, id);
  }

  insertImpactAssessment(assessment: ImpactAssessment): void {
    this.database
      .prepare(
        "INSERT INTO impact_assessments(id, project_id, change_id, subject_type, subject_id, new_validity, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        assessment.id,
        assessment.project_id,
        assessment.change_id,
        assessment.subject_type,
        assessment.subject_id,
        assessment.new_validity,
        json(assessment)
      );
  }

  listImpactAssessmentsBySubject(subjectId: InternalId): ImpactAssessment[] {
    return this.listPayload(
      "SELECT payload_json FROM impact_assessments WHERE subject_id = ? ORDER BY rowid",
      parseImpactAssessment,
      subjectId
    );
  }

  insertRepairWorkItemLink(link: RepairWorkItemLink): void {
    this.database
      .prepare(
        "INSERT INTO repair_work_item_links(id, project_id, change_id, failed_evidence_id, repair_work_item_id, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(link.id, link.project_id, link.change_id, link.failed_evidence_id, link.repair_work_item_id, json(link));
  }

  listRepairWorkItemLinksByChange(changeId: InternalId): RepairWorkItemLink[] {
    return this.listPayload(
      "SELECT payload_json FROM repair_work_item_links WHERE change_id = ? ORDER BY rowid",
      parseRepairLink,
      changeId
    );
  }

  insertEnvironment(environment: Environment): void {
    this.insertUnique(
      "INSERT INTO environments(id, project_id, environment_key, kind, status, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        environment.id,
        environment.project_id,
        environment.environment_key,
        environment.kind,
        environment.status,
        environment.revision,
        json(environment)
      ],
      "Environment key already registered"
    );
  }

  updateEnvironment(environment: Environment, expectedRevision: number): void {
    this.updateRevision(
      "environments",
      environment.id,
      environment.revision,
      expectedRevision,
      environment,
      ", status = ?",
      [environment.status]
    );
  }

  getEnvironment(id: InternalId): Environment | undefined {
    return this.getPayload("SELECT payload_json FROM environments WHERE id = ?", parseEnvironment, id);
  }

  getEnvironmentByKey(projectId: InternalId, environmentKey: string): Environment | undefined {
    return this.getPayload(
      "SELECT payload_json FROM environments WHERE project_id = ? AND environment_key = ?",
      parseEnvironment,
      projectId,
      environmentKey
    );
  }

  listEnvironments(projectId: InternalId): Environment[] {
    return this.listPayload(
      "SELECT payload_json FROM environments WHERE project_id = ? ORDER BY rowid",
      parseEnvironment,
      projectId
    );
  }

  insertRelease(release: Release): void {
    this.database
      .prepare(
        "INSERT INTO releases(id, project_id, change_id, environment_id, kind, artifact_digest, status, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        release.id,
        release.project_id,
        release.change_id,
        release.environment_id,
        release.kind,
        release.artifact_digest.value,
        release.status,
        release.revision,
        json(release)
      );
  }

  updateRelease(release: Release, expectedRevision: number): void {
    this.updateRevision(
      "releases",
      release.id,
      release.revision,
      expectedRevision,
      release,
      ", status = ?",
      [release.status]
    );
  }

  getRelease(id: InternalId): Release | undefined {
    return this.getPayload("SELECT payload_json FROM releases WHERE id = ?", parseRelease, id);
  }

  listReleasesByChange(changeId: InternalId): Release[] {
    return this.listPayload("SELECT payload_json FROM releases WHERE change_id = ? ORDER BY rowid", parseRelease, changeId);
  }

  insertReleasePackage(releasePackage: ReleasePackage): void {
    this.database
      .prepare(
        "INSERT INTO release_packages(id, project_id, change_id, release_id, artifact_digest, digest, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        releasePackage.id,
        releasePackage.project_id,
        releasePackage.change_id,
        releasePackage.release_id,
        releasePackage.artifact_digest.value,
        releasePackage.digest.value,
        json(releasePackage)
      );
  }

  getReleasePackage(id: InternalId): ReleasePackage | undefined {
    return this.getPayload("SELECT payload_json FROM release_packages WHERE id = ?", parseReleasePackage, id);
  }

  insertDeployment(deployment: Deployment): void {
    this.database
      .prepare(
        "INSERT INTO deployments(id, project_id, change_id, release_id, environment_id, artifact_digest, status, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        deployment.id,
        deployment.project_id,
        deployment.change_id,
        deployment.release_id,
        deployment.environment_id,
        deployment.artifact_digest.value,
        deployment.status,
        deployment.revision,
        json(deployment)
      );
  }

  updateDeployment(deployment: Deployment, expectedRevision: number): void {
    this.updateRevision(
      "deployments",
      deployment.id,
      deployment.revision,
      expectedRevision,
      deployment,
      ", status = ?",
      [deployment.status]
    );
  }

  getDeployment(id: InternalId): Deployment | undefined {
    return this.getPayload("SELECT payload_json FROM deployments WHERE id = ?", parseDeployment, id);
  }

  listDeploymentsByRelease(releaseId: InternalId): Deployment[] {
    return this.listPayload(
      "SELECT payload_json FROM deployments WHERE release_id = ? ORDER BY rowid",
      parseDeployment,
      releaseId
    );
  }

  insertDeploymentAttempt(attempt: DeploymentAttempt): void {
    this.database
      .prepare(
        "INSERT INTO deployment_attempts(id, project_id, change_id, deployment_id, attempt_kind, operation_key, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        attempt.id,
        attempt.project_id,
        attempt.change_id,
        attempt.deployment_id,
        attempt.attempt_kind,
        attempt.operation_key,
        json(attempt)
      );
  }

  listDeploymentAttempts(deploymentId: InternalId): DeploymentAttempt[] {
    return this.listPayload(
      "SELECT payload_json FROM deployment_attempts WHERE deployment_id = ? ORDER BY rowid",
      parseDeploymentAttempt,
      deploymentId
    );
  }

  insertVerificationResult(result: VerificationResult): void {
    this.database
      .prepare(
        "INSERT INTO verification_results(id, project_id, change_id, deployment_id, result, digest, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        result.id,
        result.project_id,
        result.change_id,
        result.deployment_id,
        result.result,
        result.digest.value,
        json(result)
      );
  }

  getVerificationResult(id: InternalId): VerificationResult | undefined {
    return this.getPayload("SELECT payload_json FROM verification_results WHERE id = ?", parseVerificationResult, id);
  }

  listVerificationResultsByDeployment(deploymentId: InternalId): VerificationResult[] {
    return this.listPayload(
      "SELECT payload_json FROM verification_results WHERE deployment_id = ? ORDER BY rowid",
      parseVerificationResult,
      deploymentId
    );
  }

  insertRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.database
      .prepare(
        "INSERT INTO recovery_strategies(id, project_id, change_id, release_id, digest, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(strategy.id, strategy.project_id, strategy.change_id, strategy.release_id, strategy.digest.value, json(strategy));
  }

  getRecoveryStrategy(id: InternalId): RecoveryStrategy | undefined {
    return this.getPayload("SELECT payload_json FROM recovery_strategies WHERE id = ?", parseRecoveryStrategy, id);
  }

  insertRecoveryExecution(execution: RecoveryExecution): void {
    this.database
      .prepare(
        "INSERT INTO recovery_executions(id, project_id, change_id, strategy_id, source_deployment_id, deployment_id, status, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        execution.id,
        execution.project_id,
        execution.change_id,
        execution.strategy_id,
        execution.source_deployment_id,
        execution.deployment_id,
        execution.status,
        execution.revision,
        json(execution)
      );
  }

  updateRecoveryExecution(execution: RecoveryExecution, expectedRevision: number): void {
    this.updateRevision(
      "recovery_executions",
      execution.id,
      execution.revision,
      expectedRevision,
      execution,
      ", status = ?",
      [execution.status]
    );
  }

  getRecoveryExecution(id: InternalId): RecoveryExecution | undefined {
    return this.getPayload("SELECT payload_json FROM recovery_executions WHERE id = ?", parseRecoveryExecution, id);
  }

  listRecoveryExecutionsByRelease(releaseId: InternalId): RecoveryExecution[] {
    return this.listPayload(
      `SELECT payload_json FROM recovery_executions
       WHERE strategy_id IN (SELECT id FROM recovery_strategies WHERE release_id = ?)
       ORDER BY rowid`,
      parseRecoveryExecution,
      releaseId
    );
  }

  insertReconciliation(reconciliation: Reconciliation): void {
    this.database
      .prepare(
        "INSERT INTO reconciliations(id, project_id, change_id, operation_id, conclusion, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        reconciliation.id,
        reconciliation.project_id,
        reconciliation.change_id,
        reconciliation.operation_id,
        reconciliation.conclusion,
        json(reconciliation)
      );
  }

  listReconciliationsByOperation(operationId: InternalId): Reconciliation[] {
    return this.listPayload(
      "SELECT payload_json FROM reconciliations WHERE operation_id = ? ORDER BY rowid",
      parseReconciliation,
      operationId
    );
  }

  insertExternalOperation(operation: ExternalOperation): void {
    this.insertUnique(
      "INSERT INTO external_operations(id, project_id, change_id, operation_key, operation_kind, state, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        operation.id,
        operation.project_id,
        operation.change_id,
        operation.operation_key,
        operation.operation_kind,
        operation.state,
        operation.revision,
        json(operation)
      ],
      "External operation key already recorded"
    );
  }

  updateExternalOperation(operation: ExternalOperation, expectedRevision: number): void {
    this.updateRevision(
      "external_operations",
      operation.id,
      operation.revision,
      expectedRevision,
      operation,
      ", state = ?",
      [operation.state]
    );
  }

  getExternalOperation(id: InternalId): ExternalOperation | undefined {
    return this.getPayload("SELECT payload_json FROM external_operations WHERE id = ?", parseExternalOperation, id);
  }

  getExternalOperationByKey(operationKey: string): ExternalOperation | undefined {
    return this.getPayload(
      "SELECT payload_json FROM external_operations WHERE operation_key = ?",
      parseExternalOperation,
      operationKey
    );
  }

  listExternalOperationsByChange(changeId: InternalId): ExternalOperation[] {
    return this.listPayload(
      "SELECT payload_json FROM external_operations WHERE change_id = ? ORDER BY rowid",
      parseExternalOperation,
      changeId
    );
  }

  listUnknownExternalOperations(): ExternalOperation[] {
    return this.listPayload(
      "SELECT payload_json FROM external_operations WHERE state = 'unknown' ORDER BY rowid",
      parseExternalOperation
    );
  }

  insertLearningCandidate(candidate: LearningCandidate): void {
    this.insertUnique(
      "INSERT INTO learning_candidates(id, project_id, change_id, source_kind, promoted, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
      [
        candidate.id,
        candidate.project_id,
        candidate.change_id,
        candidate.source_kind,
        candidate.promoted ? 1 : 0,
        json(candidate)
      ],
      "Learning candidate already exists"
    );
  }

  getLearningCandidate(id: InternalId): LearningCandidate | undefined {
    return this.getPayload("SELECT payload_json FROM learning_candidates WHERE id = ?", parseLearningCandidate, id);
  }

  listLearningCandidatesByChange(changeId: InternalId): LearningCandidate[] {
    return this.listPayload(
      "SELECT payload_json FROM learning_candidates WHERE change_id = ? ORDER BY rowid",
      parseLearningCandidate,
      changeId
    );
  }

  insertKnowledgeUpdateEvidence(evidence: KnowledgeUpdateEvidence): void {
    this.insertUnique(
      "INSERT INTO knowledge_update_evidence(id, project_id, change_id, task_id, conclusion, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
      [evidence.id, evidence.project_id, evidence.change_id, evidence.task_id, evidence.conclusion, json(evidence)],
      "Knowledge update evidence already exists"
    );
  }

  listKnowledgeUpdateEvidenceByChange(changeId: InternalId): KnowledgeUpdateEvidence[] {
    return this.listPayload(
      "SELECT payload_json FROM knowledge_update_evidence WHERE change_id = ? ORDER BY rowid",
      parseKnowledgeUpdate,
      changeId
    );
  }

  insertClosureEvaluation(evaluation: ClosureEvaluation): void {
    this.insertUnique(
      "INSERT INTO closure_evaluations(id, project_id, change_id, disposition, result, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
      [
        evaluation.id,
        evaluation.project_id,
        evaluation.change_id,
        evaluation.disposition,
        evaluation.result,
        json(evaluation)
      ],
      "Closure evaluation already exists"
    );
  }

  getClosureEvaluation(id: InternalId): ClosureEvaluation | undefined {
    return this.getPayload("SELECT payload_json FROM closure_evaluations WHERE id = ?", parseClosureEvaluation, id);
  }

  listClosureEvaluationsByChange(changeId: InternalId): ClosureEvaluation[] {
    return this.listPayload(
      "SELECT payload_json FROM closure_evaluations WHERE change_id = ? ORDER BY rowid",
      parseClosureEvaluation,
      changeId
    );
  }

  insertArchiveRecord(record: ArchiveRecord): void {
    this.insertUnique(
      "INSERT INTO archive_records(id, project_id, change_id, payload_json) VALUES (?, ?, ?, ?)",
      [record.id, record.project_id, record.change_id, json(record)],
      "Archive record already exists"
    );
  }

  listArchiveRecordsByChange(changeId: InternalId): ArchiveRecord[] {
    return this.listPayload(
      "SELECT payload_json FROM archive_records WHERE change_id = ? ORDER BY rowid",
      parseArchiveRecord,
      changeId
    );
  }

  insertCancellationRecord(record: CancellationRecord): void {
    this.insertUnique(
      "INSERT INTO cancellation_records(id, project_id, change_id, payload_json) VALUES (?, ?, ?, ?)",
      [record.id, record.project_id, record.change_id, json(record)],
      "Cancellation record already exists"
    );
  }

  listCancellationRecordsByChange(changeId: InternalId): CancellationRecord[] {
    return this.listPayload(
      "SELECT payload_json FROM cancellation_records WHERE change_id = ? ORDER BY rowid",
      parseCancellationRecord,
      changeId
    );
  }

  insertSupersessionRecord(record: SupersessionRecord): void {
    this.insertUnique(
      "INSERT INTO supersession_records(id, project_id, change_id, successor_change_id, payload_json) VALUES (?, ?, ?, ?, ?)",
      [record.id, record.project_id, record.change_id, record.successor_change_id, json(record)],
      "Supersession record already exists"
    );
  }

  listSupersessionRecordsByChange(changeId: InternalId): SupersessionRecord[] {
    return this.listPayload(
      "SELECT payload_json FROM supersession_records WHERE change_id = ? ORDER BY rowid",
      parseSupersessionRecord,
      changeId
    );
  }

  insertAttentionItem(item: AttentionItem): void {
    this.insertUnique(
      "INSERT INTO attention_items(id, project_id, change_id, kind, status, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [item.id, item.project_id, item.change_id ?? null, item.kind, item.status, item.revision, json(item)],
      "Attention item already exists"
    );
  }

  updateAttentionItem(item: AttentionItem, expectedRevision: number): void {
    this.updateRevision(
      "attention_items",
      item.id,
      item.revision,
      expectedRevision,
      item,
      ", status = ?",
      [item.status]
    );
  }

  getAttentionItem(id: InternalId): AttentionItem | undefined {
    return this.getPayload("SELECT payload_json FROM attention_items WHERE id = ?", parseAttentionItem, id);
  }

  listOpenAttentionItems(projectId: InternalId): AttentionItem[] {
    return this.listPayload(
      "SELECT payload_json FROM attention_items WHERE project_id = ? AND status = 'open' ORDER BY rowid",
      parseAttentionItem,
      projectId
    );
  }

  deleteReadModels(): void {
    this.database.exec("DELETE FROM attention_items");
    this.database.exec("DELETE FROM read_model_checkpoints");
  }

  insertImportReport(report: ImportReport): void {
    this.insertUnique(
      "INSERT INTO import_reports(id, project_id, status, runtime_ownership, payload_json) VALUES (?, ?, ?, ?, ?)",
      [report.id, report.project_id, report.status, report.runtime_ownership, json(report)],
      "Import report already exists"
    );
  }

  getImportReport(id: InternalId): ImportReport | undefined {
    return this.getPayload("SELECT payload_json FROM import_reports WHERE id = ?", parseImportReport, id);
  }

  listPortableFacts() {
    return listPortableFacts(this.database);
  }

  importPortableSnapshot(facts: Parameters<StoreTransaction["importPortableSnapshot"]>[0]): void {
    importPortableSnapshot(this, facts);
  }

  insertImportedEvent(event: EventEnvelope): void {
    const parsed = parseEvent(event);
    this.database
      .prepare(
        `INSERT INTO event_ledger(
          event_id, project_id, event_sequence, aggregate_type, aggregate_id,
          aggregate_revision, event_type, occurred_at, envelope_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        parsed.event_id,
        parsed.project_id,
        parsed.event_sequence,
        parsed.aggregate.object_type,
        parsed.aggregate.id,
        parsed.aggregate_revision,
        parsed.event_type,
        parsed.occurred_at,
        json(parsed)
      );
  }

  setProjectCounters(projectId: InternalId, counters: { change_number: number; event_sequence: number }): void {
    const result = this.database
      .prepare("UPDATE project_counters SET change_number = ?, event_sequence = ? WHERE project_id = ?")
      .run(counters.change_number, counters.event_sequence, projectId);
    if (Number(result.changes) !== 1) {
      throw new Error("Project counter not found");
    }
  }

  listOutboxMessages() {
    return listOutboxRows(this.database);
  }

  upsertReadModelCheckpoint(projectionName: string, eventSequence: number, payload: Record<string, unknown>): void {
    this.database
      .prepare(
        `INSERT INTO read_model_checkpoints(projection_name, event_sequence, payload_json)
         VALUES (?, ?, ?)
         ON CONFLICT(projection_name) DO UPDATE SET event_sequence = excluded.event_sequence, payload_json = excluded.payload_json`
      )
      .run(projectionName, eventSequence, json(payload));
  }

  getReadModelCheckpoint(
    projectionName: string
  ): { event_sequence: number; payload: Record<string, unknown> } | undefined {
    const row = this.database
      .prepare("SELECT event_sequence, payload_json FROM read_model_checkpoints WHERE projection_name = ?")
      .get(projectionName) as SqlRow | undefined;
    return row
      ? { event_sequence: Number(row.event_sequence), payload: parseJson(row.payload_json) as Record<string, unknown> }
      : undefined;
  }

  private insertUnique(sql: string, values: SqlValue[], conflictMessage: string): void {
    try {
      this.database.prepare(sql).run(...values);
    } catch (error) {
      if (isUniqueConstraint(error)) throw new StoreConflictError(conflictMessage);
      throw error;
    }
  }

  private getPayload<T>(sql: string, parser: (value: unknown) => T, ...params: SqlValue[]): T | undefined {
    const row = this.database.prepare(sql).get(...params) as SqlRow | undefined;
    return row ? parser(parseJson(row.payload_json)) : undefined;
  }

  private listPayload<T>(sql: string, parser: (value: unknown) => T, ...params: SqlValue[]): T[] {
    const rows = this.database.prepare(sql).all(...params) as SqlRow[];
    return rows.map((row) => parser(parseJson(row.payload_json)));
  }

  private updateRevision(
    table: string,
    id: InternalId,
    nextRevision: number,
    expectedRevision: number,
    payload: unknown,
    extraSet = "",
    extraValues: SqlValue[] = []
  ): void {
    const result = this.database
      .prepare(`UPDATE ${table} SET revision = ?, payload_json = ?${extraSet} WHERE id = ? AND revision = ?`)
      .run(nextRevision, json(payload), ...extraValues, id, expectedRevision);
    if (Number(result.changes) !== 1) {
      const row = this.database.prepare(`SELECT revision FROM ${table} WHERE id = ?`).get(id) as SqlRow | undefined;
      throw new StoreConflictError(`${table} revision conflict`, row ? Number(row.revision) : undefined);
    }
  }
}

export class SqliteProjectStore implements ProjectStore {
  readonly #database: DatabaseSync;

  constructor(readonly databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath, {
      timeout: 5000,
      defensive: true,
      allowExtension: false
    });
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA busy_timeout = 5000");
    applyProjectStoreMigrations(this.#database);
  }

  transaction<T>(work: (transaction: StoreTransaction) => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = work(new SqliteTransaction(this.#database));
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  getProject(): Project | undefined {
    const row = this.#database.prepare("SELECT payload_json FROM projects LIMIT 1").get() as SqlRow | undefined;
    return row ? parseProject(parseJson(row.payload_json)) : undefined;
  }

  getChange(idOrKey: string): Change | undefined {
    const row = this.#database
      .prepare("SELECT payload_json FROM changes WHERE id = ? OR display_key = ? LIMIT 1")
      .get(idOrKey, idOrKey) as SqlRow | undefined;
    return row ? parseChange(parseJson(row.payload_json)) : undefined;
  }

  listChanges(): Change[] {
    const rows = this.#database
      .prepare("SELECT payload_json FROM changes ORDER BY CAST(SUBSTR(display_key, 5) AS INTEGER)")
      .all() as SqlRow[];
    return rows.map((row) => parseChange(parseJson(row.payload_json)));
  }

  listEvents(): EventEnvelope[] {
    const rows = this.#database
      .prepare("SELECT envelope_json FROM event_ledger ORDER BY event_sequence")
      .all() as SqlRow[];
    return rows.map((row) => parseEvent(parseJson(row.envelope_json)));
  }

  listOutbox(status?: OutboxMessage["status"]): OutboxMessage[] {
    const rows = (status
      ? this.#database
          .prepare("SELECT * FROM outbox_messages WHERE status = ? ORDER BY created_at")
          .all(status)
      : this.#database.prepare("SELECT * FROM outbox_messages ORDER BY created_at").all()) as SqlRow[];
    return rows.map((row) => ({
      id: String(row.id),
      project_id: String(row.project_id),
      event_id: String(row.event_id),
      status: String(row.status) as OutboxMessage["status"],
      attempt_count: Number(row.attempt_count),
      available_at: String(row.available_at),
      ...(row.lease_until ? { lease_until: String(row.lease_until) } : {}),
      created_at: String(row.created_at),
      ...(row.delivered_at ? { delivered_at: String(row.delivered_at) } : {})
    }));
  }

  claimOutbox(now: string, leaseUntil: string): OutboxMessage | undefined {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#database
        .prepare(
          `SELECT * FROM outbox_messages
           WHERE available_at <= ?
             AND (status = 'pending' OR (status = 'processing' AND lease_until <= ?))
           ORDER BY created_at, rowid
           LIMIT 1`
        )
        .get(now, now) as SqlRow | undefined;
      if (!row) {
        this.#database.exec("COMMIT");
        return undefined;
      }
      this.#database
        .prepare(
          `UPDATE outbox_messages
           SET status = 'processing', attempt_count = attempt_count + 1, lease_until = ?
           WHERE id = ?`
        )
        .run(leaseUntil, String(row.id));
      this.#database.exec("COMMIT");
      return {
        id: String(row.id),
        project_id: String(row.project_id),
        event_id: String(row.event_id),
        status: "processing",
        attempt_count: Number(row.attempt_count) + 1,
        available_at: String(row.available_at),
        lease_until: leaseUntil,
        created_at: String(row.created_at),
        ...(row.delivered_at ? { delivered_at: String(row.delivered_at) } : {})
      };
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  markOutboxDelivered(messageId: InternalId, deliveredAt: string): void {
    const result = this.#database
      .prepare(
        `UPDATE outbox_messages
         SET status = 'delivered', delivered_at = ?, lease_until = NULL
         WHERE id = ? AND status = 'processing'`
      )
      .run(deliveredAt, messageId);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Outbox message is not claimed");
  }

  releaseOutbox(messageId: InternalId, availableAt: string): void {
    const result = this.#database
      .prepare(
        `UPDATE outbox_messages
         SET status = 'pending', available_at = ?, lease_until = NULL
         WHERE id = ? AND status = 'processing'`
      )
      .run(availableAt, messageId);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Outbox message is not claimed");
  }

  claimExternalOperation(input: {
    operationId: InternalId;
    ownerId: string;
    now: string;
    leaseUntil: string;
  }): ExternalOperationLease | undefined {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const operation = this.#database
        .prepare("SELECT state FROM external_operations WHERE id = ?")
        .get(input.operationId) as SqlRow | undefined;
      if (!operation || String(operation.state) !== "pending") {
        this.#database.exec("COMMIT");
        return undefined;
      }
      const existing = this.#readLease(input.operationId);
      if (existing?.invoke_finished_at) {
        this.#database.exec("COMMIT");
        return undefined;
      }
      if (existing?.invoke_started_at) {
        this.#database.exec("COMMIT");
        return undefined;
      }
      if (existing && existing.expires_at > input.now) {
        this.#database.exec("COMMIT");
        return undefined;
      }
      const generation = (existing?.generation ?? 0) + 1;
      this.#database
        .prepare(
          `INSERT INTO external_operation_leases(
             operation_id, owner_id, claimed_at, expires_at, generation,
             invoke_started_at, invoke_finished_at, adapter_result_json
           ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)
           ON CONFLICT(operation_id) DO UPDATE SET
             owner_id = excluded.owner_id,
             claimed_at = excluded.claimed_at,
             expires_at = excluded.expires_at,
             generation = excluded.generation,
             invoke_started_at = NULL,
             invoke_finished_at = NULL,
             adapter_result_json = NULL
           WHERE external_operation_leases.invoke_started_at IS NULL
             AND external_operation_leases.invoke_finished_at IS NULL
             AND external_operation_leases.expires_at <= excluded.claimed_at`
        )
        .run(input.operationId, input.ownerId, input.now, input.leaseUntil, generation);
      const claimed = this.#readLease(input.operationId);
      this.#database.exec("COMMIT");
      return claimed?.owner_id === input.ownerId && claimed.claimed_at === input.now ? claimed : undefined;
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  markExternalOperationInvokeStarted(operationId: InternalId, ownerId: string, now: string): boolean {
    const result = this.#database
      .prepare(
        `UPDATE external_operation_leases
         SET invoke_started_at = ?
         WHERE operation_id = ? AND owner_id = ? AND invoke_started_at IS NULL`
      )
      .run(now, operationId, ownerId);
    return Number(result.changes) === 1;
  }

  markExternalOperationInvokeFinished(
    operationId: InternalId,
    ownerId: string,
    now: string,
    adapterResult: unknown
  ): boolean {
    const result = this.#database
      .prepare(
        `UPDATE external_operation_leases
         SET invoke_finished_at = ?, adapter_result_json = ?
         WHERE operation_id = ? AND owner_id = ? AND invoke_finished_at IS NULL`
      )
      .run(now, json(adapterResult), operationId, ownerId);
    return Number(result.changes) === 1;
  }

  getExternalOperationLease(operationId: InternalId): ExternalOperationLease | undefined {
    return this.#readLease(operationId);
  }

  listInvokedUnrecordedOperations(): Array<{ operation: ExternalOperation; lease: ExternalOperationLease }> {
    const rows = this.#database
      .prepare(
        `SELECT o.payload_json AS payload_json, l.operation_id, l.owner_id, l.claimed_at, l.expires_at,
                l.generation, l.invoke_started_at, l.invoke_finished_at, l.adapter_result_json
         FROM external_operation_leases l
         JOIN external_operations o ON o.id = l.operation_id
         WHERE o.state = 'pending' AND l.invoke_finished_at IS NOT NULL
         ORDER BY l.claimed_at, o.rowid`
      )
      .all() as SqlRow[];
    return rows.map((row) => ({
      operation: parseExternalOperation(parseJson(row.payload_json)),
      lease: this.#leaseFromRow(row)
    }));
  }

  listAbandonedExternalInvokes(now: string): Array<{ operation: ExternalOperation; lease: ExternalOperationLease }> {
    const rows = this.#database
      .prepare(
        `SELECT o.payload_json AS payload_json, l.operation_id, l.owner_id, l.claimed_at, l.expires_at,
                l.generation, l.invoke_started_at, l.invoke_finished_at, l.adapter_result_json
         FROM external_operation_leases l
         JOIN external_operations o ON o.id = l.operation_id
         WHERE o.state = 'pending'
           AND l.invoke_started_at IS NOT NULL
           AND l.invoke_finished_at IS NULL
           AND l.expires_at <= ?
         ORDER BY l.claimed_at, o.rowid`
      )
      .all(now) as SqlRow[];
    return rows.map((row) => ({
      operation: parseExternalOperation(parseJson(row.payload_json)),
      lease: this.#leaseFromRow(row)
    }));
  }

  releaseExternalOperationLease(operationId: InternalId): void {
    this.#database.prepare("DELETE FROM external_operation_leases WHERE operation_id = ?").run(operationId);
  }

  #readLease(operationId: InternalId): ExternalOperationLease | undefined {
    const row = this.#database
      .prepare("SELECT * FROM external_operation_leases WHERE operation_id = ?")
      .get(operationId) as SqlRow | undefined;
    return row ? this.#leaseFromRow(row) : undefined;
  }

  #leaseFromRow(row: SqlRow): ExternalOperationLease {
    return {
      operation_id: String(row.operation_id) as InternalId,
      owner_id: String(row.owner_id),
      claimed_at: String(row.claimed_at),
      expires_at: String(row.expires_at),
      generation: Number(row.generation),
      ...(row.invoke_started_at ? { invoke_started_at: String(row.invoke_started_at) } : {}),
      ...(row.invoke_finished_at ? { invoke_finished_at: String(row.invoke_finished_at) } : {}),
      ...(row.adapter_result_json ? { adapter_result_json: String(row.adapter_result_json) } : {})
    };
  }

  close(): void {
    try {
      this.#database.close();
    } catch (error) {
      if (!(error instanceof Error) || !/not open|already closed/i.test(error.message)) throw error;
    }
  }
}
