import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { SCHEMA_VERSION, type SourceSnapshot } from "@cimiloop/protocol";
import { createInternalId } from "@cimiloop/protocol";
import type { SnapshotCaptureInput } from "./port.js";

const git = (repositoryPath: string, args: string[]): string =>
  execFileSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" }).trim();

export const captureSourceSnapshot = (
  input: SnapshotCaptureInput & { repositoryPath: string }
): SourceSnapshot => {
  const commitSha = git(input.worktreePath, ["rev-parse", "HEAD"]);
  const treeSha = git(input.worktreePath, ["rev-parse", "HEAD^{tree}"]);
  const status = git(input.worktreePath, ["status", "--porcelain"]);
  const dirty = status.length > 0;
  const digestValue = createHash("sha256")
    .update(JSON.stringify({ commitSha, treeSha, status }))
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
