import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "../../packages/protocol/dist/index.js";

const temporaryDirectories: string[] = [];
const cli = resolve("apps/cli/dist/bin.js");

const run = (projectDirectory: string, appData: string, args: string[]): unknown => {
  const output = execFileSync(
    process.execPath,
    ["--no-warnings", cli, "--project-dir", projectDirectory, "--json", ...args],
    {
      encoding: "utf8",
      env: { ...process.env, LOCALAPPDATA: appData }
    }
  );
  return JSON.parse(output);
};

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("cimiloop CLI", () => {
  it("runs the M0 flow and keeps JSON output machine-readable", { timeout: 90_000 }, () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-cli-test-"));
    temporaryDirectories.push(root);
    const repository = join(root, "repository");
    const appData = join(root, "app-data");
    execFileSync("git", ["init", repository], { stdio: "ignore" });

    const initialized = run(repository, appData, [
      "init",
      "--owner-name",
      "CLI Owner",
      "--owner-email",
      "cli@example.com",
      "--yes"
    ]) as { ok: boolean };
    expect(initialized.ok).toBe(true);

    const commandId = createInternalId();
    const created = run(repository, appData, ["--command-id", commandId, "change", "create", "--title", "CLI M0"]);
    const replayed = run(repository, appData, ["--command-id", commandId, "change", "create", "--title", "CLI M0"]);
    expect(replayed).toEqual(created);

    run(repository, appData, ["change", "pause", "CHG-0001", "--reason", "CLI test"]);
    const resumed = run(repository, appData, ["change", "resume", "CHG-0001"]) as { revision: number };
    expect(resumed.revision).toBe(3);

    const doctor = run(repository, appData, ["doctor"]) as {
      ok: boolean;
      changes: number;
      events: number;
      pending_outbox: number;
    };
    expect(doctor).toMatchObject({ ok: true, changes: 1, events: 4, pending_outbox: 4 });

    const instance = JSON.parse(readFileSync(join(repository, ".git", "cimiloop", "instance.json"), "utf8"));
    expect(instance.project_id).toBeTruthy();
  });

  it("returns schema-valid JSON for pre-kernel and argument failures", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-cli-error-test-"));
    temporaryDirectories.push(root);
    const missingProject = spawnSync(
      process.execPath,
      ["--no-warnings", cli, "--json", "--project-dir", root, "change", "list"],
      { encoding: "utf8" }
    );
    expect(missingProject.status).toBe(1);
    expect(missingProject.stderr).toBe("");
    expect(JSON.parse(missingProject.stdout)).toMatchObject({
      ok: false,
      error: { code: "CLI_EXECUTION_FAILED", category: "internal", message: "CLI 执行失败" }
    });
    expect(missingProject.stdout).not.toContain(root);

    const missingTitle = spawnSync(
      process.execPath,
      ["--no-warnings", cli, "--json", "--project-dir", root, "change", "create"],
      { encoding: "utf8" }
    );
    expect(missingTitle.status).toBe(2);
    expect(missingTitle.stderr).toBe("");
    expect(JSON.parse(missingTitle.stdout)).toMatchObject({
      ok: false,
      error: { code: "CLI_ARGUMENT_INVALID", category: "validation" }
    });
  }, 90_000);
});
