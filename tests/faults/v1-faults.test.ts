import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";
import type { ProjectStore } from "../../packages/store/src/index.js";
import { CimiLoopKernel } from "../../packages/kernel/src/kernel.js";
import { createPlanningWorkItem } from "../../packages/kernel/src/work-item.js";
import { exportProjectBundle } from "../../packages/portability/src/exporter.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string, value = "a".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

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

const wrapStore = (store: SqliteProjectStore, fault?: string): ProjectStore => ({
  transaction: (work) => {
    if (fault === "afterCommit") {
      const result = store.transaction(work);
      throw new Error("simulated process crash after commit");
    }
    return store.transaction((transaction) => {
      if (!fault) return work(transaction);
      return work(
        new Proxy(transaction, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (property === fault && typeof value === "function") {
              return () => {
                throw new Error(`injected failure at ${String(property)}`);
              };
            }
            return typeof value === "function" ? value.bind(target) : value;
          }
        })
      );
    });
  },
  getProject: () => store.getProject(),
  getChange: (idOrKey) => store.getChange(idOrKey),
  listChanges: () => store.listChanges(),
  listEvents: () => store.listEvents(),
  listOutbox: (status) => store.listOutbox(status),
  claimOutbox: (nowValue, leaseUntil) => store.claimOutbox(nowValue, leaseUntil),
  markOutboxDelivered: (messageId, deliveredAt) => store.markOutboxDelivered(messageId, deliveredAt),
  releaseOutbox: (messageId, availableAt) => store.releaseOutbox(messageId, availableAt),
  close: () => store.close()
});

const initialize = (kernel: CimiLoopKernel, directory: string) => {
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "v1-fault-test" },
      payload: {
        name: "Faults",
        repository_kind: "directory",
        repository_path: directory,
        owner_name: "Owner"
      }
    })
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
  return { projectId: initialized.data.project.id, actorId: initialized.data.actor.id };
};

const createChange = (kernel: CimiLoopKernel, projectId: InternalId, actorId: InternalId, title = "Fault") => {
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      actor_id: actorId,
      project_id: projectId,
      source: { origin: "human_cli" as const, producer: "v1-fault-test" },
      payload: { title }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  return created.data.change;
};

describe("V1 fault injection", () => {
  it("rolls back a failed SQLite command and recovers a committed receipt after crash", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-v1-fault-"));
    temporaryDirectories.push(directory);
    const raw = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(raw);
    const baseline = new CimiLoopKernel({ store: raw, now: () => now });
    const ctx = initialize(baseline, directory);
    const rolled = new CimiLoopKernel({ store: wrapStore(raw, "insertChange"), now: () => now });
    expect(
      rolled.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CreateChange",
        requested_at: now,
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        source: { origin: "human_cli" as const, producer: "v1-fault-test" },
        payload: { title: "Should roll back" }
      })
    ).toMatchObject({ code: "STORE_FAILURE", retryable: true });
    expect(raw.listChanges()).toEqual([]);

    const commandId = createInternalId();
    const crashing = new CimiLoopKernel({ store: wrapStore(raw, "afterCommit"), now: () => now });
    const command = {
      schema_version: SCHEMA_VERSION,
      command_id: commandId,
      correlation_id: createInternalId(),
      command_type: "CreateChange" as const,
      requested_at: now,
      actor_id: ctx.actorId,
      project_id: ctx.projectId,
      source: { origin: "human_cli" as const, producer: "v1-fault-test" },
      payload: { title: "Committed before crash" }
    };
    expect(crashing.execute(command)).toMatchObject({ code: "STORE_FAILURE", retryable: true });
    expect(raw.listChanges()).toHaveLength(1);
    expect(baseline.execute(command)).toMatchObject({ ok: true, command_id: commandId });
    expect(raw.listChanges()).toHaveLength(1);
  });

  it("does not deliver the same outbox message while a lease is held", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-v1-outbox-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = initialize(kernel, directory);
    createChange(kernel, ctx.projectId, ctx.actorId);
    const first = store.claimOutbox(now, "2026-09-20T00:01:00.000Z");
    const second = store.claimOutbox(now, "2026-09-20T00:01:00.000Z");
    expect(first).toBeTruthy();
    expect(second?.id).not.toBe(first?.id);
    if (first) store.releaseOutbox(first.id, now);
    const reclaimed = store.claimOutbox(now, "2026-09-20T00:02:00.000Z");
    expect(reclaimed?.id).toBe(first?.id);
  });

  it("records runtime loss as unknown without creating a retry run", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-v1-runtime-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = initialize(kernel, directory);
    const change = createChange(kernel, ctx.projectId, ctx.actorId);
    const workItem = createPlanningWorkItem({
      id: createInternalId(),
      projectId: ctx.projectId,
      changeId: change.id,
      contractId: createInternalId(),
      contractVersion: 1,
      policySnapshotId: createInternalId(),
      now
    });
    const runId = createInternalId();
    store.transaction((transaction) => {
      transaction.insertWorkItem(workItem);
      transaction.insertAgentRun({
        schema_version: SCHEMA_VERSION,
        id: runId,
        project_id: ctx.projectId,
        change_id: change.id,
        work_item_id: workItem.id,
        status: "running",
        attempt: 1,
        summary: "Runtime is executing.",
        log_reference: "file://logs/run.log",
        log_digest: digest("runtime_log"),
        created_at: now,
        updated_at: now,
        revision: 1
      });
    });
    const current = kernel.getChange(change.id);
    if ("code" in current) throw new Error(current.code);
    success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "FailRun",
        requested_at: now,
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: current.revision,
        target: { object_type: "change", id: change.id, domain_version: 1 },
        source: { origin: "system" as const, producer: "v1-fault-test" },
        payload: {
          run_id: runId,
          summary: "Runtime process disappeared.",
          failure_code: "RUNTIME_PROCESS_LOST"
        }
      })
    );
    const run = store.transaction((transaction) => transaction.getAgentRun(runId));
    expect(run?.status).toBe("unknown");
    expect(
      store.transaction((transaction) => transaction.listAgentRuns(workItem.id))
    ).toHaveLength(1);
    expect(
      store.transaction((transaction) => transaction.listOpenBlockers(change.id).map((item) => item.code))
    ).toContain("RUNTIME_PROCESS_LOST");
  });

  it("blocks redeploy after an unknown external result", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-v1-unknown-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = initialize(kernel, directory);
    const change = createChange(kernel, ctx.projectId, ctx.actorId);
    const environmentId = createInternalId();
    const releaseId = createInternalId();
    const deploymentId = createInternalId();
    const operationId = createInternalId();
    const operationKey = `deploy:${change.id}`;
    store.transaction((transaction) => {
      transaction.insertEnvironment({
        schema_version: SCHEMA_VERSION,
        id: environmentId,
        project_id: ctx.projectId,
        environment_key: `test-${change.id}`,
        kind: "test",
        display_name: "Test",
        owner_actor_id: ctx.actorId,
        adapter_ref: "file://examples/acceptance-target",
        status: "active",
        revision: 1,
        created_at: now,
        updated_at: now
      });
      transaction.insertRelease({
        schema_version: SCHEMA_VERSION,
        id: releaseId,
        project_id: ctx.projectId,
        change_id: change.id,
        kind: "test",
        artifact_id: createInternalId(),
        artifact_digest: digest("artifact"),
        environment_id: environmentId,
        contract_id: createInternalId(),
        contract_version: 1,
        policy_snapshot_id: createInternalId(),
        status: "authorized",
        authorization_digest: digest("authorization"),
        revision: 1,
        created_at: now,
        updated_at: now
      });
      transaction.insertDeployment({
        schema_version: SCHEMA_VERSION,
        id: deploymentId,
        project_id: ctx.projectId,
        change_id: change.id,
        release_id: releaseId,
        environment_id: environmentId,
        artifact_digest: digest("artifact"),
        status: "in_progress",
        revision: 1,
        created_at: now,
        updated_at: now
      });
      transaction.insertExternalOperation({
        schema_version: SCHEMA_VERSION,
        id: operationId,
        project_id: ctx.projectId,
        change_id: change.id,
        operation_key: operationKey,
        operation_kind: "deploy",
        environment_id: environmentId,
        release_id: releaseId,
        deployment_id: deploymentId,
        artifact_digest: digest("artifact"),
        state: "pending",
        log_reference: "file://logs/deploy.log",
        log_digest: digest("deploy_log"),
        summary: "Deploy started.",
        created_at: now,
        updated_at: now,
        revision: 1
      });
    });
    const current = kernel.getChange(change.id);
    if ("code" in current) throw new Error(current.code);
    success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "RecordOperationResult",
        requested_at: now,
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: current.revision,
        target: { object_type: "change", id: change.id, domain_version: 1 },
        source: { origin: "system" as const, producer: "v1-fault-test" },
        payload: {
          operation_id: operationId,
          operation_key: operationKey,
          state: "unknown",
          log_reference: "file://logs/deploy.log",
          log_digest: digest("deploy_log"),
          summary: "Deploy result is unknown."
        }
      })
    );
    const afterUnknown = kernel.getChange(change.id);
    if ("code" in afterUnknown) throw new Error(afterUnknown.code);
    expect(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "QueueDeployment",
        requested_at: now,
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: afterUnknown.revision,
        target: { object_type: "change", id: change.id, domain_version: 1 },
        source: { origin: "human_cli" as const, producer: "v1-fault-test" },
        payload: { release_id: releaseId, environment_id: environmentId }
      })
    ).toMatchObject({ code: "EXTERNAL_OPERATION_UNKNOWN" });
  });

  it("fails export when a referenced object is missing and does not commit a interrupted import", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-v1-objects-"));
    temporaryDirectories.push(directory);
    expect(() =>
      exportProjectBundle({
        projectId: createInternalId(),
        exporterActorId: createInternalId(),
        sourceInstanceId: createInternalId(),
        exportedAt: now,
        manifestId: createInternalId(),
        facts: [],
        events: [],
        outbox: [],
        ownershipState: "active",
        objectsDirectory: directory,
        objectDigests: ["b".repeat(64)]
      })
    ).toThrow(/OBJECT_MISSING|missing object/i);

    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = initialize(kernel, directory);
    const exported = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "ExportProject",
        requested_at: now,
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: store.getProject()?.revision,
        source: { origin: "human_cli" as const, producer: "v1-fault-test" },
        payload: { scope: "project" }
      })
    );
    if (!("export_manifest" in exported.data)) throw new Error("missing export");
    const bundlePath = join(directory, "bundle.json");
    const bytes = JSON.stringify({ manifest: exported.data.export_manifest, facts: exported.data.export_manifest.entries });
    writeFileSync(bundlePath, bytes);
    const interrupted = new CimiLoopKernel({ store: wrapStore(store, "insertImportReport"), now: () => now });
    const project = kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    expect(
      interrupted.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "StageImport",
        requested_at: now,
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: project.revision,
        source: { origin: "human_cli" as const, producer: "v1-fault-test" },
        payload: {
          bundle_reference: `file://${bundlePath.replaceAll("\\", "/")}`,
          bundle_digest: {
            algorithm: "sha256",
            value: createHash("sha256").update(bytes).digest("hex"),
            subject: "import_bundle"
          }
        }
      })
    ).toMatchObject({ code: "STORE_FAILURE" });
    expect(store.getProject()?.id).toBe(ctx.projectId);
    expect(
      interrupted.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CommitImport",
        requested_at: now,
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: project.revision,
        source: { origin: "human_cli" as const, producer: "v1-fault-test" },
        payload: { import_report_id: createInternalId() }
      })
    ).toMatchObject({ code: "IMPORT_REPORT_NOT_FOUND" });
  });
});
