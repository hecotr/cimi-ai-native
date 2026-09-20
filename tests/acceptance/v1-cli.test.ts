import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const cli = resolve("apps/cli/dist/bin.js");

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("V1 CLI north-star surface", () => {
  it("exposes export, import, knowledge, and close commands", { timeout: 90_000 }, () => {
    const help = execFileSync(process.execPath, ["--no-warnings", cli, "--help"], {
      encoding: "utf8",
      timeout: 90_000
    });
    const changeHelp = execFileSync(process.execPath, ["--no-warnings", cli, "change", "--help"], {
      encoding: "utf8",
      timeout: 90_000
    });
    expect(help).toMatch(/export/);
    expect(help).toMatch(/import/);
    expect(help).toMatch(/knowledge/);
    expect(changeHelp).toMatch(/close/);
  });

  it("exports a freshly initialized project through CLI JSON", { timeout: 90_000 }, () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-v1-cli-"));
    temporaryDirectories.push(directory);
    execFileSync("git", ["init"], { cwd: directory, stdio: "ignore" });
    const appData = join(directory, "app-data");
    const run = (args: string[]) =>
      JSON.parse(
        execFileSync(process.execPath, ["--no-warnings", cli, "--project-dir", directory, "--json", ...args], {
          encoding: "utf8",
          env: { ...process.env, LOCALAPPDATA: appData },
          timeout: 90_000
        })
      ) as { ok?: boolean; data?: { export_manifest?: { content_digest: { value: string }; runtime_ownership?: string } }; export_manifest?: { content_digest: { value: string } } };
    run(["init", "--owner-name", "V1 Owner", "--owner-email", "v1@example.com", "--yes"]);
    const exported = run(["project", "export"]);
    const digest =
      exported.data?.export_manifest?.content_digest.value ?? exported.export_manifest?.content_digest.value;
    expect(exported.ok ?? true).toBeTruthy();
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
