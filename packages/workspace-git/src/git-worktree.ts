import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { InternalId } from "@cimiloop/protocol";
import { WorkspaceError, type ChangeWorkspace, type WorkspaceLocation } from "./port.js";
import { captureSourceSnapshot } from "./snapshot.js";

const INTERNAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isInternalId = (value: string): value is InternalId => INTERNAL_ID.test(value);

const isInside = (root: string, candidate: string): boolean => {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath !== "" && !relativePath.startsWith("..") && !relativePath.startsWith(sep);
};

export class GitWorktreeWorkspace implements ChangeWorkspace {
  readonly #repositoryPath: string;
  readonly #worktreeRoot: string;

  constructor(input: { repositoryPath: string; worktreeRoot: string }) {
    this.#repositoryPath = resolve(input.repositoryPath);
    this.#worktreeRoot = resolve(input.worktreeRoot);
  }

  ensureWorktree(changeId: string): WorkspaceLocation {
    if (!isInternalId(changeId)) {
      throw new WorkspaceError("CHANGE_ID_INVALID", "Worktree 名称必须基于 Change Internal ID");
    }
    const worktreePath = resolve(join(this.#worktreeRoot, changeId));
    if (!isInside(this.#worktreeRoot, worktreePath) && worktreePath !== this.#worktreeRoot) {
      throw new WorkspaceError("WORKTREE_PATH_INVALID", "Worktree 路径越出配置根目录");
    }
    if (!worktreePath.startsWith(this.#worktreeRoot)) {
      throw new WorkspaceError("WORKTREE_PATH_INVALID", "Worktree 路径越出配置根目录");
    }
    mkdirSync(this.#worktreeRoot, { recursive: true });
    if (!existsSync(worktreePath)) {
      execFileSync("git", ["-C", this.#repositoryPath, "worktree", "add", worktreePath, "HEAD"], {
        stdio: "ignore"
      });
    }
    return { worktreePath, changeId };
  }

  captureSnapshot(input: Parameters<ChangeWorkspace["captureSnapshot"]>[0]) {
    this.#assertVerified(input.worktreePath);
    return captureSourceSnapshot({
      ...input,
      repositoryPath: this.#repositoryPath
    });
  }

  cleanup(worktreePath: string): void {
    this.#assertVerified(worktreePath);
    execFileSync("git", ["-C", this.#repositoryPath, "worktree", "remove", resolve(worktreePath)], {
      stdio: "ignore"
    });
  }

  #assertVerified(worktreePath: string): void {
    const resolved = resolve(worktreePath);
    if (!isInside(this.#worktreeRoot, resolved) && resolved !== this.#worktreeRoot) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "只能清理已验证的 Change worktree");
    }
    const name = resolved.slice(this.#worktreeRoot.length).replace(/^[\\/]/, "");
    if (!isInternalId(name) || !existsSync(resolved)) {
      throw new WorkspaceError("WORKTREE_UNVERIFIED", "只能清理已验证的 Change worktree");
    }
  }
}

export const workspaceRootDirectory = (worktreePath: string): string => dirname(worktreePath);
