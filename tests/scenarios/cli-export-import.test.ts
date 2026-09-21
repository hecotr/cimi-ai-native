import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseChangeListResult, parseCommandResult, parseTimelineResult } from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";

const temporaryDirectories: string[] = [];
const cli = resolve("apps/cli/dist/bin.js");

afterAll(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const run = (projectDirectory: string, appData: string, args: string[]): unknown => {
  const output = execFileSync(process.execPath, ["--no-warnings", cli, "--project-dir", projectDirectory, "--json", ...args], {
    encoding: "utf8",
    env: { ...process.env, LOCALAPPDATA: appData },
    timeout: 90_000
  });
  return JSON.parse(output);
};

describe("CLI export to empty-target import", () => {
  it("exports a bundle file and materializes a dormant project in a completely empty directory", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-cli-import-"));
    temporaryDirectories.push(root);
    const source = join(root, "source");
    const target = join(root, "empty-target");
    const appData = join(root, "app-data");
    mkdirSync(source);
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--template=", source], { stdio: "ignore" });
    writeFileSync(join(source, "README.md"), "cli-import\n");
    execFileSync("git", ["-C", source, "-c", "user.email=cli@example.com", "-c", "user.name=CLI", "add", "README.md"], {
      stdio: "ignore"
    });
    execFileSync("git", ["-C", source, "-c", "user.email=cli@example.com", "-c", "user.name=CLI", "commit", "-m", "init"], {
      stdio: "ignore"
    });
    run(source, appData, ["init", "--owner-name", "CLI Owner", "--owner-email", "cli@example.com", "--yes"]);
    const created = run(source, appData, ["change", "create", "--title", "Portable CLI Change"]) as {
      data: { change: { id: string; display_key: string } };
    };
    const bundle = join(root, "bundle.json");
    const exported = run(source, appData, ["project", "export", "--file", bundle]) as {
      data: { export_manifest: { project_id: string; content_digest: { value: string }; ids: string[] } };
      bundle_digest?: string;
      bundle_file?: string;
    };
    expect(existsSync(bundle)).toBe(true);
    expect(exported.bundle_digest).toMatch(/^[0-9a-f]{64}$/);
    mkdirSync(target);
    expect(existsSync(join(target, ".cimiloop"))).toBe(false);
    const staged = run(target, appData, ["project", "import-stage", "--file", bundle, "--target", target]) as {
      data: { import_report: { id: string; status: string; runtime_ownership: string } };
    };
    expect(staged.data.import_report.status).toBe("staged");
    expect(staged.data.import_report.runtime_ownership).toBe("dormant");
    const committed = run(target, appData, [
      "project",
      "import-commit",
      staged.data.import_report.id,
      "--target",
      target
    ]) as { data: { import_report: { status: string; runtime_ownership: string } } };
    expect(committed.data.import_report.status).toBe("accepted");
    expect(committed.data.import_report.runtime_ownership).toBe("dormant");
    const listed = parseChangeListResult(run(target, appData, ["change", "list"]));
    expect(listed.changes[0]?.id).toBe(created.data.change.id);
    const timeline = parseTimelineResult(run(target, appData, ["timeline", created.data.change.display_key]));
    expect(timeline.events.map((item) => item.event_type)).toEqual(expect.arrayContaining(["ChangeCreated"]));
    const store = new SqliteProjectStore(join(target, ".cimiloop", "project.db"));
    try {
      const ownership = store.transaction((transaction) =>
        transaction.getProjectRuntimeOwnership(exported.data.export_manifest.project_id)
      );
      expect(ownership?.ownership).toBe("dormant");
    } finally {
      store.close();
    }
    const recovered = run(target, appData, ["deployment", "recover"]) as { executed: number };
    expect(recovered.executed).toBe(0);
  }, 180_000);
});
