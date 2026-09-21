import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createInternalId } from "../../protocol/src/index.js";
import { CommandDevOpsAdapter } from "../src/index.js";

const temporaryDirectories: string[] = [];
const fakeDevops = fileURLToPath(new URL("./fake-devops.mjs", import.meta.url));

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may keep a short lock on the log file after process exit.
      }
    }
  }
});

const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: createHash("sha256").update(subject).digest("hex"),
  subject
});

const inputFor = (operation: "build" | "deploy" | "status" | "verify" | "recover" | "reconcile", directory: string) => ({
  schema_version: SCHEMA_VERSION,
  operation_key: `op:${operation}:chg:rel:1`,
  operation,
  environment_id: createInternalId(),
  release_id: createInternalId(),
  artifact_digest: digest("artifact"),
  working_directory: directory,
  config_digest: digest("adapter_config"),
  input_reference: "file://ops/input.json",
  operation_id: createInternalId()
});

const createAdapter = (behavior: string, timeoutMs = 5_000) => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-devops-"));
  temporaryDirectories.push(directory);
  const adapter = new CommandDevOpsAdapter({
    schema_version: "1.0.0",
    executable: process.execPath,
    args: [fakeDevops],
    working_directory: directory,
    log_directory: join(directory, "logs"),
    timeout_ms: timeoutMs,
    operations: {
      build: { args: ["--operation", "build"] },
      deploy: { args: ["--operation", "deploy"] },
      status: { args: ["--operation", "status"] },
      verify: { args: ["--operation", "verify"] },
      recover: { args: ["--operation", "recover"] },
      reconcile: { args: ["--operation", "reconcile"] }
    }
  });
  return { adapter, directory, secrets: { CIMILOOP_FAKE_DEVOPS: behavior, CIMILOOP_DEVOPS_SECRET: "super-secret" } };
};

describe("DevOps command adapter", () => {
  it("runs build, deploy, status, verify, recover and reconcile through schema-validated results", async () => {
    const operations = ["build", "deploy", "status", "verify", "recover", "reconcile"] as const;
    for (const operation of operations) {
      const { adapter, directory, secrets } = createAdapter("ok");
      const result = await adapter.execute(inputFor(operation, directory), {
        secrets,
        secretNames: ["CIMILOOP_DEVOPS_SECRET"]
      });
      expect(result.operation_key).toBe(`op:${operation}:chg:rel:1`);
      expect(result.state).toBe("succeeded");
      expect(result.summary).toContain(operation);
      expect(result.log_reference.startsWith("file://")).toBe(true);
      expect(result.log_digest.value).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("passes the operation key, stores large logs by digest and never writes secrets", async () => {
    const { adapter, directory, secrets } = createAdapter("ok");
    const result = await adapter.execute(inputFor("deploy", directory), {
      secrets,
      secretNames: ["CIMILOOP_DEVOPS_SECRET"]
    });
    const logPath = fileURLToPath(result.log_reference);
    const log = readFileSync(logPath, "utf8");
    expect(log).toContain("op:deploy:chg:rel:1");
    expect(log).not.toContain("super-secret");
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(result.log_digest.value).toBe(createHash("sha256").update(log).digest("hex"));
  });

  it("records unknown results for timeout and signal, and rejects malformed JSON", async () => {
    const timed = createAdapter("hang", 200);
    const timedOut = await timed.adapter.execute(inputFor("deploy", timed.directory), {
      secrets: timed.secrets,
      secretNames: ["CIMILOOP_DEVOPS_SECRET"]
    });
    expect(timedOut.state).toBe("unknown");
    expect(timedOut.summary).toMatch(/timeout/i);

    const signaled = createAdapter("signal");
    const signalResult = await signaled.adapter.execute(inputFor("status", signaled.directory), {
      secrets: signaled.secrets,
      secretNames: ["CIMILOOP_DEVOPS_SECRET"]
    });
    expect(signalResult.state).toBe("unknown");
    expect(signalResult.summary).toMatch(/signal/i);

    const malformed = createAdapter("malformed");
    const invalid = await malformed.adapter.execute(inputFor("verify", malformed.directory), {
      secrets: malformed.secrets,
      secretNames: ["CIMILOOP_DEVOPS_SECRET"]
    });
    expect(invalid.state).toBe("unknown");
    expect(invalid.summary).toMatch(/malformed|invalid/i);
  });
});
