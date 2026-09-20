import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseClaimShowResult,
  parseCommandResult,
  parseEvidencePackageShowResult,
  parseEvidenceShowResult,
  type CommandSuccess
} from "../../packages/protocol/src/index.js";

const success = (value: unknown): CommandSuccess => {
  const parsed = parseCommandResult(value);
  if (!("ok" in parsed && parsed.ok)) throw new Error(JSON.stringify(parsed));
  return parsed;
};

const temporaryDirectories: string[] = [];
const cli = resolve("apps/cli/dist/bin.js");

const run = (projectDirectory: string, appData: string, args: string[]): unknown => {
  const output = execFileSync(
    process.execPath,
    ["--no-warnings", cli, "--project-dir", projectDirectory, "--json", ...args],
    {
      encoding: "utf8",
      env: { ...process.env, LOCALAPPDATA: appData },
      timeout: 90_000
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

describe("cimiloop M3 CLI", () => {
  it("submits a claim, records evidence and shows an evidence package", { timeout: 90_000 }, () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-m3-cli-"));
    temporaryDirectories.push(root);
    const project = join(root, "repository");
    const appData = join(root, "app-data");
    mkdirSync(project, { recursive: true });
    execFileSync("git", ["init", project], { stdio: "ignore" });
    const initialized = success(
      run(project, appData, ["init", "--owner-name", "M3 Owner", "--owner-email", "m3@example.com", "--yes"])
    );
    expect(initialized.ok).toBe(true);
    const created = success(run(project, appData, ["change", "create", "--title", "M3 evidence CLI"]));
    if (!("change" in created.data)) throw new Error("missing change");
    const submitted = success(
      run(project, appData, [
        "claim",
        "submit",
        created.data.change.id,
        "--key",
        "AC-1",
        "--statement",
        "验收通过。",
        "--category",
        "intent",
        "--obligation",
        "required",
        "--source",
        "acceptance"
      ])
    );
    expect("claim" in submitted.data).toBe(true);
    if (!("claim" in submitted.data)) throw new Error("missing claim");
    const shown = parseClaimShowResult(
      run(project, appData, ["claim", "show", submitted.data.claim.id])
    );
    expect(shown.claim.claim_key).toBe("AC-1");
    const recorded = success(
      run(project, appData, [
        "evidence",
        "record",
        created.data.change.id,
        "--claim",
        submitted.data.claim.id,
        "--stance",
        "Supports",
        "--subject-type",
        "artifact",
        "--subject-id",
        submitted.data.claim.id,
        "--subject-digest",
        "a".repeat(64),
        "--reference",
        "cimi-object://evidence/cli",
        "--digest",
        "b".repeat(64),
        "--producer",
        "evaluator"
      ])
    );
    expect("evidence" in recorded.data).toBe(true);
    if (!("evidence" in recorded.data)) throw new Error("missing evidence");
    const evidence = parseEvidenceShowResult(run(project, appData, ["evidence", "show", recorded.data.evidence.id]));
    expect(evidence.evidence.stance).toBe("Supports");
    const pack = parseEvidencePackageShowResult(run(project, appData, ["evidence", "package", created.data.change.id]));
    expect(pack.package.claim_ids).toContain(submitted.data.claim.id);
    expect(pack.package.evidence_ids).toContain(recorded.data.evidence.id);
    expect(JSON.stringify(pack)).not.toContain("SECRET");
  });
});
