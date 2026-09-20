import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type AgentRunRecord,
  type Artifact,
  type CapabilityBinding,
  type Change,
  type ContextPackManifest,
  type Lease,
  type Project,
  type ProviderDescriptor,
  type ResourceLock,
  type SourceSnapshot,
  type WorkItem
} from "../../protocol/dist/index.js";
import { StoreConflictError } from "../../store/dist/index.js";
import { applyProjectStoreMigrations, getProjectStoreSchemaVersion } from "../src/migrations.js";
import { SqliteProjectStore } from "../src/project-store.js";

const temporaryDirectories: string[] = [];
const now = "2026-09-20T00:00:00.000Z";

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const tempDb = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m2-migration-"));
  temporaryDirectories.push(directory);
  return join(directory, "project.db");
};

const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "a".repeat(64),
  subject
});

const project = (id = createInternalId()): Project => ({
  schema_version: SCHEMA_VERSION,
  id,
  name: "M2 Migration",
  repository_kind: "directory",
  repository_path: "/tmp/m2-migration",
  instance_id: createInternalId(),
  created_at: now,
  revision: 1
});

const change = (projectId: Project["id"], id = createInternalId()): Change => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  display_key: "CHG-0001",
  title: "M2 Upgrade Change",
  lifecycle_state: "Planned",
  operating_status: "Active",
  owner_actor_id: createInternalId(),
  source: { origin: "human_cli", producer: "m2-migration" },
  created_at: now,
  updated_at: now,
  revision: 5
});

const workItem = (projectId: string, changeId: string, status: WorkItem["status"] = "ready"): WorkItem => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  kind: "execution",
  status,
  contract_id: createInternalId(),
  contract_version: 1,
  plan_id: createInternalId(),
  plan_version: 1,
  task_id: createInternalId(),
  policy_snapshot_id: createInternalId(),
  authorized_role_key: "technical_owner",
  permission_scope: ["workspace.write"],
  budget: { max_duration_ms: 600000, max_retries: 1 },
  stop_conditions: ["timeout"],
  authorization_digest: digest("work_item_authorization"),
  created_at: now,
  updated_at: now,
  revision: 1
});

const lease = (projectId: string, workItemId: string, ownerActorId = createInternalId(), status: Lease["status"] = "active"): Lease => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  work_item_id: workItemId,
  owner_actor_id: ownerActorId,
  status,
  acquired_at: now,
  expires_at: "2026-09-20T00:10:00.000Z",
  created_at: now,
  updated_at: now,
  revision: 1
});

const provider = (projectId: string): ProviderDescriptor => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  provider_type: "runtime",
  name: "claude-code",
  implementation_version: "1.0.0",
  capability_ids: ["code.modify"],
  version_digest: digest("provider_claude_code"),
  created_at: now
});

const contextPack = (projectId: string, changeId: string, workItemId: string): ContextPackManifest => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  work_item_id: workItemId,
  contract_id: createInternalId(),
  contract_version: 1,
  plan_id: createInternalId(),
  plan_version: 1,
  task_id: createInternalId(),
  policy_snapshot_id: createInternalId(),
  role_key: "technical_owner",
  assembly_rule_version: 1,
  validity: "valid",
  sources: [
    {
      key: "contract",
      authority: "canonical",
      location_ref: "cimi://contract/current",
      digest: digest("context_source_contract"),
      freshness: "current"
    }
  ],
  digest: digest("context_pack"),
  created_at: now
});

const binding = (projectId: string, workItemId: string, runId: string, runtime: ProviderDescriptor): CapabilityBinding => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  work_item_id: workItemId,
  run_id: runId,
  runtime,
  granted_permissions: ["workspace.write"],
  digest: digest("capability_binding"),
  created_at: now
});

const runRecord = (projectId: string, changeId: string, workItemId: string): AgentRunRecord => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  work_item_id: workItemId,
  status: "running",
  attempt: 1,
  summary: "授权执行中。",
  log_reference: "cimi-object://runs/log",
  log_digest: digest("run_log"),
  started_at: now,
  created_at: now,
  updated_at: now,
  revision: 1
});

const snapshot = (projectId: string, changeId: string, workItemId: string, runId: string): SourceSnapshot => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  work_item_id: workItemId,
  run_id: runId,
  snapshot_kind: "git_commit",
  dirty: false,
  commit_sha: "b".repeat(40),
  tree_sha: "c".repeat(40),
  digest: digest("source_snapshot"),
  content_reference: "git://repo#commit",
  created_at: now
});

const artifact = (
  projectId: string,
  changeId: string,
  workItemId: string,
  runId: string,
  contextPackId: string,
  bindingId: string,
  snapshotId: string
): Artifact => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  work_item_id: workItemId,
  run_id: runId,
  context_pack_id: contextPackId,
  binding_id: bindingId,
  source_snapshot_id: snapshotId,
  contract_id: createInternalId(),
  contract_version: 1,
  plan_id: createInternalId(),
  plan_version: 1,
  status: "candidate",
  summary: "不可变候选制品。",
  digest: digest("artifact"),
  content_reference: "cimi-object://artifacts/candidate",
  created_at: now
});

const lock = (projectId: string, workItemId: string): ResourceLock => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  resource_type: "worktree",
  resource_key: "change/CHG-0001",
  holder_work_item_id: workItemId,
  status: "held",
  acquired_at: now,
  created_at: now,
  updated_at: now,
  revision: 1
});

const seedV1 = (databasePath: string): { projectId: string; changeId: string; eventId: string; receiptId: string } => {
  const database = new DatabaseSync(databasePath);
  applyProjectStoreMigrations(database, 1);
  const seededProject = project();
  const seededChange = change(seededProject.id);
  const eventId = createInternalId();
  const commandId = createInternalId();
  database.exec("BEGIN IMMEDIATE");
  database
    .prepare("INSERT INTO projects(id, revision, payload_json) VALUES (?, ?, ?)")
    .run(seededProject.id, seededProject.revision, JSON.stringify(seededProject));
  database.prepare("INSERT INTO project_counters(project_id, change_number, event_sequence) VALUES (?, 1, 2)").run(seededProject.id);
  database
    .prepare(
      `INSERT INTO changes(id, project_id, display_key, lifecycle_state, operating_status, revision, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      seededChange.id,
      seededChange.project_id,
      seededChange.display_key,
      seededChange.lifecycle_state,
      seededChange.operating_status,
      seededChange.revision,
      JSON.stringify(seededChange)
    );
  database
    .prepare(
      `INSERT INTO event_ledger(
        event_id, project_id, event_sequence, aggregate_type, aggregate_id,
        aggregate_revision, event_type, occurred_at, envelope_json
      ) VALUES (?, ?, 2, 'change', ?, 5, 'ChangeCreated', ?, ?)`
    )
    .run(
      eventId,
      seededProject.id,
      seededChange.id,
      now,
      JSON.stringify({
        schema_version: SCHEMA_VERSION,
        event_id: eventId,
        event_type: "ChangeCreated",
        project_id: seededProject.id,
        aggregate: { object_type: "change", id: seededChange.id, domain_version: 1 },
        aggregate_revision: 5,
        event_sequence: 2,
        occurred_at: now,
        actor_id: seededChange.owner_actor_id,
        command_id: commandId,
        correlation_id: createInternalId(),
        payload: { display_key: seededChange.display_key }
      })
    );
  database
    .prepare(
      `INSERT INTO outbox_messages(
        id, project_id, event_id, status, attempt_count, available_at, created_at
      ) VALUES (?, ?, ?, 'pending', 0, ?, ?)`
    )
    .run(createInternalId(), seededProject.id, eventId, now, now);
  database
    .prepare("INSERT INTO command_receipts(command_id, request_digest, result_json, created_at) VALUES (?, ?, ?, ?)")
    .run(
      commandId,
      "m0-m2-receipt",
      JSON.stringify({
        ok: true,
        command_id: commandId,
        correlation_id: createInternalId(),
        aggregate: { object_type: "change", id: seededChange.id, domain_version: 1 },
        revision: 5,
        events: [],
        data: { change: seededChange }
      }),
      now
    );
  database.exec("COMMIT");
  database.close();
  return { projectId: seededProject.id, changeId: seededChange.id, eventId, receiptId: commandId };
};

describe("M2 store migrations", () => {
  it("upgrades M0 and M1 databases to v3 without changing IDs, revisions, sequences or receipts", () => {
    const databasePath = tempDb();
    const seeded = seedV1(databasePath);
    const before = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(before)).toBe(1);
    before.close();

    const store = new SqliteProjectStore(databasePath);
    expect(store.getProject()).toMatchObject({ id: seeded.projectId, revision: 1 });
    expect(store.getChange(seeded.changeId)).toMatchObject({ id: seeded.changeId, revision: 5 });
    expect(store.listEvents().map((event) => event.event_sequence)).toEqual([2]);
    expect(store.listEvents()[0]?.event_id).toBe(seeded.eventId);
    expect(store.transaction((transaction) => transaction.getCommandReceipt(seeded.receiptId))).toMatchObject({
      command_id: seeded.receiptId,
      request_digest: "m0-m2-receipt"
    });

    const inspect = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(inspect)).toBe(3);
    expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'work_items'").get()).toBeTruthy();
    expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_work_items_ready'").get()).toBeTruthy();
    expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_leases_active_work_item'").get()).toBeTruthy();
    inspect.close();
    store.close();
  });

  it("applies v3 idempotently when the same database is reopened", () => {
    const databasePath = tempDb();
    const first = new SqliteProjectStore(databasePath);
    first.close();
    const second = new SqliteProjectStore(databasePath);
    const inspect = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(inspect)).toBe(3);
    expect(inspect.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({ count: 3 });
    inspect.close();
    second.close();
  });

  it("writes work items, runs, context, bindings, snapshots, artifacts, leases and locks atomically", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const item = workItem(seededProject.id, seededChange.id);
    const runtime = provider(seededProject.id);
    const run = runRecord(seededProject.id, seededChange.id, item.id);
    const pack = contextPack(seededProject.id, seededChange.id, item.id);
    const bind = binding(seededProject.id, item.id, run.id, runtime);
    const snap = snapshot(seededProject.id, seededChange.id, item.id, run.id);
    const art = artifact(seededProject.id, seededChange.id, item.id, run.id, pack.id, bind.id, snap.id);
    const activeLease = lease(seededProject.id, item.id);
    const heldLock = lock(seededProject.id, item.id);

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
      transaction.insertWorkItem(item);
      transaction.insertProviderDescriptor(runtime);
      transaction.insertContextPackManifest(pack);
      transaction.insertAgentRun(run);
      transaction.insertCapabilityBinding(bind);
      transaction.insertSourceSnapshot(snap);
      transaction.insertArtifact(art);
      transaction.insertLease(activeLease);
      transaction.insertResourceLock(heldLock);
    });

    expect(store.transaction((transaction) => transaction.getWorkItem(item.id))).toMatchObject({ id: item.id, status: "ready" });
    expect(store.transaction((transaction) => transaction.listReadyWorkItems(seededChange.id).map((entry) => entry.id))).toEqual([
      item.id
    ]);
    expect(store.transaction((transaction) => transaction.getAgentRun(run.id))).toMatchObject({ id: run.id, attempt: 1 });
    expect(store.transaction((transaction) => transaction.getContextPackManifest(pack.id))).toMatchObject({ id: pack.id });
    expect(store.transaction((transaction) => transaction.getCapabilityBinding(bind.id))).toMatchObject({ id: bind.id });
    expect(store.transaction((transaction) => transaction.getSourceSnapshot(snap.id))).toMatchObject({ id: snap.id });
    expect(store.transaction((transaction) => transaction.getArtifact(art.id))).toMatchObject({
      id: art.id,
      digest: art.digest
    });
    expect(store.transaction((transaction) => transaction.getActiveLeaseByWorkItem(item.id))).toMatchObject({
      id: activeLease.id,
      owner_actor_id: activeLease.owner_actor_id
    });
    expect(store.transaction((transaction) => transaction.getHeldResourceLock("worktree", "change/CHG-0001"))).toMatchObject({
      id: heldLock.id
    });
    store.close();
  });

  it("rolls back execution facts, events, outbox and receipts together", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const item = workItem(seededProject.id, seededChange.id);
    const commandId = createInternalId();

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
    });

    expect(() =>
      store.transaction((transaction) => {
        transaction.insertWorkItem(item);
        transaction.insertLease(lease(seededProject.id, item.id));
        const event = transaction.appendEvent({
          event_id: createInternalId(),
          event_type: "WorkItemCreated",
          project_id: seededProject.id,
          aggregate: { object_type: "work_item", id: item.id, domain_version: 1 },
          aggregate_revision: 1,
          occurred_at: now,
          actor_id: seededChange.owner_actor_id,
          command_id: commandId,
          correlation_id: createInternalId(),
          payload: { work_item_id: item.id }
        });
        transaction.enqueueOutbox({
          id: createInternalId(),
          project_id: seededProject.id,
          event_id: event.event_id,
          status: "pending",
          attempt_count: 0,
          available_at: now,
          created_at: now
        });
        transaction.saveCommandReceipt({
          command_id: commandId,
          request_digest: "m2-rollback",
          result: {
            ok: true,
            command_id: commandId,
            correlation_id: event.correlation_id,
            aggregate: event.aggregate,
            revision: 1,
            events: [event],
            data: { work_item: item }
          },
          created_at: now
        });
        throw new Error("m2 rollback");
      })
    ).toThrow("m2 rollback");

    expect(store.transaction((transaction) => transaction.getWorkItem(item.id))).toBeUndefined();
    expect(store.transaction((transaction) => transaction.getActiveLeaseByWorkItem(item.id))).toBeUndefined();
    expect(store.listEvents()).toEqual([]);
    expect(store.listOutbox()).toEqual([]);
    expect(store.transaction((transaction) => transaction.getCommandReceipt(commandId))).toBeUndefined();
    store.close();
  });

  it("lets only one of two connections own an active lease and allows reclaim after expiry", () => {
    const databasePath = tempDb();
    const first = new SqliteProjectStore(databasePath);
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const item = workItem(seededProject.id, seededChange.id);
    first.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
      transaction.insertWorkItem(item);
    });

    const ownerA = createInternalId();
    const ownerB = createInternalId();
    const leaseA = lease(seededProject.id, item.id, ownerA);
    first.transaction((transaction) => {
      transaction.insertLease(leaseA);
    });

    const second = new SqliteProjectStore(databasePath);
    expect(() =>
      second.transaction((transaction) => {
        transaction.insertLease(lease(seededProject.id, item.id, ownerB));
      })
    ).toThrow(StoreConflictError);
    expect(first.transaction((transaction) => transaction.getActiveLeaseByWorkItem(item.id))).toMatchObject({
      owner_actor_id: ownerA
    });

    first.transaction((transaction) => {
      transaction.updateLease({ ...leaseA, status: "expired", revision: 2, updated_at: now }, 1);
    });
    const leaseB = lease(seededProject.id, item.id, ownerB);
    second.transaction((transaction) => {
      transaction.insertLease(leaseB);
    });
    expect(second.transaction((transaction) => transaction.getActiveLeaseByWorkItem(item.id))).toMatchObject({
      owner_actor_id: ownerB,
      id: leaseB.id
    });
    first.close();
    second.close();
  });
});
