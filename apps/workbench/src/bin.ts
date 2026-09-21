#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { DeterministicDevOpsAdapter } from "@cimiloop/devops";
import { CimiLoopKernel } from "@cimiloop/kernel";
import { ExternalDeliveryWorker } from "@cimiloop/orchestrator";
import { SqliteProjectStore } from "@cimiloop/store-sqlite";
import { readFileSync } from "node:fs";
import { startWorkbench } from "./server.js";
import "./composition.js";

const projectDirFlag = process.argv.findIndex((arg) => arg === "--project-dir");
const portFlag = process.argv.findIndex((arg) => arg === "--port");
const projectDir = resolve(projectDirFlag >= 0 ? (process.argv[projectDirFlag + 1] ?? process.cwd()) : process.cwd());
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 8787;

const dataDirectory = existsSync(join(projectDir, ".git"))
  ? join(projectDir, ".git", "cimiloop")
  : join(projectDir, ".cimiloop");
const databasePath = join(dataDirectory, "project.db");
const instancePath = join(dataDirectory, "instance.json");
if (!existsSync(databasePath) || !existsSync(instancePath)) {
  process.stderr.write("当前目录尚未初始化 CimiLoop Project。\n");
  process.exit(1);
}

const instance = JSON.parse(readFileSync(instancePath, "utf8")) as {
  project_id: string;
  actor_id: string;
};
const store = new SqliteProjectStore(databasePath);
const kernel = new CimiLoopKernel({ store });
const worker = new ExternalDeliveryWorker({
  kernel,
  store,
  adapter: new DeterministicDevOpsAdapter(),
  projectId: instance.project_id as never,
  actorId: instance.actor_id as never,
  workingDirectory: projectDir
});
void worker.start();
const workbench = await startWorkbench({
  kernel,
  projectId: instance.project_id as never,
  actorId: instance.actor_id as never,
  host: "127.0.0.1",
  port,
  databasePath
});

const shutdown = async (): Promise<void> => {
  worker.stop();
  await workbench.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
process.stdout.write(`CimiLoop Workbench 已启动：${workbench.url}\n`);
