import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CimiLoopKernel } from "@cimiloop/kernel";
import {
  SCHEMA_VERSION,
  createInternalId,
  parseChangeListResult,
  parseChangeRoomResult,
  parseChangeShowResult,
  parseCommandResult,
  parseDecisionInboxResult,
  parseDoctorResult,
  parseTimelineResult,
  type AnyCommand,
  type DecisionOutcome,
  type InternalId
} from "@cimiloop/protocol";
import { SqliteProjectRegistry, SqliteProjectStore } from "@cimiloop/store-sqlite";
import { openProject } from "./composition.js";
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
