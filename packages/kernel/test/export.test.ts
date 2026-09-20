import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createInternalId, type CommandSuccess, type DomainError } from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../src/kernel.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";

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

describe("ExportProject", () => {
  it("exports a deterministic in-progress project bundle without secrets", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-export-"));
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
        source: { origin: "human_cli" as const, producer: "m5-export-test" },
        payload: {
          name: "M5 Export",
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
        source: { origin: "human_cli" as const, producer: "m5-export-test" },
        payload: { title: "In progress" }
      })
    );
    const project = kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    const exported = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "ExportProject",
        requested_at: now,
        actor_id: initialized.data.actor.id,
        project_id: initialized.data.project.id,
        expected_revision: project.revision,
        source: { origin: "human_cli" as const, producer: "m5-export-test" },
        payload: { scope: "project" }
      })
    );
    if (!("export_manifest" in exported.data)) throw new Error("missing export_manifest");
    expect(exported.data.export_manifest.ownership_state).toBe("active");
    expect(exported.data.export_manifest.entries.some((entry) => entry.object_type === "change")).toBe(true);
    expect(exported.data.export_manifest.entries.some((entry) => entry.object_type === "event")).toBe(true);
    expect(JSON.stringify(exported.data.export_manifest)).not.toMatch(/password|token|BEGIN PRIVATE/i);
    expect(exported.data.export_manifest.excluded.some((item) => item.kind === "secret")).toBe(true);
  });
});
