import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "../../protocol/src/index.js";
import { GitWorktreeWorkspace, WorkspaceError } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const tempRoot = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-workspace-"));
  temporaryDirectories.push(directory);
  return directory;
};

const initRepo = (directory: string): string => {
  const repo = join(directory, "repo");
  mkdirSync(repo);
  execFileSync("git", ["init", repo], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "config", "user.email", "workspace@example.com"], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "config", "user.name", "Workspace"], { stdio: "ignore" });
  writeFileSync(join(repo, "README.md"), "workspace\n");
  execFileSync("git", ["-C", repo, "add", "README.md"], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "commit", "-m", "init"], { stdio: "ignore" });
  return repo;
};

describe("Git worktree isolation", () => {
  it("creates a change-scoped worktree under the configured root and reuses it", () => {
    const root = tempRoot();
    const repo = initRepo(root);
    const changeId = createInternalId();
    const workspace = new GitWorktreeWorkspace({ repositoryPath: repo, worktreeRoot: join(root, "worktrees") });
    const first = workspace.ensureWorktree(changeId);
    const second = workspace.ensureWorktree(changeId);
    expect(first.worktreePath).toBe(second.worktreePath);
    expect(first.worktreePath.startsWith(resolve(join(root, "worktrees")))).toBe(true);
    expect(first.worktreePath).toContain(changeId);
  });

  it("rejects path escape and cleanup of unverified directories", () => {
    const root = tempRoot();
    const repo = initRepo(root);
    const workspace = new GitWorktreeWorkspace({ repositoryPath: repo, worktreeRoot: join(root, "worktrees") });
    expect(() => workspace.ensureWorktree("../../../escape")).toThrow(WorkspaceError);
    try {
      workspace.ensureWorktree("../../../escape");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceError);
      expect((error as WorkspaceError).code).toMatch(/WORKTREE_PATH_INVALID|CHANGE_ID_INVALID/);
    }
    expect(() => workspace.cleanup(join(root, "not-a-worktree"))).toThrow(WorkspaceError);
  });

  it("records a git commit snapshot when clean and an explicit dirty manifest when uncommitted files exist", () => {
    const root = tempRoot();
    const repo = initRepo(root);
    const changeId = createInternalId();
    const workspace = new GitWorktreeWorkspace({ repositoryPath: repo, worktreeRoot: join(root, "worktrees") });
    const ensured = workspace.ensureWorktree(changeId);
    const clean = workspace.captureSnapshot({
      changeId,
      workItemId: createInternalId(),
      runId: createInternalId(),
      projectId: createInternalId(),
      worktreePath: ensured.worktreePath
    });
    expect(clean.snapshot_kind).toBe("git_commit");
    expect(clean.dirty).toBe(false);
    expect(clean.commit_sha).toMatch(/^[0-9a-f]{40}$/);

    writeFileSync(join(ensured.worktreePath, "dirty.txt"), "uncommitted\n");
    const dirty = workspace.captureSnapshot({
      changeId,
      workItemId: createInternalId(),
      runId: createInternalId(),
      projectId: createInternalId(),
      worktreePath: ensured.worktreePath
    });
    expect(dirty.snapshot_kind).toBe("explicit_dirty_manifest");
    expect(dirty.dirty).toBe(true);
    expect(dirty.commit_sha).toBe(clean.commit_sha);
  });
});
