import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AssignmentSchema,
  ChangeProfileSchema,
  ChangeSchema,
  CommandSuccessSchema,
  ContractAmendmentSchema,
  ContractCandidateSchema,
  ContractVersionSchema,
  DecisionRequestSchema,
  DecisionSchema,
  EventEnvelopeSchema,
  FeedbackSchema,
  GateEvaluationSchema,
  KnowledgeImpactAssessmentSchema,
  PlanAmendmentSchema,
  PlanCandidateSchema,
  PlanVersionSchema,
  PolicySnapshotSchema,
  ProjectPolicySchema,
  ProjectSchema,
  RiskAssessmentSchema,
  RiskProfileSchema,
  RoleSchema,
  SCHEMA_VERSION,
  TaskSchema,
  compileValidator,
  type Actor,
  type Assignment,
  type Change,
  type ChangeProfile,
  type CommandSuccess,
  type ContractAmendment,
  type ContractCandidate,
  type ContractVersion,
  type Decision,
  type DecisionRequest,
  type EventEnvelope,
  type Feedback,
  type GateEvaluation,
  type InternalId,
  type KnowledgeImpactAssessment,
  type PlanAmendment,
  type PlanCandidate,
  type PlanVersion,
  type PolicySnapshot,
  type Project,
  type ProjectPolicy,
  type RiskAssessment,
  type RiskProfile,
  type Role,
  type Task,
  type TransitionRecord
} from "@cimiloop/protocol";
import {
  StoreConflictError,
  type CommandReceipt,
  type OutboxMessage,
  type ProjectStore,
  type ProposedEvent,
  type StoreTransaction
} from "@cimiloop/store";
import { applyProjectStoreMigrations } from "./migrations.js";

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

  close(): void {
    this.#database.close();
  }
}
