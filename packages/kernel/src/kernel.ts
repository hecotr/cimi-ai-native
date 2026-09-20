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
  type InitializeProjectCommand,
  type InternalId,
  type Project,
  type Role
} from "@cimiloop/protocol";
import {
  StoreConflictError,
  type OutboxMessage,
  type ProjectStore,
  type ProposedEvent,
  type StoreTransaction
} from "@cimiloop/store";
import { commandDigest } from "./canonical.js";
import { createDraftChange, pauseDraftChange, resumeDraftChange } from "./change.js";
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
      default:
        return domainError(
          command.correlation_id,
          "UNSUPPORTED_COMMAND",
          "当前 Kernel 尚未实现该命令",
          "validation",
          false,
          { command_type: command.command_type }
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
