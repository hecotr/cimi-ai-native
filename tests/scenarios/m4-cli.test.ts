import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCommandResult, parseEnvironmentShowResult, type CommandSuccess } from "../../packages/protocol/src/index.js";

const success = (value: unknown): CommandSuccess => {
  const parsed = parseCommandResult(value);
  if (!("ok" in parsed && parsed.ok)) throw new Error(JSON.stringify(parsed));
  return parsed;
};

const temporaryDirectories: string[] = [];
const cli = resolve("apps/cli/dist/bin.js");

const run = (projectDirectory: string, appData: string, args: string[]): unknown => {
  const output = execFileSync(process.execPath, ["--no-warnings", cli, "--project-dir", projectDirectory, "--json", ...args], {
    encoding: "utf8",
    env: { ...process.env, LOCALAPPDATA: appData },
    timeout: 90_000
  });
  return JSON.parse(output);
};

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("cimiloop M4 CLI", () => {
  it("registers and shows an environment", { timeout: 90_000 }, () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-m4-cli-"));
    temporaryDirectories.push(root);
    const project = join(root, "repository");
    const appData = join(root, "app-data");
    mkdirSync(project, { recursive: true });
    execFileSync("git", ["init", project], { stdio: "ignore" });
    success(run(project, appData, ["init", "--owner-name", "M4 Owner", "--owner-email", "m4@example.com", "--yes"]));
    const created = success(run(project, appData, ["change", "create", "--title", "M4 delivery CLI"]));
    if (!("change" in created.data)) throw new Error("missing change");
    const registered = success(
      run(project, appData, [
        "environment",
        "register",
        created.data.change.id,
        "--key",
        "acceptance-test",
        "--kind",
        "test",
        "--name",
        "Acceptance Test",
        "--adapter",
        "file://examples/acceptance-target"
      ])
    );
    expect("environment" in registered.data).toBe(true);
    if (!("environment" in registered.data)) throw new Error("missing environment");
    const shown = parseEnvironmentShowResult(run(project, appData, ["environment", "show", registered.data.environment.id]));
    expect(shown.environment.kind).toBe("test");
    expect(shown.environment.environment_key).toBe("acceptance-test");
  });
});
