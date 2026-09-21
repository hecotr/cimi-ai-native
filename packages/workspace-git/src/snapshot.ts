import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, lstatSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { SCHEMA_VERSION, type SourceSnapshot } from "@cimiloop/protocol";
import { createInternalId } from "@cimiloop/protocol";
import { WorkspaceError, type SnapshotCaptureInput } from "./port.js";

const MAX_UNTRACKED_FILES = 256;
const MAX_FILE_BYTES = 1_048_576;
const MAX_TOTAL_BYTES = 8_388_608;
const DIRTY_MANIFEST_VERSION = "cimiloop.dirty-manifest.v1";

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

const insideWorktree = (worktreePath: string, candidate: string): boolean => {
  const root = resolve(worktreePath);
  const real = resolve(candidate);
  const rel = relative(root, real);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
};

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

const parsePorcelain = (status: string) => {
  const tracked: Array<{ path: string; status: string; renamed_from?: string }> = [];
  const untracked: string[] = [];
  const deleted: string[] = [];
  const renamed: Array<{ from: string; to: string }> = [];
  for (const line of status.split(/\r?\n/).filter(Boolean)) {
    const code = line.slice(0, 2);
    const rest = line.slice(3);
    if (code === "??") {
      untracked.push(rest.replaceAll("\\", "/"));
      continue;
    }
    if (code.includes("R") && rest.includes(" -> ")) {
      const [from, to] = rest.split(" -> ");
      if (from && to) {
        renamed.push({ from: from.replaceAll("\\", "/"), to: to.replaceAll("\\", "/") });
        tracked.push({ path: to.replaceAll("\\", "/"), status: "renamed", renamed_from: from.replaceAll("\\", "/") });
      }
      continue;
    }
    const path = rest.replaceAll("\\", "/");
    if (code.includes("D")) deleted.push(path);
    tracked.push({ path, status: code.trim() || "modified" });
  }
  return { tracked, untracked, deleted, renamed };
};

const hashUntracked = (worktreePath: string, relativePath: string): { path: string; sha256: string; bytes: number } => {
  const absolute = resolve(worktreePath, relativePath);
  if (relativePath.includes("\0") || relativePath.split("/").includes("..")) {
    throw new WorkspaceError("DIRTY_SYMLINK_ESCAPE", `untracked path escaped the worktree: ${relativePath}`);
  }
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    throw new WorkspaceError("DIRTY_SYMLINK_ESCAPE", `untracked path is not readable: ${relativePath}`);
  }
  if (stat.isSymbolicLink()) {
    let target: string;
    try {
      target = realpathSync(absolute);
    } catch {
      throw new WorkspaceError("DIRTY_SYMLINK_ESCAPE", `untracked symlink is not resolvable: ${relativePath}`);
    }
    if (!insideWorktree(worktreePath, target)) {
      throw new WorkspaceError("DIRTY_SYMLINK_ESCAPE", `untracked symlink escaped the worktree: ${relativePath}`);
    }
  } else if (!insideWorktree(worktreePath, absolute)) {
    throw new WorkspaceError("DIRTY_SYMLINK_ESCAPE", `untracked path escaped the worktree: ${relativePath}`);
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new WorkspaceError("DIRTY_MANIFEST_LIMIT", `untracked file exceeds ${MAX_FILE_BYTES} bytes: ${relativePath}`);
  }
  const bytes = readFileSync(absolute);
  return { path: relativePath.replaceAll("\\", "/"), sha256: sha256(bytes), bytes: bytes.length };
};

export const captureSourceSnapshot = (
  input: SnapshotCaptureInput & { repositoryPath: string }
): SourceSnapshot => {
  const identities = git(input.worktreePath, ["rev-parse", "HEAD", "HEAD^{tree}"]);
  const [commitSha, treeSha] = identities.split(/\r?\n/);
  if (!commitSha || !treeSha) {
    throw new Error("SourceSnapshot 无法读取 Git commit/tree");
  }
  const status = git(input.worktreePath, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const diff =
    status.length === 0 ? "" : git(input.worktreePath, ["diff", "--no-ext-diff", "--no-color", "HEAD"]);
  const dirty = status.length > 0;
  const parsed = parsePorcelain(status);
  const untrackedPaths = parsed.untracked
    .filter((path) => !path.replaceAll("\\", "/").startsWith(".cimiloop/dirty-manifests/"))
    .slice()
    .sort((left, right) => left.localeCompare(right));
  if (untrackedPaths.length > MAX_UNTRACKED_FILES) {
    throw new WorkspaceError(
      "DIRTY_MANIFEST_LIMIT",
      `untracked file count exceeds ${MAX_UNTRACKED_FILES}`
    );
  }
  const untracked = untrackedPaths.map((path) => hashUntracked(input.worktreePath, path));
  const totalBytes = untracked.reduce((sum, item) => sum + item.bytes, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new WorkspaceError("DIRTY_MANIFEST_LIMIT", `untracked files exceed ${MAX_TOTAL_BYTES} bytes`);
  }
  const trackedDiffDigest = sha256(diff);
  const manifest = {
    schema: DIRTY_MANIFEST_VERSION,
    version: 1,
    base_commit_sha: commitSha,
    base_tree_sha: treeSha,
    tracked_diff_digest: trackedDiffDigest,
    tracked: parsed.tracked
      .map((item) => ({
        path: item.path,
        status: item.status,
        ...(item.renamed_from ? { renamed_from: item.renamed_from } : {})
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    untracked: untracked.map((item) => ({ path: item.path, sha256: item.sha256 })),
    deleted: [...parsed.deleted].sort((left, right) => left.localeCompare(right)),
    renamed: [...parsed.renamed].sort((left, right) => left.to.localeCompare(right.to))
  };
  const canonical = `${JSON.stringify(manifest)}\n`;
  const digestValue = sha256(canonical);
  let contentReference = dirty ? `worktree://${input.changeId}#dirty` : `git://${commitSha}`;
  if (dirty) {
    const manifestDir = join(input.worktreePath, ".cimiloop", "dirty-manifests");
    mkdirSync(manifestDir, { recursive: true });
    const manifestPath = join(manifestDir, `${input.runId}.json`);
    writeFileSync(manifestPath, canonical);
    const relativePath = relative(input.worktreePath, manifestPath).replaceAll("\\", "/");
    contentReference = `cimi-file://worktree/${relativePath}`;
  }
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
    content_reference: contentReference,
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

export const DIRTY_SNAPSHOT_LIMITS = {
  maxUntrackedFiles: MAX_UNTRACKED_FILES,
  maxFileBytes: MAX_FILE_BYTES,
  maxTotalBytes: MAX_TOTAL_BYTES
};
