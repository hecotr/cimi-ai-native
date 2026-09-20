import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError
} from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../../packages/kernel/src/kernel.js";
import { parseDevOpsCommandConfig } from "../../packages/devops/src/contract.js";
import { validateImportBundle } from "../../packages/portability/src/importer.js";
import { escapeHtml } from "../../apps/workbench/src/html.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const forbidden = /token|password|secret_value|BEGIN RSA|sk-[A-Za-z0-9]|Authorization: Bearer|process_env/i;

afterEach(() => {
  while (openStores.length > 0) {
    openStores.pop()?.close();
  }
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  if (!("ok" in result && result.ok)) throw new Error(JSON.stringify(result));
  return result;
};

const digestOf = (bytes: string) => ({
  algorithm: "sha256" as const,
  value: createHash("sha256").update(bytes).digest("hex"),
  subject: "import_bundle"
});

describe("V1 security boundaries", () => {
  it("keeps secrets and stacks out of errors, events, and export JSON", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-v1-security-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const initialized = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "InitializeProject",
        requested_at: now,
        actor_id: createInternalId(),
        project_id: createInternalId(),
        source: { origin: "human_cli" as const, producer: "v1-security-test" },
        payload: {
          name: "Security",
          repository_kind: "directory",
          repository_path: directory,
          owner_name: "Owner"
        }
      })
    );
    if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
    success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CreateChange",
        requested_at: now,
        actor_id: initialized.data.actor.id,
        project_id: initialized.data.project.id,
        source: { origin: "human_cli" as const, producer: "v1-security-test" },
        payload: { title: "No secrets" }
      })
    );
    const malformed = kernel.execute({
      command_type: "CreateChange",
      secret: "sk-live-secret_value",
      process_env: { TOKEN: "hidden-token" },
      payload: { password: "hunter2" }
    });
    expect(malformed).toMatchObject({ code: "PROTOCOL_VALIDATION_FAILED" });
    expect(JSON.stringify(malformed)).not.toMatch(forbidden);
    expect(JSON.stringify(malformed)).not.toMatch(/at CimiLoopKernel|sqlite|SQL/);
    const exported = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "ExportProject",
        requested_at: now,
        actor_id: initialized.data.actor.id,
        project_id: initialized.data.project.id,
        expected_revision: store.getProject()?.revision,
        source: { origin: "human_cli" as const, producer: "v1-security-test" },
        payload: { scope: "project" }
      })
    );
    expect(JSON.stringify(store.listEvents())).not.toMatch(forbidden);
    expect(JSON.stringify(exported)).not.toMatch(forbidden);
    if ("export_manifest" in exported.data) {
      expect(exported.data.export_manifest.excluded.some((item) => item.kind === "secret")).toBe(true);
    }
  });

  it("rejects path traversal, command injection, HTML injection, and oversized imports", () => {
    expect(escapeHtml(`<script>alert("token")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;token&quot;)&lt;/script&gt;"
    );
    expect(() =>
      parseDevOpsCommandConfig({
        schema_version: SCHEMA_VERSION,
        executable: "node",
        args: ["--operation", "deploy; rm -rf /"],
        working_directory: "examples/acceptance-target",
        log_directory: "var/logs",
        timeout_ms: 1000,
        operations: {
          build: { args: ["build"] },
          deploy: { args: ["deploy && curl http://evil"] },
          status: { args: ["status"] },
          verify: { args: ["verify"] },
          recover: { args: ["recover"] },
          reconcile: { args: ["reconcile"] }
        }
      })
    ).toThrow();

    const root = mkdtempSync(join(tmpdir(), "cimiloop-v1-import-sec-"));
    temporaryDirectories.push(root);
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: "file://../Windows/System32/config",
        bundleDigest: digestOf("x"),
        maxBytes: 1024
      })
    ).toThrow(/PATH_TRAVERSAL|path traversal/i);
    const huge = join(root, "huge.json");
    writeFileSync(huge, "x".repeat(2048));
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: `file://${huge.replaceAll("\\", "/")}`,
        bundleDigest: digestOf("x".repeat(2048)),
        maxBytes: 1024
      })
    ).toThrow(/BUNDLE_TOO_LARGE|size/i);
  });
});
