import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const digestOf = (bytes: string) => ({
  algorithm: "sha256" as const,
  value: createHash("sha256").update(bytes).digest("hex"),
  subject: "import_bundle"
});

describe("StageImport and CommitImport", () => {
  it("stages a bundle as dormant and rejects divergent local history", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-import-cmd-"));
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
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: {
          name: "Local",
          repository_kind: "directory",
          repository_path: directory,
          owner_name: "Owner"
        }
      })
    );
    if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
    const exported = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "ExportProject",
        requested_at: now,
        actor_id: initialized.data.actor.id,
        project_id: initialized.data.project.id,
        expected_revision: initialized.data.project.revision,
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: { scope: "project" }
      })
    );
    if (!("export_manifest" in exported.data)) throw new Error("missing export");
    const foreign = {
      ...exported.data.export_manifest,
      project_id: createInternalId(),
      content_digest: { ...exported.data.export_manifest.content_digest, value: "b".repeat(64) }
    };
    const bytes = JSON.stringify({ manifest: foreign, facts: foreign.entries });
    const bundlePath = join(directory, "foreign.json");
    writeFileSync(bundlePath, bytes);
    const project = kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    const staged = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "StageImport",
        requested_at: now,
        actor_id: initialized.data.actor.id,
        project_id: initialized.data.project.id,
        expected_revision: project.revision,
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: {
          bundle_reference: `file://${bundlePath.replaceAll("\\", "/")}`,
          bundle_digest: digestOf(bytes)
        }
      })
    );
    if (!("import_report" in staged.data)) throw new Error("missing report");
    expect(staged.data.import_report).toMatchObject({ status: "staged", runtime_ownership: "dormant" });
    expect(
      failure(
        kernel.execute({
          schema_version: SCHEMA_VERSION,
          command_id: createInternalId(),
          correlation_id: createInternalId(),
          command_type: "CommitImport",
          requested_at: now,
          actor_id: initialized.data.actor.id,
          project_id: initialized.data.project.id,
          expected_revision: project.revision,
          source: { origin: "human_cli" as const, producer: "m5-import-test" },
          payload: { import_report_id: staged.data.import_report.id }
        })
      ).code
    ).toBe("DIVERGENT_HISTORY");
    expect(kernel.getProject()).toMatchObject({ id: initialized.data.project.id, name: "Local" });
  });

  it("commits into an empty store without activating runtime ownership", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-import-empty-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const manifest = {
      portable_schema_version: "portable-1.0.0",
      id: createInternalId(),
      project_id: createInternalId(),
      exported_at: now,
      exporter_actor_id: createInternalId(),
      source_instance_id: createInternalId(),
      ids: [],
      entries: [],
      event_sequence_start: 1,
      event_sequence_end: 1,
      latest_revision: 1,
      ownership_state: "active",
      excluded: [{ kind: "secret", reason: "credentials are never exported" }],
      content_digest: { algorithm: "sha256", value: "c".repeat(64), subject: "export_content" },
      manifest_digest: { algorithm: "sha256", value: "d".repeat(64), subject: "export_manifest" }
    };
    const bytes = JSON.stringify({ manifest, facts: [] });
    const bundlePath = join(directory, "empty-target.json");
    writeFileSync(bundlePath, bytes);
    const staged = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "StageImport",
        requested_at: now,
        actor_id: createInternalId(),
        project_id: manifest.project_id,
        expected_revision: 1,
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: {
          bundle_reference: `file://${bundlePath.replaceAll("\\", "/")}`,
          bundle_digest: digestOf(bytes)
        }
      })
    );
    if (!("import_report" in staged.data)) throw new Error("missing report");
    const committed = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CommitImport",
        requested_at: now,
        actor_id: createInternalId(),
        project_id: manifest.project_id,
        expected_revision: 1,
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: { import_report_id: staged.data.import_report.id }
      })
    );
    if (!("import_report" in committed.data)) throw new Error("missing commit report");
    expect(committed.data.import_report).toMatchObject({
      status: "accepted",
      runtime_ownership: "dormant"
    });
    const project = kernel.getProject();
    expect("code" in project).toBe(true);
  });

  it("treats a re-imported export of the same project as identical history", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-import-identical-"));
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
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: {
          name: "Identical",
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
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: { title: "Same history" }
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
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: { scope: "project" }
      })
    );
    if (!("export_manifest" in exported.data)) throw new Error("missing export");
    const bytes = JSON.stringify({ manifest: exported.data.export_manifest, facts: exported.data.export_manifest.entries });
    const bundlePath = join(directory, "same.json");
    writeFileSync(bundlePath, bytes);
    const afterExport = kernel.getProject();
    if ("code" in afterExport) throw new Error(afterExport.code);
    const staged = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "StageImport",
        requested_at: now,
        actor_id: initialized.data.actor.id,
        project_id: initialized.data.project.id,
        expected_revision: afterExport.revision,
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: {
          bundle_reference: `file://${bundlePath.replaceAll("\\", "/")}`,
          bundle_digest: digestOf(bytes)
        }
      })
    );
    if (!("import_report" in staged.data)) throw new Error("missing report");
    const committed = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CommitImport",
        requested_at: now,
        actor_id: initialized.data.actor.id,
        project_id: initialized.data.project.id,
        expected_revision: afterExport.revision,
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: { import_report_id: staged.data.import_report.id }
      })
    );
    if (!("import_report" in committed.data)) throw new Error("missing commit");
    expect(committed.data.import_report.status).toBe("accepted");
    expect(committed.data.import_report.summary).toMatch(/idempotent/i);
  });
});
