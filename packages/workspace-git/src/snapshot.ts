import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { SCHEMA_VERSION, type SourceSnapshot } from "@cimiloop/protocol";
import { createInternalId } from "@cimiloop/protocol";
import type { SnapshotCaptureInput } from "./port.js";

const git = (repositoryPath: string, args: string[]): string =>
  execFileSync("git", ["-c", "core.fsmonitor=false", "-C", repositoryPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_PAGER: "cat"
    }
  }).trim();

export const captureSourceSnapshot = (
  input: SnapshotCaptureInput & { repositoryPath: string }
): SourceSnapshot => {
  const identities = git(input.worktreePath, ["rev-parse", "HEAD", "HEAD^{tree}"]);
  const [commitSha, treeSha] = identities.split(/\r?\n/);
  if (!commitSha || !treeSha) {
    throw new Error("SourceSnapshot 无法读取 Git commit/tree");
  }
  const status = git(input.worktreePath, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const diff = git(input.worktreePath, ["diff", "--no-ext-diff", "--no-color", "HEAD"]);
  const dirty = status.length > 0 || diff.length > 0;
  const digestValue = createHash("sha256")
    .update(JSON.stringify({ commitSha, treeSha, status, diff }))
    .digest("hex");
  const shared = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: input.projectId,
    change_id: input.changeId,
    work_item_id: input.workItemId,
    run_id: input.runId,
    digest: {
      algorithm: "sha256" as const,
      value: digestValue,
      subject: "source_snapshot"
    },
    content_reference: dirty ? `worktree://${input.changeId}#dirty` : `git://${commitSha}`,
    created_at: new Date().toISOString()
  };
  if (dirty) {
    return {
      ...shared,
      snapshot_kind: "explicit_dirty_manifest",
      dirty: true,
      commit_sha: commitSha,
      tree_sha: treeSha
    };
  }
  return {
    ...shared,
    snapshot_kind: "git_commit",
    dirty: false,
    commit_sha: commitSha,
    tree_sha: treeSha
  };
};
