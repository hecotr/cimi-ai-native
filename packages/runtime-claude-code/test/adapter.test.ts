import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createInternalId } from "../../protocol/src/index.js";
import { ClaudeCodeRuntimeAdapter } from "../src/index.js";

const temporaryDirectories: string[] = [];
const fakeRuntime = fileURLToPath(new URL("./fake-runtime.mjs", import.meta.url));

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "a".repeat(64),
  subject
});

const createHarness = (behavior: string, timeoutMs = 5_000) => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-runtime-"));
  temporaryDirectories.push(directory);
  const worktreePath = join(directory, "worktree");
  const logDirectory = join(directory, "logs");
  mkdirSync(worktreePath);
  mkdirSync(logDirectory);
  const contextManifestPath = join(directory, "manifest.json");
  writeFileSync(contextManifestPath, JSON.stringify({ id: "pack" }));
  const workItem = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: createInternalId(),
    change_id: createInternalId(),
    kind: "execution" as const,
    status: "claimed" as const,
    contract_id: createInternalId(),
    contract_version: 1,
    policy_snapshot_id: createInternalId(),
    authorized_role_key: "technical_owner" as const,
    permission_scope: ["workspace.write"],
    budget: { max_duration_ms: timeoutMs, max_retries: 0 },
    stop_conditions: ["timeout"],
    authorization_digest: digest("work_item_authorization"),
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    revision: 1
  };
  const binding = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: workItem.project_id,
    work_item_id: workItem.id,
    run_id: createInternalId(),
    runtime: {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: workItem.project_id,
      provider_type: "runtime" as const,
      name: "claude-code",
      implementation_version: "fake",
      capability_ids: ["code.modify"],
      version_digest: digest("provider"),
      created_at: "2026-09-20T00:00:00.000Z"
    },
    granted_permissions: ["workspace.write"],
    digest: digest("binding"),
    created_at: "2026-09-20T00:00:00.000Z"
  };
  const adapter = new ClaudeCodeRuntimeAdapter({
    executable: fakeRuntime,
    logDirectory,
    env: { CIMILOOP_FAKE_BEHAVIOR: behavior, CIMILOOP_SECRET: "super-secret" },
    secretNames: ["CIMILOOP_SECRET"],
    timeoutMs
  });
  return {
    adapter,
    request: { workItem, contextManifestPath, worktreePath, binding }
  };
};

describe("Claude Code runtime adapter", () => {
  it("starts a live process and reports heartbeat without exposing secrets", async () => {
    const { adapter, request } = createHarness("hang", 5_000);
    const session = await adapter.start(request);
    expect(session.processReference.startsWith("pid://")).toBe(true);
    const heartbeat = await session.heartbeat();
    expect(heartbeat.running).toBe(true);
    await session.cancel();
    const result = await session.wait();
    expect(result.kind).toBe("unknown");
    if (result.kind !== "unknown") throw new Error("expected unknown");
    expect(result.reason).toBe("cancelled");
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });

  it("treats exit 0 as a process fact, not business success, and stores logs by digest", async () => {
    const { adapter, request } = createHarness("exit0");
    const result = await adapter.run(request);
    expect(result.kind).toBe("exited");
    if (result.kind !== "exited") throw new Error("expected exited");
    expect(result.exitCode).toBe(0);
    expect(result.businessSuccess).toBe(false);
    expect(result.logDigest.algorithm).toBe("sha256");
    expect(result.logDigest.value).toMatch(/^[0-9a-f]{64}$/);
    expect(result.logReference.startsWith("file://")).toBe(true);
    const log = readFileSync(result.logPath, "utf8");
    expect(log).toContain("fake-runtime ok");
    expect(log).not.toContain("super-secret");
  });

  it("records unknown results for timeout, invalid output and signal", async () => {
    const timed = createHarness("hang", 200);
    const timedOut = await timed.adapter.run(timed.request);
    expect(timedOut.kind).toBe("unknown");
    if (timedOut.kind !== "unknown") throw new Error("expected unknown");
    expect(timedOut.reason).toBe("timeout");
    expect(timedOut.failure.code).toMatch(/^[A-Z][A-Z0-9_]+$/);
    expect(timedOut.blocker.status).toBe("open");
    expect(timedOut.blocker.work_item_id).toBe(timed.request.workItem.id);

    const invalid = createHarness("invalid");
    const invalidResult = await invalid.adapter.run(invalid.request);
    expect(invalidResult.kind).toBe("unknown");
    if (invalidResult.kind !== "unknown") throw new Error("expected unknown");
    expect(invalidResult.reason).toBe("invalid_output");

    const signaled = createHarness("hang", 5_000);
    const signalSession = await signaled.adapter.start(signaled.request);
    await signalSession.signal("SIGTERM");
    const signalResult = await signalSession.wait();
    expect(signalResult.kind).toBe("unknown");
    if (signalResult.kind !== "unknown") throw new Error("expected unknown");
    expect(signalResult.reason).toBe("signal");
  });
});
