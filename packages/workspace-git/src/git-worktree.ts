import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { InternalId } from "@cimiloop/protocol";
import { WorkspaceError, type ChangeWorkspace, type WorkspaceLocation } from "./port.js";
import { captureSourceSnapshot } from "./snapshot.js";

const INTERNAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isInternalId = (value: string): value is InternalId => INTERNAL_ID.test(value);

const isInside = (root: string, candidate: string): boolean => {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith(sep));
};

const gitEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_PAGER: "cat",
  PAGER: "cat"
};

const git = (cwd: string, args: string[]): string =>
  execFileSync("git", ["-c", "core.fsmonitor=false", "-C", cwd, ...args], {
    encoding: "utf8",
    env: gitEnv
  }).trim();

const listedWorktrees = (repositoryPath: string): Set<string> => {
  const output = git(repositoryPath, ["worktree", "list", "--porcelain"]);
  const paths = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      paths.add(resolve(line.slice("worktree ".length)));
    }
  }
  return paths;
};

const resolveCommonDir = (cwd: string): string => {
  const common = git(cwd, ["rev-parse", "--git-common-dir"]);
  return resolve(cwd, common);
};

export class GitWorktreeWorkspace implements ChangeWorkspace {
  readonly #repositoryPath: string;
  readonly #worktreeRoot: string;
  #repositoryCommonDir?: string;
  #listedWorktrees?: Set<string>;

  constructor(input: { repositoryPath: string; worktreeRoot: string }) {
    this.#repositoryPath = resolve(input.repositoryPath);
    this.#worktreeRoot = resolve(input.worktreeRoot);
    if (git(this.#repositoryPath, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "Repository 不是已验证的 Git 工作区");
    }
  }

  #commonDir(): string {
    return (this.#repositoryCommonDir ??= resolveCommonDir(this.#repositoryPath));
  }

  #worktrees(): Set<string> {
    return (this.#listedWorktrees ??= listedWorktrees(this.#repositoryPath));
  }

  #rememberWorktree(worktreePath: string): void {
    (this.#listedWorktrees ??= listedWorktrees(this.#repositoryPath)).add(resolve(worktreePath));
  }

  ensureWorktree(changeId: string, baseRevision?: string): WorkspaceLocation {
    if (!isInternalId(changeId)) {
      throw new WorkspaceError("CHANGE_ID_INVALID", "Worktree 名称必须基于 Change Internal ID");
    }
    const worktreePath = resolve(join(this.#worktreeRoot, changeId));
    if (!isInside(this.#worktreeRoot, worktreePath)) {
      throw new WorkspaceError("WORKTREE_PATH_INVALID", "Worktree 路径越出配置根目录");
    }
    mkdirSync(this.#worktreeRoot, { recursive: true });
    const startPoint = baseRevision ?? "HEAD";
    if (existsSync(worktreePath)) {
      this.#assertVerified(worktreePath, changeId);
    } else {
      execFileSync(
        "git",
        ["-c", "core.fsmonitor=false", "-C", this.#repositoryPath, "worktree", "add", "--detach", worktreePath, startPoint],
        { stdio: "ignore", env: gitEnv }
      );
      this.#rememberWorktree(worktreePath);
      this.#assertVerified(worktreePath, changeId);
    }
    const worktreeHead = git(worktreePath, ["rev-parse", "--verify", "HEAD"]);
    if (!/^[0-9a-f]{40}$/.test(worktreeHead)) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "Worktree 缺少有效 base revision");
    }
    return { worktreePath, changeId };
  }

  captureSnapshot(input: Parameters<ChangeWorkspace["captureSnapshot"]>[0]) {
    this.#assertVerified(input.worktreePath, input.changeId);
    return captureSourceSnapshot({
      ...input,
      repositoryPath: this.#repositoryPath
    });
  }

  cleanup(worktreePath: string): void {
    this.#assertVerified(worktreePath);
    execFileSync("git", ["-C", this.#repositoryPath, "worktree", "remove", "--force", resolve(worktreePath)], {
      stdio: "ignore"
    });
    this.#listedWorktrees = listedWorktrees(this.#repositoryPath);
  }

  #assertVerified(worktreePath: string, changeId?: string): void {
    const resolved = resolve(worktreePath);
    if (!isInside(this.#worktreeRoot, resolved)) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "只能使用已验证的 Change worktree");
    }
    const name = resolved.slice(this.#worktreeRoot.length).replace(/^[\\/]/, "");
    if (!isInternalId(name) || (changeId && name !== changeId)) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "只能使用已验证的 Change worktree");
    }
    if (!existsSync(resolved)) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "只能使用已验证的 Change worktree");
    }
    const gitMarker = join(resolved, ".git");
    if (!existsSync(gitMarker)) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "目录不是 Git worktree");
    }
    const marker = lstatSync(gitMarker);
    if (marker.isDirectory()) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "禁止把主仓库目录冒充为隔离 worktree");
    }
    const gitFile = readFileSync(gitMarker, "utf8");
    if (!/gitdir:/i.test(gitFile)) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "目录不是 Git worktree");
    }
    if (!this.#worktrees().has(resolved)) {
      this.#listedWorktrees = listedWorktrees(this.#repositoryPath);
      if (!this.#worktrees().has(resolved)) {
        throw new WorkspaceError("WORKTREE_UNVERIFIED", "路径未登记为 Git worktree");
      }
    }
    if (git(resolved, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "目录不是 Git worktree");
    }
    if (resolveCommonDir(resolved) !== this.#commonDir()) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "Worktree 不属于当前 Repository");
    }
  }
}

export const workspaceRootDirectory = (worktreePath: string): string => dirname(worktreePath);
