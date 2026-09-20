import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_VERSION, createInternalId } from "../packages/protocol/dist/index.js";
import { SqliteProjectStore } from "../packages/store-sqlite/dist/index.js";
import { CimiLoopKernel } from "../packages/kernel/dist/index.js";

const now = "2026-09-20T12:00:00.000Z";
const root = mkdtempSync(join(tmpdir(), "cimiloop-v1-freeze-import-"));
const sourceDir = join(root, "source");
const isolatedDir = join(root, "isolated");
mkdirSync(sourceDir, { recursive: true });
mkdirSync(isolatedDir, { recursive: true });

const success = (result) => {
  if (!result || !("ok" in result) || !result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
};

const digestOf = (bytes) => ({
  algorithm: "sha256",
  value: createHash("sha256").update(bytes).digest("hex"),
  subject: "import_bundle"
});

const sourceStore = new SqliteProjectStore(join(sourceDir, "project.db"));
const source = new CimiLoopKernel({ store: sourceStore, now: () => now });
const initialized = success(
  source.execute({
    schema_version: SCHEMA_VERSION,
    command_id: createInternalId(),
    correlation_id: createInternalId(),
    command_type: "InitializeProject",
    requested_at: now,
    actor_id: createInternalId(),
    project_id: createInternalId(),
    source: { origin: "human_cli", producer: "v1-freeze" },
    payload: {
      name: "V1 Freeze Source",
      repository_kind: "directory",
      repository_path: sourceDir,
      owner_name: "Freeze Owner"
    }
  })
);
const created = success(
  source.execute({
    schema_version: SCHEMA_VERSION,
    command_id: createInternalId(),
    correlation_id: createInternalId(),
    command_type: "CreateChange",
    requested_at: now,
    actor_id: initialized.data.actor.id,
    project_id: initialized.data.project.id,
    source: { origin: "human_cli", producer: "v1-freeze" },
    payload: { title: "Freeze export change" }
  })
);
const project = source.getProject();
if ("code" in project) throw new Error(project.code);
const exported = success(
  source.execute({
    schema_version: SCHEMA_VERSION,
    command_id: createInternalId(),
    correlation_id: createInternalId(),
    command_type: "ExportProject",
    requested_at: now,
    actor_id: initialized.data.actor.id,
    project_id: initialized.data.project.id,
    expected_revision: project.revision,
    source: { origin: "human_cli", producer: "v1-freeze" },
    payload: { scope: "project" }
  })
);
const manifest = exported.data.export_manifest;
const timeline = source.getTimeline(created.data.change.id);
if ("code" in timeline) throw new Error(timeline.code);
const eventIds = source.listEvents().map((event) => event.event_id);
const bytes = JSON.stringify({ manifest, facts: manifest.entries });
const bundlePath = join(root, "bundle.json");
writeFileSync(bundlePath, bytes);

const isolatedStore = new SqliteProjectStore(join(isolatedDir, "project.db"));
const isolated = new CimiLoopKernel({ store: isolatedStore, now: () => now });
const staged = success(
  isolated.execute({
    schema_version: SCHEMA_VERSION,
    command_id: createInternalId(),
    correlation_id: createInternalId(),
    command_type: "StageImport",
    requested_at: now,
    actor_id: createInternalId(),
    project_id: manifest.project_id,
    expected_revision: 1,
    source: { origin: "human_cli", producer: "v1-freeze" },
    payload: {
      bundle_reference: `file://${bundlePath.replaceAll("\\", "/")}`,
      bundle_digest: digestOf(bytes)
    }
  })
);
const committed = success(
  isolated.execute({
    schema_version: SCHEMA_VERSION,
    command_id: createInternalId(),
    correlation_id: createInternalId(),
    command_type: "CommitImport",
    requested_at: now,
    actor_id: createInternalId(),
    project_id: manifest.project_id,
    expected_revision: 1,
    source: { origin: "human_cli", producer: "v1-freeze" },
    payload: { import_report_id: staged.data.import_report.id }
  })
);
const isolatedProject = isolated.getProject();

sourceStore.close();
isolatedStore.close();
rmSync(root, { recursive: true, force: true });

if (committed.data.import_report.runtime_ownership !== "dormant") {
  throw new Error("imported project must stay dormant");
}
if (committed.data.import_report.status !== "accepted") {
  throw new Error(`expected accepted import, got ${committed.data.import_report.status}`);
}
if (!/^[0-9a-f]{64}$/.test(manifest.content_digest.value)) {
  throw new Error("export content digest missing");
}
if (timeline.events.length === 0) {
  throw new Error("source timeline is empty");
}

console.log("freeze-export-import passed");
console.log(`source_project=${initialized.data.project.id}`);
console.log(`source_change=${created.data.change.id}`);
console.log(`export_digest=${manifest.content_digest.value}`);
console.log(`source_timeline_events=${timeline.events.length}`);
console.log(`source_event_ids=${eventIds.length}`);
console.log(`import_status=${committed.data.import_report.status}`);
console.log(`runtime_ownership=${committed.data.import_report.runtime_ownership}`);
console.log(`isolated_project_materialized=${!("code" in isolatedProject)}`);
