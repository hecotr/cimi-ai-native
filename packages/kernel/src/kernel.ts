import {
  ProtocolValidationError,
  SCHEMA_VERSION,
  createInternalId,
  formatValidationErrors,
  parseChangeRoomResult,
  parseCommand,
  parseDecisionInboxResult,
  parseGetDecisionRequestResult,
  parseEvidencePackageShowResult,
  parseTimelineResult,
  type Actor,
  type AnyCommand,
  type Assignment,
  type Change,
  type ChangeRoomResult,
  type CommandSuccess,
  type DecisionInboxResult,
  type DomainError,
  type GetDecisionRequestResult,
  type EventEnvelope,
  type BootstrapSoloGovernanceCommand,
  type ContractVersion,
  type GateEvaluation,
  type InitializeProjectCommand,
  type InternalId,
  type Project,
  type PlanVersion,
  type RequestIntentDecisionCommand,
  type RequestPlanDecisionCommand,
  type Role,
  type SubmitContractAmendmentCommand,
  type SubmitContractCandidateCommand,
  type SubmitDecisionCommand,
  type SubmitPlanAmendmentCommand,
  type SubmitPlanCandidateCommand,
  type Task,
  type TimelineResult,
  type WorkItem,
  type AgentRunRecord,
  type Blocker,
  type CapabilityBinding,
  type ClaimWorkItemCommand,
  type ContextPackManifest,
  type CreateExecutionWorkItemsCommand,
  type CreatePlanningWorkItemCommand,
  type StartRunCommand,
  type HeartbeatRunCommand,
  type CompleteRunCommand,
  type FailRunCommand,
  type CancelRunCommand,
  type ReclaimExpiredLeaseCommand,
  type RecordSourceSnapshotCommand,
  type RecordArtifactCommand,
  type RecordEvidenceCommand,
  type PromoteTestResultCommand,
  type RequestEvaluationCommand,
  type CompleteEvaluationCommand,
  type AssessImpactCommand,
  type CreateRepairWorkItemCommand,
  type SubmitClaimCommand,
  type Claim,
  type ClaimAssessment,
  type EvidencePackageManifest,
  type EvidencePackageShowResult,
  type RepairWorkItemLink,
  type Artifact,
  type Evidence,
  type EvidenceValidity,
  type IndependentEvaluation,
  type ImpactAssessment,
  type Lease,
  type PolicySnapshot,
  type ResourceLock,
  type SourceSnapshot
} from "@cimiloop/protocol";
import {
  StoreConflictError,
  type OutboxMessage,
  type ProjectStore,
  type ProposedEvent,
  type StoreTransaction
} from "@cimiloop/store";
import { createContractAmendment, createPlanAmendment, nextDomainVersion } from "./amendment.js";
import { commandDigest, requestDigest } from "./canonical.js";
import { createDraftChange, pauseDraftChange, resumeDraftChange } from "./change.js";
import { createContractCandidate } from "./contract.js";
import {
  actorHasRole,
  computeDecisionRequestDigest,
  createDecisionRecord,
  createDecisionRequest,
  createFeedbackRecords
} from "./decision.js";
import { evaluateIntentGate } from "./gates/intent-gate.js";
import { evaluatePlanGate } from "./gates/plan-gate.js";
import { resolveGateRequirementSet } from "./evidence/requirements.js";
import { assessClaim } from "./evidence/assessment.js";
import { evaluateEvidenceGate, evaluationInputDigest, findReusableEvaluation } from "./evidence/evaluation-gate.js";
import { classifyImpact, projectValidity } from "./evidence/impact.js";
import { createEvidenceFromCommand } from "./evidence/ingest.js";
import { parseWhitelistedTestResult, readPromotableReference } from "./evidence/promotion.js";
import { createKnowledgeImpactAssessment, validateKnowledgeImpact } from "./knowledge-impact.js";
import { createPlanCandidate, createPlanTasks, createPlanVersion, validateKnowledgeTasks } from "./plan.js";
import { ReadModelBuilder } from "./read-models.js";
import { createRiskAssessment, createRiskProfile, validateRiskDimensions } from "./risk.js";
import { selectReadyTasks } from "./scheduler.js";
import { validateTaskDag } from "./task-dag.js";
import {
  allowedRunTransition,
  createBindingForRun,
  createContextPackForWorkItem,
  createDefaultRuntimeProvider,
  createEvaluatorProvider,
  createStartedRun,
  failStatusForCode,
  hasActiveRun,
  isOpenExecutionStatus,
  nextRunAttempt
} from "./run.js";
import { createArtifact, localReferenceExists } from "./artifact.js";
import { createSourceSnapshot, snapshotKindValid } from "./source-snapshot.js";
import { createRepairWorkItem, createRepairWorkItemLink } from "./repair.js";
import { createEvaluationWorkItem, createExecutionWorkItem, createPlanningWorkItem } from "./work-item.js";
import {
  createBuiltInChangeProfiles,
  createSoloAssignments,
  createSoloPolicy,
  createSoloPolicySnapshot,
  createSoloRoles,
  type GovernanceIds
} from "./governance.js";

export type KernelResult = CommandSuccess | DomainError;

export interface KernelDependencies {
  store: ProjectStore;
  now?: () => string;
  id?: () => InternalId;
}

const defaultClock = (): string => new Date().toISOString();

const domainError = (
  correlationId: InternalId,
  code: string,
  message: string,
  category: DomainError["category"],
  retryable = false,
  details: Record<string, unknown> = {}
): DomainError => ({ code, message, category, retryable, details, correlation_id: correlationId });

const isDomainError = (value: KernelResult): value is DomainError => "code" in value;

export class CimiLoopKernel {
  readonly #store: ProjectStore;
  readonly #now: () => string;
  readonly #id: () => InternalId;

  constructor(dependencies: KernelDependencies) {
    this.#store = dependencies.store;
    this.#now = dependencies.now ?? defaultClock;
    this.#id = dependencies.id ?? createInternalId;
  }

  execute(input: unknown): KernelResult {
    let command: AnyCommand;
    try {
      command = parseCommand(input);
    } catch (error) {
      const correlationId = this.#id();
      if (error instanceof ProtocolValidationError) {
        return domainError(
          correlationId,
          "PROTOCOL_VALIDATION_FAILED",
          "命令不符合 Cimi Change Protocol",
          "validation",
          false,
          { errors: formatValidationErrors(error.errors) }
        );
      }
      return domainError(correlationId, "INVALID_COMMAND", "无法解析命令", "validation");
    }

    const digest = commandDigest(command);
    try {
      return this.#store.transaction((transaction) => {
        const previous = transaction.getCommandReceipt(command.command_id);
        if (previous) {
          if (previous.request_digest !== digest) {
            return domainError(
              command.correlation_id,
              "COMMAND_ID_REUSED",
              "同一 command_id 已被用于不同命令",
              "conflict",
              false,
              { command_id: command.command_id }
            );
          }
          return previous.result;
        }

        const result = this.#dispatch(transaction, command);
        if (!isDomainError(result)) {
          transaction.saveCommandReceipt({
            command_id: command.command_id,
            request_digest: digest,
            result,
            created_at: this.#now()
          });
        }
        return result;
      });
    } catch (error) {
      if (error instanceof StoreConflictError) {
        if (error.message === "Lease already held for work item") {
          return domainError(command.correlation_id, "LEASE_CONFLICT", "Work Item 已被领取", "conflict");
        }
        if (error.message === "Resource lock already held") {
          return domainError(command.correlation_id, "RESOURCE_LOCK_CONFLICT", "资源锁已被占用", "conflict");
        }
        if (error.message === "Evidence subject binding already recorded") {
          return domainError(command.correlation_id, "EVIDENCE_BINDING_CONFLICT", "同一 Claim 与主体绑定的 Evidence 不可改写", "conflict");
        }
        return domainError(
          command.correlation_id,
          "REVISION_CONFLICT",
          "目标对象已被其他命令修改，请刷新后重试",
          "conflict",
          false,
          { current_revision: error.currentRevision }
        );
      }
      return domainError(command.correlation_id, "STORE_FAILURE", "本地存储操作失败", "storage", true);
    }
  }

  getProject(): Project | DomainError {
    return (
      this.#store.getProject() ??
      domainError(this.#id(), "PROJECT_NOT_INITIALIZED", "当前目录尚未初始化 CimiLoop Project", "not_found")
    );
  }

  getChange(idOrKey: string): Change | DomainError {
    return (
      this.#store.getChange(idOrKey) ??
      domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found", false, { id_or_key: idOrKey })
    );
  }

  listChanges(): Change[] {
    return this.#store.listChanges();
  }

  listRoles(): Role[] {
    return this.#store.transaction((transaction) => transaction.listRoles());
  }

  listEvents(): EventEnvelope[] {
    return this.#store.listEvents();
  }

  listDecisionInbox(actorId: InternalId): DecisionInboxResult | DomainError {
    try {
      return parseDecisionInboxResult(
        this.#store.transaction((transaction) => {
          const project = transaction.getCurrentProject();
          const roles = transaction.listRoles();
          const assignments = project
            ? transaction.listAssignments(project.id).map((assignment) => ({
                actor_id: assignment.actor_id,
                role_key: roles.find((role) => role.id === assignment.role_id)?.role_key ?? "project_owner"
              }))
            : [];
          const requests = transaction.listOpenDecisionRequests();
          const changes = requests
            .map((request) => transaction.getChange(request.change_id))
            .filter((change): change is Change => Boolean(change))
            .map((change) => ({ id: change.id, display_key: change.display_key, title: change.title }));
          return new ReadModelBuilder().buildInbox({
            actorId,
            assignments,
            requests: requests.map((request) => ({
              id: request.id,
              change_id: request.change_id,
              request_type: request.request_type,
              required_role_key: request.required_role_key,
              status: request.status,
              created_at: request.created_at
            })),
            changes
          });
        })
      );
    } catch (error) {
      return domainError(
        this.#id(),
        "PROTOCOL_VALIDATION_FAILED",
        error instanceof Error ? error.message : "Inbox 投影不符合协议",
        "validation"
      );
    }
  }

  getChangeRoom(changeId: InternalId): ChangeRoomResult | DomainError {
    try {
      return this.#store.transaction((transaction) => {
        const change = transaction.getChange(changeId);
        if (!change) {
          return domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found", false, {
            id_or_key: changeId
          });
        }
        const contract = transaction.getCurrentContract(change.id);
        const plan = transaction.getCurrentPlan(change.id);
        const openRequests = transaction
          .listOpenDecisionRequests()
          .filter((request) => request.change_id === change.id);
        const decisions = transaction.listDecisions(change.id);
        const feedbackIds = decisions.flatMap((decision) =>
          transaction.listFeedback(decision.id).map((feedback) => feedback.id)
        );
        const timeline = new ReadModelBuilder().buildTimeline(this.#store.listEvents(), change.id);
        const room = new ReadModelBuilder().buildRoom({
          change,
          ...(contract ? { contract: { domain_version: contract.domain_version, intent: contract.intent } } : {}),
          ...(plan ? { plan: { domain_version: plan.domain_version, summary: plan.summary } } : {}),
          openRequests: openRequests.map((request) => ({ id: request.id, request_type: request.request_type })),
          decisionIds: decisions.map((decision) => decision.id),
          feedbackIds,
          timelineEventIds: timeline.events.map((event) => event.event_id)
        });
        return parseChangeRoomResult({ ok: true, room });
      });
    } catch (error) {
      return domainError(
        this.#id(),
        "PROTOCOL_VALIDATION_FAILED",
        error instanceof Error ? error.message : "Change Room 投影不符合协议",
        "validation"
      );
    }
  }

  getTimeline(changeId: string): TimelineResult | DomainError {
    const change = this.#store.getChange(changeId);
    if (!change) {
      return domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found", false, {
        id_or_key: changeId
      });
    }
    try {
      return parseTimelineResult(new ReadModelBuilder().buildTimeline(this.#store.listEvents(), change.id));
    } catch (error) {
      return domainError(
        this.#id(),
        "PROTOCOL_VALIDATION_FAILED",
        error instanceof Error ? error.message : "Timeline 投影不符合协议",
        "validation"
      );
    }
  }

  getDecisionRequest(requestId: InternalId): GetDecisionRequestResult | DomainError {
    return this.#store.transaction((transaction) => {
      const request = transaction.getDecisionRequest(requestId);
      if (!request) {
        return domainError(this.#id(), "DECISION_REQUEST_NOT_FOUND", "未找到指定 Decision Request", "not_found");
      }
      try {
        return parseGetDecisionRequestResult({ ok: true, request });
      } catch (error) {
        return domainError(
          this.#id(),
          "PROTOCOL_VALIDATION_FAILED",
          error instanceof Error ? error.message : "Decision Request 不符合协议",
          "validation"
        );
      }
    });
  }

  getWorkItem(id: InternalId): WorkItem | DomainError {
    const workItem = this.#store.transaction((transaction) => transaction.getWorkItem(id));
    return (
      workItem ?? domainError(this.#id(), "WORK_ITEM_NOT_FOUND", "未找到指定 Work Item", "not_found", false, { id })
    );
  }

  listWorkItemsByChange(changeId: InternalId): WorkItem[] {
    return this.#store.transaction((transaction) => transaction.listWorkItemsByChange(changeId));
  }

  listAgentRuns(workItemId: InternalId): AgentRunRecord[] {
    return this.#store.transaction((transaction) => transaction.listAgentRuns(workItemId));
  }

  getAgentRun(id: InternalId): AgentRunRecord | DomainError {
    const run = this.#store.transaction((transaction) => transaction.getAgentRun(id));
    return run ?? domainError(this.#id(), "RUN_NOT_FOUND", "未找到指定 Run", "not_found", false, { id });
  }

  getCapabilityBinding(id: InternalId): CapabilityBinding | DomainError {
    const binding = this.#store.transaction((transaction) => transaction.getCapabilityBinding(id));
    return binding ?? domainError(this.#id(), "BINDING_NOT_FOUND", "未找到指定 Capability Binding", "not_found");
  }

  getContextPackManifest(id: InternalId): ContextPackManifest | DomainError {
    const manifest = this.#store.transaction((transaction) => transaction.getContextPackManifest(id));
    return manifest ?? domainError(this.#id(), "CONTEXT_PACK_NOT_FOUND", "未找到指定 Context Pack", "not_found");
  }

  listOpenBlockers(changeId: InternalId): Blocker[] {
    return this.#store.transaction((transaction) => transaction.listOpenBlockers(changeId));
  }

  getCurrentContract(changeId: InternalId): ContractVersion | undefined {
    return this.#store.transaction((transaction) => transaction.getCurrentContract(changeId));
  }

  getCurrentPlan(changeId: InternalId): PlanVersion | undefined {
    return this.#store.transaction((transaction) => transaction.getCurrentPlan(changeId));
  }

  getLatestPolicySnapshot(projectId: InternalId): PolicySnapshot | undefined {
    return this.#store.transaction((transaction) => transaction.getLatestPolicySnapshot(projectId));
  }

  getArtifact(id: InternalId): Artifact | DomainError {
    const artifact = this.#store.transaction((transaction) => transaction.getArtifact(id));
    return artifact ?? domainError(this.#id(), "ARTIFACT_NOT_FOUND", "未找到指定 Artifact", "not_found", false, { id });
  }

  listArtifactsByChange(changeId: InternalId): Artifact[] {
    return this.#store.transaction((transaction) => transaction.listArtifactsByChange(changeId));
  }

  getActiveLeaseByWorkItem(workItemId: InternalId): Lease | undefined {
    return this.#store.transaction((transaction) => transaction.getActiveLeaseByWorkItem(workItemId));
  }

  getClaim(id: InternalId): Claim | DomainError {
    const claim = this.#store.transaction((transaction) => transaction.getClaim(id));
    return claim ?? domainError(this.#id(), "CLAIM_NOT_FOUND", "未找到指定 Claim", "not_found", false, { id });
  }

  listClaimsByChange(changeId: InternalId): Claim[] {
    return this.#store.transaction((transaction) => transaction.listClaimsByChange(changeId));
  }

  listEvidenceByChange(changeId: InternalId): Evidence[] {
    return this.#store.transaction((transaction) => transaction.listEvidenceByChange(changeId));
  }

  getIndependentEvaluation(id: InternalId): IndependentEvaluation | DomainError {
    const evaluation = this.#store.transaction((transaction) => transaction.getIndependentEvaluation(id));
    return (
      evaluation ??
      domainError(this.#id(), "EVALUATION_NOT_FOUND", "未找到指定 Independent Evaluation", "not_found", false, { id })
    );
  }

  listIndependentEvaluationsByChange(changeId: InternalId): IndependentEvaluation[] {
    return this.#store.transaction((transaction) => transaction.listIndependentEvaluationsByChange(changeId));
  }

  listClaimAssessmentsByEvaluation(evaluationId: InternalId): ClaimAssessment[] {
    return this.#store.transaction((transaction) => transaction.listClaimAssessmentsByEvaluation(evaluationId));
  }

  listRepairWorkItemLinksByChange(changeId: InternalId): RepairWorkItemLink[] {
    return this.#store.transaction((transaction) => transaction.listRepairWorkItemLinksByChange(changeId));
  }

  getLatestGateRequirementSet(changeId: InternalId) {
    return this.#store.transaction((transaction) => transaction.getLatestGateRequirementSet(changeId));
  }

  listImpactAssessmentsBySubject(subjectId: InternalId): ImpactAssessment[] {
    return this.#store.transaction((transaction) => transaction.listImpactAssessmentsBySubject(subjectId));
  }

  getEvidencePackage(changeId: InternalId): EvidencePackageShowResult | DomainError {
    const change = this.#store.getChange(changeId);
    if (!change) {
      return domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found", false, {
        id_or_key: changeId
      });
    }
    return this.#store.transaction((transaction) => {
      const claimIds = transaction.listClaimsByChange(change.id).map((item) => item.id);
      const evidenceIds = transaction.listEvidenceByChange(change.id).map((item) => item.id);
      const evaluationIds = transaction.listIndependentEvaluationsByChange(change.id).map((item) => item.id);
      const body = { claim_ids: claimIds, evidence_ids: evidenceIds, evaluation_ids: evaluationIds };
      const manifest: EvidencePackageManifest = {
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: change.project_id,
        change_id: change.id,
        package_kind: "test",
        claim_ids: claimIds,
        evidence_ids: evidenceIds,
        evaluation_ids: evaluationIds,
        digest: { algorithm: "sha256", value: requestDigest(body), subject: "evidence_package" },
        created_at: this.#now()
      };
      try {
        return parseEvidencePackageShowResult({ ok: true, package: manifest });
      } catch (error) {
        return domainError(
          this.#id(),
          "PROTOCOL_VALIDATION_FAILED",
          error instanceof Error ? error.message : "Evidence Package 不符合协议",
          "validation"
        );
      }
    });
  }

  getEvidence(id: InternalId): Evidence | DomainError {
    const evidence = this.#store.transaction((transaction) => transaction.getEvidence(id));
    return evidence ?? domainError(this.#id(), "EVIDENCE_NOT_FOUND", "未找到指定 Evidence", "not_found", false, { id });
  }

  listTasksByChange(changeId: InternalId): Task[] {
    return this.#store.transaction((transaction) => {
      const plan = transaction.getCurrentPlan(changeId);
      return plan ? transaction.listTasks(plan.plan_id, plan.domain_version) : [];
    });
  }

  #dispatch(transaction: StoreTransaction, command: AnyCommand): KernelResult {
    switch (command.command_type) {
      case "InitializeProject":
        return this.#initializeProject(transaction, command);
      case "CreateChange":
        return this.#createChange(transaction, command);
      case "PauseChange":
        return this.#pauseChange(transaction, command);
      case "ResumeChange":
        return this.#resumeChange(transaction, command);
      case "BootstrapSoloGovernance":
        return this.#bootstrapSoloGovernance(transaction, command);
      case "SubmitContractCandidate":
        return this.#submitContractCandidate(transaction, command);
      case "RequestIntentDecision":
        return this.#requestIntentDecision(transaction, command);
      case "SubmitDecision":
        return this.#submitDecision(transaction, command);
      case "SubmitPlanCandidate":
        return this.#submitPlanCandidate(transaction, command);
      case "RequestPlanDecision":
        return this.#requestPlanDecision(transaction, command);
      case "SubmitContractAmendment":
        return this.#submitContractAmendment(transaction, command);
      case "SubmitPlanAmendment":
        return this.#submitPlanAmendment(transaction, command);
      case "CreatePlanningWorkItem":
        return this.#createPlanningWorkItem(transaction, command);
      case "CreateExecutionWorkItems":
        return this.#createExecutionWorkItems(transaction, command);
      case "ClaimWorkItem":
        return this.#claimWorkItem(transaction, command);
      case "StartRun":
        return this.#startRun(transaction, command);
      case "HeartbeatRun":
        return this.#heartbeatRun(transaction, command);
      case "CompleteRun":
        return this.#completeRun(transaction, command);
      case "FailRun":
        return this.#failRun(transaction, command);
      case "CancelRun":
        return this.#cancelRun(transaction, command);
      case "ReclaimExpiredLease":
        return this.#reclaimExpiredLease(transaction, command);
      case "RecordSourceSnapshot":
        return this.#recordSourceSnapshot(transaction, command);
      case "RecordArtifact":
        return this.#recordArtifact(transaction, command);
      case "RecordEvidence":
        return this.#recordEvidence(transaction, command);
      case "PromoteTestResult":
        return this.#promoteTestResult(transaction, command);
      case "RequestEvaluation":
        return this.#requestEvaluation(transaction, command);
      case "CompleteEvaluation":
        return this.#completeEvaluation(transaction, command);
      case "AssessImpact":
        return this.#assessImpact(transaction, command);
      case "CreateRepairWorkItem":
        return this.#createRepairWorkItem(transaction, command);
      case "SubmitClaim":
        return this.#submitClaim(transaction, command);
      case "RegisterEnvironment":
      case "CreateRelease":
      case "RequestReleaseDecision":
      case "QueueDeployment":
      case "RecordOperationResult":
      case "RequestReconciliation":
      case "RecordReconciliation":
      case "AuthorizeRecovery":
      case "RecordRecovery":
        return domainError(
          command.correlation_id,
          "COMMAND_UNSUPPORTED",
          `暂不支持 ${command.command_type}`,
          "conflict"
        );
    }
  }

  #initializeProject(transaction: StoreTransaction, command: InitializeProjectCommand): KernelResult {
    if (transaction.getCurrentProject()) {
      return domainError(
        command.correlation_id,
        "PROJECT_ALREADY_INITIALIZED",
        "当前仓库已经初始化 CimiLoop Project",
        "conflict"
      );
    }

    const now = this.#now();
    const projectId = this.#id();
    const actorId = this.#id();
    const roleId = this.#id();
    const assignmentId = this.#id();
    const instanceId = this.#id();
    const project: Project = {
      schema_version: SCHEMA_VERSION,
      id: projectId,
      name: command.payload.name,
      repository_kind: command.payload.repository_kind,
      repository_path: command.payload.repository_path,
      instance_id: instanceId,
      created_at: now,
      revision: 1
    };
    const actor: Actor = {
      schema_version: SCHEMA_VERSION,
      id: actorId,
      actor_type: "human",
      display_name: command.payload.owner_name,
      ...(command.payload.owner_email ? { email: command.payload.owner_email } : {}),
      identity_source: "git_config",
      created_at: now,
      revision: 1
    };
    const role: Role = {
      schema_version: SCHEMA_VERSION,
      id: roleId,
      role_key: "project_owner",
      display_name: "项目负责人",
      created_at: now,
      revision: 1
    };
    const assignment: Assignment = {
      schema_version: SCHEMA_VERSION,
      id: assignmentId,
      project_id: projectId,
      actor_id: actorId,
      role_id: roleId,
      scope_type: "project",
      scope_id: projectId,
      effective_at: now,
      created_at: now,
      revision: 1
    };

    transaction.insertProject(project);
    transaction.insertActor(actor);
    transaction.insertRole(role);
    transaction.insertAssignment(assignment);
    const event = this.#appendEvent(transaction, {
      event_type: "ProjectInitialized",
      project_id: projectId,
      aggregate: { object_type: "project", id: projectId, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: actorId,
      command,
      payload: { project_name: project.name, repository_kind: project.repository_kind },
      occurred_at: now
    });
    return this.#success(command, { object_type: "project", id: projectId, domain_version: 1 }, 1, [event], {
      project,
      actor,
      assignment
    });
  }

  #createChange(transaction: StoreTransaction, command: Extract<AnyCommand, { command_type: "CreateChange" }>): KernelResult {
    const context = this.#requireProjectActor(transaction, command);
    if ("code" in context) return context;
    const now = this.#now();
    const change = createDraftChange({
      id: this.#id(),
      projectId: context.project.id,
      displayKey: transaction.nextChangeDisplayKey(context.project.id),
      title: command.payload.title,
      ownerActorId: context.actorId,
      source: command.source,
      now
    });
    transaction.insertChange(change);
    const event = this.#appendEvent(transaction, {
      event_type: "ChangeCreated",
      project_id: context.project.id,
      aggregate: { object_type: "change", id: change.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: context.actorId,
      command,
      payload: { display_key: change.display_key, lifecycle_state: change.lifecycle_state },
      occurred_at: now
    });
    return this.#success(command, { object_type: "change", id: change.id, domain_version: 1 }, 1, [event], { change });
  }

  #pauseChange(transaction: StoreTransaction, command: Extract<AnyCommand, { command_type: "PauseChange" }>): KernelResult {
    const loaded = this.#requireChangeContext(transaction, command);
    if ("code" in loaded) return loaded;
    if (loaded.change.operating_status === "Paused") {
      return domainError(command.correlation_id, "CHANGE_ALREADY_PAUSED", "Change 已处于暂停状态", "conflict");
    }
    const now = this.#now();
    const mutation = pauseDraftChange(loaded.change, command.payload.reason, {
      now,
      actorId: loaded.actorId,
      commandId: command.command_id,
      id: this.#id
    });
    transaction.updateChange(mutation.change, loaded.expectedRevision);
    transaction.insertTransition(mutation.transition);
    const event = this.#appendEvent(transaction, {
      event_type: "ChangePaused",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: mutation.change.id, domain_version: 1 },
      aggregate_revision: mutation.change.revision,
      actor_id: loaded.actorId,
      command,
      payload: { reason: command.payload.reason },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, mutation.change.revision, [event], { change: mutation.change });
  }

  #resumeChange(transaction: StoreTransaction, command: Extract<AnyCommand, { command_type: "ResumeChange" }>): KernelResult {
    const loaded = this.#requireChangeContext(transaction, command);
    if ("code" in loaded) return loaded;
    if (loaded.change.operating_status !== "Paused") {
      return domainError(command.correlation_id, "CHANGE_NOT_PAUSED", "Change 当前未暂停", "conflict");
    }
    const now = this.#now();
    const mutation = resumeDraftChange(loaded.change, {
      now,
      actorId: loaded.actorId,
      commandId: command.command_id,
      id: this.#id
    });
    transaction.updateChange(mutation.change, loaded.expectedRevision);
    transaction.insertTransition(mutation.transition);
    const event = this.#appendEvent(transaction, {
      event_type: "ChangeResumed",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: mutation.change.id, domain_version: 1 },
      aggregate_revision: mutation.change.revision,
      actor_id: loaded.actorId,
      command,
      payload: {},
      occurred_at: now
    });
    return this.#success(command, event.aggregate, mutation.change.revision, [event], { change: mutation.change });
  }

  #bootstrapSoloGovernance(
    transaction: StoreTransaction,
    command: BootstrapSoloGovernanceCommand
  ): KernelResult {
    if (command.source.origin === "agent") {
      return domainError(
        command.correlation_id,
        "HUMAN_ACTOR_REQUIRED",
        "Agent Actor 不能承担 Human Owner 或初始化治理角色",
        "forbidden"
      );
    }
    const context = this.#requireProjectActor(transaction, command);
    if ("code" in context) return context;
    if (
      command.payload.intent_owner_actor_id !== context.actorId ||
      command.payload.technical_owner_actor_id !== context.actorId
    ) {
      return domainError(
        command.correlation_id,
        "SOLO_OWNER_MISMATCH",
        "Solo 模式下 Intent Owner 与 Technical Owner 必须由当前 Human Actor 显式承担",
        "forbidden"
      );
    }
    const change = transaction.getChange(command.payload.change_id);
    if (!change || change.project_id !== context.project.id) {
      return domainError(command.correlation_id, "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found");
    }
    if (command.expected_revision !== change.revision) {
      return domainError(
        command.correlation_id,
        "REVISION_CONFLICT",
        "目标对象已被其他命令修改，请刷新后重试",
        "conflict",
        false,
        { current_revision: change.revision }
      );
    }
    if (transaction.getProjectPolicy(context.project.id)) {
      return domainError(
        command.correlation_id,
        "GOVERNANCE_ALREADY_INITIALIZED",
        "当前项目已经完成 Solo 治理初始化",
        "conflict"
      );
    }

    const now = this.#now();
    const ids: GovernanceIds = {
      changeOwnerRoleId: this.#id(),
      intentOwnerRoleId: this.#id(),
      technicalOwnerRoleId: this.#id(),
      changeOwnerAssignmentId: this.#id(),
      intentOwnerAssignmentId: this.#id(),
      technicalOwnerAssignmentId: this.#id(),
      policyId: this.#id(),
      snapshotId: this.#id(),
      featureProfileId: this.#id(),
      bugfixProfileId: this.#id(),
      incidentProfileId: this.#id()
    };
    const roles = createSoloRoles(ids, now);
    const assignments = createSoloAssignments(ids, context.project.id, context.actorId, now);
    const policy = createSoloPolicy(ids.policyId, context.project.id, now);
    const snapshot = createSoloPolicySnapshot(ids.snapshotId, policy, now);
    for (const role of roles) transaction.insertRole(role);
    for (const assignment of assignments) transaction.insertAssignment(assignment);
    transaction.insertProjectPolicy(policy);
    transaction.insertPolicySnapshot(snapshot);
    for (const profile of createBuiltInChangeProfiles(ids, context.project.id, now)) {
      transaction.insertChangeProfile(profile);
    }
    const event = this.#appendEvent(transaction, {
      event_type: "SoloGovernanceBootstrapped",
      project_id: context.project.id,
      aggregate: { object_type: "project", id: context.project.id, domain_version: 1 },
      aggregate_revision: context.project.revision,
      actor_id: context.actorId,
      command,
      payload: {
        change_id: change.id,
        policy_id: policy.id,
        policy_snapshot_id: snapshot.id,
        role_keys: roles.map((role) => role.role_key)
      },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, change.revision, [event], {
      change,
      roles,
      assignments,
      policy
    });
  }

  #submitContractCandidate(
    transaction: StoreTransaction,
    command: SubmitContractCandidateCommand
  ): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.target?.id);
    if ("code" in loaded) return loaded;
    if (!transaction.getProjectPolicy(loaded.project.id)) {
      return domainError(
        command.correlation_id,
        "GOVERNANCE_REQUIRED",
        "提交 Contract 前必须先完成 Solo 治理初始化",
        "conflict"
      );
    }
    const profiles = transaction.listChangeProfiles(loaded.project.id);
    if (!profiles.some((profile) => profile.profile_key === command.payload.profile_key)) {
      return domainError(
        command.correlation_id,
        "CHANGE_PROFILE_NOT_FOUND",
        "未找到指定 Change Profile",
        "not_found",
        false,
        { profile_key: command.payload.profile_key }
      );
    }
    try {
      validateRiskDimensions(command.payload.risk);
      validateKnowledgeImpact(command.payload.knowledge_impact);
    } catch (error) {
      return domainError(
        command.correlation_id,
        "CONTRACT_ASSESSMENT_INVALID",
        error instanceof Error ? error.message : "Risk 或 Knowledge Impact 不完整",
        "validation"
      );
    }

    const now = this.#now();
    const existingCandidate = transaction.getContractCandidateByChange(loaded.change.id);
    const candidateRevision = existingCandidate ? existingCandidate.revision + 1 : 1;
    const candidate = createContractCandidate(
      existingCandidate?.id ?? this.#id(),
      loaded.project.id,
      loaded.change.id,
      command.payload,
      now,
      candidateRevision
    );
    const existingRisk = transaction.getRiskProfileByChange(loaded.change.id);
    const riskProfile = createRiskProfile(
      existingRisk?.id ?? this.#id(),
      loaded.project.id,
      loaded.change.id,
      command.payload.risk,
      now,
      existingRisk ? existingRisk.revision + 1 : 1
    );
    const riskAssessment = createRiskAssessment(this.#id(), riskProfile, now);
    const existingKnowledge = transaction.getKnowledgeImpactAssessmentByChange(loaded.change.id);
    const knowledge = createKnowledgeImpactAssessment(
      existingKnowledge?.id ?? this.#id(),
      loaded.project.id,
      loaded.change.id,
      command.payload.knowledge_impact,
      now,
      existingKnowledge ? existingKnowledge.revision + 1 : 1
    );
    if (existingCandidate) {
      transaction.updateContractCandidate(candidate, existingCandidate.revision);
    } else {
      transaction.insertContractCandidate(candidate);
    }
    if (existingRisk) {
      transaction.updateRiskProfile(riskProfile, existingRisk.revision);
    } else {
      transaction.insertRiskProfile(riskProfile);
    }
    transaction.insertRiskAssessment(riskAssessment);
    if (existingKnowledge) {
      transaction.updateKnowledgeImpactAssessment(knowledge, existingKnowledge.revision);
    } else {
      transaction.insertKnowledgeImpactAssessment(knowledge);
    }
    const nextChange = { ...loaded.change, updated_at: now, revision: loaded.change.revision + 1 };
    transaction.updateChange(nextChange, loaded.expectedRevision);
    const event = this.#appendEvent(transaction, {
      event_type: "ContractCandidateSubmitted",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: nextChange.id, domain_version: 1 },
      aggregate_revision: nextChange.revision,
      actor_id: loaded.actorId,
      command,
      payload: {
        candidate_id: candidate.id,
        candidate_revision: candidate.revision,
        risk_assessment_id: riskAssessment.id,
        knowledge_assessment_id: knowledge.id
      },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], {
      candidate,
      risk_assessment: riskAssessment,
      knowledge_assessment: knowledge
    });
  }

  #requestIntentDecision(
    transaction: StoreTransaction,
    command: RequestIntentDecisionCommand
  ): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const facts = this.#collectIntentFacts(transaction, loaded.change, command.correlation_id);
    if ("code" in facts) return facts;
    const now = this.#now();
    for (const open of transaction.listOpenDecisionRequests()) {
      if (open.change_id === loaded.change.id && open.request_type === "intent") {
        transaction.updateDecisionRequest({ ...open, status: "expired", updated_at: now, revision: open.revision + 1 }, open.revision);
      }
    }
    const request = createDecisionRequest({
      id: this.#id(),
      projectId: loaded.project.id,
      changeId: loaded.change.id,
      requestType: "intent",
      requiredRoleKey: "intent_owner",
      candidateId: facts.candidate.id,
      candidateRevision: facts.candidate.revision,
      profileId: facts.profile.id,
      profileVersion: facts.profile.domain_version,
      riskAssessmentId: facts.riskAssessment.id,
      knowledgeAssessmentId: facts.knowledge.id,
      policySnapshotId: facts.snapshot.id,
      digest: facts.digest,
      now
    });
    transaction.insertDecisionRequest(request);
    const gate = this.#recordGate(transaction, loaded.change, "intent", "REQUIRE_HUMAN", facts.snapshot.id, facts.digest, now, request.id);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "IntentDecisionRequested",
      project_id: loaded.project.id,
      aggregate: { object_type: "decision_request", id: request.id, domain_version: 1 },
      aggregate_revision: request.revision,
      actor_id: loaded.actorId,
      command,
      payload: { change_id: loaded.change.id, request_id: request.id, gate_id: gate.id },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], { request });
  }

  #submitDecision(transaction: StoreTransaction, command: SubmitDecisionCommand): KernelResult {
    if (command.source.origin === "agent") {
      return domainError(
        command.correlation_id,
        "HUMAN_ACTOR_REQUIRED",
        "Agent Actor 不能提交正式 Human Decision",
        "forbidden"
      );
    }
    const context = this.#requireProjectActor(transaction, command);
    if ("code" in context) return context;
    const request = transaction.getDecisionRequest(command.payload.request_id);
    if (!request) {
      return domainError(command.correlation_id, "DECISION_REQUEST_NOT_FOUND", "未找到指定 Decision Request", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, request.change_id);
    if ("code" in loaded) return loaded;
    if (request.status !== "open") {
      return domainError(command.correlation_id, "DECISION_REQUEST_EXPIRED", "Decision Request 已过期或已结束", "conflict");
    }
    const roles = transaction.listRoles();
    const assignments = transaction.listAssignments(loaded.project.id);
    if (
      !actorHasRole(assignments, roles, loaded.actorId, command.payload.acting_role_id, request.required_role_key)
    ) {
      return domainError(
        command.correlation_id,
        "ROLE_NOT_ALLOWED",
        "当前 acting role 无权提交该 Decision",
        "forbidden"
      );
    }
    const facts =
      request.request_type === "plan"
        ? this.#collectPlanFacts(transaction, loaded.change, command.correlation_id)
        : this.#collectIntentFacts(transaction, loaded.change, command.correlation_id);
    if ("code" in facts) return facts;
    if (facts.digest !== request.digest.value) {
      transaction.updateDecisionRequest(
        { ...request, status: "expired", updated_at: this.#now(), revision: request.revision + 1 },
        request.revision
      );
      return domainError(command.correlation_id, "DECISION_REQUEST_EXPIRED", "输入已变化，原 Decision Request 已过期", "conflict");
    }
    if (
      command.payload.outcome === "approve" &&
      request.request_type === "intent" &&
      loaded.change.lifecycle_state === "Planned"
    ) {
      return domainError(
        command.correlation_id,
        "M1_AMENDMENT_AFTER_PLANNED_UNSUPPORTED",
        "M1 不允许在 Planned 之后批准 Contract Amendment",
        "conflict"
      );
    }

    const now = this.#now();
    const decision = createDecisionRecord({
      id: this.#id(),
      request,
      actorId: loaded.actorId,
      actingRoleId: command.payload.acting_role_id,
      outcome: command.payload.outcome,
      reason: command.payload.reason,
      now
    });
    transaction.insertDecision(decision);
    for (const feedback of createFeedbackRecords(command.payload.feedback, decision, () => this.#id())) {
      transaction.insertFeedback(feedback);
    }
    transaction.updateDecisionRequest(
      { ...request, status: "decided", updated_at: now, revision: request.revision + 1 },
      request.revision
    );

    const gateFacts = {
      hasCompleteCandidate: true,
      hasHumanApproval: command.payload.outcome === "approve",
      digestMatches: true,
      rejected: command.payload.outcome === "reject"
    };
    const gateResult =
      request.request_type === "plan" ? evaluatePlanGate(gateFacts) : evaluateIntentGate(gateFacts);
    const gate = this.#recordGate(
      transaction,
      loaded.change,
      request.request_type,
      gateResult,
      facts.snapshot.id,
      facts.digest,
      now,
      request.id,
      decision.id
    );

    let nextChange = loaded.change;
    let contract: ContractVersion | undefined;
    let plan: PlanVersion | undefined;
    let tasks: Task[] | undefined;
    if (command.payload.outcome === "reject") {
      nextChange = {
        ...loaded.change,
        operating_status: "Paused",
        pause_reason: command.payload.reason,
        updated_at: now,
        revision: loaded.change.revision + 1
      };
      transaction.updateChange(nextChange, loaded.expectedRevision);
      this.#closeOpenAmendment(transaction, loaded.change.id, request.request_type, "rejected", now);
    } else if (command.payload.outcome === "request_changes") {
      nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    } else if (gateResult === "ALLOW" && request.request_type === "intent" && "profile_key" in facts.candidate) {
      const currentContract = transaction.getCurrentContract(loaded.change.id);
      contract = {
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        contract_id: currentContract?.contract_id ?? this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        domain_version: currentContract ? nextDomainVersion(currentContract.domain_version) : 1,
        candidate_id: facts.candidate.id,
        profile_key: facts.candidate.profile_key,
        intent: facts.candidate.intent,
        outcomes: facts.candidate.outcomes,
        scope: facts.candidate.scope,
        non_goals: facts.candidate.non_goals,
        acceptance: facts.candidate.acceptance,
        constraints: facts.candidate.constraints,
        created_at: now
      };
      transaction.insertContractVersion(contract);
      this.#expireOpenRequests(transaction, loaded.change.id, "plan", now);
      this.#closeOpenAmendment(transaction, loaded.change.id, "intent", "approved", now);
      nextChange = {
        ...loaded.change,
        lifecycle_state: "IntentReady",
        operating_status: "Active",
        updated_at: now,
        revision: loaded.change.revision + 1
      };
      transaction.updateChange(nextChange, loaded.expectedRevision);
      if (!currentContract) {
        transaction.insertTransition({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: loaded.project.id,
          change_id: loaded.change.id,
          command_id: command.command_id,
          transition_type: "lifecycle_changed",
          from_lifecycle: "Draft",
          to_lifecycle: "IntentReady",
          from_status: loaded.change.operating_status,
          to_status: "Active",
          gate_evaluation_id: gate.id,
          decision_id: decision.id,
          actor_id: loaded.actorId,
          occurred_at: now
        });
      }
    } else if (gateResult === "ALLOW" && request.request_type === "plan" && "tasks" in facts.candidate) {
      const currentPlan = transaction.getCurrentPlan(loaded.change.id);
      const planId = currentPlan?.plan_id ?? this.#id();
      const planVersion = currentPlan ? nextDomainVersion(currentPlan.domain_version) : 1;
      tasks = createPlanTasks(
        facts.candidate.tasks,
        () => this.#id(),
        loaded.project.id,
        loaded.change.id,
        planId,
        planVersion,
        now
      );
      plan = createPlanVersion(this.#id(), planId, facts.candidate, tasks, now, planVersion);
      for (const task of tasks) {
        transaction.insertTask(task);
      }
      transaction.insertPlanVersion(plan);
      this.#closeOpenAmendment(transaction, loaded.change.id, "plan", "approved", now);
      nextChange = {
        ...loaded.change,
        lifecycle_state: "Planned",
        operating_status: "Active",
        updated_at: now,
        revision: loaded.change.revision + 1
      };
      transaction.updateChange(nextChange, loaded.expectedRevision);
      if (!currentPlan) {
        transaction.insertTransition({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: loaded.project.id,
          change_id: loaded.change.id,
          command_id: command.command_id,
          transition_type: "lifecycle_changed",
          from_lifecycle: "IntentReady",
          to_lifecycle: "Planned",
          from_status: loaded.change.operating_status,
          to_status: "Active",
          gate_evaluation_id: gate.id,
          decision_id: decision.id,
          actor_id: loaded.actorId,
          occurred_at: now
        });
      }
    }

    const event = this.#appendEvent(transaction, {
      event_type: "DecisionSubmitted",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: nextChange.id, domain_version: 1 },
      aggregate_revision: nextChange.revision,
      actor_id: loaded.actorId,
      command,
      payload: {
        request_id: request.id,
        decision_id: decision.id,
        outcome: decision.outcome,
        gate_result: gate.result,
        contract_version: contract?.domain_version,
        plan_version: plan?.domain_version
      },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], {
      decision,
      change: nextChange,
      gate,
      ...(contract ? { contract } : {}),
      ...(plan ? { plan, tasks } : {})
    });
  }

  #requestPlanDecision(
    transaction: StoreTransaction,
    command: RequestPlanDecisionCommand
  ): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    if (loaded.change.lifecycle_state !== "IntentReady" && loaded.change.lifecycle_state !== "Planned") {
      return domainError(
        command.correlation_id,
        "CHANGE_NOT_INTENT_READY",
        "只有 IntentReady 或 Planned 的 Change 可以请求 Plan Decision",
        "conflict"
      );
    }
    const facts = this.#collectPlanFacts(transaction, loaded.change, command.correlation_id);
    if ("code" in facts) return facts;
    const now = this.#now();
    for (const open of transaction.listOpenDecisionRequests()) {
      if (open.change_id === loaded.change.id && open.request_type === "plan") {
        transaction.updateDecisionRequest(
          { ...open, status: "expired", updated_at: now, revision: open.revision + 1 },
          open.revision
        );
      }
    }
    const request = createDecisionRequest({
      id: this.#id(),
      projectId: loaded.project.id,
      changeId: loaded.change.id,
      requestType: "plan",
      requiredRoleKey: "technical_owner",
      candidateId: facts.candidate.id,
      candidateRevision: facts.candidate.revision,
      profileId: facts.profile.id,
      profileVersion: facts.profile.domain_version,
      riskAssessmentId: facts.riskAssessment.id,
      knowledgeAssessmentId: facts.knowledge.id,
      policySnapshotId: facts.snapshot.id,
      digest: facts.digest,
      now
    });
    transaction.insertDecisionRequest(request);
    const gate = this.#recordGate(
      transaction,
      loaded.change,
      "plan",
      "REQUIRE_HUMAN",
      facts.snapshot.id,
      facts.digest,
      now,
      request.id
    );
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "PlanDecisionRequested",
      project_id: loaded.project.id,
      aggregate: { object_type: "decision_request", id: request.id, domain_version: 1 },
      aggregate_revision: request.revision,
      actor_id: loaded.actorId,
      command,
      payload: { change_id: loaded.change.id, request_id: request.id, gate_id: gate.id },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], { request });
  }

  #submitPlanCandidate(transaction: StoreTransaction, command: SubmitPlanCandidateCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.target?.id);
    if ("code" in loaded) return loaded;
    if (loaded.change.lifecycle_state !== "IntentReady") {
      return domainError(
        command.correlation_id,
        "CHANGE_NOT_INTENT_READY",
        "只有 IntentReady 的 Change 可以提交 Plan Candidate",
        "conflict"
      );
    }
    const contract = transaction.getCurrentContract(loaded.change.id);
    if (!contract) {
      return domainError(
        command.correlation_id,
        "CURRENT_CONTRACT_NOT_FOUND",
        "Plan 必须绑定当前正式 Contract Version",
        "conflict"
      );
    }
    const dag = validateTaskDag(command.payload.tasks);
    if (!dag.ok) {
      return domainError(
        command.correlation_id,
        dag.code,
        "Plan Task DAG 不合法",
        "validation",
        false,
        dag.cycle_task_ids ? { cycle_task_ids: dag.cycle_task_ids } : {}
      );
    }
    const knowledge = transaction.getKnowledgeImpactAssessmentByChange(loaded.change.id);
    if (!knowledge) {
      return domainError(
        command.correlation_id,
        "CONTRACT_ASSESSMENT_INVALID",
        "提交 Plan 前必须存在 Knowledge Impact Assessment",
        "validation"
      );
    }
    try {
      validateKnowledgeTasks(command.payload.tasks, knowledge.sources);
    } catch (error) {
      return domainError(
        command.correlation_id,
        "PLAN_KNOWLEDGE_TASK_REQUIRED",
        error instanceof Error ? error.message : "非 NoImpact 知识来源必须由 knowledge Task 覆盖",
        "validation"
      );
    }

    const now = this.#now();
    const existing = transaction.getPlanCandidateByChange(loaded.change.id);
    const candidate = createPlanCandidate(
      existing?.id ?? this.#id(),
      loaded.project.id,
      loaded.change.id,
      contract.contract_id,
      contract.domain_version,
      command.payload,
      now,
      existing ? existing.revision + 1 : 1
    );
    if (existing) {
      transaction.updatePlanCandidate(candidate, existing.revision);
    } else {
      transaction.insertPlanCandidate(candidate);
    }
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "PlanCandidateSubmitted",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: nextChange.id, domain_version: 1 },
      aggregate_revision: nextChange.revision,
      actor_id: loaded.actorId,
      command,
      payload: {
        candidate_id: candidate.id,
        candidate_revision: candidate.revision,
        contract_id: contract.contract_id,
        contract_version: contract.domain_version
      },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], { candidate });
  }

  #submitContractAmendment(
    transaction: StoreTransaction,
    command: SubmitContractAmendmentCommand
  ): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.target?.id);
    if ("code" in loaded) return loaded;
    if (loaded.change.lifecycle_state === "Planned") {
      return domainError(
        command.correlation_id,
        "M1_AMENDMENT_AFTER_PLANNED_UNSUPPORTED",
        "M1 不允许在 Planned 之后批准 Contract Amendment",
        "conflict"
      );
    }
    if (loaded.change.lifecycle_state !== "IntentReady") {
      return domainError(
        command.correlation_id,
        "CHANGE_NOT_INTENT_READY",
        "只有 IntentReady 的 Change 可以提交 Contract Amendment",
        "conflict"
      );
    }
    const currentContract = transaction.getCurrentContract(loaded.change.id);
    if (!currentContract) {
      return domainError(
        command.correlation_id,
        "CURRENT_CONTRACT_NOT_FOUND",
        "Contract Amendment 必须基于当前正式 Contract Version",
        "conflict"
      );
    }
    if (command.payload.base_version !== currentContract.domain_version) {
      return domainError(
        command.correlation_id,
        "AMENDMENT_BASE_STALE",
        "Contract Amendment 的 base_version 已过期",
        "conflict",
        false,
        { current_version: currentContract.domain_version }
      );
    }
    try {
      validateRiskDimensions(command.payload.risk);
      validateKnowledgeImpact(command.payload.knowledge_impact);
    } catch (error) {
      return domainError(
        command.correlation_id,
        "CONTRACT_ASSESSMENT_INVALID",
        error instanceof Error ? error.message : "Risk 或 Knowledge Impact 不完整",
        "validation"
      );
    }

    const now = this.#now();
    this.#closeOpenAmendment(transaction, loaded.change.id, "intent", "withdrawn", now);
    const existingCandidate = transaction.getContractCandidateByChange(loaded.change.id);
    const candidate = createContractCandidate(
      existingCandidate?.id ?? this.#id(),
      loaded.project.id,
      loaded.change.id,
      command.payload,
      now,
      existingCandidate ? existingCandidate.revision + 1 : 1
    );
    const existingRisk = transaction.getRiskProfileByChange(loaded.change.id);
    const riskProfile = createRiskProfile(
      existingRisk?.id ?? this.#id(),
      loaded.project.id,
      loaded.change.id,
      command.payload.risk,
      now,
      existingRisk ? existingRisk.revision + 1 : 1
    );
    const riskAssessment = createRiskAssessment(this.#id(), riskProfile, now);
    const existingKnowledge = transaction.getKnowledgeImpactAssessmentByChange(loaded.change.id);
    const knowledge = createKnowledgeImpactAssessment(
      existingKnowledge?.id ?? this.#id(),
      loaded.project.id,
      loaded.change.id,
      command.payload.knowledge_impact,
      now,
      existingKnowledge ? existingKnowledge.revision + 1 : 1
    );
    const amendment = createContractAmendment(
      this.#id(),
      loaded.project.id,
      loaded.change.id,
      currentContract.contract_id,
      command.payload,
      now
    );
    if (existingCandidate) {
      transaction.updateContractCandidate(candidate, existingCandidate.revision);
    } else {
      transaction.insertContractCandidate(candidate);
    }
    if (existingRisk) {
      transaction.updateRiskProfile(riskProfile, existingRisk.revision);
    } else {
      transaction.insertRiskProfile(riskProfile);
    }
    transaction.insertRiskAssessment(riskAssessment);
    if (existingKnowledge) {
      transaction.updateKnowledgeImpactAssessment(knowledge, existingKnowledge.revision);
    } else {
      transaction.insertKnowledgeImpactAssessment(knowledge);
    }
    transaction.insertContractAmendment(amendment);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "ContractAmendmentSubmitted",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: nextChange.id, domain_version: 1 },
      aggregate_revision: nextChange.revision,
      actor_id: loaded.actorId,
      command,
      payload: {
        amendment_id: amendment.id,
        base_version: amendment.base_version,
        candidate_id: candidate.id
      },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], {
      candidate,
      risk_assessment: riskAssessment,
      knowledge_assessment: knowledge
    });
  }

  #submitPlanAmendment(transaction: StoreTransaction, command: SubmitPlanAmendmentCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.target?.id);
    if ("code" in loaded) return loaded;
    if (loaded.change.lifecycle_state !== "Planned") {
      return domainError(
        command.correlation_id,
        "CHANGE_NOT_PLANNED",
        "只有 Planned 的 Change 可以提交 Plan Amendment",
        "conflict"
      );
    }
    const currentPlan = transaction.getCurrentPlan(loaded.change.id);
    const contract = transaction.getCurrentContract(loaded.change.id);
    if (!currentPlan || !contract) {
      return domainError(
        command.correlation_id,
        "CURRENT_PLAN_NOT_FOUND",
        "Plan Amendment 必须基于当前正式 Plan Version",
        "conflict"
      );
    }
    if (command.payload.base_version !== currentPlan.domain_version) {
      return domainError(
        command.correlation_id,
        "AMENDMENT_BASE_STALE",
        "Plan Amendment 的 base_version 已过期",
        "conflict",
        false,
        { current_version: currentPlan.domain_version }
      );
    }
    const dag = validateTaskDag(command.payload.tasks);
    if (!dag.ok) {
      return domainError(
        command.correlation_id,
        dag.code,
        "Plan Task DAG 不合法",
        "validation",
        false,
        dag.cycle_task_ids ? { cycle_task_ids: dag.cycle_task_ids } : {}
      );
    }
    const knowledge = transaction.getKnowledgeImpactAssessmentByChange(loaded.change.id);
    if (!knowledge) {
      return domainError(
        command.correlation_id,
        "CONTRACT_ASSESSMENT_INVALID",
        "提交 Plan Amendment 前必须存在 Knowledge Impact Assessment",
        "validation"
      );
    }
    try {
      validateKnowledgeTasks(command.payload.tasks, knowledge.sources);
    } catch (error) {
      return domainError(
        command.correlation_id,
        "PLAN_KNOWLEDGE_TASK_REQUIRED",
        error instanceof Error ? error.message : "非 NoImpact 知识来源必须由 knowledge Task 覆盖",
        "validation"
      );
    }

    const now = this.#now();
    this.#closeOpenAmendment(transaction, loaded.change.id, "plan", "withdrawn", now);
    const existing = transaction.getPlanCandidateByChange(loaded.change.id);
    const candidate = createPlanCandidate(
      existing?.id ?? this.#id(),
      loaded.project.id,
      loaded.change.id,
      contract.contract_id,
      contract.domain_version,
      command.payload,
      now,
      existing ? existing.revision + 1 : 1
    );
    const amendment = createPlanAmendment(
      this.#id(),
      loaded.project.id,
      loaded.change.id,
      currentPlan.plan_id,
      contract.contract_id,
      contract.domain_version,
      command.payload,
      now
    );
    if (existing) {
      transaction.updatePlanCandidate(candidate, existing.revision);
    } else {
      transaction.insertPlanCandidate(candidate);
    }
    transaction.insertPlanAmendment(amendment);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "PlanAmendmentSubmitted",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: nextChange.id, domain_version: 1 },
      aggregate_revision: nextChange.revision,
      actor_id: loaded.actorId,
      command,
      payload: {
        amendment_id: amendment.id,
        base_version: amendment.base_version,
        candidate_id: candidate.id
      },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], { candidate });
  }

  #collectPlanFacts(transaction: StoreTransaction, change: Change, correlationId: InternalId) {
    const candidate = transaction.getPlanCandidateByChange(change.id);
    const contract = transaction.getCurrentContract(change.id);
    const knowledge = transaction.getKnowledgeImpactAssessmentByChange(change.id);
    const snapshot = transaction.getLatestPolicySnapshot(change.project_id);
    const policy = transaction.getProjectPolicy(change.project_id);
    const latestRisk = transaction.getLatestRiskAssessment(change.id);
    const profile = transaction
      .listChangeProfiles(change.project_id)
      .find((item) => item.profile_key === contract?.profile_key);
    if (!candidate || !contract || !knowledge || !snapshot || !policy || !profile || !latestRisk) {
      return domainError(
        correlationId,
        "PLAN_CANDIDATE_NOT_FOUND",
        "Plan Decision 缺少完整 Plan/Contract/Risk/Knowledge/Policy 输入",
        "validation"
      );
    }
    if (candidate.contract_id !== contract.contract_id || candidate.contract_version !== contract.domain_version) {
      return domainError(
        correlationId,
        "CURRENT_CONTRACT_NOT_FOUND",
        "Plan Candidate 必须精确绑定当前 Contract Version",
        "conflict"
      );
    }
    const dag = validateTaskDag(candidate.tasks);
    if (!dag.ok) {
      return domainError(
        correlationId,
        dag.code,
        "Plan Task DAG 不合法",
        "validation",
        false,
        dag.cycle_task_ids ? { cycle_task_ids: dag.cycle_task_ids } : {}
      );
    }
    try {
      validateKnowledgeTasks(candidate.tasks, knowledge.sources);
    } catch (error) {
      return domainError(
        correlationId,
        "PLAN_KNOWLEDGE_TASK_REQUIRED",
        error instanceof Error ? error.message : "非 NoImpact 知识来源必须由 knowledge Task 覆盖",
        "validation"
      );
    }
    const assignments = transaction.listAssignments(change.project_id);
    const roles = transaction.listRoles();
    const digest = computeDecisionRequestDigest({
      change_id: change.id,
      candidate_id: candidate.id,
      candidate_revision: candidate.revision,
      profile_id: profile.id,
      profile_version: profile.domain_version,
      risk_assessment_id: latestRisk.id,
      knowledge_assessment_id: knowledge.id,
      policy_snapshot_id: snapshot.id,
      required_role_key: policy.plan_required_role,
      scope: {
        contract_id: contract.contract_id,
        contract_version: contract.domain_version,
        task_keys: candidate.tasks.map((task) => task.key).sort()
      },
      assignments: assignments.map((assignment) => ({
        actor_id: assignment.actor_id,
        role_key: roles.find((role) => role.id === assignment.role_id)?.role_key ?? "project_owner",
        scope_type: assignment.scope_type
      }))
    });
    return { candidate, knowledge, snapshot, policy, profile, riskAssessment: latestRisk, digest, contract };
  }

  #collectIntentFacts(transaction: StoreTransaction, change: Change, correlationId: InternalId) {
    const candidate = transaction.getContractCandidateByChange(change.id);
    const knowledge = transaction.getKnowledgeImpactAssessmentByChange(change.id);
    const snapshot = transaction.getLatestPolicySnapshot(change.project_id);
    const policy = transaction.getProjectPolicy(change.project_id);
    const profile = transaction
      .listChangeProfiles(change.project_id)
      .find((item) => item.profile_key === candidate?.profile_key);
    const latestRisk = transaction.getLatestRiskAssessment(change.id);
    if (!candidate || !knowledge || !snapshot || !policy || !profile || !latestRisk) {
      return domainError(
        correlationId,
        "CONTRACT_ASSESSMENT_INVALID",
        "Intent Decision 缺少完整 Contract/Risk/Knowledge/Policy 输入",
        "validation"
      );
    }
    const assignments = transaction.listAssignments(change.project_id);
    const roles = transaction.listRoles();
    const digest = computeDecisionRequestDigest({
      change_id: change.id,
      candidate_id: candidate.id,
      candidate_revision: candidate.revision,
      profile_id: profile.id,
      profile_version: profile.domain_version,
      risk_assessment_id: latestRisk.id,
      knowledge_assessment_id: knowledge.id,
      policy_snapshot_id: snapshot.id,
      required_role_key: policy.intent_required_role,
      scope: candidate.scope,
      assignments: assignments.map((assignment) => ({
        actor_id: assignment.actor_id,
        role_key: roles.find((role) => role.id === assignment.role_id)?.role_key ?? "project_owner",
        scope_type: assignment.scope_type
      }))
    });
    return { candidate, knowledge, snapshot, policy, profile, riskAssessment: latestRisk, digest };
  }

  #recordGate(
    transaction: StoreTransaction,
    change: Change,
    gateType: GateEvaluation["gate_type"],
    result: GateEvaluation["result"],
    policySnapshotId: InternalId,
    digestValue: string,
    now: string,
    requestId?: InternalId,
    decisionId?: InternalId
  ): GateEvaluation {
    const gate: GateEvaluation = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: change.project_id,
      change_id: change.id,
      gate_type: gateType,
      result,
      policy_snapshot_id: policySnapshotId,
      digest: { algorithm: "sha256", value: digestValue, subject: `${gateType}_gate` },
      created_at: now,
      ...(requestId ? { request_id: requestId } : {}),
      ...(decisionId ? { decision_id: decisionId } : {})
    };
    transaction.insertGateEvaluation(gate);
    return gate;
  }

  #expireOpenRequests(
    transaction: StoreTransaction,
    changeId: InternalId,
    requestType: "intent" | "plan",
    now: string
  ): void {
    for (const open of transaction.listOpenDecisionRequests()) {
      if (open.change_id === changeId && open.request_type === requestType) {
        transaction.updateDecisionRequest(
          { ...open, status: "expired", updated_at: now, revision: open.revision + 1 },
          open.revision
        );
      }
    }
  }

  #closeOpenAmendment(
    transaction: StoreTransaction,
    changeId: InternalId,
    kind: "intent" | "plan",
    status: "approved" | "rejected" | "withdrawn",
    now: string
  ): void {
    if (kind === "intent") {
      const amendment = transaction.getLatestContractAmendment(changeId);
      if (amendment && amendment.status === "open") {
        transaction.updateContractAmendment(
          { ...amendment, status, updated_at: now, revision: amendment.revision + 1 },
          amendment.revision
        );
      }
      return;
    }
    const amendment = transaction.getLatestPlanAmendment(changeId);
    if (amendment && amendment.status === "open") {
      transaction.updatePlanAmendment(
        { ...amendment, status, updated_at: now, revision: amendment.revision + 1 },
        amendment.revision
      );
    }
  }

  #createPlanningWorkItem(
    transaction: StoreTransaction,
    command: CreatePlanningWorkItemCommand
  ): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const existing = transaction
      .listWorkItemsByChange(loaded.change.id)
      .find((item) => item.kind === "planning");
    if (existing) {
      return this.#success(
        command,
        { object_type: "work_item", id: existing.id, domain_version: 1 },
        loaded.change.revision,
        [],
        { work_item: existing }
      );
    }
    if (loaded.change.lifecycle_state === "Planned" || loaded.change.lifecycle_state === "Executing") {
      return this.#success(
        command,
        { object_type: "change", id: loaded.change.id, domain_version: 1 },
        loaded.change.revision,
        [],
        { work_items: [] }
      );
    }
    if (loaded.change.lifecycle_state !== "IntentReady") {
      return domainError(command.correlation_id, "CHANGE_NOT_INTENT_READY", "只有 IntentReady Change 可以创建 Planning Work Item", "conflict");
    }
    const contract = transaction.getCurrentContract(loaded.change.id);
    const policy = transaction.getLatestPolicySnapshot(loaded.project.id);
    if (!contract || !policy) {
      return domainError(command.correlation_id, "GOVERNANCE_REQUIRED", "创建 Planning Work Item 需要当前 Contract 与 Policy Snapshot", "conflict");
    }
    const now = this.#now();
    const workItem = createPlanningWorkItem({
      id: this.#id(),
      projectId: loaded.project.id,
      changeId: loaded.change.id,
      contractId: contract.contract_id,
      contractVersion: contract.domain_version,
      policySnapshotId: policy.id,
      now
    });
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    transaction.insertWorkItem(workItem);
    const event = this.#appendEvent(transaction, {
      event_type: "PlanningWorkItemCreated",
      project_id: loaded.project.id,
      aggregate: { object_type: "work_item", id: workItem.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { work_item_id: workItem.id, change_id: loaded.change.id },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "work_item", id: workItem.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { work_item: workItem }
    );
  }

  #createExecutionWorkItems(
    transaction: StoreTransaction,
    command: CreateExecutionWorkItemsCommand
  ): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    if (loaded.change.lifecycle_state !== "Planned" && loaded.change.lifecycle_state !== "Executing") {
      return domainError(command.correlation_id, "CHANGE_NOT_PLANNED", "只有 Planned 或 Executing Change 可以创建 Execution Work Item", "conflict");
    }
    const contract = transaction.getCurrentContract(loaded.change.id);
    const plan = transaction.getCurrentPlan(loaded.change.id);
    const policy = transaction.getLatestPolicySnapshot(loaded.project.id);
    if (!contract || !plan || !policy) {
      return domainError(command.correlation_id, "CURRENT_PLAN_NOT_FOUND", "创建 Execution Work Item 需要当前 Contract、Plan 与 Policy Snapshot", "not_found");
    }
    const tasks = transaction.listTasks(plan.plan_id, plan.domain_version);
    const now = this.#now();
    for (const item of transaction.listWorkItemsByChange(loaded.change.id)) {
      if (item.kind !== "execution" || !isOpenExecutionStatus(item.status) || item.policy_snapshot_id === policy.id) {
        continue;
      }
      transaction.updateWorkItem(
        { ...item, status: "cancelled", updated_at: now, revision: item.revision + 1 },
        item.revision
      );
      const lease = transaction.getActiveLeaseByWorkItem(item.id);
      if (lease) {
        transaction.updateLease(
          { ...lease, status: "released", updated_at: now, revision: lease.revision + 1 },
          lease.revision
        );
      }
      const lock = transaction.getHeldResourceLock("worktree", `change/${loaded.change.id}`);
      if (lock && lock.holder_work_item_id === item.id) {
        transaction.updateResourceLock(
          { ...lock, status: "released", updated_at: now, revision: lock.revision + 1 },
          lock.revision
        );
      }
    }
    const existing = transaction.listWorkItemsByChange(loaded.change.id);
    const readyTasks = selectReadyTasks(loaded.change.lifecycle_state, tasks, existing, {
      has_open_blocker: transaction.listOpenBlockers(loaded.change.id).length > 0,
      has_contract: true,
      has_plan: true,
      has_policy_snapshot: true
    });
    const events: EventEnvelope[] = [];
    const created: WorkItem[] = readyTasks.map((task) => {
      const workItem = createExecutionWorkItem({
        id: this.#id(),
        projectId: loaded.project.id,
        changeId: loaded.change.id,
        contractId: contract.contract_id,
        contractVersion: contract.domain_version,
        planId: plan.plan_id,
        planVersion: plan.domain_version,
        taskId: task.id,
        policySnapshotId: policy.id,
        now
      });
      transaction.insertWorkItem(workItem);
      return workItem;
    });
    let nextChange = loaded.change;
    if (created.length > 0 && loaded.change.lifecycle_state === "Planned") {
      nextChange = {
        ...loaded.change,
        lifecycle_state: "Executing",
        operating_status: "Active",
        updated_at: now,
        revision: loaded.change.revision + 1
      };
      transaction.updateChange(nextChange, loaded.expectedRevision);
      transaction.insertTransition({
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        command_id: command.command_id,
        transition_type: "lifecycle_changed",
        from_lifecycle: "Planned",
        to_lifecycle: "Executing",
        from_status: loaded.change.operating_status,
        to_status: "Active",
        actor_id: loaded.actorId,
        occurred_at: now
      });
    } else {
      nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    }
    if (created.length > 0) {
      events.push(
        this.#appendEvent(transaction, {
          event_type: "ExecutionWorkItemsCreated",
          project_id: loaded.project.id,
          aggregate: { object_type: "change", id: loaded.change.id, domain_version: 1 },
          aggregate_revision: nextChange.revision,
          actor_id: loaded.actorId,
          command,
          payload: { work_item_ids: created.map((item) => item.id) },
          occurred_at: now
        })
      );
    }
    return this.#success(
      command,
      { object_type: "change", id: loaded.change.id, domain_version: 1 },
      nextChange.revision,
      events,
      { work_items: created, change: nextChange }
    );
  }

  #claimWorkItem(transaction: StoreTransaction, command: ClaimWorkItemCommand): KernelResult {
    const workItem = transaction.getWorkItem(command.payload.work_item_id);
    if (!workItem) {
      return domainError(command.correlation_id, "WORK_ITEM_NOT_FOUND", "未找到指定 Work Item", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, workItem.change_id);
    if ("code" in loaded) return loaded;
    if (transaction.getActiveLeaseByWorkItem(workItem.id)) {
      return domainError(command.correlation_id, "LEASE_CONFLICT", "Work Item 已被领取", "conflict");
    }
    if (workItem.status !== "ready") {
      return domainError(command.correlation_id, "WORK_ITEM_NOT_READY", "只有 ready Work Item 可以被领取", "conflict");
    }
    const resourceKey = `change/${loaded.change.id}`;
    const held = transaction.getHeldResourceLock("worktree", resourceKey);
    if (held && held.holder_work_item_id !== workItem.id) {
      return domainError(command.correlation_id, "RESOURCE_LOCK_CONFLICT", "资源锁已被占用", "conflict");
    }
    const now = this.#now();
    const expires = new Date(now);
    expires.setUTCMinutes(expires.getUTCMinutes() + 10);
    const lease: Lease = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      work_item_id: workItem.id,
      owner_actor_id: loaded.actorId,
      status: "active",
      acquired_at: now,
      expires_at: expires.toISOString(),
      created_at: now,
      updated_at: now,
      revision: 1
    };
    const lock: ResourceLock = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      resource_type: "worktree",
      resource_key: resourceKey,
      holder_work_item_id: workItem.id,
      status: "held",
      acquired_at: now,
      created_at: now,
      updated_at: now,
      revision: 1
    };
    const claimed: WorkItem = {
      ...workItem,
      status: "claimed",
      updated_at: now,
      revision: workItem.revision + 1
    };
    transaction.insertLease(lease);
    if (!held) transaction.insertResourceLock(lock);
    transaction.updateWorkItem(claimed, workItem.revision);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "WorkItemClaimed",
      project_id: loaded.project.id,
      aggregate: { object_type: "work_item", id: workItem.id, domain_version: 1 },
      aggregate_revision: claimed.revision,
      actor_id: loaded.actorId,
      command,
      payload: { work_item_id: workItem.id, lease_id: lease.id },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "work_item", id: workItem.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { work_item: claimed, lease }
    );
  }

  #startRun(transaction: StoreTransaction, command: StartRunCommand): KernelResult {
    const workItem = transaction.getWorkItem(command.payload.work_item_id);
    if (!workItem) {
      return domainError(command.correlation_id, "WORK_ITEM_NOT_FOUND", "未找到指定 Work Item", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, workItem.change_id);
    if ("code" in loaded) return loaded;
    if (workItem.status !== "claimed" && workItem.status !== "running") {
      return domainError(command.correlation_id, "WORK_ITEM_NOT_CLAIMED", "只有已领取的 Work Item 可以启动 Run", "conflict");
    }
    if (!transaction.getActiveLeaseByWorkItem(workItem.id)) {
      return domainError(command.correlation_id, "LEASE_CONFLICT", "启动 Run 需要有效 Lease", "conflict");
    }
    const existingRuns = transaction.listAgentRuns(workItem.id);
    if (hasActiveRun(existingRuns)) {
      return domainError(command.correlation_id, "RUN_ALREADY_ACTIVE", "同一 Work Item 已有未结束的 Run", "conflict");
    }
    const now = this.#now();
    const runId = this.#id();
    const pack = createContextPackForWorkItem({
      id: command.payload.context_pack_id,
      workItem,
      now
    });
    const provider =
      workItem.kind === "evaluation"
        ? createEvaluatorProvider({
            id: this.#id(),
            projectId: loaded.project.id,
            now
          })
        : createDefaultRuntimeProvider({
            id: this.#id(),
            projectId: loaded.project.id,
            now
          });
    const binding = createBindingForRun({
      id: command.payload.binding_id,
      workItem,
      runId,
      runtime: provider,
      now
    });
    const run = createStartedRun({
      id: runId,
      workItem,
      contextPackId: pack.id,
      bindingId: binding.id,
      attempt: nextRunAttempt(existingRuns),
      now
    });
    const nextWorkItem: WorkItem = {
      ...workItem,
      status: "running",
      updated_at: now,
      revision: workItem.revision + 1
    };
    transaction.insertContextPackManifest(pack);
    transaction.insertProviderDescriptor(provider);
    transaction.insertCapabilityBinding(binding);
    transaction.insertAgentRun(run);
    transaction.updateWorkItem(nextWorkItem, workItem.revision);
    const lease = transaction.getActiveLeaseByWorkItem(workItem.id);
    if (lease) {
      transaction.updateLease(
        { ...lease, owner_run_id: run.id, updated_at: now, revision: lease.revision + 1 },
        lease.revision
      );
    }
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "RunStarted",
      project_id: loaded.project.id,
      aggregate: { object_type: "agent_run", id: run.id, domain_version: 1 },
      aggregate_revision: run.revision,
      actor_id: loaded.actorId,
      command,
      payload: { run_id: run.id, work_item_id: workItem.id, attempt: run.attempt },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "agent_run", id: run.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { run }
    );
  }

  #heartbeatRun(transaction: StoreTransaction, command: HeartbeatRunCommand): KernelResult {
    return this.#transitionRun(transaction, command, command.payload.run_id, (run) => {
      if (run.status === "starting") {
        if (!allowedRunTransition(run.status, "running")) {
          return domainError(command.correlation_id, "INVALID_RUN_TRANSITION", "不允许的 Run 状态迁移", "conflict");
        }
        return { ...run, status: "running" };
      }
      if (run.status !== "running") {
        return domainError(command.correlation_id, "INVALID_RUN_TRANSITION", "只能对进行中的 Run 发送心跳", "conflict");
      }
      return run;
    }, "RunHeartbeat", { run_id: command.payload.run_id });
  }

  #completeRun(transaction: StoreTransaction, command: CompleteRunCommand): KernelResult {
    return this.#transitionRun(transaction, command, command.payload.run_id, (run) => {
      if (!allowedRunTransition(run.status, "completed")) {
        return domainError(command.correlation_id, "INVALID_RUN_TRANSITION", "不允许将 Run 标记为 completed", "conflict");
      }
      return {
        ...run,
        status: "completed" as const,
        summary: command.payload.summary,
        log_reference: command.payload.log_reference,
        log_digest: command.payload.log_digest,
        ended_at: this.#now()
      };
    }, "RunCompleted", { run_id: command.payload.run_id });
  }

  #failRun(transaction: StoreTransaction, command: FailRunCommand): KernelResult {
    const nextStatus = failStatusForCode(command.payload.failure_code);
    return this.#transitionRun(
      transaction,
      command,
      command.payload.run_id,
      (run) => {
        if (!allowedRunTransition(run.status, nextStatus)) {
          return domainError(command.correlation_id, "INVALID_RUN_TRANSITION", "不允许将 Run 标记为失败", "conflict");
        }
        const next = {
          ...run,
          status: nextStatus,
          summary: command.payload.summary,
          ended_at: this.#now()
        };
        return command.payload.log_reference && command.payload.log_digest
          ? { ...next, log_reference: command.payload.log_reference, log_digest: command.payload.log_digest }
          : next;
      },
      "RunFailed",
      { run_id: command.payload.run_id, failure_code: command.payload.failure_code },
      (transaction, run, now) => {
        transaction.insertBlocker({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: run.project_id,
          change_id: run.change_id,
          work_item_id: run.work_item_id,
          code: command.payload.failure_code,
          summary: command.payload.summary,
          status: "open",
          resolution_condition: "reconcile the runtime process before retrying",
          created_at: now,
          updated_at: now,
          revision: 1
        });
      }
    );
  }

  #cancelRun(transaction: StoreTransaction, command: CancelRunCommand): KernelResult {
    return this.#transitionRun(transaction, command, command.payload.run_id, (run) => {
      if (!allowedRunTransition(run.status, "cancelled")) {
        return domainError(command.correlation_id, "INVALID_RUN_TRANSITION", "不允许取消该 Run", "conflict");
      }
      return { ...run, status: "cancelled" as const, summary: command.payload.reason, ended_at: this.#now() };
    }, "RunCancelled", { run_id: command.payload.run_id });
  }

  #reclaimExpiredLease(transaction: StoreTransaction, command: ReclaimExpiredLeaseCommand): KernelResult {
    const lease = transaction.getLease(command.payload.lease_id);
    if (!lease) {
      return domainError(command.correlation_id, "LEASE_NOT_FOUND", "未找到指定 Lease", "not_found");
    }
    const workItem = transaction.getWorkItem(lease.work_item_id);
    if (!workItem) {
      return domainError(command.correlation_id, "WORK_ITEM_NOT_FOUND", "未找到指定 Work Item", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, workItem.change_id);
    if ("code" in loaded) return loaded;
    const now = this.#now();
    if (lease.status !== "active" || lease.expires_at > now) {
      return domainError(command.correlation_id, "LEASE_NOT_EXPIRED", "只能回收已过期的 Lease", "conflict");
    }
    const reclaimed: Lease = {
      ...lease,
      status: "reclaimed",
      updated_at: now,
      revision: lease.revision + 1
    };
    transaction.updateLease(reclaimed, lease.revision);
    if (workItem.status === "claimed" || workItem.status === "running") {
      transaction.updateWorkItem(
        { ...workItem, status: "ready", updated_at: now, revision: workItem.revision + 1 },
        workItem.revision
      );
    }
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "LeaseReclaimed",
      project_id: loaded.project.id,
      aggregate: { object_type: "lease", id: lease.id, domain_version: 1 },
      aggregate_revision: reclaimed.revision,
      actor_id: loaded.actorId,
      command,
      payload: { lease_id: lease.id, work_item_id: workItem.id },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "lease", id: lease.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { lease: reclaimed }
    );
  }

  #transitionRun(
    transaction: StoreTransaction,
    command: HeartbeatRunCommand | CompleteRunCommand | FailRunCommand | CancelRunCommand,
    runId: InternalId,
    update: (run: AgentRunRecord) => AgentRunRecord | DomainError,
    eventType: string,
    payload: Record<string, unknown>,
    after?: (transaction: StoreTransaction, run: AgentRunRecord, now: string) => void
  ): KernelResult {
    const run = transaction.getAgentRun(runId);
    if (!run) {
      return domainError(command.correlation_id, "RUN_NOT_FOUND", "未找到指定 Run", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, run.change_id);
    if ("code" in loaded) return loaded;
    const nextOrError = update(run);
    if ("code" in nextOrError) return nextOrError;
    const now = this.#now();
    const next: AgentRunRecord = {
      ...nextOrError,
      updated_at: now,
      revision: run.revision + 1
    };
    transaction.updateAgentRun(next, run.revision);
    after?.(transaction, next, now);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: eventType,
      project_id: loaded.project.id,
      aggregate: { object_type: "agent_run", id: run.id, domain_version: 1 },
      aggregate_revision: next.revision,
      actor_id: loaded.actorId,
      command,
      payload,
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "agent_run", id: run.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { run: next }
    );
  }

  #recordSourceSnapshot(transaction: StoreTransaction, command: RecordSourceSnapshotCommand): KernelResult {
    const run = transaction.getAgentRun(command.payload.run_id);
    if (!run) {
      return domainError(command.correlation_id, "RUN_NOT_FOUND", "未找到指定 Run", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, run.change_id);
    if ("code" in loaded) return loaded;
    if (!snapshotKindValid(command)) {
      return domainError(
        command.correlation_id,
        "SNAPSHOT_KIND_INVALID",
        "Source Snapshot 的 kind 与 dirty 标记不一致",
        "validation"
      );
    }
    const now = this.#now();
    const snapshot = createSourceSnapshot({ id: this.#id(), run, command, now });
    transaction.insertSourceSnapshot(snapshot);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "SourceSnapshotRecorded",
      project_id: loaded.project.id,
      aggregate: { object_type: "source_snapshot", id: snapshot.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { snapshot_id: snapshot.id, run_id: run.id, snapshot_kind: snapshot.snapshot_kind },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "source_snapshot", id: snapshot.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { snapshot }
    );
  }

  #recordArtifact(transaction: StoreTransaction, command: RecordArtifactCommand): KernelResult {
    const run = transaction.getAgentRun(command.payload.run_id);
    if (!run) {
      return domainError(command.correlation_id, "RUN_NOT_FOUND", "未找到指定 Run", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, run.change_id);
    if ("code" in loaded) return loaded;
    const snapshot = transaction.getSourceSnapshot(command.payload.source_snapshot_id);
    if (!snapshot) {
      return domainError(command.correlation_id, "SNAPSHOT_NOT_FOUND", "未找到指定 Source Snapshot", "not_found");
    }
    if (
      snapshot.run_id !== run.id ||
      run.context_pack_id !== command.payload.context_pack_id ||
      run.binding_id !== command.payload.binding_id
    ) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_PROVENANCE_MISMATCH",
        "Artifact 必须绑定同一 Run 的 Snapshot、Context 与 Binding",
        "validation"
      );
    }
    const workItem = transaction.getWorkItem(run.work_item_id);
    if (!workItem?.plan_id || !workItem.plan_version) {
      return domainError(command.correlation_id, "ARTIFACT_PLAN_REQUIRED", "Artifact 必须绑定 Plan", "validation");
    }
    if (!localReferenceExists(command.payload.content_reference)) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_REFERENCE_INVALID",
        "本地 Artifact 引用不存在",
        "validation"
      );
    }
    const now = this.#now();
    const artifact = createArtifact({
      id: this.#id(),
      run,
      workItem,
      snapshot,
      contextPackId: command.payload.context_pack_id,
      bindingId: command.payload.binding_id,
      digest: command.payload.digest,
      contentReference: command.payload.content_reference,
      summary: command.payload.summary,
      now
    });
    for (const existing of transaction.listArtifactsByChange(run.change_id)) {
      if (existing.work_item_id !== run.work_item_id || existing.status !== "candidate") continue;
      transaction.updateArtifact({ ...existing, status: "superseded" });
    }
    transaction.insertArtifact(artifact);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "ArtifactRecorded",
      project_id: loaded.project.id,
      aggregate: { object_type: "artifact", id: artifact.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: {
        artifact_id: artifact.id,
        run_id: run.id,
        source_snapshot_id: snapshot.id,
        digest: artifact.digest.value
      },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "artifact", id: artifact.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { artifact }
    );
  }

  #requestEvaluation(transaction: StoreTransaction, command: RequestEvaluationCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const artifact = transaction.getArtifact(command.payload.artifact_id);
    if (!artifact || artifact.change_id !== loaded.change.id) {
      return domainError(command.correlation_id, "ARTIFACT_NOT_FOUND", "评价需要已存在的 Artifact", "not_found");
    }
    if (
      artifact.digest.algorithm !== command.payload.artifact_digest.algorithm ||
      artifact.digest.value !== command.payload.artifact_digest.value
    ) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_DIGEST_MISMATCH",
        "评价必须绑定 Artifact 当前 Digest",
        "conflict"
      );
    }
    const requirementSet = transaction.getGateRequirementSet(command.payload.requirement_set_id);
    if (!requirementSet || requirementSet.change_id !== loaded.change.id) {
      return domainError(command.correlation_id, "REQUIREMENT_SET_NOT_FOUND", "评价需要已存在的 Requirement Set", "not_found");
    }
    const policy = transaction.getLatestPolicySnapshot(loaded.project.id);
    const now = this.#now();
    const workItem = createEvaluationWorkItem({
      id: this.#id(),
      projectId: loaded.project.id,
      changeId: loaded.change.id,
      contractId: artifact.contract_id,
      contractVersion: artifact.contract_version,
      policySnapshotId: policy?.id ?? requirementSet.policy_snapshot_id,
      artifactId: artifact.id,
      artifactDigest: artifact.digest,
      requirementSetId: requirementSet.id,
      now
    });
    transaction.insertWorkItem(workItem);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "EvaluationWorkItemCreated",
      project_id: loaded.project.id,
      aggregate: { object_type: "work_item", id: workItem.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: {
        work_item_id: workItem.id,
        artifact_id: artifact.id,
        artifact_digest: artifact.digest.value,
        requirement_set_id: requirementSet.id
      },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "work_item", id: workItem.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { work_item: workItem }
    );
  }

  #completeEvaluation(transaction: StoreTransaction, command: CompleteEvaluationCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const artifact = transaction.getArtifact(command.payload.artifact_id);
    if (!artifact || artifact.change_id !== loaded.change.id) {
      return domainError(command.correlation_id, "ARTIFACT_NOT_FOUND", "完成评价需要已存在的 Artifact", "not_found");
    }
    if (
      artifact.digest.algorithm !== command.payload.artifact_digest.algorithm ||
      artifact.digest.value !== command.payload.artifact_digest.value
    ) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_DIGEST_MISMATCH",
        "评价必须绑定 Artifact 当前 Digest",
        "conflict"
      );
    }
    const requirementSet = transaction.getGateRequirementSet(command.payload.requirement_set_id);
    if (!requirementSet || requirementSet.change_id !== loaded.change.id) {
      return domainError(command.correlation_id, "REQUIREMENT_SET_NOT_FOUND", "完成评价需要已存在的 Requirement Set", "not_found");
    }
    const claims = transaction.listClaimsByChange(loaded.change.id);
    const evidence = transaction.listEvidenceByChange(loaded.change.id);
    const validity: Record<string, EvidenceValidity> = {};
    for (const item of evidence) {
      const impacts = [
        ...transaction.listImpactAssessmentsBySubject(item.id),
        ...transaction.listImpactAssessmentsBySubject(item.subject_id)
      ].filter((impact, index, all) => all.findIndex((entry) => entry.id === impact.id) === index)
        .filter((impact) => impact.affected_ids.includes(item.id) || impact.subject_id === item.id);
      validity[item.id] = impacts.at(-1)?.new_validity ?? "Valid";
    }
    const assessed = claims.map((claim) => {
      const requirement = requirementSet.items.find((item) => item.claim_key === claim.claim_key);
      const related = evidence.filter((item) => item.claim_id === claim.id);
      return {
        claim,
        ...assessClaim({
          claim,
          ...(requirement ? { requirement } : {}),
          evidence: related,
          validity
        })
      };
    });
    const unresolvedRefutes = evidence.some(
      (item) => item.stance === "Refutes" && (validity[item.id] ?? "Valid") === "Valid"
    );
    const gate = evaluateEvidenceGate({
      assessments: assessed.map((item) => ({ claim: item.claim, result: item.result })),
      unresolvedRefutes
    });
    const inputDigest = evaluationInputDigest({
      artifactDigest: artifact.digest,
      requirementSetDigest: requirementSet.digest,
      evidenceDigests: evidence.map((item) => item.digest)
    });
    const reusable = findReusableEvaluation(
      transaction.listIndependentEvaluationsByChange(loaded.change.id),
      inputDigest
    );
    const now = this.#now();
    if (reusable) {
      const assessments = transaction.listClaimAssessmentsByEvaluation(reusable.id);
      const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
      const event = this.#appendEvent(transaction, {
        event_type: "EvaluationReused",
        project_id: loaded.project.id,
        aggregate: { object_type: "independent_evaluation", id: reusable.id, domain_version: 1 },
        aggregate_revision: 1,
        actor_id: loaded.actorId,
        command,
        payload: { evaluation_id: reusable.id, input_digest: inputDigest.value },
        occurred_at: now
      });
      return this.#success(
        command,
        { object_type: "independent_evaluation", id: reusable.id, domain_version: 1 },
        nextChange.revision,
        [event],
        { evaluation: reusable, assessments }
      );
    }
    const evaluation: IndependentEvaluation = {
      schema_version: SCHEMA_VERSION,
      id: command.payload.evaluation_id,
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      requirement_set_id: requirementSet.id,
      input_digest: inputDigest,
      result: gate.result,
      reason: gate.reason,
      created_at: now
    };
    transaction.insertIndependentEvaluation(evaluation);
    const assessments: ClaimAssessment[] = assessed
      .filter((item) => item.evidence_ids.length > 0)
      .map((item) => ({
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        claim_id: item.claim.id,
        evaluation_id: evaluation.id,
        result: item.result,
        evidence_ids: item.evidence_ids,
        digest: {
          algorithm: "sha256",
          value: requestDigest({
            claim_id: item.claim.id,
            result: item.result,
            evidence_ids: item.evidence_ids
          }),
          subject: "claim_assessment"
        },
        created_at: now
      }));
    for (const assessment of assessments) {
      transaction.insertClaimAssessment(assessment);
    }
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "EvaluationCompleted",
      project_id: loaded.project.id,
      aggregate: { object_type: "independent_evaluation", id: evaluation.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { evaluation_id: evaluation.id, result: evaluation.result },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "independent_evaluation", id: evaluation.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { evaluation, assessments }
    );
  }

  #assessImpact(transaction: StoreTransaction, command: AssessImpactCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const affected: Evidence[] = [];
    for (const id of command.payload.affected_ids) {
      const evidence = transaction.getEvidence(id);
      if (!evidence || evidence.change_id !== loaded.change.id) {
        return domainError(command.correlation_id, "EVIDENCE_NOT_FOUND", "影响评估只能针对已存在的 Evidence", "not_found");
      }
      const classified = classifyImpact({
        trigger: command.payload.trigger,
        binding: {
          subject_type: evidence.subject_type,
          subject_id: evidence.subject_id,
          subject_digest: evidence.subject_digest,
          ...(evidence.environment_ref ? { environment_ref: evidence.environment_ref } : {}),
          ...(evidence.context_pack_id ? { context_pack_id: evidence.context_pack_id } : {})
        },
        change: {
          subject_type: command.payload.subject_type,
          subject_id: command.payload.subject_id,
          old_digest: command.payload.old_input_digest,
          new_digest: command.payload.new_input_digest,
          replacement: command.payload.rule.includes("superseded"),
          integrity_broken: command.payload.rule.includes("integrity"),
          subject_mismatch: command.payload.rule.includes("mismatch"),
          source_unverified: command.payload.rule.includes("unverified")
        }
      });
      if (!classified.applies) {
        return domainError(
          command.correlation_id,
          "IMPACT_BINDING_MISMATCH",
          "影响评估只能作用于绑定了该变化主体的 Evidence",
          "conflict"
        );
      }
      affected.push(evidence);
    }
    const now = this.#now();
    const first = affected[0];
    const previous = first ? projectValidity(transaction.listImpactAssessmentsBySubject(first.id)) : "Valid";
    const impact: ImpactAssessment = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      trigger: command.payload.trigger,
      subject_type: command.payload.subject_type,
      subject_id: command.payload.subject_id,
      rule: command.payload.rule,
      old_input_digest: command.payload.old_input_digest,
      new_input_digest: command.payload.new_input_digest,
      old_validity: command.payload.old_validity ?? previous,
      new_validity: command.payload.new_validity,
      affected_ids: command.payload.affected_ids,
      created_at: now
    };
    transaction.insertImpactAssessment(impact);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "ImpactAssessed",
      project_id: loaded.project.id,
      aggregate: { object_type: "impact_assessment", id: impact.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: {
        impact_id: impact.id,
        rule: impact.rule,
        new_validity: impact.new_validity,
        affected_ids: impact.affected_ids
      },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "impact_assessment", id: impact.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { impact }
    );
  }

  #createRepairWorkItem(transaction: StoreTransaction, command: CreateRepairWorkItemCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const evidence = transaction.getEvidence(command.payload.failed_evidence_id);
    if (!evidence || evidence.change_id !== loaded.change.id || evidence.stance !== "Refutes") {
      return domainError(command.correlation_id, "REPAIR_EVIDENCE_NOT_REFUTED", "Repair 只能关联未解决的 Refutes Evidence", "conflict");
    }
    const source = transaction.getWorkItem(command.payload.source_work_item_id);
    if (!source || source.change_id !== loaded.change.id) {
      return domainError(command.correlation_id, "WORK_ITEM_NOT_FOUND", "Repair 需要原 Work Item", "not_found");
    }
    const artifact = transaction.getArtifact(command.payload.artifact_id);
    if (!artifact || artifact.change_id !== loaded.change.id) {
      return domainError(command.correlation_id, "ARTIFACT_NOT_FOUND", "Repair 需要保留原 Artifact", "not_found");
    }
    const policy = transaction.getLatestPolicySnapshot(loaded.project.id);
    const now = this.#now();
    const repair = createRepairWorkItem({
      id: this.#id(),
      projectId: loaded.project.id,
      changeId: loaded.change.id,
      contractId: artifact.contract_id,
      contractVersion: artifact.contract_version,
      planId: source.plan_id ?? artifact.plan_id,
      planVersion: source.plan_version ?? artifact.plan_version,
      taskId: command.payload.task_id,
      policySnapshotId: policy?.id ?? source.policy_snapshot_id,
      failedArtifactId: artifact.id,
      now
    });
    const link = createRepairWorkItemLink({
      id: this.#id(),
      projectId: loaded.project.id,
      changeId: loaded.change.id,
      failedEvidenceId: evidence.id,
      sourceWorkItemId: source.id,
      taskId: command.payload.task_id,
      artifactId: artifact.id,
      repairWorkItemId: repair.id,
      now
    });
    transaction.insertWorkItem(repair);
    transaction.insertRepairWorkItemLink(link);
    let nextChange = loaded.change;
    if (loaded.change.lifecycle_state !== "Executing") {
      nextChange = {
        ...loaded.change,
        lifecycle_state: "Executing",
        operating_status: "Active",
        updated_at: now,
        revision: loaded.change.revision + 1
      };
      transaction.updateChange(nextChange, loaded.expectedRevision);
      transaction.insertTransition({
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        command_id: command.command_id,
        transition_type: "lifecycle_changed",
        from_lifecycle: loaded.change.lifecycle_state,
        to_lifecycle: "Executing",
        from_status: loaded.change.operating_status,
        to_status: "Active",
        actor_id: loaded.actorId,
        occurred_at: now
      });
    } else {
      nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    }
    const event = this.#appendEvent(transaction, {
      event_type: "RepairWorkItemCreated",
      project_id: loaded.project.id,
      aggregate: { object_type: "repair_work_item_link", id: link.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: {
        repair_work_item_id: repair.id,
        failed_evidence_id: evidence.id,
        artifact_id: artifact.id
      },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "repair_work_item_link", id: link.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { repair_link: link }
    );
  }

  #submitClaim(transaction: StoreTransaction, command: SubmitClaimCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const now = this.#now();
    let requirementSetId = command.payload.requirement_set_id;
    if (!requirementSetId) {
      const existing = transaction.getLatestGateRequirementSet(loaded.change.id);
      const contract = transaction.getCurrentContract(loaded.change.id);
      const policy = transaction.getLatestPolicySnapshot(loaded.project.id);
      const risk = transaction.getLatestRiskAssessment(loaded.change.id);
      if (existing) {
        requirementSetId = existing.id;
      } else if (contract && policy && risk) {
        const requirementSet = resolveGateRequirementSet({
          id: this.#id(),
          now,
          version: 1,
          profile_key: contract.profile_key,
          policy,
          contract,
          risk
        });
        transaction.insertGateRequirementSet(requirementSet);
        requirementSetId = requirementSet.id;
      }
    }
    const claim: Claim = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      claim_key: command.payload.claim_key,
      statement: command.payload.statement,
      category: command.payload.category,
      obligation: command.payload.obligation,
      source: command.payload.source,
      contract_id:
        transaction.getCurrentContract(loaded.change.id)?.contract_id ??
        command.payload.artifact_id ??
        loaded.change.id,
      contract_version: transaction.getCurrentContract(loaded.change.id)?.domain_version ?? 1,
      created_at: now,
      ...(requirementSetId ? { requirement_set_id: requirementSetId } : {}),
      ...(command.payload.artifact_id ? { artifact_id: command.payload.artifact_id } : {}),
      ...(command.payload.artifact_digest ? { artifact_digest: command.payload.artifact_digest } : {})
    };
    transaction.insertClaim(claim);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "ClaimSubmitted",
      project_id: loaded.project.id,
      aggregate: { object_type: "claim", id: claim.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { claim_id: claim.id, claim_key: claim.claim_key },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "claim", id: claim.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { claim }
    );
  }

  #recordEvidence(transaction: StoreTransaction, command: RecordEvidenceCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const claim = transaction.getClaim(command.payload.claim_id);
    if (!claim || claim.change_id !== loaded.change.id) {
      return domainError(command.correlation_id, "EVIDENCE_CLAIM_NOT_FOUND", "记录 Evidence 需要已存在的 Claim", "not_found");
    }
    const now = this.#now();
    const evidence = createEvidenceFromCommand({ id: this.#id(), claim, command, now });
    transaction.insertEvidence(evidence);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "EvidenceRecorded",
      project_id: loaded.project.id,
      aggregate: { object_type: "evidence", id: evidence.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { evidence_id: evidence.id, claim_id: claim.id, stance: evidence.stance },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "evidence", id: evidence.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { evidence }
    );
  }

  #promoteTestResult(transaction: StoreTransaction, command: PromoteTestResultCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const claim = transaction.getClaim(command.payload.claim_id);
    if (!claim || claim.change_id !== loaded.change.id) {
      return domainError(command.correlation_id, "EVIDENCE_CLAIM_NOT_FOUND", "提升测试结果需要已存在的 Claim", "not_found");
    }
    const referenced = readPromotableReference(command.payload.content_reference);
    const parsed =
      referenced.kind === "contents"
        ? parseWhitelistedTestResult(command.payload.format, referenced.value)
        : { kind: "invalid" as const, reason: "unparseable" as const };
    const now = this.#now();
    const evidence: Evidence = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      claim_id: claim.id,
      stance: parsed.kind === "parsed" ? parsed.stance : "Inconclusive",
      subject_type: "artifact",
      subject_id: command.payload.artifact_id,
      subject_digest: command.payload.artifact_digest,
      content_reference: command.payload.content_reference,
      digest: command.payload.digest,
      producer_role: "deterministic_test",
      created_at: now,
      ...(command.payload.environment_ref ? { environment_ref: command.payload.environment_ref } : {})
    };
    transaction.insertEvidence(evidence);
    if (parsed.kind === "invalid") {
      const impact: ImpactAssessment = {
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        trigger: "artifact",
        subject_type: "evidence",
        subject_id: evidence.id,
        rule: "test_result_unparseable",
        old_input_digest: command.payload.digest,
        new_input_digest: command.payload.digest,
        old_validity: "Valid",
        new_validity: "Invalid",
        affected_ids: [evidence.id],
        created_at: now
      };
      transaction.insertImpactAssessment(impact);
    }
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "TestResultPromoted",
      project_id: loaded.project.id,
      aggregate: { object_type: "evidence", id: evidence.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { evidence_id: evidence.id, stance: evidence.stance, format: command.payload.format },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "evidence", id: evidence.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { evidence }
    );
  }

  #touchChange(transaction: StoreTransaction, change: Change, expectedRevision: number, now: string): Change {
    const next = { ...change, updated_at: now, revision: change.revision + 1 };
    transaction.updateChange(next, expectedRevision);
    return next;
  }

  #requireChangeForMutation(
    transaction: StoreTransaction,
    command: Exclude<AnyCommand, InitializeProjectCommand>,
    changeId: InternalId | undefined
  ): { project: Project; actorId: InternalId; change: Change; expectedRevision: number } | DomainError {
    const context = this.#requireProjectActor(transaction, command);
    if ("code" in context) return context;
    if (!changeId || command.expected_revision === undefined) {
      return domainError(
        command.correlation_id,
        "CHANGE_TARGET_REQUIRED",
        "修改 Change 必须提供目标和 expected_revision",
        "validation"
      );
    }
    const change = transaction.getChange(changeId);
    if (!change || change.project_id !== context.project.id) {
      return domainError(command.correlation_id, "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found");
    }
    if (change.revision !== command.expected_revision) {
      return domainError(
        command.correlation_id,
        "REVISION_CONFLICT",
        "目标对象已被其他命令修改，请刷新后重试",
        "conflict",
        false,
        { current_revision: change.revision }
      );
    }
    return { ...context, change, expectedRevision: command.expected_revision };
  }

  #requireProjectActor(
    transaction: StoreTransaction,
    command: Exclude<AnyCommand, InitializeProjectCommand>
  ): { project: Project; actorId: InternalId } | DomainError {
    if (!command.project_id || !command.actor_id) {
      return domainError(
        command.correlation_id,
        "COMMAND_CONTEXT_REQUIRED",
        "命令必须包含 project_id 与 actor_id",
        "validation"
      );
    }
    const project = transaction.getProject(command.project_id);
    if (!project) {
      return domainError(command.correlation_id, "PROJECT_NOT_FOUND", "未找到指定 Project", "not_found");
    }
    return { project, actorId: command.actor_id };
  }

  #requireChangeContext(
    transaction: StoreTransaction,
    command: Extract<AnyCommand, { command_type: "PauseChange" | "ResumeChange" }>
  ): { project: Project; actorId: InternalId; change: Change; expectedRevision: number } | DomainError {
    const context = this.#requireProjectActor(transaction, command);
    if ("code" in context) return context;
    if (!command.target || command.target.object_type !== "change" || command.expected_revision === undefined) {
      return domainError(
        command.correlation_id,
        "CHANGE_TARGET_REQUIRED",
        "修改 Change 必须提供目标和 expected_revision",
        "validation"
      );
    }
    const change = transaction.getChange(command.target.id);
    if (!change || change.project_id !== context.project.id) {
      return domainError(command.correlation_id, "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found");
    }
    if (change.owner_actor_id !== context.actorId) {
      return domainError(command.correlation_id, "CHANGE_OWNER_REQUIRED", "只有当前 Change Owner 可以执行该操作", "forbidden");
    }
    return { ...context, change, expectedRevision: command.expected_revision };
  }

  #appendEvent(
    transaction: StoreTransaction,
    input: {
      event_type: string;
      project_id: InternalId;
      aggregate: ProposedEvent["aggregate"];
      aggregate_revision: number;
      actor_id: InternalId;
      command: AnyCommand;
      payload: Record<string, unknown>;
      occurred_at: string;
    }
  ): EventEnvelope {
    const event = transaction.appendEvent({
      event_id: this.#id(),
      event_type: input.event_type,
      project_id: input.project_id,
      aggregate: input.aggregate,
      aggregate_revision: input.aggregate_revision,
      occurred_at: input.occurred_at,
      actor_id: input.actor_id,
      command_id: input.command.command_id,
      correlation_id: input.command.correlation_id,
      payload: input.payload
    });
    const outbox: OutboxMessage = {
      id: this.#id(),
      project_id: input.project_id,
      event_id: event.event_id,
      status: "pending",
      attempt_count: 0,
      available_at: input.occurred_at,
      created_at: input.occurred_at
    };
    transaction.enqueueOutbox(outbox);
    return event;
  }

  #success(
    command: AnyCommand,
    aggregate: CommandSuccess["aggregate"],
    revision: number,
    events: EventEnvelope[],
    data: CommandSuccess["data"]
  ): CommandSuccess {
    return {
      ok: true,
      command_id: command.command_id,
      correlation_id: command.correlation_id,
      aggregate,
      revision,
      events,
      data
    };
  }
}
