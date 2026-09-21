import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type ArchiveRecord,
  type AttentionItem,
  type CancellationRecord,
  type Change,
  type ClosureEvaluation,
  type ImportReport,
  type KnowledgeUpdateEvidence,
  type LearningCandidate,
  type Project,
  type SupersessionRecord
} from "../../protocol/src/index.js";
import { applyProjectStoreMigrations, getProjectStoreSchemaVersion } from "../src/migrations.js";
import { assertManagedObjectsExist, createProjectStoreSnapshot } from "../src/snapshot.js";
import { SqliteProjectStore } from "../src/project-store.js";

const temporaryDirectories: string[] = [];
const now = "2026-09-20T18:00:00.000Z";

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const tempDb = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m5-migration-"));
  temporaryDirectories.push(directory);
  return join(directory, "project.db");
};

const digest = (subject: string, value = "d".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

const project = (id = createInternalId()): Project => ({
  schema_version: SCHEMA_VERSION,
  id,
  name: "M5 Migration",
  repository_kind: "directory",
  repository_path: "/tmp/m5-migration",
  instance_id: createInternalId(),
  created_at: now,
  revision: 1
});

const change = (projectId: Project["id"], id = createInternalId()): Change => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  display_key: "CHG-0001",
  title: "M5 Upgrade Change",
  lifecycle_state: "Executing",
  operating_status: "Active",
  owner_actor_id: createInternalId(),
  source: { origin: "human_cli", producer: "m5-migration" },
  created_at: now,
  updated_at: now,
  revision: 9
});

const learning = (projectId: string, changeId: string): LearningCandidate => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  source_kind: "failure",
  source_id: createInternalId(),
  summary: "Duplicate deploy was attempted after timeout.",
  status: "proposed",
  promoted: false,
  digest: digest("learning_candidate"),
  created_at: now
});

const knowledge = (projectId: string, changeId: string): KnowledgeUpdateEvidence => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  task_id: createInternalId(),
  knowledge_source: "technical",
  conclusion: "Update",
  external_reference_id: createInternalId(),
  evidence_id: createInternalId(),
  digest: digest("knowledge_update"),
  created_at: now
});

const closure = (projectId: string, changeId: string): ClosureEvaluation => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  disposition: "closed",
  result: "ALLOW",
  knowledge_complete: true,
  residual_risk: "none",
  known_issues: [],
  gaps: [],
  digest: digest("closure_evaluation"),
  created_at: now
});

const archive = (projectId: string, changeId: string): ArchiveRecord => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  disposition: "archived",
  reason: "Hide completed change from default views.",
  created_at: now
});

const cancellation = (projectId: string, changeId: string): CancellationRecord => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  disposition: "cancelled",
  reason: "Withdrawn before delivery.",
  cleanup_summary: "No external operation was queued.",
  residual_responsibility: "Owner notifies stakeholders.",
  created_at: now
});

const supersession = (projectId: string, changeId: string): SupersessionRecord => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  successor_change_id: createInternalId(),
  disposition: "superseded",
  reason: "Replaced by a narrower change.",
  created_at: now
});

const attention = (projectId: string, changeId: string): AttentionItem => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  kind: "knowledge_gap",
  subject_id: createInternalId(),
  summary: "Technical knowledge task is still open.",
  status: "open",
  created_at: now,
  updated_at: now,
  revision: 1
});

const report = (projectId: string): ImportReport => ({
  portable_schema_version: "portable-1.0.0",
  id: createInternalId(),
  project_id: projectId,
  staged_at: now,
  status: "staged",
  runtime_ownership: "dormant",
  conflicts: [],
  duplicate_ids: [],
  digest_mismatches: [],
  summary: "Staged without activating runtime ownership."
});

const seedV1 = (databasePath: string) => {
  const database = new DatabaseSync(databasePath);
  applyProjectStoreMigrations(database, 1);
  const seededProject = project();
  const seededChange = change(seededProject.id);
  const commandId = createInternalId();
  const eventId = createInternalId();
  database.exec("BEGIN IMMEDIATE");
  database.prepare("INSERT INTO projects(id, revision, payload_json) VALUES (?, ?, ?)").run(
    seededProject.id,
    seededProject.revision,
    JSON.stringify(seededProject)
  );
  database
    .prepare(
      "INSERT INTO changes(id, project_id, display_key, lifecycle_state, operating_status, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
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
  database.prepare("INSERT INTO project_counters(project_id, change_number, event_sequence) VALUES (?, ?, ?)").run(
    seededProject.id,
    1,
    2
  );
  database
    .prepare(
      `INSERT INTO event_ledger(
        event_id, project_id, event_sequence, aggregate_type, aggregate_id,
        aggregate_revision, event_type, occurred_at, envelope_json
      ) VALUES (?, ?, 2, 'change', ?, 9, 'ChangeCreated', ?, ?)`
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
        aggregate_revision: 9,
        event_sequence: 2,
        occurred_at: now,
        actor_id: seededChange.owner_actor_id,
        command_id: commandId,
        correlation_id: createInternalId(),
        payload: { display_key: seededChange.display_key }
      })
    );
  database
    .prepare("INSERT INTO command_receipts(command_id, request_digest, result_json, created_at) VALUES (?, ?, ?, ?)")
    .run(
      commandId,
      "m0-m5-receipt",
      JSON.stringify({
        ok: true,
        command_id: commandId,
        correlation_id: createInternalId(),
        aggregate: { object_type: "change", id: seededChange.id, domain_version: 1 },
        revision: 9,
        events: [],
        data: { change: seededChange }
      }),
      now
    );
  database.exec("COMMIT");
  database.close();
  return { projectId: seededProject.id, changeId: seededChange.id, eventId, receiptId: commandId };
};

describe("M5 store migrations", () => {
  it("upgrades every published version to v6 without rewriting history", () => {
    for (const published of [1, 2, 3, 4, 5]) {
      const databasePath = tempDb();
      const seeded = seedV1(databasePath);
      if (published > 1) {
        const database = new DatabaseSync(databasePath);
        applyProjectStoreMigrations(database, published);
        expect(getProjectStoreSchemaVersion(database)).toBe(published);
        database.close();
      }
      const store = new SqliteProjectStore(databasePath);
      expect(store.getProject()).toMatchObject({ id: seeded.projectId, revision: 1 });
      expect(store.getChange(seeded.changeId)).toMatchObject({ id: seeded.changeId, revision: 9 });
      expect(store.listEvents()[0]?.event_id).toBe(seeded.eventId);
      expect(store.transaction((transaction) => transaction.getCommandReceipt(seeded.receiptId))).toMatchObject({
        command_id: seeded.receiptId,
        request_digest: "m0-m5-receipt"
      });
      const inspect = new DatabaseSync(databasePath, { readOnly: true });
      expect(getProjectStoreSchemaVersion(inspect)).toBe(8);
      expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'learning_candidates'").get()).toBeTruthy();
      expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'import_reports'").get()).toBeTruthy();
      expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'read_model_checkpoints'").get()).toBeTruthy();
      expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_runtime_ownership'").get()).toBeTruthy();
      expect(
        (inspect.prepare("PRAGMA table_info(artifact_lineage)").all() as Array<{ name: string }>).some((column) => column.name === "id")
      ).toBe(true);
      inspect.close();
      store.close();
    }
  });

  it("applies v6 idempotently when the same database is reopened", () => {
    const databasePath = tempDb();
    const first = new SqliteProjectStore(databasePath);
    first.close();
    const second = new SqliteProjectStore(databasePath);
    const inspect = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(inspect)).toBe(8);
    expect(inspect.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({ count: 8 });
    inspect.close();
    second.close();
  });

  it("persists closure facts append-only and keeps import ownership dormant", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const candidate = learning(seededProject.id, seededChange.id);
    const update = knowledge(seededProject.id, seededChange.id);
    const evaluation = closure(seededProject.id, seededChange.id);
    const archived = archive(seededProject.id, seededChange.id);
    const cancelled = cancellation(seededProject.id, seededChange.id);
    const replaced = supersession(seededProject.id, seededChange.id);
    const item = attention(seededProject.id, seededChange.id);
    const staged = report(seededProject.id);

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
      transaction.insertLearningCandidate(candidate);
      transaction.insertKnowledgeUpdateEvidence(update);
      transaction.insertClosureEvaluation(evaluation);
      transaction.insertArchiveRecord(archived);
      transaction.insertCancellationRecord(cancelled);
      transaction.insertSupersessionRecord(replaced);
      transaction.insertAttentionItem(item);
      transaction.insertImportReport(staged);
      transaction.upsertReadModelCheckpoint("attention", 2, { rebuilt: true });
    });

    expect(store.transaction((transaction) => transaction.listLearningCandidatesByChange(seededChange.id))).toEqual([candidate]);
    expect(store.transaction((transaction) => transaction.getClosureEvaluation(evaluation.id))).toMatchObject({
      disposition: "closed"
    });
    expect(store.transaction((transaction) => transaction.getImportReport(staged.id))).toMatchObject({
      runtime_ownership: "dormant"
    });
    expect(store.transaction((transaction) => transaction.getReadModelCheckpoint("attention"))).toMatchObject({
      event_sequence: 2
    });
    expect("updateLearningCandidate" in store.transaction((transaction) => transaction)).toBe(false);
    expect("updateClosureEvaluation" in store.transaction((transaction) => transaction)).toBe(false);
    store.close();
  });

  it("creates a consistent sqlite snapshot and fails export when a digest is missing", () => {
    const databasePath = tempDb();
    const store = new SqliteProjectStore(databasePath);
    const seededProject = project();
    store.transaction((transaction) => transaction.insertProject(seededProject));
    const snapshotPath = join(databasePath, "..", "snapshot.db");
    createProjectStoreSnapshot(databasePath, snapshotPath);
    const snapshot = new SqliteProjectStore(snapshotPath);
    expect(snapshot.getProject()).toMatchObject({ id: seededProject.id, revision: 1 });
    snapshot.close();
    store.close();

    const objects = join(databasePath, "..", "objects");
    mkdirSync(objects, { recursive: true });
    const present = "c".repeat(64);
    writeFileSync(join(objects, present), "portable-object");
    expect(() => assertManagedObjectsExist(objects, [present])).not.toThrow();
    expect(() => assertManagedObjectsExist(objects, [present, "e".repeat(64)])).toThrow(/OBJECT_MISSING|missing object/i);
  });
});
