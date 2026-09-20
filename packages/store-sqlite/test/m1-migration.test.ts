import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Change,
  type ContractCandidate,
  type Decision,
  type GateEvaluation,
  type Project
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
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m1-migration-"));
  temporaryDirectories.push(directory);
  return join(directory, "project.db");
};

const project = (id = createInternalId()): Project => ({
  schema_version: SCHEMA_VERSION,
  id,
  name: "M1 Migration",
  repository_kind: "directory",
  repository_path: "/tmp/m1-migration",
  instance_id: createInternalId(),
  created_at: now,
  revision: 1
});

const change = (projectId: Project["id"], id = createInternalId()): Change => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  display_key: "CHG-0001",
  title: "Upgrade Change",
  lifecycle_state: "Draft",
  operating_status: "Active",
  owner_actor_id: createInternalId(),
  source: { origin: "human_cli", producer: "m1-migration" },
  created_at: now,
  updated_at: now,
  revision: 3
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
  database
    .prepare("INSERT INTO project_counters(project_id, change_number, event_sequence) VALUES (?, 1, 2)")
    .run(seededProject.id);
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
      ) VALUES (?, ?, 2, 'change', ?, 3, 'ChangeCreated', ?, ?)`
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
        aggregate_revision: 3,
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
      "m0-receipt",
      JSON.stringify({
        ok: true,
        command_id: commandId,
        correlation_id: createInternalId(),
        aggregate: { object_type: "change", id: seededChange.id, domain_version: 1 },
        revision: 3,
        events: [],
        data: { change: seededChange }
      }),
      now
    );
  database.exec("COMMIT");
  database.close();
  return {
    projectId: seededProject.id,
    changeId: seededChange.id,
    eventId,
    receiptId: commandId
  };
};

const candidate = (projectId: string, changeId: string, revision = 1): ContractCandidate => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  revision,
  created_at: now,
  updated_at: now,
  profile_key: "feature",
  intent: "升级后仍可保存候选。",
  outcomes: ["保留 M0 事实"],
  scope: { in: ["Store"], out: ["Runtime"] },
  non_goals: ["不改历史"],
  acceptance: [{ key: "AC-1", statement: "ID 与 sequence 不变。" }],
  constraints: ["不可变历史不得覆盖"]
});

describe("M1 store migrations", () => {
  it("upgrades an M0 database to v2 without changing IDs, revisions, sequences or receipts", () => {
    const databasePath = tempDb();
    const seeded = seedV1(databasePath);

    const before = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(before)).toBe(1);
    before.close();

    const store = new SqliteProjectStore(databasePath);
    expect(store.getProject()).toMatchObject({ id: seeded.projectId, revision: 1 });
    expect(store.getChange(seeded.changeId)).toMatchObject({ id: seeded.changeId, revision: 3 });
    expect(store.listEvents().map((event) => event.event_sequence)).toEqual([2]);
    expect(store.listEvents()[0]?.event_id).toBe(seeded.eventId);
    expect(store.listOutbox()).toHaveLength(1);
    expect(store.transaction((transaction) => transaction.getCommandReceipt(seeded.receiptId))).toMatchObject({
      command_id: seeded.receiptId,
      request_digest: "m0-receipt"
    });

    const inspect = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(inspect)).toBe(4);
    expect(
      inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'decision_requests'").get()
    ).toBeTruthy();
    inspect.close();
    store.close();
  });

  it("applies migrations idempotently when the same database is reopened", () => {
    const databasePath = tempDb();
    const first = new SqliteProjectStore(databasePath);
    first.close();
    const second = new SqliteProjectStore(databasePath);
    const inspect = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(inspect)).toBe(4);
    expect(inspect.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({ count: 4 });
    inspect.close();
    second.close();
  });

  it("updates contract candidates with expected revision and refuses stale writes", () => {
    const store = new SqliteProjectStore(tempDb());
    try {
      const seededProject = project();
      const seededChange = change(seededProject.id);
      const first = candidate(seededProject.id, seededChange.id, 1);
      store.transaction((transaction) => {
        transaction.insertProject(seededProject);
        transaction.insertChange(seededChange);
        transaction.insertContractCandidate(first);
      });

      const updated = { ...first, intent: "修订后的意图", revision: 2, updated_at: now };
      store.transaction((transaction) => {
        transaction.updateContractCandidate(updated, 1);
      });
      expect(store.transaction((transaction) => transaction.getContractCandidate(first.id))).toMatchObject({
        intent: "修订后的意图",
        revision: 2
      });

      expect(() =>
        store.transaction((transaction) => {
          transaction.updateContractCandidate({ ...updated, intent: "stale", revision: 3 }, 1);
        })
      ).toThrow(StoreConflictError);
    } finally {
      store.close();
    }
  });

  it("rolls back change, decision, gate, event, outbox and receipt together", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const decision: Decision = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: seededProject.id,
      change_id: seededChange.id,
      request_id: createInternalId(),
      actor_id: seededChange.owner_actor_id,
      acting_role_id: createInternalId(),
      outcome: "approve",
      reason: "测试回滚",
      created_at: now
    };
    const gate: GateEvaluation = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: seededProject.id,
      change_id: seededChange.id,
      gate_type: "intent",
      result: "ALLOW",
      policy_snapshot_id: createInternalId(),
      digest: { algorithm: "sha256", value: "b".repeat(64), subject: "intent_gate" },
      created_at: now
    };
    const commandId = createInternalId();

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
    });

    expect(() =>
      store.transaction((transaction) => {
        transaction.insertChange(seededChange);
        transaction.insertDecision(decision);
        transaction.insertGateEvaluation(gate);
        const event = transaction.appendEvent({
          event_id: createInternalId(),
          event_type: "IntentDecisionRecorded",
          project_id: seededProject.id,
          aggregate: { object_type: "change", id: seededChange.id, domain_version: 1 },
          aggregate_revision: 1,
          occurred_at: now,
          actor_id: seededChange.owner_actor_id,
          command_id: commandId,
          correlation_id: createInternalId(),
          payload: { decision_id: decision.id }
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
          request_digest: "m1-rollback",
          result: {
            ok: true,
            command_id: commandId,
            correlation_id: event.correlation_id,
            aggregate: event.aggregate,
            revision: 1,
            events: [event],
            data: { change: seededChange }
          },
          created_at: now
        });
        throw new Error("m1 rollback");
      })
    ).toThrow("m1 rollback");

    expect(store.getChange(seededChange.id)).toBeUndefined();
    expect(store.listEvents()).toEqual([]);
    expect(store.listOutbox()).toEqual([]);
    expect(store.transaction((transaction) => transaction.getCommandReceipt(commandId))).toBeUndefined();
    expect(store.transaction((transaction) => transaction.getDecision(decision.id))).toBeUndefined();
    expect(store.transaction((transaction) => transaction.getGateEvaluation(gate.id))).toBeUndefined();
    store.close();
  });
});

