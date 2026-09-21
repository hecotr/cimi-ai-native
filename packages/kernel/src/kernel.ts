import { dirname } from "node:path";
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
  parseEnvironmentShowResult,
  parseReleaseShowResult,
  parseDeploymentShowResult,
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
  type RegisterEnvironmentCommand,
  type CreateReleaseCommand,
  type QueueDeploymentCommand,
  type RecordOperationResultCommand,
  type RequestReconciliationCommand,
  type RecordReconciliationCommand,
  type AuthorizeRecoveryCommand,
  type RecordRecoveryCommand,
  type RecordKnowledgeUpdateCommand,
  type ProposeCloseCommand,
  type CloseChangeCommand,
  type CancelChangeCommand,
  type SupersedeChangeCommand,
  type ArchiveChangeCommand,
  type CreateLearningCandidateCommand,
  type ExportManifest,
  type ExportProjectCommand,
  type StageImportCommand,
  type CommitImportCommand,
  type RevokeProjectPolicyCommand,
  type RequestReleaseDecisionCommand,
  type DecisionRequest,
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
  type SourceSnapshot,
  type Digest,
  type RecoveryStrategyDraft,
  type Deployment,
  type DeploymentAttempt,
  type Environment,
  type ExternalOperation,
  type RecoveryExecution,
  type Release,
  type KnowledgeUpdateEvidence,
  type ClosureEvaluation,
  type ArchiveRecord,
  type CancellationRecord,
  type SupersessionRecord
} from "@cimiloop/protocol";
import {
  StoreConflictError,
  type OutboxMessage,
  type PortableFact,
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
import { assessRequirementSet } from "./evidence/assessment.js";
import { evaluateEvidenceGate, evaluationInputDigest, findReusableEvaluation } from "./evidence/evaluation-gate.js";
import { classifyImpact, projectValidity } from "./evidence/impact.js";
import { createEvidenceFromCommand, producerRoleAllowedForOrigin } from "./evidence/ingest.js";
import { parseWhitelistedTestResult, readPromotableReference } from "./evidence/promotion.js";
import {
  classifyImportHistory,
  createImportReport,
  exportProjectBundle,
  PortableExportError,
  PortableImportError
} from "@cimiloop/portability";
import { evaluateKnowledgeClosureGate } from "./closure/gate.js";
import { createProposedLearningCandidate } from "./closure/learning.js";
import {
  collectKnowledgeObligations,
  evaluateKnowledgeObligation,
  isUnavailableReference
} from "./closure/knowledge.js";
import { evaluateCloseProposal, hasUnresolvedExternalSideEffects } from "./closure/terminal-actions.js";
import { createKnowledgeImpactAssessment, validateKnowledgeImpact } from "./knowledge-impact.js";
import { createPlanCandidate, createPlanTasks, createPlanVersion, validateKnowledgeTasks } from "./plan.js";
import { ReadModelBuilder } from "./read-models.js";
import { rebuildWorkbenchProjections } from "./read-model/builder.js";
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
import { createArtifact, localReferenceExists, resolveAuthorizedFileReference } from "./artifact.js";
import { createSourceSnapshot, snapshotKindValid } from "./source-snapshot.js";
import { createRepairWorkItem, createRepairWorkItemLink } from "./repair.js";
import { recoveryStrategyDigest, releaseAuthorizationDigest } from "./delivery/release.js";
import { releaseDecisionIsCurrent } from "./delivery/release-decision.js";
import {
  canPromoteProductionDigest,
  nextDeliveryOperationKind,
  productionNeedsRecovery
} from "./delivery/production.js";
import {
  conclusionToOperationState,
  redeployBlockedReason,
  reconciliationResolvesBlocker
} from "./delivery/reconciliation.js";
import { recoveryRequiresHuman, recoveryScopeExceeded } from "./delivery/recovery.js";
import { latestEvaluationAllowsArtifact, releaseDigestMatches } from "./delivery/test-gate.js";
import {
  authorizationDigest,
  createEvaluationWorkItem,
  createExecutionWorkItem,
  createPlanningWorkItem
} from "./work-item.js";
import {
  createBuiltInChangeProfiles,
  createSoloAssignments,
  createSoloPolicy,
  createSoloPolicySnapshot,
  createSoloRoles,
  type GovernanceIds
} from "./governance.js";
import { canAdvanceLifecycle, isTerminalLifecycle, type ChangeLifecycleState } from "./lifecycle.js";
import { createNodeKernelIo, type KernelIo } from "./io.js";
import { isPolicyRevoked, policyDigestInput, computePolicySnapshotDigest } from "./policy.js";

export type KernelResult = CommandSuccess | DomainError;

export interface KernelDependencies {
  store: ProjectStore;
  now?: () => string;
  id?: () => InternalId;
  io?: KernelIo;
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

const DORMANT_ALLOWED_COMMANDS = new Set(["ExportProject", "StageImport", "CommitImport"]);

export class CimiLoopKernel {
  readonly #store: ProjectStore;
  readonly #now: () => string;
  readonly #id: () => InternalId;
  readonly #io: KernelIo;
  #pendingStagingCleanup: string | undefined = undefined;

  constructor(dependencies: KernelDependencies) {
    this.#store = dependencies.store;
    this.#now = dependencies.now ?? defaultClock;
    this.#id = dependencies.id ?? createInternalId;
    this.#io = dependencies.io ?? createNodeKernelIo();
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
    if (command.command_type === "StageImport") {
      return this.#stageImportOutsideTransaction(command, digest);
    }
    try {
      const result = this.#store.transaction((transaction) => {
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

        const dispatched = this.#dispatch(transaction, command);
        if (!isDomainError(dispatched)) {
          transaction.saveCommandReceipt({
            command_id: command.command_id,
            request_digest: digest,
            result: dispatched,
            created_at: this.#now()
          });
        }
        return dispatched;
      });
      this.#cleanupCommittedStaging();
      return result;
    } catch (error) {
      this.#pendingStagingCleanup = undefined;
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
    const project = this.#store.getProject();
    if (!project) {
      return domainError(this.#id(), "PROJECT_NOT_INITIALIZED", "当前目录尚未初始化 CimiLoop Project", "not_found");
    }
    const ownership = this.#store.transaction((transaction) => transaction.getProjectRuntimeOwnership(project.id));
    return { ...project, runtime_ownership: ownership?.ownership ?? "active" };
  }

  getProjectRuntimeOwnership(projectId: InternalId) {
    return this.#store.transaction((transaction) => transaction.getProjectRuntimeOwnership(projectId));
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
        const releases = transaction.listReleasesByChange(change.id);
        const operations = transaction.listExternalOperationsByChange(change.id);
        const recoveries = releases.flatMap((release) => transaction.listRecoveryExecutionsByRelease(release.id));
        const blockers = transaction.listOpenBlockers(change.id);
        const room = new ReadModelBuilder().buildRoom({
          change,
          ...(contract ? { contract: { domain_version: contract.domain_version, intent: contract.intent } } : {}),
          ...(plan ? { plan: { domain_version: plan.domain_version, summary: plan.summary } } : {}),
          openRequests: openRequests.map((request) => ({ id: request.id, request_type: request.request_type })),
          decisionIds: decisions.map((decision) => decision.id),
          feedbackIds,
          timelineEventIds: timeline.events.map((event) => event.event_id),
          delivery: {
            unknownOperations: operations.filter((item) => item.state === "unknown").length,
            pendingOperations: operations.filter((item) => item.state === "pending").length,
            productionDrafted: releases.some((item) => item.kind === "production" && item.status === "drafted"),
            testReady: releases.some((item) => item.kind === "test" && (item.status === "authorized" || item.status === "verified")),
            recoveryRequiresHuman: recoveries.some((item) => item.status === "require_human"),
            productionVerificationFailed: blockers.some((item) => item.code === "PRODUCTION_VERIFICATION_FAILED")
          }
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

  getEnvironment(id: InternalId): Environment | DomainError {
    const environment = this.#store.transaction((transaction) => transaction.getEnvironment(id));
    return environment ?? domainError(this.#id(), "ENVIRONMENT_NOT_FOUND", "未找到指定 Environment", "not_found", false, { id });
  }

  listEnvironments(projectId: InternalId): Environment[] {
    return this.#store.transaction((transaction) => transaction.listEnvironments(projectId));
  }

  listOpenAttentionItems(projectId: InternalId) {
    return this.#store.transaction((transaction) => transaction.listOpenAttentionItems(projectId));
  }

  rebuildReadModels(projectId: InternalId) {
    return this.#store.transaction((transaction) =>
      rebuildWorkbenchProjections(transaction, {
        projectId,
        now: this.#now(),
        nextId: this.#id,
        eventSequence: this.#store.listEvents().at(-1)?.event_sequence ?? 0
      })
    );
  }

  acknowledgeAttention(attentionId: InternalId, _actorId: InternalId): void {
    this.#store.transaction((transaction) => {
      const item = transaction.getAttentionItem(attentionId);
      if (!item) return;
      transaction.updateAttentionItem(
        {
          ...item,
          status: "acknowledged",
          updated_at: this.#now(),
          revision: item.revision + 1
        },
        item.revision
      );
    });
  }

  getRelease(id: InternalId): Release | DomainError {
    const release = this.#store.transaction((transaction) => transaction.getRelease(id));
    return release ?? domainError(this.#id(), "RELEASE_NOT_FOUND", "未找到指定 Release", "not_found", false, { id });
  }

  listReleasesByChange(changeId: InternalId): Release[] {
    return this.#store.transaction((transaction) => transaction.listReleasesByChange(changeId));
  }

  getDeployment(id: InternalId): Deployment | DomainError {
    const deployment = this.#store.transaction((transaction) => transaction.getDeployment(id));
    return (
      deployment ?? domainError(this.#id(), "DEPLOYMENT_NOT_FOUND", "未找到指定 Deployment", "not_found", false, { id })
    );
  }

  listDeploymentsByRelease(releaseId: InternalId): Deployment[] {
    return this.#store.transaction((transaction) => transaction.listDeploymentsByRelease(releaseId));
  }

  listDeploymentAttempts(deploymentId: InternalId): DeploymentAttempt[] {
    return this.#store.transaction((transaction) => transaction.listDeploymentAttempts(deploymentId));
  }

  listExternalOperationsByChange(changeId: InternalId): ExternalOperation[] {
    return this.#store.transaction((transaction) => transaction.listExternalOperationsByChange(changeId));
  }

  listUnknownExternalOperations(): ExternalOperation[] {
    return this.#store.transaction((transaction) => transaction.listUnknownExternalOperations());
  }

  listRecoveryExecutionsByRelease(releaseId: InternalId): RecoveryExecution[] {
    return this.#store.transaction((transaction) => transaction.listRecoveryExecutionsByRelease(releaseId));
  }

  showEnvironment(id: InternalId) {
    const environment = this.getEnvironment(id);
    if ("code" in environment) return environment;
    try {
      return parseEnvironmentShowResult({ ok: true, environment });
    } catch (error) {
      return domainError(
        this.#id(),
        "PROTOCOL_VALIDATION_FAILED",
        error instanceof Error ? error.message : "Environment 不符合协议",
        "validation"
      );
    }
  }

  showRelease(id: InternalId) {
    const release = this.getRelease(id);
    if ("code" in release) return release;
    const packageId = release.package_id;
    const pack = packageId
      ? this.#store.transaction((transaction) => transaction.getReleasePackage(packageId))
      : undefined;
    try {
      return parseReleaseShowResult({ ok: true, release, ...(pack ? { package: pack } : {}) });
    } catch (error) {
      return domainError(
        this.#id(),
        "PROTOCOL_VALIDATION_FAILED",
        error instanceof Error ? error.message : "Release 不符合协议",
        "validation"
      );
    }
  }

  showDeployment(id: InternalId) {
    const deployment = this.getDeployment(id);
    if ("code" in deployment) return deployment;
    const attempts = this.listDeploymentAttempts(id);
    const operationId = deployment.current_operation_id;
    const operation = operationId
      ? this.#store.transaction((transaction) => transaction.getExternalOperation(operationId))
      : undefined;
    try {
      return parseDeploymentShowResult({
        ok: true,
        deployment,
        attempts,
        ...(operation ? { operation } : {})
      });
    } catch (error) {
      return domainError(
        this.#id(),
        "PROTOCOL_VALIDATION_FAILED",
        error instanceof Error ? error.message : "Deployment 不符合协议",
        "validation"
      );
    }
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
      case "RevokeProjectPolicy":
        return this.#revokeProjectPolicy(transaction, command);
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
        return this.#registerEnvironment(transaction, command);
      case "CreateRelease":
        return this.#createRelease(transaction, command);
      case "QueueDeployment":
        return this.#queueDeployment(transaction, command);
      case "RecordOperationResult":
        return this.#recordOperationResult(transaction, command);
      case "RequestReleaseDecision":
        return this.#requestReleaseDecision(transaction, command);
      case "RequestReconciliation":
        return this.#requestReconciliation(transaction, command);
      case "RecordReconciliation":
        return this.#recordReconciliation(transaction, command);
      case "AuthorizeRecovery":
        return this.#authorizeRecovery(transaction, command);
      case "RecordRecovery":
        return this.#recordRecovery(transaction, command);
      case "RecordKnowledgeUpdate":
        return this.#recordKnowledgeUpdate(transaction, command);
      case "ProposeClose":
        return this.#proposeClose(transaction, command);
      case "CloseChange":
        return this.#closeChange(transaction, command);
      case "CancelChange":
        return this.#cancelChange(transaction, command);
      case "SupersedeChange":
        return this.#supersedeChange(transaction, command);
      case "ArchiveChange":
        return this.#archiveChange(transaction, command);
      case "CreateLearningCandidate":
        return this.#createLearningCandidate(transaction, command);
      case "ExportProject":
        return this.#exportProject(transaction, command);
      case "StageImport":
        return this.#stageImport(transaction, command);
      case "CommitImport":
        return this.#commitImport(transaction, command);
    }
  }

  #unsupported(command: AnyCommand): KernelResult {
    return domainError(
      command.correlation_id,
      "COMMAND_UNSUPPORTED",
      `命令 ${command.command_type} 尚未实现`,
      "conflict"
    );
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
    if (this.#changeIsTerminal(transaction, loaded.change.id)) {
      return domainError(
        command.correlation_id,
        "CHANGE_ALREADY_TERMINAL",
        "已关闭、取消、取代或归档的 Change 不能再暂停",
        "conflict"
      );
    }
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
    if (this.#changeIsTerminal(transaction, loaded.change.id)) {
      return domainError(
        command.correlation_id,
        "CHANGE_ALREADY_TERMINAL",
        "已关闭、取消、取代或归档的 Change 不能恢复为 Active",
        "conflict"
      );
    }
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
      releaseOwnerRoleId: this.#id(),
      changeOwnerAssignmentId: this.#id(),
      intentOwnerAssignmentId: this.#id(),
      technicalOwnerAssignmentId: this.#id(),
      releaseOwnerAssignmentId: this.#id(),
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
      roles: transaction.listRoles(),
      assignments: transaction.listAssignments(context.project.id),
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
    const human = this.#requireHumanActor(transaction, command);
    if (human) return human;
    const context = this.#requireProjectActor(transaction, command);
    if ("code" in context) return context;
    const request = transaction.getDecisionRequest(command.payload.request_id);
    if (!request) {
      return domainError(command.correlation_id, "DECISION_REQUEST_NOT_FOUND", "未找到指定 Decision Request", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, request.change_id);
    if ("code" in loaded) return loaded;
    if (request.request_type === "release") {
      return this.#submitReleaseDecision(transaction, command, request, loaded);
    }
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
    const revoked = this.#requireActivePolicy(transaction, command, loaded.project.id);
    if (revoked) return revoked;
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
    const revoked = this.#requireActivePolicy(transaction, command, loaded.project.id);
    if (revoked) return revoked;
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
    const revoked = this.#requireActivePolicy(transaction, command, loaded.project.id);
    if (revoked) return revoked;
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
    const authorizedRoots = [loaded.project.repository_path];
    let contentReference = command.payload.content_reference;
    if (command.payload.content_reference.startsWith("file:")) {
      const resolved = resolveAuthorizedFileReference(command.payload.content_reference, authorizedRoots, this.#io);
      if (!resolved.ok) {
        return domainError(
          command.correlation_id,
          "ARTIFACT_REFERENCE_INVALID",
          "本地 Artifact 引用不在授权范围内",
          "validation"
        );
      }
      if (resolved.digest !== command.payload.digest.value) {
        return domainError(
          command.correlation_id,
          "ARTIFACT_DIGEST_MISMATCH",
          "Artifact digest 必须等于本地文件字节的 sha256",
          "validation"
        );
      }
      contentReference = resolved.storedReference;
    } else if (!localReferenceExists(command.payload.content_reference, authorizedRoots, this.#io)) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_REFERENCE_INVALID",
        "本地 Artifact 引用不在授权范围内",
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
      contentReference,
      summary: command.payload.summary,
      now
    });
    const predecessors = transaction
      .listArtifactsByChange(run.change_id)
      .filter((existing) => existing.work_item_id === run.work_item_id)
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
    const latest = predecessors.at(-1);
    transaction.insertArtifact(artifact);
    if (latest) {
      transaction.insertArtifactLineage({
        id: this.#id(),
        schema_version: SCHEMA_VERSION,
        predecessor_id: latest.id,
        successor_id: artifact.id,
        project_id: loaded.project.id,
        change_id: run.change_id,
        created_at: now
      });
    }
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
    const nextChange = this.#advanceLifecycle(
      transaction,
      loaded.change,
      loaded.expectedRevision,
      now,
      command,
      "Evaluating"
    );
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
    const assessed = assessRequirementSet({
      requirementSet,
      claims,
      evidence,
      validity
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
      const nextChange =
        reusable.result === "ALLOW"
          ? this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now)
          : this.#advanceLifecycle(transaction, loaded.change, loaded.expectedRevision, now, command, "Executing");
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
    const nextChange =
      evaluation.result === "ALLOW"
        ? this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now)
        : this.#advanceLifecycle(transaction, loaded.change, loaded.expectedRevision, now, command, "Executing");
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
    const authoritative = this.#authoritativeImpactDigests(transaction, command, loaded.change.id);
    if ("code" in authoritative) return authoritative;
    const affected: Evidence[] = [];
    let conclusion: { new_validity: ImpactAssessment["new_validity"]; rule: string } | undefined;
    for (const id of command.payload.affected_ids) {
      const evidence = transaction.getEvidence(id);
      if (!evidence || evidence.change_id !== loaded.change.id) {
        return domainError(command.correlation_id, "EVIDENCE_NOT_FOUND", "影响评估只能针对已存在的 Evidence", "not_found");
      }
      if (evidence.subject_digest.value !== authoritative.old.value) {
        return domainError(
          command.correlation_id,
          "IMPACT_SUBJECT_DIGEST_MISMATCH",
          "Impact old digest 必须等于 Evidence 已绑定主体的 digest",
          "conflict"
        );
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
          old_digest: authoritative.old,
          new_digest: authoritative.new
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
      if (command.payload.new_validity !== classified.new_validity) {
        return domainError(
          command.correlation_id,
          "IMPACT_CONCLUSION_MISMATCH",
          "Impact validity 必须由 Kernel 分类器决定，不能由调用方覆盖",
          "conflict"
        );
      }
      conclusion = { new_validity: classified.new_validity, rule: classified.rule };
      affected.push(evidence);
    }
    if (!conclusion) {
      return domainError(command.correlation_id, "EVIDENCE_NOT_FOUND", "影响评估只能针对已存在的 Evidence", "not_found");
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
      rule: conclusion.rule,
      old_input_digest: authoritative.old,
      new_input_digest: authoritative.new,
      old_validity: command.payload.old_validity ?? previous,
      new_validity: conclusion.new_validity,
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

  #requestReleaseDecision(transaction: StoreTransaction, command: RequestReleaseDecisionCommand): KernelResult {
    const human = this.#requireHumanActor(transaction, command);
    if (human) return human;
    const release = transaction.getRelease(command.payload.release_id);
    if (!release) {
      return domainError(command.correlation_id, "RELEASE_NOT_FOUND", "未找到指定 Release", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, release.change_id);
    if ("code" in loaded) return loaded;
    const revokedDecision = this.#requireActivePolicy(transaction, command, loaded.project.id);
    if (revokedDecision) return revokedDecision;
    if (release.kind !== "production") {
      return domainError(
        command.correlation_id,
        "RELEASE_DECISION_NOT_REQUIRED",
        "测试 Release 不走生产 Decision",
        "conflict"
      );
    }
    const now = this.#now();
    const request = createDecisionRequest({
      id: this.#id(),
      projectId: loaded.project.id,
      changeId: loaded.change.id,
      requestType: "release",
      requiredRoleKey: "release_owner",
      candidateId: release.id,
      candidateRevision: release.revision,
      profileId: release.policy_snapshot_id,
      profileVersion: 1,
      riskAssessmentId: release.recovery_strategy_id ?? release.id,
      knowledgeAssessmentId: release.package_id ?? release.id,
      policySnapshotId: release.policy_snapshot_id,
      digest: release.authorization_digest.value,
      now
    });
    transaction.insertDecisionRequest(request);
    const gate = this.#recordGate(
      transaction,
      loaded.change,
      "release",
      "REQUIRE_HUMAN",
      release.policy_snapshot_id,
      release.authorization_digest.value,
      now,
      request.id
    );
    const nextChange = this.#advanceLifecycle(
      transaction,
      loaded.change,
      loaded.expectedRevision,
      now,
      command,
      "ReleaseReady"
    );
    const event = this.#appendEvent(transaction, {
      event_type: "ReleaseDecisionRequested",
      project_id: loaded.project.id,
      aggregate: { object_type: "decision_request", id: request.id, domain_version: 1 },
      aggregate_revision: request.revision,
      actor_id: loaded.actorId,
      command,
      payload: { release_id: release.id, request_id: request.id, gate_id: gate.id },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], { request });
  }

  #submitReleaseDecision(
    transaction: StoreTransaction,
    command: SubmitDecisionCommand,
    request: DecisionRequest,
    loaded: { project: Project; actorId: InternalId; change: Change; expectedRevision: number }
  ): KernelResult {
    if (request.status !== "open") {
      return domainError(command.correlation_id, "DECISION_REQUEST_EXPIRED", "Decision Request 已过期或已结束", "conflict");
    }
    const roles = transaction.listRoles();
    const assignments = transaction.listAssignments(loaded.project.id);
    if (!actorHasRole(assignments, roles, loaded.actorId, command.payload.acting_role_id, request.required_role_key)) {
      return domainError(command.correlation_id, "ROLE_NOT_ALLOWED", "当前 acting role 无权提交该 Decision", "forbidden");
    }
    const release = transaction.getRelease(request.candidate_id);
    const liveDigest = release ? this.#releaseLiveDigest(transaction, release) : undefined;
    if (!release || !liveDigest || !releaseDecisionIsCurrent(request, release, liveDigest)) {
      transaction.updateDecisionRequest(
        { ...request, status: "expired", updated_at: this.#now(), revision: request.revision + 1 },
        request.revision
      );
      return domainError(command.correlation_id, "DECISION_REQUEST_EXPIRED", "Release 授权事实已变化，原 Decision Request 已过期", "conflict");
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
    transaction.updateDecisionRequest(
      { ...request, status: "decided", updated_at: now, revision: request.revision + 1 },
      request.revision
    );
    const gateResult =
      command.payload.outcome === "approve" ? "ALLOW" : command.payload.outcome === "reject" ? "DENY" : "REQUIRE_HUMAN";
    const gate = this.#recordGate(
      transaction,
      loaded.change,
      "release",
      gateResult,
      release.policy_snapshot_id,
      release.authorization_digest.value,
      now,
      request.id,
      decision.id
    );
    if (gateResult === "ALLOW") {
      transaction.updateRelease(
        {
          ...release,
          status: "authorized",
          decision_id: decision.id,
          updated_at: now,
          revision: release.revision + 1
        },
        release.revision
      );
    }
    const nextChange =
      gateResult === "ALLOW"
        ? this.#advanceLifecycle(transaction, loaded.change, loaded.expectedRevision, now, command, "ReleaseReady")
        : this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "ReleaseDecisionSubmitted",
      project_id: loaded.project.id,
      aggregate: { object_type: "decision", id: decision.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { release_id: release.id, decision_id: decision.id, outcome: command.payload.outcome, gate_id: gate.id },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], {
      decision,
      change: nextChange,
      gate
    });
  }

  #registerEnvironment(transaction: StoreTransaction, command: RegisterEnvironmentCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.target?.id);
    if ("code" in loaded) return loaded;
    if (transaction.getEnvironmentByKey(loaded.project.id, command.payload.environment_key)) {
      return domainError(command.correlation_id, "ENVIRONMENT_KEY_CONFLICT", "Environment key 已经注册", "conflict");
    }
    const now = this.#now();
    const environment = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      environment_key: command.payload.environment_key,
      kind: command.payload.kind,
      display_name: command.payload.display_name,
      owner_actor_id: loaded.actorId,
      adapter_ref: command.payload.adapter_ref,
      status: "active" as const,
      created_at: now,
      updated_at: now,
      revision: 1
    };
    transaction.insertEnvironment(environment);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "EnvironmentRegistered",
      project_id: loaded.project.id,
      aggregate: { object_type: "environment", id: environment.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { environment_key: environment.environment_key, kind: environment.kind },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "environment", id: environment.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { environment }
    );
  }

  #createRelease(transaction: StoreTransaction, command: CreateReleaseCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const revokedRelease = this.#requireActivePolicy(transaction, command, loaded.project.id);
    if (revokedRelease) return revokedRelease;
    const artifact = transaction.getArtifact(command.payload.artifact_id);
    if (
      !artifact ||
      artifact.change_id !== loaded.change.id ||
      artifact.digest.value !== command.payload.artifact_digest.value
    ) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_EVALUATION_NOT_ALLOWED",
        "只有通过 Independent Evaluation ALLOW 的 Artifact 可以创建测试 Release",
        "conflict"
      );
    }
    if (
      !latestEvaluationAllowsArtifact(
        transaction.listIndependentEvaluationsByChange(loaded.change.id),
        artifact.id,
        artifact.digest
      )
    ) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_EVALUATION_NOT_ALLOWED",
        "只有通过 Independent Evaluation ALLOW 的 Artifact 可以创建测试 Release",
        "conflict"
      );
    }
    const environment = transaction.getEnvironment(command.payload.environment_id);
    if (!environment || environment.project_id !== loaded.project.id) {
      return domainError(command.correlation_id, "ENVIRONMENT_NOT_FOUND", "未找到指定 Environment", "not_found");
    }
    if (environment.kind !== command.payload.kind) {
      return domainError(
        command.correlation_id,
        "RELEASE_KIND_ENVIRONMENT_MISMATCH",
        "Release kind 必须与 Environment kind 一致",
        "conflict"
      );
    }
    if (
      command.payload.kind === "production" &&
      !canPromoteProductionDigest(transaction.listReleasesByChange(loaded.change.id), artifact.digest)
    ) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_DIGEST_MISMATCH",
        "生产 Release 必须晋升已通过测试验证的同一 Artifact digest",
        "conflict"
      );
    }
    const now = this.#now();
    const releaseId = this.#id();
    const strategy = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      release_id: releaseId,
      ...command.payload.recovery,
      digest: recoveryStrategyDigest(command.payload.recovery),
      created_at: now
    };
    const evaluations = transaction.listIndependentEvaluationsByChange(loaded.change.id);
    const claims = transaction.listClaimsByChange(loaded.change.id);
    const evidence = transaction.listEvidenceByChange(loaded.change.id);
    const evidencePackageId = command.payload.evidence_package_id ?? this.#id();
    const releasePackageId = this.#id();
    const pack = {
      schema_version: SCHEMA_VERSION,
      id: evidencePackageId,
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      package_kind: command.payload.kind === "production" ? ("release" as const) : ("test" as const),
      claim_ids: claims.map((item) => item.id),
      evidence_ids: evidence.map((item) => item.id),
      evaluation_ids: evaluations.map((item) => item.id),
      digest: authorizationDigest(
        { claims: claims.map((item) => item.id), evidence: evidence.map((item) => item.id) },
        "evidence_package"
      ),
      created_at: now
    };
    const release = {
      schema_version: SCHEMA_VERSION,
      id: releaseId,
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      kind: command.payload.kind,
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      environment_id: environment.id,
      contract_id: artifact.contract_id,
      contract_version: artifact.contract_version,
      package_id: releasePackageId,
      recovery_strategy_id: strategy.id,
      evidence_package_id: pack.id,
      policy_snapshot_id: evaluations.at(-1)?.requirement_set_id
        ? (transaction.getGateRequirementSet(evaluations.at(-1)!.requirement_set_id)?.policy_snapshot_id ??
          artifact.contract_id)
        : artifact.contract_id,
      status: command.payload.kind === "test" ? ("authorized" as const) : ("drafted" as const),
      authorization_digest: this.#liveReleaseAuthorizationDigest(
        transaction,
        {
          change_id: loaded.change.id,
          artifact_id: artifact.id,
          artifact_digest: artifact.digest,
          environment_id: environment.id
        },
        command.payload.scope,
        command.payload.window,
        command.payload.recovery
      ),
      created_at: now,
      updated_at: now,
      revision: 1
    };
    const releasePackage = {
      schema_version: SCHEMA_VERSION,
      id: releasePackageId,
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      release_id: release.id,
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      environment_id: environment.id,
      evidence_package_id: pack.id,
      scope: command.payload.scope,
      window: command.payload.window,
      recovery_strategy_id: strategy.id,
      digest: authorizationDigest(
        { release_id: release.id, artifact: artifact.digest, scope: command.payload.scope },
        "release_package"
      ),
      created_at: now
    };
    transaction.insertRelease(release);
    transaction.insertRecoveryStrategy(strategy);
    transaction.insertEvidencePackageManifest(pack);
    transaction.insertReleasePackage(releasePackage);
    const nextChange =
      command.payload.kind === "production"
        ? this.#advanceLifecycle(transaction, loaded.change, loaded.expectedRevision, now, command, "ReleaseReady")
        : this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "ReleaseCreated",
      project_id: loaded.project.id,
      aggregate: { object_type: "release", id: release.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: {
        release_id: release.id,
        artifact_digest: artifact.digest.value,
        environment_id: environment.id
      },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "release", id: release.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { release, package: releasePackage, recovery_strategy: strategy }
    );
  }

  #queueDeployment(transaction: StoreTransaction, command: QueueDeploymentCommand): KernelResult {
    if (command.project_id) {
      const revokedEarly = this.#requireActivePolicy(transaction, command, command.project_id);
      if (revokedEarly) return revokedEarly;
    }
    const release = transaction.getRelease(command.payload.release_id);
    if (!release) {
      return domainError(command.correlation_id, "RELEASE_NOT_FOUND", "未找到指定 Release", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, release.change_id);
    if ("code" in loaded) return loaded;
    const revokedQueue = this.#requireActivePolicy(transaction, command, loaded.project.id);
    if (revokedQueue) return revokedQueue;
    if (release.environment_id !== command.payload.environment_id) {
      return domainError(command.correlation_id, "ENVIRONMENT_NOT_FOUND", "Deployment 必须绑定 Release 的 Environment", "conflict");
    }
    if (release.status !== "authorized" && release.status !== "queued" && release.status !== "deploying") {
      return domainError(command.correlation_id, "RELEASE_NOT_AUTHORIZED", "只有已授权 Release 可以排队部署", "conflict");
    }
    const blocked = redeployBlockedReason(
      transaction.listExternalOperationsByChange(loaded.change.id).filter((item) => item.release_id === release.id)
    );
    if (blocked) {
      return domainError(
        command.correlation_id,
        blocked,
        blocked === "EXTERNAL_OPERATION_UNKNOWN"
          ? "存在未知外部结果，必须先 Reconciliation，禁止再次部署"
          : "已核对的外部操作不可盲目重试部署",
        "conflict"
      );
    }
    if (
      release.kind === "production" &&
      !canPromoteProductionDigest(transaction.listReleasesByChange(loaded.change.id), release.artifact_digest)
    ) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_DIGEST_MISMATCH",
        "生产部署前必须再次核对已验证测试 Artifact digest",
        "conflict"
      );
    }
    if (
      !latestEvaluationAllowsArtifact(
        transaction.listIndependentEvaluationsByChange(loaded.change.id),
        release.artifact_id,
        release.artifact_digest
      )
    ) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_EVALUATION_NOT_ALLOWED",
        "部署前最新 Independent Evaluation 必须仍为 ALLOW",
        "conflict"
      );
    }
    const liveDigest = this.#releaseLiveDigest(transaction, release);
    if (!liveDigest || liveDigest.value !== release.authorization_digest.value) {
      return domainError(
        command.correlation_id,
        "RELEASE_AUTHORIZATION_EXPIRED",
        "Release 授权事实已变化，必须重新授权后才能部署",
        "conflict"
      );
    }
    const unresolvedRefutes = transaction
      .listEvidenceByChange(loaded.change.id)
      .some((item) => item.stance === "Refutes" && projectValidity(transaction.listImpactAssessmentsBySubject(item.id)) === "Valid");
    if (unresolvedRefutes) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_EVALUATION_NOT_ALLOWED",
        "未解决的 Refutes Evidence 阻止部署",
        "conflict"
      );
    }
    const now = this.#now();
    const existingOperations = transaction
      .listExternalOperationsByChange(loaded.change.id)
      .filter((item) => item.release_id === release.id);
    const operationKind = nextDeliveryOperationKind(existingOperations);
    const currentDeployment = transaction.listDeploymentsByRelease(release.id).at(-1);
    const deployment =
      operationKind === "deploy" || !currentDeployment
        ? {
            schema_version: SCHEMA_VERSION,
            id: this.#id(),
            project_id: loaded.project.id,
            change_id: loaded.change.id,
            release_id: release.id,
            environment_id: release.environment_id,
            artifact_digest: release.artifact_digest,
            status: "queued" as const,
            created_at: now,
            updated_at: now,
            revision: 1
          }
        : currentDeployment;
    const operationKey = `op:${operationKind}:${release.id}:${deployment.id}`;
    const attempt =
      operationKind === "status"
        ? undefined
        : {
            schema_version: SCHEMA_VERSION,
            id: this.#id(),
            project_id: loaded.project.id,
            change_id: loaded.change.id,
            deployment_id: deployment.id,
            attempt_kind: operationKind === "verify" ? ("verify" as const) : ("deploy" as const),
            operation_key: operationKey,
            artifact_digest: release.artifact_digest,
            requested_at: now,
            created_at: now
          };
    const operation = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      operation_key: operationKey,
      operation_kind: operationKind,
      environment_id: release.environment_id,
      release_id: release.id,
      deployment_id: deployment.id,
      artifact_digest: release.artifact_digest,
      state: "pending" as const,
      log_reference: "file://logs/pending.log",
      log_digest: authorizationDigest({ operation_key: operationKey }, `${operationKind}_log`),
      summary: `${operationKind} queued`,
      created_at: now,
      updated_at: now,
      revision: 1
    };
    if (operationKind === "deploy" || !currentDeployment) {
      transaction.insertDeployment({ ...deployment, current_operation_id: operation.id });
    } else {
      transaction.updateDeployment(
        {
          ...deployment,
          current_operation_id: operation.id,
          status: "in_progress",
          updated_at: now,
          revision: deployment.revision + 1
        },
        deployment.revision
      );
    }
    if (attempt) transaction.insertDeploymentAttempt(attempt);
    transaction.insertExternalOperation(operation);
    transaction.updateRelease(
      {
        ...release,
        status: operationKind === "deploy" ? "queued" : "deploying",
        updated_at: now,
        revision: release.revision + 1
      },
      release.revision
    );
    const nextChange = this.#advanceLifecycle(
      transaction,
      loaded.change,
      loaded.expectedRevision,
      now,
      command,
      release.kind === "production" ? "ProductionDeploying" : "TestDeploying"
    );
    const persistedDeployment =
      operationKind === "deploy" || !currentDeployment
        ? { ...deployment, current_operation_id: operation.id }
        : {
            ...deployment,
            current_operation_id: operation.id,
            status: "in_progress" as const,
            updated_at: now,
            revision: deployment.revision + 1
          };
    const event = this.#appendEvent(transaction, {
      event_type: "DeploymentQueued",
      project_id: loaded.project.id,
      aggregate: { object_type: "deployment", id: deployment.id, domain_version: 1 },
      aggregate_revision: persistedDeployment.revision,
      actor_id: loaded.actorId,
      command,
      payload: {
        deployment_id: deployment.id,
        operation_id: operation.id,
        operation_key: operationKey,
        operation_kind: operationKind
      },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "deployment", id: deployment.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { deployment: persistedDeployment, ...(attempt ? { attempt } : {}), operation }
    );
  }

  #recordOperationResult(transaction: StoreTransaction, command: RecordOperationResultCommand): KernelResult {
    const operation = transaction.getExternalOperation(command.payload.operation_id);
    if (!operation || operation.operation_key !== command.payload.operation_key) {
      return domainError(command.correlation_id, "OPERATION_NOT_FOUND", "未找到指定 External Operation", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, operation.change_id);
    if ("code" in loaded) return loaded;
    const release = transaction.getRelease(operation.release_id);
    const deployment = transaction.getDeployment(operation.deployment_id);
    if (!release || !deployment) {
      return domainError(command.correlation_id, "RELEASE_NOT_FOUND", "Operation 缺少 Release 或 Deployment", "not_found");
    }
    const now = this.#now();
    const nextOperation = {
      ...operation,
      state: command.payload.state,
      log_reference: command.payload.log_reference,
      log_digest: command.payload.log_digest,
      summary: command.payload.summary,
      updated_at: now,
      revision: operation.revision + 1
    };
    transaction.updateExternalOperation(nextOperation, operation.revision);
    if (command.payload.state === "unknown") {
      transaction.updateDeployment(
        { ...deployment, status: "unknown", updated_at: now, revision: deployment.revision + 1 },
        deployment.revision
      );
      if (
        !transaction
          .listOpenBlockers(loaded.change.id)
          .some((item) => item.code === "EXTERNAL_OPERATION_UNKNOWN")
      ) {
        transaction.insertBlocker({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: loaded.project.id,
          change_id: loaded.change.id,
          code: "EXTERNAL_OPERATION_UNKNOWN",
          summary: command.payload.summary,
          status: "open",
          resolution_condition: "reconcile the operation key before any further deploy",
          created_at: now,
          updated_at: now,
          revision: 1
        });
      }
    } else if (operation.operation_kind === "deploy" && command.payload.state === "succeeded") {
      if (!releaseDigestMatches(release, command.payload.actual_digest)) {
        const related = transaction
          .listEvidenceByChange(loaded.change.id)
          .filter((item) => item.subject_id === release.artifact_id)
          .map((item) => item.id);
        const impact = {
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: loaded.project.id,
          change_id: loaded.change.id,
          trigger: "artifact" as const,
          subject_type: "artifact" as const,
          subject_id: release.artifact_id,
          rule: "deployed_digest_mismatch",
          old_input_digest: release.artifact_digest,
          new_input_digest: command.payload.actual_digest ?? authorizationDigest({ missing: true }, "missing_digest"),
          old_validity: "Valid" as const,
          new_validity: "Invalid" as const,
          affected_ids: related.length > 0 ? related : [release.artifact_id],
          created_at: now
        };
        transaction.insertImpactAssessment(impact);
        transaction.insertBlocker({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: loaded.project.id,
          change_id: loaded.change.id,
          code: "DEPLOYMENT_DIGEST_MISMATCH",
          summary: command.payload.summary,
          status: "open",
          resolution_condition: "redeploy the authorized artifact digest",
          created_at: now,
          updated_at: now,
          revision: 1
        });
        transaction.updateDeployment(
          { ...deployment, status: "failed", updated_at: now, revision: deployment.revision + 1 },
          deployment.revision
        );
        transaction.updateRelease(
          { ...release, status: "failed", updated_at: now, revision: release.revision + 1 },
          release.revision
        );
      } else {
        transaction.updateDeployment(
          { ...deployment, status: "succeeded", updated_at: now, revision: deployment.revision + 1 },
          deployment.revision
        );
        transaction.updateRelease(
          { ...release, status: "deploying", updated_at: now, revision: release.revision + 1 },
          release.revision
        );
      }
    }
    if (operation.operation_kind === "status" || operation.operation_kind === "verify") {
      const environment = transaction.getEnvironment(release.environment_id);
      const digestMatches = releaseDigestMatches(release, command.payload.actual_digest);
      const needsRecovery = productionNeedsRecovery({
        state: command.payload.state,
        ...(command.payload.health ? { health: command.payload.health } : {}),
        ...(command.payload.core_path ? { core_path: command.payload.core_path } : {}),
        digest_matches: digestMatches
      });
      if (operation.operation_kind === "verify" || needsRecovery) {
        transaction.insertVerificationResult({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: loaded.project.id,
          change_id: loaded.change.id,
          deployment_id: deployment.id,
          environment_id: release.environment_id,
          expected_digest: release.artifact_digest,
          actual_digest: command.payload.actual_digest ?? release.artifact_digest,
          health: command.payload.health ?? "unknown",
          core_path: command.payload.core_path ?? "unknown",
          result: !digestMatches ? "invalid" : needsRecovery ? "fail" : "pass",
          digest: authorizationDigest(
            {
              deployment_id: deployment.id,
              actual: command.payload.actual_digest?.value ?? release.artifact_digest.value
            },
            "verification"
          ),
          created_at: now
        });
      }
      if (needsRecovery && environment?.kind === "production") {
        transaction.insertBlocker({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: loaded.project.id,
          change_id: loaded.change.id,
          code: "PRODUCTION_VERIFICATION_FAILED",
          summary: command.payload.summary,
          status: "open",
          resolution_condition: "execute the preauthorized recovery or request a human decision",
          created_at: now,
          updated_at: now,
          revision: 1
        });
        transaction.updateDeployment(
          { ...deployment, status: "failed", updated_at: now, revision: deployment.revision + 1 },
          deployment.revision
        );
        transaction.updateRelease(
          { ...release, status: "failed", updated_at: now, revision: release.revision + 1 },
          release.revision
        );
      } else if (needsRecovery) {
        const claims = transaction.listClaimsByChange(loaded.change.id);
        const claim = claims[0];
        if (claim && environment) {
          const failedEvidence = {
            schema_version: SCHEMA_VERSION,
            id: this.#id(),
            project_id: loaded.project.id,
            change_id: loaded.change.id,
            claim_id: claim.id,
            stance: "Refutes" as const,
            subject_type: "environment" as const,
            subject_id: environment.id,
            subject_digest: release.artifact_digest,
            content_reference: command.payload.log_reference,
            digest: command.payload.log_digest,
            producer_role: "deterministic_test" as const,
            environment_ref: environment.adapter_ref,
            created_at: now
          };
          transaction.insertEvidence(failedEvidence);
          const source = transaction
            .listWorkItemsByChange(loaded.change.id)
            .find((item) => item.id === (transaction.getArtifact(release.artifact_id)?.work_item_id ?? ""));
          const artifact = transaction.getArtifact(release.artifact_id);
          if (source && artifact) {
            const repair = createRepairWorkItem({
              id: this.#id(),
              projectId: loaded.project.id,
              changeId: loaded.change.id,
              contractId: artifact.contract_id,
              contractVersion: artifact.contract_version,
              planId: source.plan_id ?? artifact.plan_id,
              planVersion: source.plan_version ?? artifact.plan_version,
              taskId: source.task_id ?? source.id,
              policySnapshotId: source.policy_snapshot_id,
              failedArtifactId: artifact.id,
              now
            });
            const link = createRepairWorkItemLink({
              id: this.#id(),
              projectId: loaded.project.id,
              changeId: loaded.change.id,
              failedEvidenceId: failedEvidence.id,
              sourceWorkItemId: source.id,
              taskId: source.task_id ?? source.id,
              artifactId: artifact.id,
              repairWorkItemId: repair.id,
              now
            });
            transaction.insertWorkItem(repair);
            transaction.insertRepairWorkItemLink(link);
          }
        }
        transaction.updateRelease(
          { ...release, status: "failed", updated_at: now, revision: release.revision + 1 },
          release.revision
        );
      } else if (operation.operation_kind === "verify") {
        transaction.updateRelease(
          { ...release, status: "verified", updated_at: now, revision: release.revision + 1 },
          release.revision
        );
      }
    }
    const recordedDigestMatches = releaseDigestMatches(release, command.payload.actual_digest);
    const recordedNeedsRecovery = productionNeedsRecovery({
      state: command.payload.state,
      ...(command.payload.health ? { health: command.payload.health } : {}),
      ...(command.payload.core_path ? { core_path: command.payload.core_path } : {}),
      digest_matches: recordedDigestMatches
    });
    let nextLifecycle: ChangeLifecycleState | undefined;
    if (release.kind === "test" && operation.operation_kind === "deploy" && command.payload.state === "succeeded") {
      nextLifecycle = "TestValidating";
    } else if (
      release.kind === "test" &&
      operation.operation_kind === "verify" &&
      command.payload.state === "succeeded" &&
      !recordedNeedsRecovery
    ) {
      nextLifecycle = "ReleaseReady";
    } else if (release.kind === "test" && recordedNeedsRecovery) {
      nextLifecycle = "Executing";
    } else if (
      release.kind === "production" &&
      operation.operation_kind === "verify" &&
      command.payload.state === "succeeded" &&
      !recordedNeedsRecovery
    ) {
      nextLifecycle = "ReleaseVerified";
    }
    const nextChange = nextLifecycle
      ? this.#advanceLifecycle(transaction, loaded.change, loaded.expectedRevision, now, command, nextLifecycle)
      : this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "OperationResultRecorded",
      project_id: loaded.project.id,
      aggregate: { object_type: "external_operation", id: operation.id, domain_version: 1 },
      aggregate_revision: nextOperation.revision,
      actor_id: loaded.actorId,
      command,
      payload: { operation_id: operation.id, state: nextOperation.state },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "external_operation", id: operation.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { operation: nextOperation }
    );
  }

  #requestReconciliation(transaction: StoreTransaction, command: RequestReconciliationCommand): KernelResult {
    const operation = transaction.getExternalOperation(command.payload.operation_id);
    if (!operation) {
      return domainError(command.correlation_id, "OPERATION_NOT_FOUND", "未找到指定 External Operation", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, operation.change_id);
    if ("code" in loaded) return loaded;
    if (operation.state === "succeeded" || operation.state === "failed" || operation.state === "not_found") {
      return domainError(
        command.correlation_id,
        "RECONCILIATION_NOT_REQUIRED",
        "已确定的外部结果不需要再发起 Reconciliation",
        "conflict"
      );
    }
    const now = this.#now();
    let current = operation;
    if (operation.state === "pending") {
      current = { ...operation, state: "unknown", updated_at: now, revision: operation.revision + 1 };
      transaction.updateExternalOperation(current, operation.revision);
    }
    if (!transaction.listOpenBlockers(loaded.change.id).some((item) => item.code === "EXTERNAL_OPERATION_UNKNOWN")) {
      transaction.insertBlocker({
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        code: "EXTERNAL_OPERATION_UNKNOWN",
        summary: "external operation result is unknown",
        status: "open",
        resolution_condition: "reconcile the operation key before any further deploy",
        created_at: now,
        updated_at: now,
        revision: 1
      });
    }
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "ReconciliationRequested",
      project_id: loaded.project.id,
      aggregate: { object_type: "external_operation", id: current.id, domain_version: 1 },
      aggregate_revision: current.revision,
      actor_id: loaded.actorId,
      command,
      payload: { operation_id: current.id, operation_key: current.operation_key },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], { operation: current });
  }

  #recordReconciliation(transaction: StoreTransaction, command: RecordReconciliationCommand): KernelResult {
    const operation = transaction.getExternalOperation(command.payload.operation_id);
    if (!operation) {
      return domainError(command.correlation_id, "OPERATION_NOT_FOUND", "未找到指定 External Operation", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, operation.change_id);
    if ("code" in loaded) return loaded;
    const deployment = transaction.getDeployment(operation.deployment_id);
    const now = this.#now();
    const nextState = conclusionToOperationState(command.payload.conclusion);
    const reconciliation = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      operation_id: operation.id,
      conclusion: command.payload.conclusion,
      summary: command.payload.summary,
      created_at: now,
      ...(command.payload.observed_digest ? { observed_digest: command.payload.observed_digest } : {}),
      ...(command.payload.observed_state ? { observed_state: command.payload.observed_state } : {})
    };
    transaction.insertReconciliation(reconciliation);
    const nextOperation = {
      ...operation,
      state: nextState,
      summary: command.payload.summary,
      updated_at: now,
      revision: operation.revision + 1
    };
    transaction.updateExternalOperation(nextOperation, operation.revision);
    if (deployment) {
      const deploymentStatus =
        nextState === "succeeded" ? "succeeded" : nextState === "unknown" ? "unknown" : "failed";
      transaction.updateDeployment(
        { ...deployment, status: deploymentStatus, updated_at: now, revision: deployment.revision + 1 },
        deployment.revision
      );
    }
    if (reconciliationResolvesBlocker(command.payload.conclusion)) {
      for (const blocker of transaction.listOpenBlockers(loaded.change.id)) {
        if (blocker.code === "EXTERNAL_OPERATION_UNKNOWN") {
          transaction.updateBlocker(
            { ...blocker, status: "resolved", updated_at: now, revision: blocker.revision + 1 },
            blocker.revision
          );
        }
      }
    }
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "ReconciliationRecorded",
      project_id: loaded.project.id,
      aggregate: { object_type: "reconciliation", id: reconciliation.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { operation_id: operation.id, conclusion: command.payload.conclusion },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], { reconciliation });
  }

  #authorizeRecovery(transaction: StoreTransaction, command: AuthorizeRecoveryCommand): KernelResult {
    const human = this.#requireHumanActor(transaction, command);
    if (human) return human;
    if (command.project_id) {
      const revokedEarly = this.#requireActivePolicy(transaction, command, command.project_id);
      if (revokedEarly) return revokedEarly;
    }
    const release = transaction.getRelease(command.payload.release_id);
    if (!release) {
      return domainError(command.correlation_id, "RELEASE_NOT_FOUND", "未找到指定 Release", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, release.change_id);
    if ("code" in loaded) return loaded;
    const revokedRecovery = this.#requireActivePolicy(transaction, command, loaded.project.id);
    if (revokedRecovery) return revokedRecovery;
    const strategy = transaction.getRecoveryStrategy(command.payload.strategy_id);
    if (!strategy || strategy.release_id !== release.id) {
      return domainError(command.correlation_id, "RECOVERY_STRATEGY_NOT_FOUND", "未找到指定 Recovery Strategy", "not_found");
    }
    const source = transaction.getDeployment(command.payload.source_deployment_id);
    if (!source || source.release_id !== release.id) {
      return domainError(command.correlation_id, "DEPLOYMENT_NOT_FOUND", "Recovery 必须绑定失败的 Deployment", "not_found");
    }
    const pack = release.package_id ? transaction.getReleasePackage(release.package_id) : undefined;
    const needsHuman = recoveryRequiresHuman({
      authorization: strategy.authorization,
      targetAvailable: transaction
        .listArtifactsByChange(loaded.change.id)
        .some((item) => item.digest.value === strategy.target_digest.value),
      strategyCurrent:
        strategy.digest.value ===
        recoveryStrategyDigest({
          trigger: strategy.trigger,
          kind: strategy.kind,
          target_digest: strategy.target_digest,
          scope: strategy.scope,
          steps: strategy.steps,
          verify_checks: strategy.verify_checks,
          authorization: strategy.authorization
        }).value,
      scopeExceeded: recoveryScopeExceeded(strategy.scope, pack?.scope ?? { in: [], out: [] })
    });
    const now = this.#now();
    let recoveryDeployment = source;
    if (!needsHuman) {
      recoveryDeployment = {
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        release_id: release.id,
        environment_id: release.environment_id,
        artifact_digest: strategy.target_digest,
        status: "queued",
        created_at: now,
        updated_at: now,
        revision: 1
      };
      const operationKey = `op:recover:${release.id}:${recoveryDeployment.id}`;
      const attempt = {
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        deployment_id: recoveryDeployment.id,
        attempt_kind: "recover" as const,
        operation_key: operationKey,
        artifact_digest: strategy.target_digest,
        requested_at: now,
        created_at: now
      };
      const operation = {
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        operation_key: operationKey,
        operation_kind: "recover" as const,
        environment_id: release.environment_id,
        release_id: release.id,
        deployment_id: recoveryDeployment.id,
        artifact_digest: strategy.target_digest,
        state: "pending" as const,
        log_reference: "file://logs/recover-pending.log",
        log_digest: authorizationDigest({ operation_key: operationKey }, "recover_log"),
        summary: "recovery queued",
        created_at: now,
        updated_at: now,
        revision: 1
      };
      transaction.insertDeployment({ ...recoveryDeployment, current_operation_id: operation.id });
      transaction.insertDeploymentAttempt(attempt);
      transaction.insertExternalOperation(operation);
    }
    const execution = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      strategy_id: strategy.id,
      source_deployment_id: source.id,
      deployment_id: recoveryDeployment.id,
      status: needsHuman ? ("require_human" as const) : ("authorized" as const),
      created_at: now,
      updated_at: now,
      revision: 1
    };
    transaction.insertRecoveryExecution(execution);
    if (needsHuman) {
      transaction.insertBlocker({
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        code: "RECOVERY_REQUIRES_HUMAN",
        summary: "Recovery 超出预授权范围",
        status: "open",
        resolution_condition: "obtain a new human decision before recovery",
        created_at: now,
        updated_at: now,
        revision: 1
      });
    }
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "RecoveryAuthorized",
      project_id: loaded.project.id,
      aggregate: { object_type: "recovery_execution", id: execution.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { execution_id: execution.id, status: execution.status, source_deployment_id: source.id },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], { recovery_execution: execution });
  }

  #recordRecovery(transaction: StoreTransaction, command: RecordRecoveryCommand): KernelResult {
    const execution = transaction.getRecoveryExecution(command.payload.execution_id);
    if (!execution) {
      return domainError(command.correlation_id, "RECOVERY_EXECUTION_NOT_FOUND", "未找到指定 Recovery Execution", "not_found");
    }
    const loaded = this.#requireChangeForMutation(transaction, command, execution.change_id);
    if ("code" in loaded) return loaded;
    const now = this.#now();
    const nextExecution = {
      ...execution,
      status: command.payload.status,
      updated_at: now,
      revision: execution.revision + 1,
      ...(command.payload.verification_id ? { verification_id: command.payload.verification_id } : {})
    };
    transaction.updateRecoveryExecution(nextExecution, execution.revision);
    if (command.payload.status === "verified" && execution.deployment_id !== execution.source_deployment_id) {
      const deployment = transaction.getDeployment(execution.deployment_id);
      if (deployment) {
        transaction.updateDeployment(
          { ...deployment, status: "recovered", updated_at: now, revision: deployment.revision + 1 },
          deployment.revision
        );
      }
      for (const blocker of transaction.listOpenBlockers(loaded.change.id)) {
        if (blocker.code === "PRODUCTION_VERIFICATION_FAILED") {
          transaction.updateBlocker(
            { ...blocker, status: "resolved", updated_at: now, revision: blocker.revision + 1 },
            blocker.revision
          );
        }
      }
    }
    if (command.payload.status === "failed") {
      transaction.insertBlocker({
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        change_id: loaded.change.id,
        code: "RECOVERY_FAILED",
        summary: "Recovery verification failed",
        status: "open",
        resolution_condition: "keep the failed deployment and await a new decision",
        created_at: now,
        updated_at: now,
        revision: 1
      });
    }
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "RecoveryRecorded",
      project_id: loaded.project.id,
      aggregate: { object_type: "recovery_execution", id: execution.id, domain_version: 1 },
      aggregate_revision: nextExecution.revision,
      actor_id: loaded.actorId,
      command,
      payload: { execution_id: execution.id, status: command.payload.status },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, nextChange.revision, [event], { recovery_execution: nextExecution });
  }

  #createRepairWorkItem(transaction: StoreTransaction, command: CreateRepairWorkItemCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const revokedRepair = this.#requireActivePolicy(transaction, command, loaded.project.id);
    if (revokedRepair) return revokedRepair;
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
    if (!producerRoleAllowedForOrigin(command.source.origin, command.payload.producer_role)) {
      return domainError(
        command.correlation_id,
        "PRODUCER_ROLE_MISMATCH",
        "Evidence producer_role 必须与 Actor origin 一致，Human 不能自称 evaluator",
        "forbidden"
      );
    }
    const now = this.#now();
    let evidence = createEvidenceFromCommand({ id: this.#id(), claim, command, now });
    if (!evidence.external_reference_id) {
      const reference = {
        schema_version: SCHEMA_VERSION,
        id: this.#id(),
        project_id: loaded.project.id,
        reference: evidence.content_reference,
        digest: evidence.digest,
        summary: evidence.content_reference.slice(0, 1000),
        created_at: now
      };
      transaction.insertExternalReference(reference);
      evidence = { ...evidence, external_reference_id: reference.id };
    }
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
    const artifact = transaction.getArtifact(command.payload.artifact_id);
    if (!artifact || artifact.change_id !== loaded.change.id) {
      return domainError(command.correlation_id, "ARTIFACT_NOT_FOUND", "提升测试结果必须绑定已存在的 Artifact", "not_found");
    }
    if (
      artifact.digest.algorithm !== command.payload.artifact_digest.algorithm ||
      artifact.digest.value !== command.payload.artifact_digest.value
    ) {
      return domainError(
        command.correlation_id,
        "ARTIFACT_DIGEST_MISMATCH",
        "提升测试结果必须绑定 Artifact 当前 Digest",
        "conflict"
      );
    }
    let contentReference = command.payload.content_reference;
    if (command.payload.content_reference.startsWith("file:")) {
      const resolved = resolveAuthorizedFileReference(
        command.payload.content_reference,
        [loaded.project.repository_path],
        this.#io
      );
      if (!resolved.ok || resolved.digest !== command.payload.digest.value) {
        return domainError(
          command.correlation_id,
          resolved.ok ? "ARTIFACT_DIGEST_MISMATCH" : "ARTIFACT_REFERENCE_INVALID",
          resolved.ok ? "测试结果 digest 必须等于本地文件字节的 sha256" : "本地 Artifact 引用不在授权范围内",
          "validation"
        );
      }
      contentReference = resolved.storedReference;
    }
    const referenced = readPromotableReference(command.payload.content_reference);
    const parsed =
      referenced.kind === "contents"
        ? parseWhitelistedTestResult(command.payload.format, referenced.value)
        : { kind: "invalid" as const, reason: "unparseable" as const };
    const now = this.#now();
    let evidence: Evidence = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      claim_id: claim.id,
      stance: parsed.kind === "parsed" ? parsed.stance : "Inconclusive",
      subject_type: "artifact",
      subject_id: command.payload.artifact_id,
      subject_digest: artifact.digest,
      content_reference: contentReference,
      digest: command.payload.digest,
      producer_role: "deterministic_test",
      created_at: now,
      ...(command.payload.environment_ref ? { environment_ref: command.payload.environment_ref } : {})
    };
    const reference = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      reference: evidence.content_reference,
      digest: evidence.digest,
      summary: evidence.content_reference.slice(0, 1000),
      created_at: now
    };
    transaction.insertExternalReference(reference);
    evidence = { ...evidence, external_reference_id: reference.id };
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

  #recordKnowledgeUpdate(transaction: StoreTransaction, command: RecordKnowledgeUpdateCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    if (command.payload.conclusion === "NoImpact") {
      return domainError(
        command.correlation_id,
        "KNOWLEDGE_NO_IMPACT_UPDATE",
        "NoImpact 知识来源不记录 Knowledge Update",
        "validation"
      );
    }
    const knowledge = transaction.getKnowledgeImpactAssessmentByChange(loaded.change.id);
    if (!knowledge) {
      return domainError(
        command.correlation_id,
        "KNOWLEDGE_OBLIGATION_NOT_FOUND",
        "记录知识更新需要 Knowledge Impact Assessment",
        "not_found"
      );
    }
    const required = knowledge.sources[command.payload.knowledge_source];
    if (required.conclusion !== command.payload.conclusion) {
      return domainError(
        command.correlation_id,
        "KNOWLEDGE_CONCLUSION_MISMATCH",
        "知识更新结论必须匹配 Mandatory Knowledge Impact",
        "validation"
      );
    }
    const plan = transaction.getCurrentPlan(loaded.change.id);
    const task = plan
      ? transaction.listTasks(plan.plan_id, plan.domain_version).find((item) => item.id === command.payload.task_id)
      : undefined;
    if (!task || task.kind !== "knowledge" || task.knowledge_source !== command.payload.knowledge_source) {
      return domainError(
        command.correlation_id,
        "KNOWLEDGE_TASK_NOT_FOUND",
        "知识更新必须绑定当前 Plan 的 Mandatory Knowledge Task",
        "not_found"
      );
    }
    const reference = transaction.getExternalReference(command.payload.external_reference_id);
    if (!reference || reference.project_id !== loaded.project.id) {
      return domainError(
        command.correlation_id,
        "KNOWLEDGE_REFERENCE_NOT_FOUND",
        "知识更新必须引用已存在的版本化 External Reference",
        "not_found"
      );
    }
    const evidence = transaction.getEvidence(command.payload.evidence_id);
    if (!evidence || evidence.change_id !== loaded.change.id) {
      return domainError(
        command.correlation_id,
        "KNOWLEDGE_EVIDENCE_NOT_FOUND",
        "知识更新必须引用已存在的 Evidence",
        "not_found"
      );
    }
    if (command.payload.exception_id) {
      const decision = transaction.getDecision(command.payload.exception_id);
      if (!decision || decision.change_id !== loaded.change.id || decision.outcome !== "approve") {
        return domainError(
          command.correlation_id,
          "KNOWLEDGE_EXCEPTION_INVALID",
          "知识例外必须是同一 Change 上已批准的 Human Decision",
          "forbidden"
        );
      }
    } else if (isUnavailableReference(reference.reference)) {
      return domainError(
        command.correlation_id,
        "KNOWLEDGE_REFERENCE_UNAVAILABLE",
        "不可访问的知识引用不能自动视为完成",
        "conflict"
      );
    } else {
      const validity = projectValidity(transaction.listImpactAssessmentsBySubject(evidence.id));
      const assessed = evaluateKnowledgeObligation({
        source: command.payload.knowledge_source,
        requiredConclusion: required.conclusion,
        task,
        updates: [
          {
            schema_version: SCHEMA_VERSION,
            id: command.command_id,
            project_id: loaded.project.id,
            change_id: loaded.change.id,
            task_id: command.payload.task_id,
            knowledge_source: command.payload.knowledge_source,
            conclusion: command.payload.conclusion,
            external_reference_id: command.payload.external_reference_id,
            evidence_id: command.payload.evidence_id,
            digest: { algorithm: "sha256", value: "0".repeat(64), subject: "knowledge_update_preview" },
            created_at: this.#now()
          }
        ],
        references: { [reference.id]: { id: reference.id, reference: reference.reference } },
        evidenceById: {
          [evidence.id]: {
            id: evidence.id,
            stance: evidence.stance,
            ...(evidence.external_reference_id ? { external_reference_id: evidence.external_reference_id } : {})
          }
        },
        validityByEvidenceId: { [evidence.id]: validity }
      });
      if (!assessed.complete) {
        const codes = {
          missing_evidence: "KNOWLEDGE_EVIDENCE_INSUFFICIENT",
          stale_reference: "KNOWLEDGE_REFERENCE_STALE",
          unavailable_reference: "KNOWLEDGE_REFERENCE_UNAVAILABLE",
          conclusion_mismatch: "KNOWLEDGE_CONCLUSION_MISMATCH",
          invalid_exception: "KNOWLEDGE_EXCEPTION_INVALID"
        } as const;
        return domainError(
          command.correlation_id,
          codes[assessed.reason],
          assessed.gap.summary,
          assessed.reason === "conclusion_mismatch" ? "validation" : "conflict"
        );
      }
    }
    const now = this.#now();
    const knowledgeUpdate: KnowledgeUpdateEvidence = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      task_id: command.payload.task_id,
      knowledge_source: command.payload.knowledge_source,
      conclusion: command.payload.conclusion,
      external_reference_id: command.payload.external_reference_id,
      evidence_id: command.payload.evidence_id,
      digest: {
        algorithm: "sha256",
        value: requestDigest({
          change_id: loaded.change.id,
          task_id: command.payload.task_id,
          knowledge_source: command.payload.knowledge_source,
          conclusion: command.payload.conclusion,
          external_reference_id: command.payload.external_reference_id,
          evidence_id: command.payload.evidence_id,
          ...(command.payload.exception_id ? { exception_id: command.payload.exception_id } : {})
        }),
        subject: "knowledge_update_evidence"
      },
      created_at: now,
      ...(command.payload.exception_id ? { exception_id: command.payload.exception_id } : {})
    };
    transaction.insertKnowledgeUpdateEvidence(knowledgeUpdate);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "KnowledgeUpdateRecorded",
      project_id: loaded.project.id,
      aggregate: { object_type: "knowledge_update_evidence", id: knowledgeUpdate.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: {
        knowledge_update_id: knowledgeUpdate.id,
        task_id: knowledgeUpdate.task_id,
        conclusion: knowledgeUpdate.conclusion
      },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "knowledge_update_evidence", id: knowledgeUpdate.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { knowledge_update: knowledgeUpdate }
    );
  }

  #assessKnowledgeClosure(transaction: StoreTransaction, change: Change) {
    const knowledge = transaction.getKnowledgeImpactAssessmentByChange(change.id);
    if (!knowledge) {
      return evaluateKnowledgeClosureGate([
        {
          obligation_key: "knowledge_impact",
          summary: "缺少 Knowledge Impact Assessment。",
          blocking: true
        }
      ]);
    }
    const plan = transaction.getCurrentPlan(change.id);
    const tasks = plan ? transaction.listTasks(plan.plan_id, plan.domain_version) : [];
    const updates = transaction.listKnowledgeUpdateEvidenceByChange(change.id);
    const gaps = collectKnowledgeObligations(knowledge.sources, tasks)
      .map((obligation) => {
        const related = updates.filter(
          (item) =>
            item.knowledge_source === obligation.source &&
            (!obligation.task || item.task_id === obligation.task.id)
        );
        const latest = related.at(-1);
        const reference = latest ? transaction.getExternalReference(latest.external_reference_id) : undefined;
        const evidence = latest ? transaction.getEvidence(latest.evidence_id) : undefined;
        const exception = latest?.exception_id ? transaction.getDecision(latest.exception_id) : undefined;
        return evaluateKnowledgeObligation({
          source: obligation.source,
          requiredConclusion: obligation.requiredConclusion,
          ...(obligation.task
            ? {
                task: {
                  id: obligation.task.id,
                  kind: obligation.task.kind,
                  ...(obligation.task.knowledge_source ? { knowledge_source: obligation.task.knowledge_source } : {})
                }
              }
            : {}),
          updates: related,
          references: reference ? { [reference.id]: { id: reference.id, reference: reference.reference } } : {},
          evidenceById: evidence
            ? {
                [evidence.id]: {
                  id: evidence.id,
                  stance: evidence.stance,
                  ...(evidence.external_reference_id ? { external_reference_id: evidence.external_reference_id } : {})
                }
              }
            : {},
          validityByEvidenceId: evidence
            ? { [evidence.id]: projectValidity(transaction.listImpactAssessmentsBySubject(evidence.id)) }
            : {},
          ...(exception ? { exception: { id: exception.id, outcome: exception.outcome } } : {})
        });
      })
      .flatMap((item) => (item.complete ? [] : [item.gap]));
    return evaluateKnowledgeClosureGate(gaps);
  }

  #proposeClose(transaction: StoreTransaction, command: ProposeCloseCommand): KernelResult {
    const human = this.#requireHumanActor(transaction, command);
    if (human) return human;
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const now = this.#now();
    const proposal = evaluateCloseProposal({
      knowledge: this.#assessKnowledgeClosure(transaction, loaded.change),
      profileKey: transaction.getCurrentContract(loaded.change.id)?.profile_key ?? "feature",
      releases: transaction.listReleasesByChange(loaded.change.id),
      residualRisk: command.payload.residual_risk,
      knownIssues: command.payload.known_issues,
      unresolvedExternal: hasUnresolvedExternalSideEffects(
        transaction.listExternalOperationsByChange(loaded.change.id)
      )
    });
    const evaluation: ClosureEvaluation = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      disposition: "closed",
      result: proposal.result,
      knowledge_complete: proposal.knowledge_complete,
      residual_risk: command.payload.residual_risk,
      known_issues: command.payload.known_issues,
      gaps: proposal.gaps,
      digest: {
        algorithm: "sha256",
        value: requestDigest({
          change_id: loaded.change.id,
          residual_risk: command.payload.residual_risk,
          known_issues: command.payload.known_issues,
          result: proposal.result,
          gaps: proposal.gaps
        }),
        subject: "closure_evaluation"
      },
      created_at: now
    };
    transaction.insertClosureEvaluation(evaluation);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "CloseProposed",
      project_id: loaded.project.id,
      aggregate: { object_type: "closure_evaluation", id: evaluation.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { closure_evaluation_id: evaluation.id, result: evaluation.result },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "closure_evaluation", id: evaluation.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { closure_evaluation: evaluation }
    );
  }

  #closeChange(transaction: StoreTransaction, command: CloseChangeCommand): KernelResult {
    const human = this.#requireHumanActor(transaction, command);
    if (human) return human;
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const evaluation = transaction.getClosureEvaluation(command.payload.closure_evaluation_id);
    if (!evaluation || evaluation.change_id !== loaded.change.id) {
      return domainError(
        command.correlation_id,
        "CLOSURE_EVALUATION_NOT_FOUND",
        "关闭 Change 需要已存在的 Closure Evaluation",
        "not_found"
      );
    }
    if (hasUnresolvedExternalSideEffects(transaction.listExternalOperationsByChange(loaded.change.id))) {
      return domainError(
        command.correlation_id,
        "EXTERNAL_OPERATION_UNKNOWN",
        "关闭前必须核对未知或未完成的外部副作用",
        "conflict"
      );
    }
    const current = evaluateCloseProposal({
      knowledge: this.#assessKnowledgeClosure(transaction, loaded.change),
      profileKey: transaction.getCurrentContract(loaded.change.id)?.profile_key ?? "feature",
      releases: transaction.listReleasesByChange(loaded.change.id),
      residualRisk: evaluation.residual_risk,
      knownIssues: evaluation.known_issues,
      unresolvedExternal: false
    });
    if (evaluation.result !== "ALLOW" || current.result !== "ALLOW") {
      return domainError(
        command.correlation_id,
        current.result === evaluation.result ? "CLOSURE_NOT_ALLOWED" : "CLOSURE_EVALUATION_STALE",
        "关闭 Change 需要当前 Closure Gate 仍为 ALLOW",
        "conflict"
      );
    }
    const latest = transaction.listClosureEvaluationsByChange(loaded.change.id).at(-1);
    if (latest && latest.id !== evaluation.id) {
      return domainError(
        command.correlation_id,
        "CLOSURE_EVALUATION_STALE",
        "关闭 Change 必须使用最新的 Closure Evaluation",
        "conflict"
      );
    }
    const now = this.#now();
    const nextChange = this.#advanceLifecycle(
      transaction,
      loaded.change,
      loaded.expectedRevision,
      now,
      command,
      "DeliveryClosed"
    );
    const event = this.#appendEvent(transaction, {
      event_type: "ChangeClosed",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: loaded.change.id, domain_version: 1 },
      aggregate_revision: nextChange.revision,
      actor_id: loaded.actorId,
      command,
      payload: { closure_evaluation_id: evaluation.id, disposition: evaluation.disposition },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "change", id: loaded.change.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { closure_evaluation: evaluation }
    );
  }

  #cancelChange(transaction: StoreTransaction, command: CancelChangeCommand): KernelResult {
    const human = this.#requireHumanActor(transaction, command);
    if (human) return human;
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    if (transaction.listCancellationRecordsByChange(loaded.change.id).length > 0) {
      return domainError(command.correlation_id, "CHANGE_ALREADY_CANCELLED", "Change 已取消", "conflict");
    }
    if (hasUnresolvedExternalSideEffects(transaction.listExternalOperationsByChange(loaded.change.id))) {
      return domainError(
        command.correlation_id,
        "EXTERNAL_OPERATION_UNKNOWN",
        "取消前必须核对未知或未完成的外部副作用",
        "conflict"
      );
    }
    const now = this.#now();
    const record: CancellationRecord = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      disposition: "cancelled",
      reason: command.payload.reason,
      cleanup_summary: command.payload.cleanup_summary,
      residual_responsibility: command.payload.cleanup_summary,
      created_at: now
    };
    transaction.insertCancellationRecord(record);
    const nextChange = this.#advanceLifecycle(
      transaction,
      loaded.change,
      loaded.expectedRevision,
      now,
      command,
      "Cancelled"
    );
    const event = this.#appendEvent(transaction, {
      event_type: "ChangeCancelled",
      project_id: loaded.project.id,
      aggregate: { object_type: "cancellation_record", id: record.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { cancellation_record_id: record.id, reason: record.reason },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "cancellation_record", id: record.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { cancellation_record: record }
    );
  }

  #supersedeChange(transaction: StoreTransaction, command: SupersedeChangeCommand): KernelResult {
    const human = this.#requireHumanActor(transaction, command);
    if (human) return human;
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    if (command.payload.successor_change_id === loaded.change.id) {
      return domainError(command.correlation_id, "SUPERSEDE_SELF", "取代必须引用另一个 Change", "validation");
    }
    const successor = transaction.getChange(command.payload.successor_change_id);
    if (!successor || successor.project_id !== loaded.project.id) {
      return domainError(command.correlation_id, "SUCCESSOR_CHANGE_NOT_FOUND", "取代必须精确引用同一项目中的后续 Change", "not_found");
    }
    if (hasUnresolvedExternalSideEffects(transaction.listExternalOperationsByChange(loaded.change.id))) {
      return domainError(
        command.correlation_id,
        "EXTERNAL_OPERATION_UNKNOWN",
        "取代前必须核对未知或未完成的外部副作用",
        "conflict"
      );
    }
    const now = this.#now();
    const record: SupersessionRecord = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      successor_change_id: successor.id,
      disposition: "superseded",
      reason: command.payload.reason,
      created_at: now
    };
    transaction.insertSupersessionRecord(record);
    const nextChange = this.#advanceLifecycle(
      transaction,
      loaded.change,
      loaded.expectedRevision,
      now,
      command,
      "Superseded"
    );
    const event = this.#appendEvent(transaction, {
      event_type: "ChangeSuperseded",
      project_id: loaded.project.id,
      aggregate: { object_type: "supersession_record", id: record.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { supersession_record_id: record.id, successor_change_id: successor.id },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "supersession_record", id: record.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { supersession_record: record }
    );
  }

  #archiveChange(transaction: StoreTransaction, command: ArchiveChangeCommand): KernelResult {
    const human = this.#requireHumanActor(transaction, command);
    if (human) return human;
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    if (transaction.listArchiveRecordsByChange(loaded.change.id).length > 0) {
      return domainError(command.correlation_id, "CHANGE_ALREADY_ARCHIVED", "Change 已归档", "conflict");
    }
    const now = this.#now();
    const record: ArchiveRecord = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: loaded.project.id,
      change_id: loaded.change.id,
      disposition: "archived",
      reason: command.payload.reason,
      created_at: now
    };
    transaction.insertArchiveRecord(record);
    const nextChange = this.#touchChange(
      transaction,
      { ...loaded.change, operating_status: "Paused" },
      loaded.expectedRevision,
      now
    );
    const event = this.#appendEvent(transaction, {
      event_type: "ChangeArchived",
      project_id: loaded.project.id,
      aggregate: { object_type: "archive_record", id: record.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { archive_record_id: record.id },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "archive_record", id: record.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { archive_record: record }
    );
  }

  #exportProject(transaction: StoreTransaction, command: ExportProjectCommand): KernelResult {
    const context = this.#requireProjectActor(transaction, command);
    if ("code" in context) return context;
    if (command.expected_revision !== context.project.revision) {
      return domainError(
        command.correlation_id,
        "REVISION_CONFLICT",
        "目标对象已被其他命令修改，请刷新后重试",
        "conflict",
        false,
        { current_revision: context.project.revision }
      );
    }
    if (command.payload.scope === "change" && !command.payload.change_id) {
      return domainError(command.correlation_id, "CHANGE_TARGET_REQUIRED", "按 Change 导出必须提供 change_id", "validation");
    }
    if (command.payload.change_id) {
      const change = transaction.getChange(command.payload.change_id);
      if (!change || change.project_id !== context.project.id) {
        return domainError(command.correlation_id, "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found");
      }
    }
    const exported = this.#portableExportInput(transaction, context.project, command.payload.change_id);
    try {
      const manifest = exportProjectBundle({
        projectId: context.project.id,
        exporterActorId: context.actorId,
        sourceInstanceId: context.project.instance_id,
        exportedAt: this.#now(),
        manifestId: this.#id(),
        facts: exported.facts,
        events: exported.events,
        outbox: exported.outbox,
        ownershipState: "active",
        latestRevision: exported.latestRevision
      });
      const now = this.#now();
      const event = this.#appendEvent(transaction, {
        event_type: "ProjectExported",
        project_id: context.project.id,
        aggregate: { object_type: "export_manifest", id: manifest.id, domain_version: 1 },
        aggregate_revision: 1,
        actor_id: context.actorId,
        command,
        payload: {
          export_manifest_id: manifest.id,
          content_digest: manifest.content_digest.value,
          ownership_state: manifest.ownership_state
        },
        occurred_at: now
      });
      return this.#success(
        command,
        { object_type: "export_manifest", id: manifest.id, domain_version: 1 },
        context.project.revision,
        [event],
        { export_manifest: manifest }
      );
    } catch (error) {
      if (error instanceof PortableExportError) {
        return domainError(command.correlation_id, error.code, error.message, "conflict");
      }
      throw error;
    }
  }

  #createLearningCandidate(transaction: StoreTransaction, command: CreateLearningCandidateCommand): KernelResult {
    const loaded = this.#requireChangeForMutation(transaction, command, command.payload.change_id);
    if ("code" in loaded) return loaded;
    const sourceId = command.payload.source_id;
    const resolved =
      command.payload.source_kind === "failure"
        ? transaction.getAgentRun(sourceId)?.status === "failed" &&
          transaction.getAgentRun(sourceId)?.change_id === loaded.change.id
        : command.payload.source_kind === "recovery"
          ? transaction.getRecoveryExecution(sourceId)?.change_id === loaded.change.id
          : command.payload.source_kind === "decision" || command.payload.source_kind === "exception"
            ? transaction.getDecision(sourceId)?.change_id === loaded.change.id ||
              transaction
                .listKnowledgeUpdateEvidenceByChange(loaded.change.id)
                .some((item) => item.exception_id === sourceId)
            : false;
    if (!resolved) {
      return domainError(
        command.correlation_id,
        "LEARNING_SOURCE_NOT_FOUND",
        "Learning Candidate 必须引用 failure/exception/decision/recovery 事实",
        "not_found"
      );
    }
    const now = this.#now();
    const candidate = createProposedLearningCandidate({
      id: this.#id(),
      projectId: loaded.project.id,
      changeId: loaded.change.id,
      sourceKind: command.payload.source_kind,
      sourceId,
      summary: command.payload.summary,
      now
    });
    transaction.insertLearningCandidate(candidate);
    const nextChange = this.#touchChange(transaction, loaded.change, loaded.expectedRevision, now);
    const event = this.#appendEvent(transaction, {
      event_type: "LearningCandidateCreated",
      project_id: loaded.project.id,
      aggregate: { object_type: "learning_candidate", id: candidate.id, domain_version: 1 },
      aggregate_revision: 1,
      actor_id: loaded.actorId,
      command,
      payload: { learning_candidate_id: candidate.id, source_kind: candidate.source_kind, promoted: false },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "learning_candidate", id: candidate.id, domain_version: 1 },
      nextChange.revision,
      [event],
      { learning_candidate: candidate }
    );
  }

  #stageImportOutsideTransaction(command: StageImportCommand, digest: string): KernelResult {
    const replayed = this.#store.transaction((transaction) => transaction.getCommandReceipt(command.command_id));
    if (replayed) {
      if (replayed.request_digest !== digest) {
        return domainError(command.correlation_id, "COMMAND_ID_REUSED", "同一 command_id 已被用于不同命令", "conflict", false, {
          command_id: command.command_id
        });
      }
      return replayed.result;
    }
    const existing = this.#store.getProject();
    if (existing && command.expected_revision !== existing.revision) {
      return domainError(command.correlation_id, "REVISION_CONFLICT", "目标对象已被其他命令修改，请刷新后重试", "conflict", false, {
        current_revision: existing.revision
      });
    }
    if (!existing && command.expected_revision !== 1) {
      return domainError(command.correlation_id, "REVISION_CONFLICT", "空目标导入必须使用 expected_revision=1", "conflict");
    }
    const bundlePath = command.payload.bundle_reference.startsWith("file://")
      ? command.payload.bundle_reference.slice("file://".length)
      : command.payload.bundle_reference;
    const allowedRoot = existing?.repository_path ?? command.source.repository_path ?? dirname(bundlePath);
    this.#cleanupOrphanStaging(allowedRoot);
    let staged: ReturnType<KernelIo["stageImport"]>;
    try {
      staged = this.#io.stageImport({
        allowedRoot,
        bundleReference: command.payload.bundle_reference,
        bundleDigest: command.payload.bundle_digest,
        maxBytes: 5_000_000,
        reportId: this.#id(),
        stagedAt: this.#now()
      });
    } catch (error) {
      this.#cleanupOrphanStaging(allowedRoot);
      if (error instanceof PortableImportError) {
        return domainError(command.correlation_id, error.code, error.message, "validation");
      }
      return domainError(command.correlation_id, "STORE_FAILURE", "导入暂存失败", "storage", true);
    }
    try {
      return this.#store.transaction((transaction) => {
        const previous = transaction.getCommandReceipt(command.command_id);
        if (previous) {
          this.#io.abandon(staged.stagingPath);
          return previous.result;
        }
        const result = this.#recordStagedImport(transaction, command, staged);
        if (!isDomainError(result)) {
          transaction.saveCommandReceipt({
            command_id: command.command_id,
            request_digest: digest,
            result,
            created_at: this.#now()
          });
        } else {
          this.#io.abandon(staged.stagingPath);
        }
        return result;
      });
    } catch (error) {
      this.#io.abandon(staged.stagingPath);
      if (error instanceof StoreConflictError) {
        return domainError(command.correlation_id, "REVISION_CONFLICT", "目标对象已被其他命令修改，请刷新后重试", "conflict", false, {
          current_revision: error.currentRevision
        });
      }
      return domainError(command.correlation_id, "STORE_FAILURE", "本地存储操作失败", "storage", true);
    }
  }

  #recordStagedImport(
    transaction: StoreTransaction,
    command: StageImportCommand,
    staged: ReturnType<KernelIo["stageImport"]>
  ): KernelResult {
    const existing = transaction.getCurrentProject();
    if (existing) {
      const context = this.#requireProjectActor(transaction, command);
      if ("code" in context) return context;
    }
    const report = {
      ...staged.report,
      summary: `bundle_digest=${staged.bundleDigest}; content_digest=${staged.historyDigest}; staging=${encodeURIComponent(staged.stagingPath)}; ${staged.report.summary}`
    };
    transaction.insertImportReport(report);
    const events = existing
      ? [
          this.#appendEvent(transaction, {
            event_type: "ImportStaged",
            project_id: existing.id,
            aggregate: { object_type: "import_report", id: report.id, domain_version: 1 },
            aggregate_revision: 1,
            actor_id: command.actor_id,
            command,
            payload: { import_report_id: report.id, runtime_ownership: report.runtime_ownership },
            occurred_at: this.#now()
          })
        ]
      : [];
    return this.#success(
      command,
      { object_type: "import_report", id: report.id, domain_version: 1 },
      existing?.revision ?? 1,
      events,
      { import_report: report }
    );
  }

  #stageImport(transaction: StoreTransaction, command: StageImportCommand): KernelResult {
    return domainError(
      command.correlation_id,
      "STORE_FAILURE",
      "StageImport 必须在事务外完成文件暂存",
      "storage"
    );
  }

  #revokeProjectPolicy(transaction: StoreTransaction, command: RevokeProjectPolicyCommand): KernelResult {
    const human = this.#requireHumanActor(transaction, command);
    if (human) return human;
    const context = this.#requireProjectActor(transaction, command);
    if ("code" in context) return context;
    if (command.expected_revision !== context.project.revision) {
      return domainError(command.correlation_id, "REVISION_CONFLICT", "目标对象已被其他命令修改，请刷新后重试", "conflict", false, {
        current_revision: context.project.revision
      });
    }
    const policy = transaction.getProjectPolicy(context.project.id);
    const current = transaction.getLatestPolicySnapshot(context.project.id);
    if (!policy || !current) {
      return domainError(command.correlation_id, "POLICY_NOT_FOUND", "撤销 Policy 需要已初始化的项目策略", "not_found");
    }
    if (isPolicyRevoked(current)) {
      return domainError(command.correlation_id, "POLICY_ALREADY_REVOKED", "当前 Policy 已被撤销", "conflict");
    }
    const now = this.#now();
    const nextPolicy = { ...policy, updated_at: now, revision: policy.revision + 1 };
    const snapshot: PolicySnapshot = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: context.project.id,
      policy_id: policy.id,
      policy_revision: nextPolicy.revision,
      status: "revoked",
      digest: {
        algorithm: "sha256",
        value: computePolicySnapshotDigest({ ...policyDigestInput(policy), status: "revoked" }),
        subject: "project_policy"
      },
      created_at: now
    };
    transaction.updateProjectPolicy(nextPolicy, policy.revision);
    transaction.insertPolicySnapshot(snapshot);
    for (const open of transaction.listOpenDecisionRequests()) {
      transaction.updateDecisionRequest(
        { ...open, status: "expired", updated_at: now, revision: open.revision + 1 },
        open.revision
      );
    }
    this.#haltInFlightAfterPolicyRevoke(transaction, context.project.id, command.payload.reason, now);
    const event = this.#appendEvent(transaction, {
      event_type: "PolicyRevoked",
      project_id: context.project.id,
      aggregate: { object_type: "policy_snapshot", id: snapshot.id, domain_version: snapshot.policy_revision },
      aggregate_revision: snapshot.policy_revision,
      actor_id: context.actorId,
      command,
      payload: {
        policy_id: policy.id,
        policy_snapshot_id: snapshot.id,
        policy_revision: snapshot.policy_revision,
        digest: snapshot.digest.value,
        reason: command.payload.reason
      },
      occurred_at: now
    });
    return this.#success(
      command,
      { object_type: "policy_snapshot", id: snapshot.id, domain_version: snapshot.policy_revision },
      context.project.revision,
      [event],
      { policy: nextPolicy }
    );
  }

  #requireActivePolicy(
    transaction: StoreTransaction,
    command: AnyCommand,
    projectId: InternalId
  ): DomainError | undefined {
    const snapshot = transaction.getLatestPolicySnapshot(projectId);
    if (isPolicyRevoked(snapshot)) {
      return domainError(
        command.correlation_id,
        "POLICY_REVOKED",
        "当前 Policy 已撤销，禁止新的领取、运行、发布、部署或恢复",
        "forbidden"
      );
    }
    return undefined;
  }

  #haltInFlightAfterPolicyRevoke(
    transaction: StoreTransaction,
    projectId: InternalId,
    reason: string,
    now: string
  ): void {
    for (const change of transaction.listChanges()) {
      for (const run of transaction.listAgentRunsByChange(change.id)) {
        if (run.status !== "starting" && run.status !== "running") continue;
        if (!allowedRunTransition(run.status, "cancelled")) continue;
        transaction.updateAgentRun(
          {
            ...run,
            status: "cancelled",
            summary: `Policy revoked: ${reason}`,
            ended_at: now,
            updated_at: now,
            revision: run.revision + 1
          },
          run.revision
        );
        transaction.insertBlocker({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: projectId,
          change_id: change.id,
          work_item_id: run.work_item_id,
          code: "POLICY_REVOKED",
          summary: `Running Run ${run.id} is no longer authorized after Policy revoke`,
          status: "open",
          resolution_condition: "human must reconcile the cancelled run before retrying",
          created_at: now,
          updated_at: now,
          revision: 1
        });
        transaction.insertAttentionItem({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: projectId,
          change_id: change.id,
          kind: "blocker",
          subject_id: run.id,
          summary: `Run ${run.id} requires human handling after Policy revoke`,
          status: "open",
          created_at: now,
          updated_at: now,
          revision: 1
        });
      }
      for (const operation of transaction.listExternalOperationsByChange(change.id)) {
        if (operation.state !== "pending") continue;
        const lease = transaction.getExternalOperationLease(operation.id);
        if (lease?.invoke_started_at) continue;
        transaction.updateExternalOperation(
          {
            ...operation,
            state: "failed",
            summary: `Policy revoked before adapter invoke: ${reason}`,
            updated_at: now,
            revision: operation.revision + 1
          },
          operation.revision
        );
        transaction.insertBlocker({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: projectId,
          change_id: change.id,
          code: "POLICY_REVOKED",
          summary: `Pending ExternalOperation ${operation.id} was not invoked after Policy revoke`,
          status: "open",
          resolution_condition: "do not retry the blocked operation without a new authorization",
          created_at: now,
          updated_at: now,
          revision: 1
        });
        transaction.insertAttentionItem({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: projectId,
          change_id: change.id,
          kind: "blocker",
          subject_id: operation.id,
          summary: `ExternalOperation ${operation.id} awaits new authorization after Policy revoke`,
          status: "open",
          created_at: now,
          updated_at: now,
          revision: 1
        });
      }
    }
  }

  #cleanupCommittedStaging(): void {
    const stagingPath = this.#pendingStagingCleanup;
    this.#pendingStagingCleanup = undefined;
    if (!stagingPath) return;
    try {
      this.#io.abandon(stagingPath);
    } catch {
      this.#store.transaction((transaction) => {
        const project = transaction.getCurrentProject();
        if (!project) return;
        transaction.insertAttentionItem({
          schema_version: SCHEMA_VERSION,
          id: this.#id(),
          project_id: project.id,
          kind: "failure",
          subject_id: project.id,
          summary: `Failed to delete import staging ${stagingPath}; retry orphan cleanup`,
          status: "open",
          created_at: this.#now(),
          updated_at: this.#now(),
          revision: 1
        });
      });
    }
  }

  #cleanupOrphanStaging(allowedRoot: string): void {
    const live = this.#store.transaction((transaction) =>
      transaction.listImportReports().flatMap((report) => {
        if (report.status !== "staged") return [];
        const encoded = /staging=([^;]+)/.exec(report.summary)?.[1];
        return encoded ? [decodeURIComponent(encoded)] : [];
      })
    );
    for (const orphan of this.#io.listOrphanStaging(allowedRoot, live)) {
      this.#io.abandon(orphan);
    }
  }

  #commitImport(transaction: StoreTransaction, command: CommitImportCommand): KernelResult {
    const report = transaction.getImportReport(command.payload.import_report_id);
    if (!report) {
      return domainError(command.correlation_id, "IMPORT_REPORT_NOT_FOUND", "未找到指定 Import Report", "not_found");
    }
    if (report.status !== "staged") {
      return domainError(command.correlation_id, "IMPORT_NOT_STAGED", "只能提交已 staging 的 Import Report", "conflict");
    }
    const existing = transaction.getCurrentProject();
    if (existing && command.expected_revision !== existing.revision) {
      return domainError(command.correlation_id, "REVISION_CONFLICT", "目标对象已被其他命令修改，请刷新后重试", "conflict", false, {
        current_revision: existing.revision
      });
    }
    if (!existing && command.expected_revision !== 1) {
      return domainError(command.correlation_id, "REVISION_CONFLICT", "空目标导入必须使用 expected_revision=1", "conflict");
    }
    const staged = this.#readStagedImport(report.summary);
    if ("code" in staged) {
      return domainError(command.correlation_id, staged.code, staged.message, "validation");
    }
    const incomingDigest = staged.manifest.content_digest.value;
    const history = classifyImportHistory({
      ...(existing
        ? { localProjectId: existing.id, localDigest: this.#currentContentDigest(transaction, existing.id) }
        : {}),
      incomingProjectId: staged.manifest.project_id,
      incomingDigest
    });
    if (history === "divergent") {
      const rejected = createImportReport({
        id: this.#id(),
        projectId: report.project_id,
        stagedAt: this.#now(),
        status: "rejected",
        conflicts: ["DIVERGENT_HISTORY"],
        digestMismatches: [incomingDigest],
        summary: "Local project history diverges from the staged bundle."
      });
      transaction.updateImportReport({
        ...report,
        status: "rejected",
        conflicts: ["DIVERGENT_HISTORY"],
        digest_mismatches: [incomingDigest],
        summary: `${report.summary}; superseded_by=${rejected.id}`
      });
      transaction.insertImportReport(rejected);
      this.#pendingStagingCleanup = staged.stagingPath;
      return domainError(command.correlation_id, "DIVERGENT_HISTORY", "拒绝静默合并分叉历史", "conflict", false, {
        import_report_id: rejected.id
      });
    }
    if (history === "empty_target") {
      try {
        transaction.importPortableSnapshot(this.#factsFromManifest(staged.manifest));
      } catch (error) {
        return domainError(
          command.correlation_id,
          "IMPORT_INVALID",
          error instanceof Error ? error.message : "导入激活失败",
          "storage",
          true
        );
      }
    }
    const accepted = createImportReport({
      id: report.id,
      projectId: staged.manifest.project_id,
      stagedAt: report.staged_at,
      status: "accepted",
      summary:
        history === "identical"
          ? "Import is idempotent with the existing project history."
          : "Empty target accepted the staged bundle without activating runtime ownership."
    });
    transaction.updateImportReport(accepted);
    this.#pendingStagingCleanup = staged.stagingPath;
    const project = transaction.getCurrentProject();
    const events = project
      ? [
          this.#appendEvent(transaction, {
            event_type: "ImportCommitted",
            project_id: project.id,
            aggregate: { object_type: "import_report", id: accepted.id, domain_version: 1 },
            aggregate_revision: 1,
            actor_id: command.actor_id,
            command,
            payload: { import_report_id: accepted.id, runtime_ownership: accepted.runtime_ownership, history },
            occurred_at: this.#now()
          })
        ]
      : [];
    return this.#success(
      command,
      { object_type: "import_report", id: accepted.id, domain_version: 1 },
      project?.revision ?? existing?.revision ?? 1,
      events,
      { import_report: accepted }
    );
  }

  #historyEvents(events: EventEnvelope[]): EventEnvelope[] {
    return events.filter(
      (event) =>
        event.event_type !== "ProjectExported" &&
        event.event_type !== "ImportStaged" &&
        event.event_type !== "ImportCommitted"
    );
  }

  #historyOutbox(events: EventEnvelope[]): Array<{ id: InternalId; status: string }> {
    const historyIds = new Set(events.map((event) => event.event_id));
    return this.#store
      .listOutbox()
      .filter((item) => historyIds.has(item.event_id))
      .map((item) => ({ id: item.id, status: item.status }));
  }

  #currentContentDigest(transaction: StoreTransaction, projectId: string): string {
    const project = transaction.getCurrentProject();
    if (!project || project.id !== projectId) return "";
    const exported = this.#portableExportInput(transaction, project);
    return exportProjectBundle({
      projectId,
      exporterActorId: project.id,
      sourceInstanceId: project.instance_id,
      exportedAt: this.#now(),
      manifestId: this.#id(),
      facts: exported.facts,
      events: exported.events,
      outbox: exported.outbox,
      ownershipState: "active",
      latestRevision: exported.latestRevision
    }).content_digest.value;
  }

  #portableExportInput(
    transaction: StoreTransaction,
    project: Project,
    changeId?: InternalId
  ): {
    facts: PortableFact[];
    events: Array<{ event_id: string; event_sequence: number }>;
    outbox: Array<{ id: InternalId; status: string }>;
    latestRevision: number;
  } {
    const collected = transaction.listPortableFacts().filter((fact) => this.#includePortableFact(fact, project.id, changeId));
    const events = collected
      .filter((fact) => fact.object_type === "event")
      .map((fact) => ({
        event_id: fact.id,
        event_sequence: Number(fact.payload.event_sequence ?? fact.domain_version ?? 0)
      }))
      .sort((left, right) => left.event_sequence - right.event_sequence);
    const historyIds = new Set(events.map((item) => item.event_id));
    const facts = collected.filter(
      (fact) => fact.object_type !== "outbox_message" || historyIds.has(String(fact.payload.event_id ?? ""))
    );
    const outbox = facts
      .filter((fact) => fact.object_type === "outbox_message")
      .map((fact) => ({ id: fact.id as InternalId, status: String(fact.payload.status ?? "") }));
    const revisions = facts
      .map((fact) => fact.domain_version ?? (typeof fact.payload.revision === "number" ? fact.payload.revision : 0))
      .filter((value) => value > 0);
    return {
      facts,
      events,
      outbox,
      latestRevision: Math.max(project.revision, ...revisions)
    };
  }

  #includePortableFact(fact: PortableFact, projectId: string, changeId?: InternalId): boolean {
    if (fact.object_type === "event") {
      const eventType = String(fact.payload.event_type ?? "");
      if (eventType === "ProjectExported" || eventType === "ImportStaged" || eventType === "ImportCommitted") {
        return false;
      }
      if (String(fact.payload.project_id ?? "") !== projectId) return false;
      if (!changeId) return true;
      return (
        String(fact.payload.aggregate && typeof fact.payload.aggregate === "object"
          ? (fact.payload.aggregate as { id?: string }).id
          : "") === changeId || fact.payload.change_id === changeId
      );
    }
    if (fact.object_type === "outbox_message") {
      return String(fact.payload.project_id ?? "") === projectId;
    }
    if (String(fact.payload.project_id ?? fact.id) !== projectId && fact.payload.project_id !== undefined) {
      return false;
    }
    if (!changeId) return true;
    if (
      fact.object_type === "project" ||
      fact.object_type === "actor" ||
      fact.object_type === "role" ||
      fact.object_type === "assignment" ||
      fact.object_type === "project_policy" ||
      fact.object_type === "policy_snapshot" ||
      fact.object_type === "change_profile"
    ) {
      return true;
    }
    return fact.id === changeId || fact.payload.change_id === changeId;
  }

  #factsFromManifest(manifest: ExportManifest): PortableFact[] {
    return manifest.entries.map((entry) => ({
      object_type: entry.object_type,
      schema_version: entry.schema_version,
      id: entry.id,
      ...(entry.domain_version ? { domain_version: entry.domain_version } : {}),
      payload: { ...entry.payload }
    }));
  }

  #readStagedImport(summary: string): { manifest: ExportManifest; stagingPath: string } | { code: string; message: string } {
    const encoded = /staging=([^;]+)/.exec(summary)?.[1];
    const bundleClaimed = /(?:^|[;\s])bundle_digest=([0-9a-f]{64})/.exec(summary)?.[1];
    const contentClaimed = /(?:^|[;\s])content_digest=([0-9a-f]{64})/.exec(summary)?.[1];
    if (!encoded || !bundleClaimed || !contentClaimed) {
      return { code: "DIGEST_MISMATCH", message: "CommitImport 必须重新核对 staging bundle 的 digest" };
    }
    const stagingPath = decodeURIComponent(encoded);
    try {
      const validated = this.#io.readStagedBundle(stagingPath, { value: bundleClaimed }, dirname(stagingPath));
      if (validated.manifest.content_digest.value !== contentClaimed) {
        return { code: "DIGEST_MISMATCH", message: "content digest does not match staged receipt" };
      }
      return { manifest: validated.manifest, stagingPath };
    } catch (error) {
      if (error instanceof PortableImportError) {
        return { code: error.code, message: error.message };
      }
      return { code: "DIGEST_MISMATCH", message: "CommitImport 必须重新核对 staging bundle 的 digest" };
    }
  }

  #advanceLifecycle(
    transaction: StoreTransaction,
    change: Change,
    expectedRevision: number,
    now: string,
    command: AnyCommand,
    to: ChangeLifecycleState
  ): Change {
    const from = change.lifecycle_state as ChangeLifecycleState;
    if (from === to || !canAdvanceLifecycle(from, to)) {
      return this.#touchChange(transaction, change, expectedRevision, now);
    }
    const next: Change = {
      ...change,
      lifecycle_state: to,
      updated_at: now,
      revision: change.revision + 1
    };
    if (isTerminalLifecycle(to) && to !== "DeliveryClosed") {
      next.operating_status = change.operating_status;
    }
    transaction.updateChange(next, expectedRevision);
    transaction.insertTransition({
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: change.project_id,
      change_id: change.id,
      command_id: command.command_id,
      transition_type: "lifecycle_changed",
      from_lifecycle: from,
      to_lifecycle: to,
      from_status: change.operating_status,
      to_status: next.operating_status,
      actor_id: command.actor_id ?? change.owner_actor_id,
      occurred_at: now
    });
    return next;
  }

  #touchChange(transaction: StoreTransaction, change: Change, expectedRevision: number, now: string): Change {
    const next = { ...change, updated_at: now, revision: change.revision + 1 };
    transaction.updateChange(next, expectedRevision);
    return next;
  }

  #evidenceFingerprint(transaction: StoreTransaction, changeId: InternalId): string {
    return requestDigest(
      transaction.listEvidenceByChange(changeId).map((item) => ({
        id: item.id,
        stance: item.stance,
        digest: item.digest.value,
        validity: projectValidity(transaction.listImpactAssessmentsBySubject(item.id))
      }))
    );
  }

  #liveReleaseAuthorizationDigest(
    transaction: StoreTransaction,
    release: { change_id: InternalId; artifact_id: InternalId; artifact_digest: Digest; environment_id: InternalId },
    scope: { in: string[]; out: string[] },
    window: { starts_at: string; ends_at: string },
    recovery: RecoveryStrategyDraft
  ) {
    const latest = [...transaction.listIndependentEvaluationsByChange(release.change_id)]
      .reverse()
      .find((item) => item.artifact_id === release.artifact_id);
    return releaseAuthorizationDigest({
      artifactDigest: release.artifact_digest,
      environmentId: release.environment_id,
      scope,
      window,
      recovery,
      evidenceFingerprint: this.#evidenceFingerprint(transaction, release.change_id),
      ...(latest ? { evaluationInputDigest: latest.input_digest } : {})
    });
  }

  #releaseLiveDigest(transaction: StoreTransaction, release: Release) {
    const pack = release.package_id ? transaction.getReleasePackage(release.package_id) : undefined;
    const strategy = release.recovery_strategy_id
      ? transaction.getRecoveryStrategy(release.recovery_strategy_id)
      : undefined;
    if (!pack || !strategy) return release.authorization_digest;
    return this.#liveReleaseAuthorizationDigest(transaction, release, pack.scope, pack.window, {
      trigger: strategy.trigger,
      kind: strategy.kind,
      target_digest: strategy.target_digest,
      scope: strategy.scope,
      steps: strategy.steps,
      verify_checks: strategy.verify_checks,
      authorization: strategy.authorization
    });
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
    const allowedWhenTerminal =
      command.command_type === "ArchiveChange" ||
      command.command_type === "CompleteRun" ||
      command.command_type === "FailRun" ||
      command.command_type === "CancelRun" ||
      command.command_type === "HeartbeatRun";
    if (this.#changeIsTerminal(transaction, change.id) && !allowedWhenTerminal) {
      return domainError(
        command.correlation_id,
        "CHANGE_ALREADY_TERMINAL",
        "已关闭、取消、取代或归档的 Change 不能再创建执行或交付事实",
        "conflict"
      );
    }
    return { ...context, change, expectedRevision: command.expected_revision };
  }

  #authoritativeImpactDigests(
    transaction: StoreTransaction,
    command: AssessImpactCommand,
    changeId: InternalId
  ): { old: Digest; new: Digest } | DomainError {
    const claimedOld = command.payload.old_input_digest;
    const claimedNew = command.payload.new_input_digest;
    if (command.payload.subject_type === "artifact") {
      const subject = transaction.getArtifact(command.payload.subject_id);
      if (!subject || subject.change_id !== changeId) {
        return domainError(
          command.correlation_id,
          "IMPACT_SUBJECT_NOT_FOUND",
          "影响评估必须绑定已持久化的 Artifact",
          "not_found"
        );
      }
      if (claimedOld.value !== subject.digest.value) {
        return domainError(
          command.correlation_id,
          "IMPACT_SUBJECT_DIGEST_MISMATCH",
          "Impact old digest 必须等于已持久化 Artifact digest",
          "conflict"
        );
      }
      const replacementExists =
        claimedNew.value === subject.digest.value ||
        transaction.listArtifactsByChange(changeId).some((item) => item.digest.value === claimedNew.value);
      if (!replacementExists) {
        return domainError(
          command.correlation_id,
          "IMPACT_SUBJECT_DIGEST_MISMATCH",
          "Impact new digest 必须等于同一 Change 上已记录的 Artifact digest",
          "conflict"
        );
      }
      return { old: subject.digest, new: claimedNew };
    }
    if (command.payload.subject_type === "environment") {
      const environment = transaction.getEnvironment(command.payload.subject_id);
      if (!environment) {
        return domainError(
          command.correlation_id,
          "IMPACT_SUBJECT_NOT_FOUND",
          "影响评估必须绑定已持久化的 Environment",
          "not_found"
        );
      }
      const current = {
        algorithm: "sha256" as const,
        value: requestDigest({
          id: environment.id,
          revision: environment.revision,
          adapter_ref: environment.adapter_ref,
          kind: environment.kind,
          environment_key: environment.environment_key
        }),
        subject: "environment"
      };
      if (claimedNew.value !== current.value || claimedOld.value !== current.value) {
        return domainError(
          command.correlation_id,
          "IMPACT_SUBJECT_DIGEST_MISMATCH",
          "Environment Impact digest 必须等于当前 Environment 事实",
          "conflict"
        );
      }
      return { old: current, new: current };
    }
    if (command.payload.subject_type === "context_pack" || command.payload.trigger === "context") {
      const pack = transaction.getContextPackManifest(command.payload.subject_id);
      if (!pack) {
        return domainError(
          command.correlation_id,
          "IMPACT_SUBJECT_NOT_FOUND",
          "影响评估必须绑定已持久化的 Context Pack",
          "not_found"
        );
      }
      if (claimedNew.value !== pack.digest.value || claimedOld.value !== pack.digest.value) {
        return domainError(
          command.correlation_id,
          "IMPACT_SUBJECT_DIGEST_MISMATCH",
          "Context Impact digest 必须等于已持久化 Context Pack digest",
          "conflict"
        );
      }
      return { old: pack.digest, new: pack.digest };
    }
    return domainError(
      command.correlation_id,
      "IMPACT_SUBJECT_NOT_FOUND",
      "影响评估只能作用于已持久化的权威主体",
      "not_found"
    );
  }

  #changeIsTerminal(transaction: StoreTransaction, changeId: InternalId): boolean {
    const change = transaction.getChange(changeId);
    if (change && isTerminalLifecycle(change.lifecycle_state as ChangeLifecycleState)) return true;
    if (transaction.listCancellationRecordsByChange(changeId).length > 0) return true;
    if (transaction.listSupersessionRecordsByChange(changeId).length > 0) return true;
    if (transaction.listArchiveRecordsByChange(changeId).length > 0) return true;
    return this.#store
      .listEvents()
      .some((event) => event.event_type === "ChangeClosed" && event.aggregate.id === changeId);
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
    const actor = transaction.getActor(command.actor_id);
    if (!actor) {
      return domainError(command.correlation_id, "ACTOR_NOT_FOUND", "命令必须绑定已持久化的 Actor", "not_found");
    }
    const ownership = transaction.getProjectRuntimeOwnership(project.id)?.ownership ?? "active";
    if (ownership === "dormant" && !DORMANT_ALLOWED_COMMANDS.has(command.command_type)) {
      return domainError(
        command.correlation_id,
        "PROJECT_RUNTIME_DORMANT",
        "dormant Project 保持只读运行状态，禁止启动 Run 或执行外部操作",
        "forbidden"
      );
    }
    return { project, actorId: command.actor_id };
  }

  #requireHumanActor(
    transaction: StoreTransaction,
    command: Exclude<AnyCommand, InitializeProjectCommand>
  ): DomainError | undefined {
    const origin = command.source.origin as string;
    if (origin !== "human_cli" && origin !== "human_workbench") {
      return domainError(
        command.correlation_id,
        "HUMAN_ACTOR_REQUIRED",
        "该操作必须由 Human Actor 通过 CLI 或 Workbench 提交",
        "forbidden"
      );
    }
    const actor = command.actor_id ? transaction.getActor(command.actor_id) : undefined;
    if (!actor || actor.actor_type !== "human") {
      return domainError(
        command.correlation_id,
        "HUMAN_ACTOR_REQUIRED",
        "该操作必须绑定 Human Actor",
        "forbidden"
      );
    }
    return undefined;
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
