import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createInternalId } from "../../protocol/src/index.js";
import { captureSourceSnapshot, DIRTY_SNAPSHOT_LIMITS, WorkspaceError } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterAll(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const initRepo = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-dirty-"));
  temporaryDirectories.push(directory);
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--template=", directory], { stdio: "ignore" });
  writeFileSync(join(directory, "tracked.txt"), "base\n");
  execFileSync("git", ["-C", directory, "-c", "user.email=dirty@example.com", "-c", "user.name=Dirty", "add", "tracked.txt"], {
    stdio: "ignore"
  });
  execFileSync(
    "git",
    ["-C", directory, "-c", "user.email=dirty@example.com", "-c", "user.name=Dirty", "commit", "-m", "init"],
    { stdio: "ignore" }
  );
  return directory;
};

const capture = (repo: string) =>
  captureSourceSnapshot({
    projectId: createInternalId(),
    changeId: createInternalId(),
    workItemId: createInternalId(),
    runId: createInternalId(),
    worktreePath: repo,
    repositoryPath: repo
  });

describe("explicit dirty SourceSnapshot", () => {
  it("changes digest when untracked file content changes and keeps order stable", () => {
    const repo = initRepo();
    writeFileSync(join(repo, "b.txt"), "one");
    writeFileSync(join(repo, "a.txt"), "one");
    const first = capture(repo);
    const secondOrder = capture(repo);
    expect(first.digest.value).toBe(secondOrder.digest.value);
    expect(first.content_reference.startsWith("cimi-file://worktree/.cimiloop/dirty-manifests/")).toBe(true);
    writeFileSync(join(repo, "a.txt"), "two");
    const changed = capture(repo);
    expect(changed.digest.value).not.toBe(first.digest.value);
  });

  it("includes tracked edits, deletes and renames in the canonical manifest", () => {
    const repo = initRepo();
    writeFileSync(join(repo, "tracked.txt"), "edited\n");
    writeFileSync(join(repo, "extra.txt"), "untracked");
    const mixed = capture(repo);
    expect(mixed.dirty).toBe(true);
    expect(mixed.snapshot_kind).toBe("explicit_dirty_manifest");
    execFileSync("git", ["-C", repo, "rm", "-f", "tracked.txt"], { stdio: "ignore" });
    const deleted = capture(repo);
    expect(deleted.digest.value).not.toBe(mixed.digest.value);
  });

  it("rejects worktree-external untracked symlinks and oversized manifests", () => {
    const repo = initRepo();
    const outside = mkdtempSync(join(tmpdir(), "cimiloop-dirty-out-"));
    temporaryDirectories.push(outside);
    writeFileSync(join(outside, "secret.txt"), "secret");
    try {
      symlinkSync(join(outside, "secret.txt"), join(repo, "escape.txt"));
      expect(() => capture(repo)).toThrow(WorkspaceError);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        expect(error.code).toBe("DIRTY_SYMLINK_ESCAPE");
      }
    }
    const crowded = initRepo();
    for (let index = 0; index < DIRTY_SNAPSHOT_LIMITS.maxUntrackedFiles + 1; index += 1) {
      writeFileSync(join(crowded, `file-${index}.txt`), "x");
    }
    expect(() => capture(crowded)).toThrow(/DIRTY_MANIFEST_LIMIT|exceeds/);
  });
});
