import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CimiLoopKernel } from "@cimiloop/kernel";
import {
  SCHEMA_VERSION,
  createInternalId,
  parseArtifactShowResult,
  parseClaimShowResult,
  parseEvidencePackageShowResult,
  parseEvidenceShowResult,
  parseEnvironmentShowResult,
  parseReleaseShowResult,
  parseDeploymentShowResult,
  parseEvaluationShowResult,
  parseChangeListResult,
  parseChangeRoomResult,
  parseChangeShowResult,
  parseCommandResult,
  parseDecisionInboxResult,
  parseDoctorResult,
  parseRunListResult,
  parseRunShowResult,
  parseTimelineResult,
  parseWorkItemListResult,
  parseWorkItemShowResult,
  type AnyCommand,
  type DecisionOutcome,
  type InternalId,
  type ProviderDescriptor
} from "@cimiloop/protocol";
import { ClaudeCodeRuntimeAdapter } from "@cimiloop/runtime-claude-code";
import { SqliteProjectRegistry, SqliteProjectStore } from "@cimiloop/store-sqlite";
import { createRunOrchestrator, openProject } from "./composition.js";
import { writeInstance } from "./instance.js";
import { locateProject, readGitIdentity, registryDatabasePath } from "./location.js";
import { formatChangeRoom, formatDecisionInbox, inputError, isDomainError, outputError, outputJson } from "./output.js";

export interface GlobalOptions {
  json?: boolean;
  projectDir?: string;
  commandId?: string;
}

interface InitOptions extends GlobalOptions {
  name?: string;
  ownerName?: string;
  ownerEmail?: string;
  yes?: boolean;
}

const now = (): string => new Date().toISOString();

const source = (repositoryPath: string) => ({
  origin: "human_cli" as const,
  producer: "cimiloop-cli",
  repository_path: repositoryPath
});

const commandIdentity = (options: GlobalOptions): { commandId: InternalId; correlationId: InternalId } => ({
  commandId: options.commandId as InternalId | undefined ?? createInternalId(),
  correlationId: createInternalId()
});

const confirmIdentity = async (
  suggestedName: string | undefined,
  suggestedEmail: string | undefined,
  options: InitOptions
): Promise<{ name: string; email?: string }> => {
  if (options.ownerName) {
    return { name: options.ownerName, ...(options.ownerEmail ? { email: options.ownerEmail } : {}) };
  }
  if (options.yes) {
    if (!suggestedName) throw new Error("非交互初始化必须提供 --owner-name，或配置 Git user.name");
    return { name: suggestedName, ...(suggestedEmail ? { email: suggestedEmail } : {}) };
  }
  if (!stdin.isTTY) {
    throw new Error("非交互初始化需要 --yes 和明确的 Owner 信息");
  }

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const name = (await prompt.question(`Owner 名称${suggestedName ? ` [${suggestedName}]` : ""}: `)).trim() || suggestedName;
    if (!name) throw new Error("Owner 名称不能为空");
    const email =
      (await prompt.question(`Owner 邮箱${suggestedEmail ? ` [${suggestedEmail}]` : "（可选）"}: `)).trim() ||
      suggestedEmail;
    const confirmation = (await prompt.question(`确认使用 ${name}${email ? ` <${email}>` : ""}？[Y/n] `)).trim();
    if (confirmation && !/^y(es)?$/i.test(confirmation)) throw new Error("初始化已取消");
    return { name, ...(email ? { email } : {}) };
  } finally {
    prompt.close();
  }
};

export const initProject = async (options: InitOptions): Promise<void> => {
  const start = options.projectDir ? resolve(options.projectDir) : process.cwd();
  const location = locateProject(start, Boolean(options.projectDir));
  const identity = readGitIdentity(location.repositoryPath);
  const owner = await confirmIdentity(identity.name, identity.email, options);
  mkdirSync(location.dataDirectory, { recursive: true });
  const store = new SqliteProjectStore(location.databasePath);
  const kernel = new CimiLoopKernel({ store });
  try {
    const ids = commandIdentity(options);
    const command: AnyCommand = {
      schema_version: SCHEMA_VERSION,
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: "InitializeProject",
      requested_at: now(),
      source: source(location.repositoryPath),
      payload: {
        name: options.name ?? location.suggestedName,
        repository_kind: location.repositoryKind,
        repository_path: location.repositoryPath,
        owner_name: owner.name,
        ...(owner.email ? { owner_email: owner.email } : {})
      }
    };
    const result = kernel.execute(command);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (!("project" in result.data)) throw new Error("初始化命令返回了非 Project 结果");
    const project = result.data.project;
    const actor = result.data.actor;
    writeInstance(location.instancePath, {
      schema_version: SCHEMA_VERSION,
      instance_id: project.instance_id,
      project_id: project.id,
      actor_id: actor.id,
      created_at: command.requested_at
    });
    const registry = new SqliteProjectRegistry(registryDatabasePath());
    try {
      registry.register({
        project_id: project.id,
        repository_path: location.repositoryPath,
        database_path: location.databasePath,
        last_opened_at: now()
      });
    } finally {
      registry.close();
    }
    if (options.json) outputJson(result, parseCommandResult);
    else {
      stdout.write(`CimiLoop Project 已初始化：${project.name}\n`);
      stdout.write(`Project ID：${project.id}\n`);
      stdout.write(`Project Owner：${actor.display_name}\n`);
    }
  } finally {
    store.close();
  }
};

export const createChange = (title: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const ids = commandIdentity(options);
    const result = context.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: "CreateChange",
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      source: source(context.location.repositoryPath),
      payload: { title }
    });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (!("change" in result.data)) throw new Error("创建命令返回了非 Change 结果");
    const change = result.data.change;
    if (options.json) outputJson(result, parseCommandResult);
    else stdout.write(`已创建 ${change.display_key}：${change.title}\nInternal ID：${change.id}\n`);
  } finally {
    context.store.close();
  }
};

export const listChanges = (options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const changes = context.kernel.listChanges();
    if (options.json) return outputJson({ ok: true, changes }, parseChangeListResult);
    if (changes.length === 0) return void stdout.write("当前 Project 暂无 Change。\n");
    for (const change of changes) {
      stdout.write(`${change.display_key}\t${change.lifecycle_state}\t${change.operating_status}\t${change.title}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const showChange = (idOrKey: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getChange(idOrKey);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson({ ok: true, change: result }, parseChangeShowResult);
    stdout.write(`${result.display_key} ${result.title}\n`);
    stdout.write(`生命周期：${result.lifecycle_state}\n运行状态：${result.operating_status}\nRevision：${result.revision}\n`);
    if (result.pause_reason) stdout.write(`暂停原因：${result.pause_reason}\n`);
  } finally {
    context.store.close();
  }
};

const transitionChange = (
  commandType: "PauseChange" | "ResumeChange",
  idOrKey: string,
  reason: string | undefined,
  options: GlobalOptions & { expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const current = context.kernel.getChange(idOrKey);
    if (isDomainError(current)) return outputError(current, Boolean(options.json));
    const expectedRevision = options.expectedRevision ? Number(options.expectedRevision) : current.revision;
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("expected-revision 必须是正整数");
    const ids = commandIdentity(options);
    const command = {
      schema_version: SCHEMA_VERSION,
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: commandType,
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      target: { object_type: "change" as const, id: current.id, domain_version: 1 },
      expected_revision: expectedRevision,
      source: source(context.location.repositoryPath),
      payload: commandType === "PauseChange" ? { reason: reason ?? "" } : {}
    };
    const result = context.kernel.execute(command);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (!("change" in result.data)) throw new Error("状态命令返回了非 Change 结果");
    const change = result.data.change;
    if (options.json) outputJson(result, parseCommandResult);
    else stdout.write(`${change.display_key} 当前状态：${change.operating_status}（Revision ${change.revision}）\n`);
  } finally {
    context.store.close();
  }
};

export const pauseChange = (
  idOrKey: string,
  reason: string,
  options: GlobalOptions & { expectedRevision?: string }
): void => transitionChange("PauseChange", idOrKey, reason, options);

export const resumeChange = (
  idOrKey: string,
  options: GlobalOptions & { expectedRevision?: string }
): void => transitionChange("ResumeChange", idOrKey, undefined, options);

export interface RevisionOptions extends GlobalOptions {
  expectedRevision?: string;
}

const readJsonValue = (filePath: string): { ok: true; value: unknown } | ReturnType<typeof inputError> => {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return inputError("CLI_INPUT_INVALID", "无法读取输入文件", { source: "command-file" });
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return inputError("CLI_INPUT_INVALID", "输入文件不是合法 JSON", { source: "command-file" });
  }
};

const expectedRevisionOf = (value: string | undefined, current: number): number | ReturnType<typeof inputError> => {
  if (value === undefined) return current;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return inputError("CLI_INPUT_INVALID", "expected-revision 必须是正整数");
  }
  return parsed;
};

const executeChangeCommand = (
  options: RevisionOptions,
  idOrKey: string,
  commandType: AnyCommand["command_type"],
  payload: Record<string, unknown> | ((changeId: InternalId) => Record<string, unknown>)
): void => {
  const context = openProject(options);
  try {
    const current = context.kernel.getChange(idOrKey);
    if (isDomainError(current)) return outputError(current, Boolean(options.json));
    const expectedRevision = expectedRevisionOf(options.expectedRevision, current.revision);
    if (typeof expectedRevision !== "number") return outputError(expectedRevision, Boolean(options.json));
    const ids = commandIdentity(options);
    const result = context.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: commandType,
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      target: { object_type: "change", id: current.id, domain_version: 1 },
      expected_revision: expectedRevision,
      source: source(context.location.repositoryPath),
      payload: typeof payload === "function" ? payload(current.id) : payload
    });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    stdout.write(`${current.display_key} 已执行 ${commandType}（Revision ${result.revision}）\n`);
  } finally {
    context.store.close();
  }
};

export const bootstrapSoloGovernance = (
  idOrKey: string,
  options: RevisionOptions & { intentOwner?: string; technicalOwner?: string }
): void => {
  const context = openProject(options);
  try {
    const current = context.kernel.getChange(idOrKey);
    if (isDomainError(current)) return outputError(current, Boolean(options.json));
    const expectedRevision = expectedRevisionOf(options.expectedRevision, current.revision);
    if (typeof expectedRevision !== "number") return outputError(expectedRevision, Boolean(options.json));
    const ids = commandIdentity(options);
    const result = context.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: "BootstrapSoloGovernance",
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      target: { object_type: "change", id: current.id, domain_version: 1 },
      expected_revision: expectedRevision,
      source: source(context.location.repositoryPath),
      payload: {
        change_id: current.id,
        intent_owner_actor_id: options.intentOwner ?? context.instance.actor_id,
        technical_owner_actor_id: options.technicalOwner ?? context.instance.actor_id
      }
    });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    stdout.write(`${current.display_key} 已完成 Solo 治理初始化（Revision ${result.revision}）\n`);
  } finally {
    context.store.close();
  }
};

export const submitContractCandidate = (idOrKey: string, filePath: string, options: RevisionOptions): void => {
  const payload = readJsonValue(filePath);
  if (isDomainError(payload)) return outputError(payload, Boolean(options.json));
  if (!payload.value || typeof payload.value !== "object" || Array.isArray(payload.value)) {
    return outputError(inputError("CLI_INPUT_INVALID", "Contract 文件必须是 JSON 对象"), Boolean(options.json));
  }
  executeChangeCommand(options, idOrKey, "SubmitContractCandidate", payload.value as Record<string, unknown>);
};

export const requestIntentDecision = (idOrKey: string, options: RevisionOptions): void => {
  executeChangeCommand(options, idOrKey, "RequestIntentDecision", (changeId) => ({ change_id: changeId }));
};

export const submitPlanCandidate = (idOrKey: string, filePath: string, options: RevisionOptions): void => {
  const payload = readJsonValue(filePath);
  if (isDomainError(payload)) return outputError(payload, Boolean(options.json));
  if (!payload.value || typeof payload.value !== "object" || Array.isArray(payload.value)) {
    return outputError(inputError("CLI_INPUT_INVALID", "Plan 文件必须是 JSON 对象"), Boolean(options.json));
  }
  executeChangeCommand(options, idOrKey, "SubmitPlanCandidate", payload.value as Record<string, unknown>);
};

export const requestPlanDecision = (idOrKey: string, options: RevisionOptions): void => {
  executeChangeCommand(options, idOrKey, "RequestPlanDecision", (changeId) => ({ change_id: changeId }));
};

export const listDecisionInbox = (options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const inbox = context.kernel.listDecisionInbox(context.instance.actor_id);
    if (isDomainError(inbox)) return outputError(inbox, Boolean(options.json));
    if (options.json) return outputJson(inbox, parseDecisionInboxResult);
    stdout.write(formatDecisionInbox(inbox));
  } finally {
    context.store.close();
  }
};

export const submitDecision = (
  requestId: string,
  options: RevisionOptions & {
    outcome: DecisionOutcome;
    actingRole: string;
    reason: string;
    feedbackFile?: string;
  }
): void => {
  const context = openProject(options);
  try {
    const request = context.kernel.getDecisionRequest(requestId as InternalId);
    if (isDomainError(request)) return outputError(request, Boolean(options.json));
    const current = context.kernel.getChange(request.request.change_id);
    if (isDomainError(current)) return outputError(current, Boolean(options.json));
    const expectedRevision = expectedRevisionOf(options.expectedRevision, current.revision);
    if (typeof expectedRevision !== "number") return outputError(expectedRevision, Boolean(options.json));
    let feedback: unknown;
    if (options.feedbackFile) {
      const loaded = readJsonValue(options.feedbackFile);
      if (isDomainError(loaded)) return outputError(loaded, Boolean(options.json));
      feedback = loaded.value;
    }
    const ids = commandIdentity(options);
    const result = context.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: "SubmitDecision",
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      expected_revision: expectedRevision,
      source: source(context.location.repositoryPath),
      payload: {
        request_id: request.request.id,
        outcome: options.outcome,
        acting_role_id: options.actingRole,
        reason: options.reason,
        ...(feedback ? { feedback } : {})
      }
    });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("change" in result.data) {
      stdout.write(
        `${result.data.change.display_key} Decision ${options.outcome}（Revision ${result.data.change.revision}）\n`
      );
    }
  } finally {
    context.store.close();
  }
};

export const showRoom = (idOrKey: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const current = context.kernel.getChange(idOrKey);
    if (isDomainError(current)) return outputError(current, Boolean(options.json));
    const room = context.kernel.getChangeRoom(current.id);
    if (isDomainError(room)) return outputError(room, Boolean(options.json));
    if (options.json) return outputJson(room, parseChangeRoomResult);
    stdout.write(formatChangeRoom(room, current.revision));
  } finally {
    context.store.close();
  }
};

export const showTimeline = (idOrKey: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const current = context.kernel.getChange(idOrKey);
    if (isDomainError(current)) return outputError(current, Boolean(options.json));
    const timeline = context.kernel.getTimeline(current.id);
    if (isDomainError(timeline)) return outputError(timeline, Boolean(options.json));
    if (options.json) return outputJson(timeline, parseTimelineResult);
    for (const event of timeline.events) {
      stdout.write(`${event.event_sequence}\t${event.event_type}\t${event.summary}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const doctor = (options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const project = context.kernel.getProject();
    if (isDomainError(project)) return outputError(project, Boolean(options.json));
    const report = {
      ok: true,
      project_id: project.id,
      repository_path: context.location.repositoryPath,
      database_path: context.location.databasePath,
      changes: context.kernel.listChanges().length,
      events: context.kernel.listEvents().length,
      pending_outbox: context.store.listOutbox("pending").length
    };
    if (options.json) outputJson(report, parseDoctorResult);
    else {
      stdout.write("CimiLoop Project 健康检查通过。\n");
      stdout.write(`Change：${report.changes}，Event：${report.events}，待投递 Outbox：${report.pending_outbox}\n`);
    }
  } finally {
    context.store.close();
  }
};

const sha256 = (value: string | Buffer, subject: string) => ({
  algorithm: "sha256" as const,
  value: createHash("sha256").update(value).digest("hex"),
  subject
});

const mutate = (
  context: ReturnType<typeof openProject>,
  changeId: string,
  commandType: AnyCommand["command_type"],
  payload: Record<string, unknown>,
  options: GlobalOptions & { expectedRevision?: string }
) => {
  const change = context.kernel.getChange(changeId);
  if (isDomainError(change)) return change;
  const ids = commandIdentity(options);
  return context.kernel.execute({
    schema_version: SCHEMA_VERSION,
    command_id: ids.commandId,
    correlation_id: ids.correlationId,
    command_type: commandType,
    requested_at: now(),
    project_id: context.instance.project_id,
    actor_id: context.instance.actor_id,
    expected_revision: options.expectedRevision ? Number(options.expectedRevision) : change.revision,
    target: { object_type: "change", id: change.id, domain_version: 1 },
    source: source(context.location.repositoryPath),
    payload
  } as AnyCommand);
};

const defaultProvider = (projectId: InternalId): ProviderDescriptor => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  provider_type: "runtime",
  name: "claude-code",
  implementation_version: "cli",
  capability_ids: ["code.modify"],
  version_digest: sha256("claude-code/cli", "provider"),
  created_at: now()
});

export const tickScheduler = (idOrKey: string, options: GlobalOptions & { expectedRevision?: string }): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const result = mutate(context, change.id, "CreateExecutionWorkItems", { change_id: change.id }, options);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("work_items" in result.data) {
      stdout.write(`已调度 ${result.data.work_items.length} 个 Work Item。\n`);
    }
  } finally {
    context.store.close();
  }
};

export const listWorkItems = (idOrKey: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const work_items = context.kernel.listWorkItemsByChange(change.id);
    if (options.json) return outputJson({ ok: true, work_items }, parseWorkItemListResult);
    if (work_items.length === 0) return void stdout.write("当前 Change 没有 Work Item。\n");
    for (const item of work_items) {
      stdout.write(`${item.id}\t${item.kind}\t${item.status}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const showWorkItem = (workItemId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const workItem = context.kernel.getWorkItem(workItemId as InternalId);
    if (isDomainError(workItem)) return outputError(workItem, Boolean(options.json));
    const lease = context.kernel.getActiveLeaseByWorkItem(workItem.id);
    if (options.json) {
      return outputJson({ ok: true, work_item: workItem, ...(lease ? { lease } : {}) }, parseWorkItemShowResult);
    }
    stdout.write(`${workItem.id} ${workItem.kind} ${workItem.status}\n`);
  } finally {
    context.store.close();
  }
};

export const claimWorkItem = (workItemId: string, options: GlobalOptions & { expectedRevision?: string }): void => {
  const context = openProject(options);
  try {
    const workItem = context.kernel.getWorkItem(workItemId as InternalId);
    if (isDomainError(workItem)) return outputError(workItem, Boolean(options.json));
    const result = mutate(context, workItem.change_id, "ClaimWorkItem", { work_item_id: workItem.id }, options);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    stdout.write(`已领取 Work Item ${workItem.id}\n`);
  } finally {
    context.store.close();
  }
};

export const executeWorkItem = async (
  workItemId: string,
  options: GlobalOptions & { executable: string }
): Promise<void> => {
  const context = openProject(options);
  try {
    const workItem = context.kernel.getWorkItem(workItemId as InternalId);
    if (isDomainError(workItem)) return outputError(workItem, Boolean(options.json));
    const orchestrator = createRunOrchestrator(context.kernel, {
      runtime: new ClaudeCodeRuntimeAdapter({
        executable: options.executable,
        logDirectory: join(context.location.dataDirectory, "runtime-logs"),
        timeoutMs: 30_000
      }),
      projectId: context.instance.project_id,
      actorId: context.instance.actor_id,
      worktreePath: join(context.location.dataDirectory, "worktrees", workItem.change_id),
      contextDirectory: join(context.location.dataDirectory, "context"),
      providers: [defaultProvider(context.instance.project_id)],
      actorPermissions: ["workspace.write", "git.commit"],
      providerPermissions: ["workspace.write", "git.commit"]
    });
    const result = await orchestrator.executeReadyWorkItem(workItem.change_id);
    if (result.kind === "failed") {
      return outputError(inputError("ORCHESTRATOR_FAILURE", result.error), Boolean(options.json));
    }
    if (result.kind === "blocked") {
      return outputError(inputError(result.code, "缺少执行能力"), Boolean(options.json));
    }
    const run = context.kernel.getAgentRun(result.run.id);
    if (isDomainError(run)) return outputError(run, Boolean(options.json));
    if (options.json) return outputJson({ ok: true, run }, parseRunShowResult);
    stdout.write(`Run ${run.id} ${run.status}\n`);
  } finally {
    context.store.close();
  }
};

export const listRuns = (workItemId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const workItem = context.kernel.getWorkItem(workItemId as InternalId);
    if (isDomainError(workItem)) return outputError(workItem, Boolean(options.json));
    const runs = context.kernel.listAgentRuns(workItem.id);
    if (options.json) return outputJson({ ok: true, runs }, parseRunListResult);
    for (const run of runs) stdout.write(`${run.id}\t${run.status}\t${run.attempt}\n`);
  } finally {
    context.store.close();
  }
};

export const showRun = (runId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const run = context.kernel.getAgentRun(runId as InternalId);
    if (isDomainError(run)) return outputError(run, Boolean(options.json));
    if (options.json) return outputJson({ ok: true, run }, parseRunShowResult);
    stdout.write(`${run.id} ${run.status} attempt ${run.attempt}\n`);
    stdout.write(`log: ${run.log_reference}\n`);
  } finally {
    context.store.close();
  }
};

export const recordArtifact = (
  runId: string,
  options: GlobalOptions & { file: string; summary: string; expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const run = context.kernel.getAgentRun(runId as InternalId);
    if (isDomainError(run)) return outputError(run, Boolean(options.json));
    if (!existsSync(options.file)) writeFileSync(options.file, "");
    const bytes = readFileSync(options.file);
    const snapshot = mutate(
      context,
      run.change_id,
      "RecordSourceSnapshot",
      {
        run_id: run.id,
        snapshot_kind: "explicit_dirty_manifest",
        dirty: true,
        digest: sha256(run.id, "source_snapshot"),
        content_reference: `worktree://${run.change_id}#dirty`
      },
      options
    );
    if (isDomainError(snapshot) || !("snapshot" in snapshot.data)) {
      return outputError(
        isDomainError(snapshot) ? snapshot : inputError("SNAPSHOT_NOT_FOUND", "无法记录 Snapshot"),
        Boolean(options.json)
      );
    }
    const recorded = mutate(
      context,
      run.change_id,
      "RecordArtifact",
      {
        run_id: run.id,
        source_snapshot_id: snapshot.data.snapshot.id,
        context_pack_id: run.context_pack_id,
        binding_id: run.binding_id,
        digest: sha256(bytes, "artifact"),
        content_reference: pathToFileURL(resolve(options.file)).href,
        summary: options.summary
      },
      options
    );
    if (isDomainError(recorded)) return outputError(recorded, Boolean(options.json));
    if (options.json) return outputJson(recorded, parseCommandResult);
    if ("artifact" in recorded.data) stdout.write(`Artifact ${recorded.data.artifact.id}\n`);
  } finally {
    context.store.close();
  }
};

export const submitClaim = (
  idOrKey: string,
  options: GlobalOptions & {
    key: string;
    statement: string;
    category: string;
    obligation: string;
    source: string;
    expectedRevision?: string;
  }
): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const result = mutate(
      context,
      change.id,
      "SubmitClaim",
      {
        change_id: change.id,
        claim_key: options.key,
        statement: options.statement,
        category: options.category,
        obligation: options.obligation,
        source: options.source
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("claim" in result.data) stdout.write(`Claim ${result.data.claim.id} ${result.data.claim.claim_key}\n`);
  } finally {
    context.store.close();
  }
};

export const showClaim = (claimId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const claim = context.kernel.getClaim(claimId as InternalId);
    if (isDomainError(claim)) return outputError(claim, Boolean(options.json));
    if (options.json) return outputJson({ ok: true, claim }, parseClaimShowResult);
    stdout.write(`${claim.id}\t${claim.claim_key}\t${claim.obligation}\n`);
  } finally {
    context.store.close();
  }
};

export const recordEvidence = (
  idOrKey: string,
  options: GlobalOptions & {
    claim: string;
    stance: string;
    subjectType: string;
    subjectId: string;
    subjectDigest: string;
    reference: string;
    digest: string;
    producer: string;
    expectedRevision?: string;
  }
): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const result = mutate(
      context,
      change.id,
      "RecordEvidence",
      {
        change_id: change.id,
        claim_id: options.claim,
        stance: options.stance,
        subject_type: options.subjectType,
        subject_id: options.subjectId,
        subject_digest: { algorithm: "sha256", value: options.subjectDigest, subject: "artifact" },
        content_reference: options.reference,
        digest: { algorithm: "sha256", value: options.digest, subject: "evidence" },
        producer_role: options.producer
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("evidence" in result.data) stdout.write(`Evidence ${result.data.evidence.id} ${result.data.evidence.stance}\n`);
  } finally {
    context.store.close();
  }
};

export const showEvidence = (evidenceId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const evidence = context.kernel.getEvidence(evidenceId as InternalId);
    if (isDomainError(evidence)) return outputError(evidence, Boolean(options.json));
    if (options.json) return outputJson({ ok: true, evidence }, parseEvidenceShowResult);
    stdout.write(`${evidence.id}\t${evidence.stance}\t${evidence.producer_role}\n`);
  } finally {
    context.store.close();
  }
};

export const requestEvaluation = (
  idOrKey: string,
  options: GlobalOptions & { artifact: string; digest: string; requirementSet?: string; expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const requirementSet = options.requirementSet ?? context.kernel.getLatestGateRequirementSet(change.id)?.id;
    if (!requirementSet) {
      return outputError(inputError("REQUIREMENT_SET_NOT_FOUND", "评价需要 Requirement Set"), Boolean(options.json));
    }
    const result = mutate(
      context,
      change.id,
      "RequestEvaluation",
      {
        change_id: change.id,
        artifact_id: options.artifact,
        artifact_digest: { algorithm: "sha256", value: options.digest, subject: "artifact" },
        requirement_set_id: requirementSet
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("work_item" in result.data) stdout.write(`Evaluation Work Item ${result.data.work_item.id}\n`);
  } finally {
    context.store.close();
  }
};

export const completeEvaluation = (
  idOrKey: string,
  options: GlobalOptions & {
    evaluationId: string;
    artifact: string;
    digest: string;
    requirementSet?: string;
    inputDigest: string;
    result: string;
    reason: string;
    expectedRevision?: string;
  }
): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const requirementSet = options.requirementSet ?? context.kernel.getLatestGateRequirementSet(change.id)?.id;
    if (!requirementSet) {
      return outputError(inputError("REQUIREMENT_SET_NOT_FOUND", "评价需要 Requirement Set"), Boolean(options.json));
    }
    const result = mutate(
      context,
      change.id,
      "CompleteEvaluation",
      {
        change_id: change.id,
        evaluation_id: options.evaluationId,
        artifact_id: options.artifact,
        artifact_digest: { algorithm: "sha256", value: options.digest, subject: "artifact" },
        requirement_set_id: requirementSet,
        input_digest: { algorithm: "sha256", value: options.inputDigest, subject: "evaluation_input" },
        result: options.result,
        reason: options.reason
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("evaluation" in result.data) {
      stdout.write(`Evaluation ${result.data.evaluation.id} ${result.data.evaluation.result}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const showEvaluation = (evaluationId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const evaluation = context.kernel.getIndependentEvaluation(evaluationId as InternalId);
    if (isDomainError(evaluation)) return outputError(evaluation, Boolean(options.json));
    const assessments = context.kernel.listClaimAssessmentsByEvaluation(evaluation.id);
    if (options.json) return outputJson({ ok: true, evaluation, assessments }, parseEvaluationShowResult);
    stdout.write(`${evaluation.id}\t${evaluation.result}\t${evaluation.reason}\n`);
  } finally {
    context.store.close();
  }
};

export const createRepair = (
  idOrKey: string,
  options: GlobalOptions & {
    failedEvidence: string;
    sourceWorkItem: string;
    artifact: string;
    task: string;
    expectedRevision?: string;
  }
): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const result = mutate(
      context,
      change.id,
      "CreateRepairWorkItem",
      {
        change_id: change.id,
        failed_evidence_id: options.failedEvidence,
        source_work_item_id: options.sourceWorkItem,
        artifact_id: options.artifact,
        task_id: options.task
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("repair_link" in result.data) stdout.write(`Repair ${result.data.repair_link.repair_work_item_id}\n`);
  } finally {
    context.store.close();
  }
};

export const assessImpactCli = (
  idOrKey: string,
  options: GlobalOptions & {
    trigger: string;
    subjectType: string;
    subjectId: string;
    rule: string;
    oldDigest: string;
    newDigest: string;
    affected: string;
    expectedRevision?: string;
  }
): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const result = mutate(
      context,
      change.id,
      "AssessImpact",
      {
        change_id: change.id,
        trigger: options.trigger,
        subject_type: options.subjectType,
        subject_id: options.subjectId,
        rule: options.rule,
        old_input_digest: { algorithm: "sha256", value: options.oldDigest, subject: "artifact" },
        new_input_digest: { algorithm: "sha256", value: options.newDigest, subject: "artifact" },
        new_validity: options.rule.includes("integrity") || options.rule.includes("mismatch") ? "Invalid" : "Stale",
        affected_ids: [options.affected]
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("impact" in result.data) stdout.write(`Impact ${result.data.impact.id} ${result.data.impact.new_validity}\n`);
  } finally {
    context.store.close();
  }
};

export const showEvidencePackage = (idOrKey: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const pack = context.kernel.getEvidencePackage(change.id);
    if (isDomainError(pack)) return outputError(pack, Boolean(options.json));
    if (options.json) return outputJson(pack, parseEvidencePackageShowResult);
    stdout.write(
      `Package ${pack.package.id} claims=${pack.package.claim_ids.length} evidence=${pack.package.evidence_ids.length} evaluations=${pack.package.evaluation_ids.length}\n`
    );
  } finally {
    context.store.close();
  }
};

export const showArtifact = (artifactId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const artifact = context.kernel.getArtifact(artifactId as InternalId);
    if (isDomainError(artifact)) return outputError(artifact, Boolean(options.json));
    if (options.json) return outputJson({ ok: true, artifact }, parseArtifactShowResult);
    stdout.write(`${artifact.id} ${artifact.status} ${artifact.content_reference}\n`);
  } finally {
    context.store.close();
  }
};

export const registerEnvironment = (
  idOrKey: string,
  options: GlobalOptions & { key: string; kind: string; name: string; adapter: string; expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const result = mutate(
      context,
      change.id,
      "RegisterEnvironment",
      {
        environment_key: options.key,
        kind: options.kind,
        display_name: options.name,
        adapter_ref: options.adapter
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("environment" in result.data) stdout.write(`Environment ${result.data.environment.environment_key}\n`);
  } finally {
    context.store.close();
  }
};

export const showEnvironment = (environmentId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const shown = context.kernel.showEnvironment(environmentId as InternalId);
    if (isDomainError(shown)) return outputError(shown, Boolean(options.json));
    if (options.json) return outputJson(shown, parseEnvironmentShowResult);
    stdout.write(`${shown.environment.environment_key}\t${shown.environment.kind}\t${shown.environment.status}\n`);
  } finally {
    context.store.close();
  }
};

export const createReleaseCli = (
  idOrKey: string,
  options: GlobalOptions & {
    kind: string;
    artifact: string;
    digest: string;
    environment: string;
    scope: string;
    windowStart: string;
    windowEnd: string;
    recoveryFile: string;
    expectedRevision?: string;
  }
): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const recovery = JSON.parse(readFileSync(resolve(options.recoveryFile), "utf8")) as Record<string, unknown>;
    const result = mutate(
      context,
      change.id,
      "CreateRelease",
      {
        change_id: change.id,
        kind: options.kind,
        artifact_id: options.artifact,
        artifact_digest: { algorithm: "sha256", value: options.digest, subject: "artifact" },
        environment_id: options.environment,
        scope: { in: options.scope.split(",").map((item) => item.trim()).filter(Boolean), out: [] },
        window: { starts_at: options.windowStart, ends_at: options.windowEnd },
        recovery
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("release" in result.data) stdout.write(`Release ${result.data.release.id} ${result.data.release.status}\n`);
  } finally {
    context.store.close();
  }
};

export const showRelease = (releaseId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const shown = context.kernel.showRelease(releaseId as InternalId);
    if (isDomainError(shown)) return outputError(shown, Boolean(options.json));
    if (options.json) return outputJson(shown, parseReleaseShowResult);
    stdout.write(`${shown.release.kind}\t${shown.release.status}\t${shown.release.artifact_digest.value}\n`);
  } finally {
    context.store.close();
  }
};

export const requestReleaseDecisionCli = (
  releaseId: string,
  options: GlobalOptions & { expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const release = context.kernel.getRelease(releaseId as InternalId);
    if (isDomainError(release)) return outputError(release, Boolean(options.json));
    const result = mutate(context, release.change_id, "RequestReleaseDecision", { release_id: release.id }, options);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("request" in result.data) stdout.write(`Release Decision ${result.data.request.id}\n`);
  } finally {
    context.store.close();
  }
};

export const queueDeploymentCli = (
  releaseId: string,
  options: GlobalOptions & { environment: string; expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const release = context.kernel.getRelease(releaseId as InternalId);
    if (isDomainError(release)) return outputError(release, Boolean(options.json));
    const result = mutate(
      context,
      release.change_id,
      "QueueDeployment",
      { release_id: release.id, environment_id: options.environment },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("deployment" in result.data) stdout.write(`Deployment ${result.data.deployment.id} ${result.data.deployment.status}\n`);
  } finally {
    context.store.close();
  }
};

export const showDeployment = (deploymentId: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const shown = context.kernel.showDeployment(deploymentId as InternalId);
    if (isDomainError(shown)) return outputError(shown, Boolean(options.json));
    if (options.json) return outputJson(shown, parseDeploymentShowResult);
    stdout.write(`${shown.deployment.id}\t${shown.deployment.status}\n`);
  } finally {
    context.store.close();
  }
};

export const recordOperationResultCli = (
  operationId: string,
  options: GlobalOptions & {
    key: string;
    state: string;
    logReference: string;
    logDigest: string;
    summary: string;
    actualDigest?: string;
    health?: string;
    corePath?: string;
    expectedRevision?: string;
  }
): void => {
  const context = openProject(options);
  try {
    const operation = context.store.transaction((transaction) => transaction.getExternalOperation(operationId as InternalId));
    if (!operation) {
      return outputError(
        { code: "OPERATION_NOT_FOUND", message: "未找到指定 External Operation", category: "not_found", retryable: false, details: {}, correlation_id: createInternalId() },
        Boolean(options.json)
      );
    }
    const result = mutate(
      context,
      operation.change_id,
      "RecordOperationResult",
      {
        operation_id: operation.id,
        operation_key: options.key,
        state: options.state,
        log_reference: options.logReference,
        log_digest: { algorithm: "sha256", value: options.logDigest, subject: "operation_log" },
        summary: options.summary,
        ...(options.actualDigest
          ? { actual_digest: { algorithm: "sha256", value: options.actualDigest, subject: "artifact" } }
          : {}),
        ...(options.health ? { health: options.health } : {}),
        ...(options.corePath ? { core_path: options.corePath } : {})
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("operation" in result.data) stdout.write(`Operation ${result.data.operation.state}\n`);
  } finally {
    context.store.close();
  }
};

export const requestReconciliationCli = (
  operationId: string,
  options: GlobalOptions & { expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const operation = context.store.transaction((transaction) => transaction.getExternalOperation(operationId as InternalId));
    if (!operation) {
      return outputError(
        { code: "OPERATION_NOT_FOUND", message: "未找到指定 External Operation", category: "not_found", retryable: false, details: {}, correlation_id: createInternalId() },
        Boolean(options.json)
      );
    }
    const result = mutate(context, operation.change_id, "RequestReconciliation", { operation_id: operation.id }, options);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    stdout.write(`Reconciliation requested for ${operationId}\n`);
  } finally {
    context.store.close();
  }
};

export const recordReconciliationCli = (
  operationId: string,
  options: GlobalOptions & { conclusion: string; summary: string; expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const operation = context.store.transaction((transaction) => transaction.getExternalOperation(operationId as InternalId));
    if (!operation) {
      return outputError(
        { code: "OPERATION_NOT_FOUND", message: "未找到指定 External Operation", category: "not_found", retryable: false, details: {}, correlation_id: createInternalId() },
        Boolean(options.json)
      );
    }
    const result = mutate(
      context,
      operation.change_id,
      "RecordReconciliation",
      { operation_id: operation.id, conclusion: options.conclusion, summary: options.summary },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("reconciliation" in result.data) stdout.write(`Reconciliation ${result.data.reconciliation.conclusion}\n`);
  } finally {
    context.store.close();
  }
};

export const authorizeRecoveryCli = (
  releaseId: string,
  options: GlobalOptions & { strategy: string; sourceDeployment: string; expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const release = context.kernel.getRelease(releaseId as InternalId);
    if (isDomainError(release)) return outputError(release, Boolean(options.json));
    const result = mutate(
      context,
      release.change_id,
      "AuthorizeRecovery",
      {
        release_id: release.id,
        strategy_id: options.strategy,
        source_deployment_id: options.sourceDeployment
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("recovery_execution" in result.data) {
      stdout.write(`Recovery ${result.data.recovery_execution.id} ${result.data.recovery_execution.status}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const recordRecoveryCli = (
  executionId: string,
  options: GlobalOptions & { status: string; expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const execution = context.store.transaction((transaction) => transaction.getRecoveryExecution(executionId as InternalId));
    if (!execution) {
      return outputError(
        {
          code: "RECOVERY_EXECUTION_NOT_FOUND",
          message: "未找到指定 Recovery Execution",
          category: "not_found",
          retryable: false,
          details: {},
          correlation_id: createInternalId()
        },
        Boolean(options.json)
      );
    }
    const result = mutate(
      context,
      execution.change_id,
      "RecordRecovery",
      { execution_id: execution.id, status: options.status },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("recovery_execution" in result.data) {
      stdout.write(`Recovery ${result.data.recovery_execution.status}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const exportProjectCli = (options: GlobalOptions & { expectedRevision?: string }): void => {
  const context = openProject(options);
  try {
    const project = context.kernel.getProject();
    if (isDomainError(project)) return outputError(project, Boolean(options.json));
    const ids = commandIdentity(options);
    const result = context.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: "ExportProject",
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      expected_revision: options.expectedRevision ? Number(options.expectedRevision) : project.revision,
      source: source(context.location.repositoryPath),
      payload: { scope: "project" }
    });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("export_manifest" in result.data) {
      stdout.write(`Export ${result.data.export_manifest.id} digest ${result.data.export_manifest.content_digest.value}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const stageImportCli = (
  options: GlobalOptions & { file: string; expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const project = context.kernel.getProject();
    if (isDomainError(project)) return outputError(project, Boolean(options.json));
    const bytes = readFileSync(resolve(options.file));
    const ids = commandIdentity(options);
    const result = context.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: "StageImport",
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      expected_revision: options.expectedRevision ? Number(options.expectedRevision) : project.revision,
      source: source(context.location.repositoryPath),
      payload: {
        bundle_reference: `file://${resolve(options.file).replaceAll("\\", "/")}`,
        bundle_digest: {
          algorithm: "sha256",
          value: createHash("sha256").update(bytes).digest("hex"),
          subject: "import_bundle"
        }
      }
    });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("import_report" in result.data) {
      stdout.write(`Import ${result.data.import_report.id} ${result.data.import_report.status} ${result.data.import_report.runtime_ownership}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const commitImportCli = (
  reportId: string,
  options: GlobalOptions & { expectedRevision?: string }
): void => {
  const context = openProject(options);
  try {
    const project = context.kernel.getProject();
    if (isDomainError(project)) return outputError(project, Boolean(options.json));
    const ids = commandIdentity(options);
    const result = context.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: "CommitImport",
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      expected_revision: options.expectedRevision ? Number(options.expectedRevision) : project.revision,
      source: source(context.location.repositoryPath),
      payload: { import_report_id: reportId }
    });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    if ("import_report" in result.data) {
      stdout.write(`Import ${result.data.import_report.status} ownership ${result.data.import_report.runtime_ownership}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const recordKnowledgeCli = (
  idOrKey: string,
  options: RevisionOptions & { evidence: string; source: string; conclusion: string }
): void => {
  const context = openProject(options);
  try {
    const change = context.kernel.getChange(idOrKey);
    if (isDomainError(change)) return outputError(change, Boolean(options.json));
    const evidence = context.store.transaction((transaction) => transaction.getEvidence(options.evidence as InternalId));
    if (!evidence?.external_reference_id) {
      return outputError(
        {
          code: "KNOWLEDGE_REFERENCE_NOT_FOUND",
          message: "Knowledge update requires Evidence with a versioned External Reference",
          category: "not_found",
          retryable: false,
          details: {},
          correlation_id: createInternalId()
        },
        Boolean(options.json)
      );
    }
    const plan = context.store.transaction((transaction) => transaction.getCurrentPlan(change.id));
    const task = plan
      ? context.store
          .transaction((transaction) => transaction.listTasks(plan.plan_id, plan.domain_version))
          .find((item) => item.kind === "knowledge" && item.knowledge_source === options.source)
      : undefined;
    if (!task) {
      return outputError(
        {
          code: "KNOWLEDGE_TASK_NOT_FOUND",
          message: "Knowledge update requires a matching Mandatory Knowledge Task",
          category: "not_found",
          retryable: false,
          details: {},
          correlation_id: createInternalId()
        },
        Boolean(options.json)
      );
    }
    const result = mutate(
      context,
      change.id,
      "RecordKnowledgeUpdate",
      {
        change_id: change.id,
        task_id: task.id,
        knowledge_source: options.source,
        conclusion: options.conclusion,
        external_reference_id: evidence.external_reference_id,
        evidence_id: evidence.id
      },
      options
    );
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseCommandResult);
    stdout.write(`Knowledge update recorded for ${task.key}\n`);
  } finally {
    context.store.close();
  }
};

export const proposeCloseCli = (
  idOrKey: string,
  options: RevisionOptions & { risk: string; issue?: string[] }
): void => {
  executeChangeCommand(options, idOrKey, "ProposeClose", (changeId) => ({
    change_id: changeId,
    residual_risk: options.risk,
    known_issues: options.issue ?? []
  }));
};

export const closeChangeCli = (
  idOrKey: string,
  options: RevisionOptions & { evaluation: string }
): void => {
  executeChangeCommand(options, idOrKey, "CloseChange", (changeId) => ({
    change_id: changeId,
    closure_evaluation_id: options.evaluation
  }));
};
