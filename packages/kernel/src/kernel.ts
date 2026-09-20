import {
  ProtocolValidationError,
  SCHEMA_VERSION,
  createInternalId,
  formatValidationErrors,
  parseCommand,
  type Actor,
  type AnyCommand,
  type Assignment,
  type Change,
  type CommandSuccess,
  type DomainError,
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
  type Task
} from "@cimiloop/protocol";
import {
  StoreConflictError,
  type OutboxMessage,
  type ProjectStore,
  type ProposedEvent,
  type StoreTransaction
} from "@cimiloop/store";
import { createContractAmendment, createPlanAmendment, nextDomainVersion } from "./amendment.js";
import { commandDigest } from "./canonical.js";
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
import { createKnowledgeImpactAssessment, validateKnowledgeImpact } from "./knowledge-impact.js";
import { createPlanCandidate, createPlanTasks, createPlanVersion, validateKnowledgeTasks } from "./plan.js";
import { createRiskAssessment, createRiskProfile, validateRiskDimensions } from "./risk.js";
import { validateTaskDag } from "./task-dag.js";
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

  listEvents(): EventEnvelope[] {
    return this.#store.listEvents();
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
