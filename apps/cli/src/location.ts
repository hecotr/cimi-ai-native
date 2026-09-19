import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

export interface ProjectLocation {
  repositoryKind: "git" | "directory";
  repositoryPath: string;
  dataDirectory: string;
  databasePath: string;
  instancePath: string;
  suggestedName: string;
}

const gitOutput = (directory: string, ...args: string[]): string | undefined => {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return undefined;
  }
};

export const locateProject = (startDirectory: string, allowNonGit = false): ProjectLocation => {
  const requested = resolve(startDirectory);
  const gitRoot = gitOutput(requested, "rev-parse", "--show-toplevel");
  if (gitRoot) {
    const commonDirectory = gitOutput(gitRoot, "rev-parse", "--git-common-dir");
    if (!commonDirectory) throw new Error("无法定位 Git Common Directory");
    const resolvedCommonDirectory = isAbsolute(commonDirectory)
      ? commonDirectory
      : resolve(gitRoot, commonDirectory);
    const dataDirectory = join(resolvedCommonDirectory, "cimiloop");
    return {
      repositoryKind: "git",
      repositoryPath: resolve(gitRoot),
      dataDirectory,
      databasePath: join(dataDirectory, "project.db"),
      instancePath: join(dataDirectory, "instance.json"),
      suggestedName: basename(gitRoot)
    };
  }

  if (!allowNonGit) {
    throw new Error("当前目录不是 Git Repository；初始化非 Git 项目时必须显式使用 --project-dir");
  }
  if (!existsSync(requested)) {
    throw new Error(`目录不存在：${requested}`);
  }
  const dataDirectory = join(requested, ".cimiloop");
  return {
    repositoryKind: "directory",
    repositoryPath: requested,
    dataDirectory,
    databasePath: join(dataDirectory, "project.db"),
    instancePath: join(dataDirectory, "instance.json"),
    suggestedName: basename(requested)
  };
};

export const readGitIdentity = (repositoryPath: string): { name?: string; email?: string } => {
  const name = gitOutput(repositoryPath, "config", "user.name");
  const email = gitOutput(repositoryPath, "config", "user.email");
  return { ...(name ? { name } : {}), ...(email ? { email } : {}) };
};

export const registryDatabasePath = (): string => {
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "CimiLoop", "registry.db");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "CimiLoop", "registry.db");
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "cimiloop", "registry.db");
};
