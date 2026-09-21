import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DevOpsAdapter } from "@cimiloop/devops";
import { CimiLoopKernel } from "@cimiloop/kernel";
import {
  createProductAdapterResolver,
  ExternalDeliveryWorker,
  MemoryProcessRegistry,
  RunOrchestrator,
  type OrchestratorDependencies,
  type OrchestratorKernel
} from "@cimiloop/orchestrator";
import { SqliteProjectStore } from "@cimiloop/store-sqlite";
import { readInstance } from "./instance.js";
import { locateProject } from "./location.js";

export const openProject = (options: { projectDir?: string }) => {
  const start = options.projectDir ? resolve(options.projectDir) : process.cwd();
  const allowNonGit = Boolean(options.projectDir) || existsSync(join(start, ".cimiloop", "instance.json"));
  const location = locateProject(start, allowNonGit);
  if (!existsSync(location.instancePath) || !existsSync(location.databasePath)) {
    throw new Error("当前目录尚未初始化 CimiLoop Project，请先运行 cimiloop init");
  }
  const instance = readInstance(location.instancePath);
  const store = new SqliteProjectStore(location.databasePath);
  const kernel = new CimiLoopKernel({ store });
  return { location, instance, store, kernel };
};

export const createRunOrchestrator = (
  kernel: OrchestratorKernel,
  input: Omit<OrchestratorDependencies, "kernel" | "processRegistry"> & {
    processRegistry?: OrchestratorDependencies["processRegistry"];
  }
): RunOrchestrator =>
  new RunOrchestrator({
    kernel,
    processRegistry: input.processRegistry ?? new MemoryProcessRegistry(),
    projectId: input.projectId,
    actorId: input.actorId,
    runtime: input.runtime,
    worktreePath: input.worktreePath,
    contextDirectory: input.contextDirectory,
    providers: input.providers,
    actorPermissions: input.actorPermissions,
    providerPermissions: input.providerPermissions,
    ...(input.workspace ? { workspace: input.workspace } : {}),
    ...(input.repositoryPath ? { repositoryPath: input.repositoryPath } : {}),
    ...(input.now ? { now: input.now } : {})
  });

const repoRootFromCli = (): string => fileURLToPath(new URL("../../..", import.meta.url));

export const createDeliveryWorker = (
  context: ReturnType<typeof openProject>,
  adapter?: DevOpsAdapter
): ExternalDeliveryWorker =>
  new ExternalDeliveryWorker({
    kernel: context.kernel,
    store: context.store,
    ...(adapter ? { adapter } : {}),
    resolver: createProductAdapterResolver({
      projectRepositoryPath: context.location.repositoryPath,
      workingDirectory: context.location.repositoryPath,
      allowedRoots: [repoRootFromCli(), join(repoRootFromCli(), "examples")],
      logDirectory: join(context.location.dataDirectory, "adapter-logs")
    }),
    projectId: context.instance.project_id,
    actorId: context.instance.actor_id,
    workingDirectory: context.location.repositoryPath
  });
