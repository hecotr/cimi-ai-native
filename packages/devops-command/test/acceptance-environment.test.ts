import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createInternalId } from "../../protocol/src/index.js";
import { CommandDevOpsAdapter } from "../src/index.js";

const temporaryDirectories: string[] = [];
const adapterScript = fileURLToPath(new URL("../../../examples/acceptance-target/adapter.mjs", import.meta.url));
const serverScript = fileURLToPath(new URL("../../../examples/acceptance-target/server.mjs", import.meta.url));

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may keep a short lock on the log or pid file.
      }
    }
  }
});

const sha = (value: string): string => createHash("sha256").update(value).digest("hex");
const digestA = sha("acceptance-artifact-a");
const digestB = sha("acceptance-artifact-b");

const protocolDigest = (value: string, subject: string) => ({
  algorithm: "sha256" as const,
  value: sha(value),
  subject
});

const inputFor = (
  operation: "build" | "deploy" | "status" | "verify" | "recover" | "reconcile",
  directory: string,
  digestValue: string,
  operationKey = `op:${operation}:${digestValue.slice(0, 8)}`
) => ({
  schema_version: SCHEMA_VERSION,
  operation_key: operationKey,
  operation,
  environment_id: createInternalId(),
  release_id: createInternalId(),
  artifact_digest: { algorithm: "sha256" as const, value: digestValue, subject: "artifact" },
  working_directory: directory,
  config_digest: protocolDigest("acceptance-config", "adapter_config"),
  input_reference: "file://ops/input.json",
  operation_id: createInternalId()
});

const writeArtifact = (root: string, digestValue: string, payload: string): void => {
  const directory = join(root, "artifacts", digestValue);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "payload.txt"), payload);
};

const createHarness = (fault?: string) => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-acceptance-"));
  temporaryDirectories.push(directory);
  writeArtifact(directory, digestA, "acceptance-artifact-a");
  writeArtifact(directory, digestB, "acceptance-artifact-b");
  const adapter = new CommandDevOpsAdapter({
    schema_version: "1.0.0",
    executable: process.execPath,
    args: [adapterScript],
    working_directory: directory,
    log_directory: join(directory, "logs"),
    timeout_ms: 2_000,
    operations: {
      build: { args: ["--operation", "build"] },
      deploy: { args: ["--operation", "deploy"] },
      status: { args: ["--operation", "status"] },
      verify: { args: ["--operation", "verify"] },
      recover: { args: ["--operation", "recover"] },
      reconcile: { args: ["--operation", "reconcile"] }
    }
  });
  const secrets: Record<string, string> = {
    CIMILOOP_ACCEPTANCE_ROOT: directory,
    CIMILOOP_ACCEPTANCE_TARGET: "test"
  };
  if (fault) secrets.CIMILOOP_ACCEPTANCE_FAULT = fault;
  return { adapter, directory, secrets };
};

const getJson = async (url: string): Promise<Record<string, unknown>> => {
  const response = await fetch(url);
  return (await response.json()) as Record<string, unknown>;
};

describe("M4 acceptance environment", () => {
  it("deploys the same immutable digest into isolated test and prod targets", { timeout: 20_000 }, async () => {
    const { adapter, directory, secrets } = createHarness();
    const { spawn } = await import("node:child_process");
    const portFile = join(directory, "port");
    const child = spawn(process.execPath, [serverScript], {
      cwd: directory,
      env: { ...process.env, CIMILOOP_ACCEPTANCE_ROOT: directory, CIMILOOP_ACCEPTANCE_PORT_FILE: portFile },
      stdio: "ignore",
      windowsHide: true
    });
    temporaryDirectories.push(directory);
    try {
      const started = await new Promise<string>((resolve, reject) => {
        const deadline = Date.now() + 5_000;
        const poll = (): void => {
          if (existsSync(portFile)) {
            resolve(readFileSync(portFile, "utf8").trim());
            return;
          }
          if (Date.now() > deadline) {
            reject(new Error("acceptance server did not start"));
            return;
          }
          setTimeout(poll, 50);
        };
        poll();
      });
      secrets.CIMILOOP_ACCEPTANCE_PORT = started;

      const deployed = await adapter.execute(inputFor("deploy", directory, digestA, "op:deploy:test-a"), { secrets });
      expect(deployed.state).toBe("succeeded");
      expect(readFileSync(join(directory, "envs", "test", "CURRENT"), "utf8").trim()).toBe(digestA);
      expect(readFileSync(join(directory, "envs", "test", "releases", digestA, "payload.txt"), "utf8")).toBe(
        "acceptance-artifact-a"
      );
      expect(existsSync(join(directory, "envs", "prod", "CURRENT"))).toBe(false);

      const observed = await getJson(`http://127.0.0.1:${started}/status?target=test`);
      expect(observed).toMatchObject({ digest: digestA, health: "healthy", core_path: "pass" });

      const verified = await adapter.execute(inputFor("verify", directory, digestA, "op:verify:test-a"), { secrets });
      expect(verified.state).toBe("succeeded");
      expect(verified.actual_digest?.value).toBe(digestA);
      expect(verified.health).toBe("healthy");
      expect(verified.core_path).toBe("pass");

      const prodSecrets = { ...secrets, CIMILOOP_ACCEPTANCE_TARGET: "prod" };
      const prodDeploy = await adapter.execute(inputFor("deploy", directory, digestA, "op:deploy:prod-a"), {
        secrets: prodSecrets
      });
      expect(prodDeploy.state).toBe("succeeded");
      expect(readFileSync(join(directory, "envs", "prod", "CURRENT"), "utf8").trim()).toBe(digestA);
      expect(readFileSync(join(directory, "envs", "test", "CURRENT"), "utf8").trim()).toBe(digestA);
    } finally {
      child.kill();
    }
  });

  it("recovers the previous known-good digest after a later deploy", async () => {
    const { adapter, directory, secrets } = createHarness();
    await adapter.execute(inputFor("deploy", directory, digestA, "op:deploy:a"), { secrets });
    await adapter.execute(inputFor("deploy", directory, digestB, "op:deploy:b"), { secrets });
    expect(readFileSync(join(directory, "envs", "test", "CURRENT"), "utf8").trim()).toBe(digestB);
    const recovered = await adapter.execute(inputFor("recover", directory, digestA, "op:recover:a"), { secrets });
    expect(recovered.state).toBe("succeeded");
    expect(recovered.actual_digest?.value).toBe(digestA);
    expect(readFileSync(join(directory, "envs", "test", "CURRENT"), "utf8").trim()).toBe(digestA);
  });

  it("injects timeout-before-effect, timeout-after-effect, wrong digest and health failure", { timeout: 15_000 }, async () => {
    const before = createHarness("timeout-before-effect");
    const beforeResult = await before.adapter.execute(inputFor("deploy", before.directory, digestA, "op:deploy:before"), {
      secrets: before.secrets,
      timeoutMs: 200
    });
    expect(beforeResult.state).toBe("unknown");
    expect(existsSync(join(before.directory, "envs", "test", "CURRENT"))).toBe(false);

    const after = createHarness("timeout-after-effect");
    const afterResult = await after.adapter.execute(inputFor("deploy", after.directory, digestA, "op:deploy:after"), {
      secrets: after.secrets,
      timeoutMs: 2_000
    });
    expect(afterResult.state).toBe("unknown");
    expect(readFileSync(join(after.directory, "envs", "test", "CURRENT"), "utf8").trim()).toBe(digestA);

    const wrong = createHarness("wrong-digest");
    const wrongResult = await wrong.adapter.execute(inputFor("deploy", wrong.directory, digestA, "op:deploy:wrong"), {
      secrets: wrong.secrets
    });
    expect(wrongResult.state).toBe("succeeded");
    expect(wrongResult.actual_digest?.value).toBe(digestB);
    expect(readFileSync(join(wrong.directory, "envs", "test", "CURRENT"), "utf8").trim()).toBe(digestB);

    const unhealthy = createHarness("health-failure");
    await unhealthy.adapter.execute(inputFor("deploy", unhealthy.directory, digestA, "op:deploy:unhealthy"), {
      secrets: unhealthy.secrets
    });
    const verified = await unhealthy.adapter.execute(inputFor("verify", unhealthy.directory, digestA, "op:verify:unhealthy"), {
      secrets: unhealthy.secrets
    });
    expect(verified.state).toBe("failed");
    expect(verified.health).toBe("unhealthy");
    expect(verified.core_path).toBe("fail");
  });
});
