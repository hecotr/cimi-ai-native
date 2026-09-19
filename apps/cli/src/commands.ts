import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CimiLoopKernel } from "@cimiloop/kernel";
import { SCHEMA_VERSION, createInternalId, type AnyCommand, type InternalId } from "@cimiloop/protocol";
import { SqliteProjectRegistry, SqliteProjectStore } from "@cimiloop/store-sqlite";
import { readInstance, writeInstance } from "./instance.js";
import { locateProject, readGitIdentity, registryDatabasePath } from "./location.js";
import { isDomainError, outputError, outputJson } from "./output.js";

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
    const project = result.data.project as { id: InternalId; instance_id: InternalId; name: string };
    const actor = result.data.actor as { id: InternalId; display_name: string };
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
    if (options.json) outputJson(result);
    else {
      stdout.write(`CimiLoop Project 已初始化：${project.name}\n`);
      stdout.write(`Project ID：${project.id}\n`);
      stdout.write(`Project Owner：${actor.display_name}\n`);
    }
  } finally {
    store.close();
  }
};

const openProject = (options: GlobalOptions) => {
  const start = options.projectDir ? resolve(options.projectDir) : process.cwd();
  const allowNonGit = Boolean(options.projectDir) || existsSync(join(start, ".cimiloop", "instance.json"));
  const location = locateProject(start, allowNonGit);
  if (!existsSync(location.instancePath) || !existsSync(location.databasePath)) {
    throw new Error("当前目录尚未初始化 CimiLoop Project，请先运行 cimiloop init");
  }
  const instance = readInstance(location.instancePath);
  const store = new SqliteProjectStore(location.databasePath);
  return { location, instance, store, kernel: new CimiLoopKernel({ store }) };
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
    const change = result.data.change as { display_key: string; title: string; id: string };
    if (options.json) outputJson(result);
    else stdout.write(`已创建 ${change.display_key}：${change.title}\nInternal ID：${change.id}\n`);
  } finally {
    context.store.close();
  }
};

export const listChanges = (options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const changes = context.kernel.listChanges();
    if (options.json) return outputJson({ ok: true, changes });
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
    if (options.json) return outputJson({ ok: true, change: result });
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
    const change = result.data.change as { display_key: string; operating_status: string; revision: number };
    if (options.json) outputJson(result);
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
    if (options.json) outputJson(report);
    else {
      stdout.write("CimiLoop Project 健康检查通过。\n");
      stdout.write(`Change：${report.changes}，Event：${report.events}，待投递 Outbox：${report.pending_outbox}\n`);
    }
  } finally {
    context.store.close();
  }
};
