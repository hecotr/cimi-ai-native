import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Change,
  type Deployment,
  type DeploymentAttempt,
  type Environment,
  type ExternalOperation,
  type Project,
  type Reconciliation,
  type RecoveryStrategy,
  type Release,
  type ReleasePackage
} from "../../protocol/dist/index.js";
import { StoreConflictError } from "../../store/dist/index.js";
import { applyProjectStoreMigrations, getProjectStoreSchemaVersion } from "../src/migrations.js";
import { SqliteProjectStore } from "../src/project-store.js";

const temporaryDirectories: string[] = [];
const now = "2026-09-20T12:00:00.000Z";

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const tempDb = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-migration-"));
  temporaryDirectories.push(directory);
  return join(directory, "project.db");
};

const digest = (subject: string, value = "b".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

const project = (id = createInternalId()): Project => ({
  schema_version: SCHEMA_VERSION,
  id,
  name: "M4 Migration",
  repository_kind: "directory",
  repository_path: "/tmp/m4-migration",
  instance_id: createInternalId(),
  created_at: now,
  revision: 1
});

const change = (projectId: Project["id"], id = createInternalId()): Change => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  display_key: "CHG-0001",
  title: "M4 Upgrade Change",
  lifecycle_state: "Executing",
  operating_status: "Active",
  owner_actor_id: createInternalId(),
  source: { origin: "human_cli", producer: "m4-migration" },
  created_at: now,
  updated_at: now,
  revision: 8
});

const environment = (projectId: string): Environment => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  environment_key: "acceptance-test",
  kind: "test",
  display_name: "Acceptance Test",
  owner_actor_id: createInternalId(),
  adapter_ref: "file://examples/acceptance-target",
  status: "active",
  created_at: now,
  updated_at: now,
  revision: 1
});

const release = (projectId: string, changeId: string, environmentId: string): Release => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  kind: "test",
  artifact_id: createInternalId(),
  artifact_digest: digest("artifact"),
  environment_id: environmentId,
  contract_id: createInternalId(),
  contract_version: 1,
  policy_snapshot_id: createInternalId(),
  status: "authorized",
  authorization_digest: digest("release_authorization"),
  created_at: now,
  updated_at: now,
  revision: 1
});

const releasePackage = (projectId: string, changeId: string, releaseId: string, environmentId: string, strategyId: string): ReleasePackage => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  release_id: releaseId,
  artifact_id: createInternalId(),
  artifact_digest: digest("artifact"),
  environment_id: environmentId,
  evidence_package_id: createInternalId(),
  scope: { in: ["acceptance.health"], out: [] },
  window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
  recovery_strategy_id: strategyId,
  digest: digest("release_package"),
  created_at: now
});

const recoveryStrategy = (projectId: string, changeId: string, releaseId: string): RecoveryStrategy => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  release_id: releaseId,
  trigger: "verify_fail",
  kind: "rollback",
  target_digest: digest("known_good_artifact"),
  scope: { in: ["acceptance.service"], out: [] },
  steps: ["restore prior digest"],
  verify_checks: ["digest", "health"],
  authorization: "preauthorized",
  digest: digest("recovery_strategy"),
  created_at: now
});

const deployment = (projectId: string, changeId: string, releaseId: string, environmentId: string): Deployment => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  release_id: releaseId,
  environment_id: environmentId,
  artifact_digest: digest("artifact"),
  status: "queued",
  created_at: now,
  updated_at: now,
  revision: 1
});

const attempt = (projectId: string, changeId: string, deploymentId: string, operationKey: string): DeploymentAttempt => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  deployment_id: deploymentId,
  attempt_kind: "deploy",
  operation_key: operationKey,
  artifact_digest: digest("artifact"),
  requested_at: now,
  created_at: now
});

const operation = (
  projectId: string,
  changeId: string,
  releaseId: string,
  environmentId: string,
  deploymentId: string,
  operationKey: string
): ExternalOperation => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  operation_key: operationKey,
  operation_kind: "deploy",
  environment_id: environmentId,
  release_id: releaseId,
  deployment_id: deploymentId,
  artifact_digest: digest("artifact"),
  state: "unknown",
  log_reference: "file://logs/deploy-1.log",
  log_digest: digest("deploy_log"),
  summary: "timeout before status",
  created_at: now,
  updated_at: now,
  revision: 1
});

const reconciliation = (projectId: string, changeId: string, operationId: string): Reconciliation => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  operation_id: operationId,
  conclusion: "confirmed_success",
  observed_digest: digest("artifact"),
  observed_state: "succeeded",
  summary: "external digest matches release",
  created_at: now
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
      ) VALUES (?, ?, 2, 'change', ?, 8, 'ChangeCreated', ?, ?)`
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
        aggregate_revision: 8,
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
      "m0-m4-receipt",
      JSON.stringify({
        ok: true,
        command_id: commandId,
        correlation_id: createInternalId(),
        aggregate: { object_type: "change", id: seededChange.id, domain_version: 1 },
        revision: 8,
        events: [],
        data: { change: seededChange }
      }),
      now
    );
  database.exec("COMMIT");
  database.close();
  return { projectId: seededProject.id, changeId: seededChange.id, eventId, receiptId: commandId };
};

describe("M4 store migrations", () => {
  it("upgrades M0–M3 databases to v5 without changing IDs, revisions, sequences or receipts", () => {
    const databasePath = tempDb();
    const seeded = seedV1(databasePath);
    const store = new SqliteProjectStore(databasePath);
    expect(store.getProject()).toMatchObject({ id: seeded.projectId, revision: 1 });
    expect(store.getChange(seeded.changeId)).toMatchObject({ id: seeded.changeId, revision: 8 });
    expect(store.listEvents()[0]?.event_id).toBe(seeded.eventId);
    expect(store.transaction((transaction) => transaction.getCommandReceipt(seeded.receiptId))).toMatchObject({
      command_id: seeded.receiptId,
      request_digest: "m0-m4-receipt"
    });
    const inspect = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(inspect)).toBe(5);
    expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'environments'").get()).toBeTruthy();
    expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'external_operations'").get()).toBeTruthy();
    expect(
      inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_external_operations_key'").get()
    ).toBeTruthy();
    inspect.close();
    store.close();
  });

  it("applies v5 idempotently when the same database is reopened", () => {
    const databasePath = tempDb();
    const first = new SqliteProjectStore(databasePath);
    first.close();
    const second = new SqliteProjectStore(databasePath);
    const inspect = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(inspect)).toBe(5);
    expect(inspect.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({ count: 5 });
    inspect.close();
    second.close();
  });

  it("writes delivery facts atomically and keeps attempts append-only", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const target = environment(seededProject.id);
    const published = release(seededProject.id, seededChange.id, target.id);
    const strategy = recoveryStrategy(seededProject.id, seededChange.id, published.id);
    const packaged = releasePackage(seededProject.id, seededChange.id, published.id, target.id, strategy.id);
    const queued = deployment(seededProject.id, seededChange.id, published.id, target.id);
    const firstAttempt = attempt(seededProject.id, seededChange.id, queued.id, "op:deploy:chg:rel:1");
    const recorded = operation(seededProject.id, seededChange.id, published.id, target.id, queued.id, firstAttempt.operation_key);
    const checked = reconciliation(seededProject.id, seededChange.id, recorded.id);

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
      transaction.insertEnvironment(target);
      transaction.insertRelease(published);
      transaction.insertRecoveryStrategy(strategy);
      transaction.insertReleasePackage(packaged);
      transaction.insertDeployment(queued);
      transaction.insertDeploymentAttempt(firstAttempt);
      transaction.insertExternalOperation(recorded);
      transaction.insertReconciliation(checked);
    });

    expect(store.transaction((transaction) => transaction.getEnvironment(target.id))).toMatchObject({
      kind: "test",
      environment_key: "acceptance-test"
    });
    expect(store.transaction((transaction) => transaction.getRelease(published.id))).toMatchObject({
      artifact_digest: published.artifact_digest
    });
    expect(store.transaction((transaction) => transaction.listDeploymentAttempts(queued.id))).toEqual([firstAttempt]);
    expect(store.transaction((transaction) => transaction.getExternalOperationByKey(firstAttempt.operation_key))).toMatchObject({
      state: "unknown"
    });
    expect(store.transaction((transaction) => transaction.listReconciliationsByOperation(recorded.id))).toEqual([checked]);
    expect("updateDeploymentAttempt" in store.transaction((transaction) => transaction)).toBe(false);
    store.close();
  });

  it("rejects duplicate operation keys and projects current state from later updates", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const target = environment(seededProject.id);
    const published = release(seededProject.id, seededChange.id, target.id);
    const queued = deployment(seededProject.id, seededChange.id, published.id, target.id);
    const first = operation(seededProject.id, seededChange.id, published.id, target.id, queued.id, "op:deploy:unique");
    const duplicate = operation(seededProject.id, seededChange.id, published.id, target.id, queued.id, first.operation_key);

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
      transaction.insertEnvironment(target);
      transaction.insertRelease(published);
      transaction.insertDeployment(queued);
      transaction.insertExternalOperation(first);
    });

    expect(() => store.transaction((transaction) => transaction.insertExternalOperation(duplicate))).toThrow(StoreConflictError);

    const confirmed = { ...first, state: "succeeded" as const, summary: "reconciled", revision: 2, updated_at: now };
    store.transaction((transaction) => transaction.updateExternalOperation(confirmed, 1));
    expect(store.transaction((transaction) => transaction.getExternalOperation(first.id))).toMatchObject({
      state: "succeeded",
      revision: 2
    });
    store.close();
  });

  it("enqueues outbox with release creation and rolls both back together", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const target = environment(seededProject.id);
    const published = release(seededProject.id, seededChange.id, target.id);
    const commandId = createInternalId();

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
      transaction.insertEnvironment(target);
    });

    expect(() =>
      store.transaction((transaction) => {
        transaction.insertRelease(published);
        const event = transaction.appendEvent({
          event_id: createInternalId(),
          event_type: "ReleaseCreated",
          project_id: seededProject.id,
          aggregate: { object_type: "release", id: published.id, domain_version: 1 },
          aggregate_revision: 1,
          occurred_at: now,
          actor_id: seededChange.owner_actor_id,
          command_id: commandId,
          correlation_id: createInternalId(),
          payload: { release_id: published.id }
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
        throw new Error("m4 rollback");
      })
    ).toThrow("m4 rollback");

    expect(store.transaction((transaction) => transaction.getRelease(published.id))).toBeUndefined();
    expect(store.listEvents()).toEqual([]);
    expect(store.listOutbox()).toEqual([]);
    store.close();
  });
});
