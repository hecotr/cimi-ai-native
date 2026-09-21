import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeterministicDevOpsAdapter } from "../../devops/src/deterministic.js";
import { CimiLoopKernel } from "../../kernel/src/kernel.js";
import { SCHEMA_VERSION, createInternalId, type ExportManifest } from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { ExternalDeliveryWorker } from "../src/external-worker.js";
import { now, openQueuedDelivery, success } from "./delivery-harness.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];

afterEach(() => {
  while (openStores.length > 0) openStores.pop()?.close();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("dormant runtime ownership", () => {
  it("imports pending operations as dormant and the worker never invokes the adapter", async () => {
    const source = openQueuedDelivery(temporaryDirectories, openStores);
    const project = source.kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    const exported = success(
      source.kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "ExportProject",
        requested_at: now,
        actor_id: source.actorId,
        project_id: source.projectId,
        expected_revision: project.revision,
        source: { origin: "human_cli", producer: "ownership-test" },
        payload: { scope: "project" }
      })
    );
    if (!("export_manifest" in exported.data)) throw new Error("missing export");
    const manifest = exported.data.export_manifest as ExportManifest;
    const targetDir = mkdtempSync(join(tmpdir(), "cimiloop-ownership-target-"));
    temporaryDirectories.push(targetDir);
    const bundlePath = join(targetDir, "bundle.json");
    writeFileSync(bundlePath, JSON.stringify({ manifest }));
    const targetStore = new SqliteProjectStore(join(targetDir, "project.db"));
    openStores.push(targetStore);
    const target = new CimiLoopKernel({ store: targetStore, now: () => now });
    const staged = success(
      target.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "StageImport",
        requested_at: now,
        actor_id: createInternalId(),
        project_id: manifest.project_id,
        expected_revision: 1,
        source: { origin: "human_cli", producer: "ownership-test", repository_path: targetDir },
        payload: {
          bundle_reference: `file://${bundlePath.replaceAll("\\", "/")}`,
          bundle_digest: {
            algorithm: "sha256",
            value: (await import("node:crypto")).createHash("sha256").update(JSON.stringify({ manifest })).digest("hex"),
            subject: "import_bundle"
          }
        }
      })
    );
    if (!("import_report" in staged.data)) throw new Error("missing report");
    success(
      target.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CommitImport",
        requested_at: now,
        actor_id: createInternalId(),
        project_id: manifest.project_id,
        expected_revision: 1,
        source: { origin: "human_cli", producer: "ownership-test", repository_path: targetDir },
        payload: { import_report_id: staged.data.import_report.id }
      })
    );
    expect(target.getProject()).toMatchObject({ id: source.projectId, runtime_ownership: "dormant" });
    const adapter = new DeterministicDevOpsAdapter();
    const worker = new ExternalDeliveryWorker({
      kernel: target,
      store: targetStore,
      adapter,
      projectId: source.projectId,
      actorId: source.actorId,
      workingDirectory: targetDir
    });
    const recovered = await worker.recover();
    expect(adapter.calls).toEqual([]);
    expect(recovered.executed).toBe(0);
    const pending = targetStore.transaction((transaction) =>
      transaction.listExternalOperationsByChange(source.changeId).filter((item) => item.state === "pending")
    );
    expect(pending.length).toBeGreaterThan(0);
    expect(target.getChange(source.changeId)).toMatchObject({ id: source.changeId });
    const timeline = target.getTimeline(source.changeId);
    if ("code" in timeline) throw new Error(timeline.code);
    expect(timeline.events.length).toBeGreaterThan(0);
    expect(failureCreate(target, source.projectId, source.actorId, source.changeId).code).toBe(
      "PROJECT_RUNTIME_DORMANT"
    );
  });
});

const failureCreate = (
  kernel: CimiLoopKernel,
  projectId: string,
  actorId: string,
  changeId: string
) => {
  const change = kernel.getChange(changeId);
  if ("code" in change) throw new Error(change.code);
  const result = kernel.execute({
    schema_version: SCHEMA_VERSION,
    command_id: createInternalId(),
    correlation_id: createInternalId(),
    command_type: "CreateExecutionWorkItems",
    requested_at: now,
    actor_id: actorId,
    project_id: projectId,
    expected_revision: change.revision,
    target: { object_type: "change", id: changeId, domain_version: 1 },
    source: { origin: "system", producer: "ownership-test" },
    payload: { change_id: changeId }
  });
  if (!("code" in result)) throw new Error("expected dormant denial");
  return result;
};
