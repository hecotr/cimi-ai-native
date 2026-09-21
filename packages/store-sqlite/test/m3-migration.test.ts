import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Change,
  type Claim,
  type ClaimAssessment,
  type Evidence,
  type EvidencePackageManifest,
  type ExternalReference,
  type GateRequirementSet,
  type ImpactAssessment,
  type IndependentEvaluation,
  type Project,
  type RepairWorkItemLink
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
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m3-migration-"));
  temporaryDirectories.push(directory);
  return join(directory, "project.db");
};

const digest = (subject: string, value = "a".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

const project = (id = createInternalId()): Project => ({
  schema_version: SCHEMA_VERSION,
  id,
  name: "M3 Migration",
  repository_kind: "directory",
  repository_path: "/tmp/m3-migration",
  instance_id: createInternalId(),
  created_at: now,
  revision: 1
});

const change = (projectId: Project["id"], id = createInternalId()): Change => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  display_key: "CHG-0001",
  title: "M3 Upgrade Change",
  lifecycle_state: "Executing",
  operating_status: "Active",
  owner_actor_id: createInternalId(),
  source: { origin: "human_cli", producer: "m3-migration" },
  created_at: now,
  updated_at: now,
  revision: 8
});

const claim = (projectId: string, changeId: string, requirementSetId: string): Claim => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  claim_key: "AC-1",
  statement: "验收通过。",
  category: "intent",
  obligation: "required",
  source: "acceptance",
  contract_id: createInternalId(),
  contract_version: 1,
  requirement_set_id: requirementSetId,
  created_at: now
});

const requirementSet = (projectId: string, changeId: string): GateRequirementSet => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  version: 1,
  profile_key: "feature",
  policy_snapshot_id: createInternalId(),
  contract_id: createInternalId(),
  contract_version: 1,
  items: [{ claim_key: "AC-1", obligation: "required", source: "acceptance", accepted_evidence_kinds: ["deterministic_test"] }],
  digest: digest("gate_requirement_set"),
  created_at: now
});

const evidence = (
  projectId: string,
  changeId: string,
  claimId: string,
  subjectId: string,
  subjectDigest = digest("artifact")
): Evidence => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  claim_id: claimId,
  stance: "Supports",
  subject_type: "artifact",
  subject_id: subjectId,
  subject_digest: subjectDigest,
  content_reference: "cimi-object://evidence/1",
  digest: digest("evidence"),
  producer_role: "deterministic_test",
  created_at: now
});

const reference = (projectId: string): ExternalReference => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  reference: "file://reports/junit.xml",
  digest: digest("external_reference"),
  media_type: "application/xml",
  summary: "JUnit",
  created_at: now
});

const evaluation = (projectId: string, changeId: string, requirementSetId: string): IndependentEvaluation => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  artifact_id: createInternalId(),
  artifact_digest: digest("artifact"),
  requirement_set_id: requirementSetId,
  input_digest: digest("evaluation_input"),
  result: "ALLOW",
  reason: "required claims satisfied",
  created_at: now
});

const assessment = (
  projectId: string,
  changeId: string,
  claimId: string,
  evaluationId: string,
  evidenceId: string
): ClaimAssessment => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  claim_id: claimId,
  evaluation_id: evaluationId,
  result: "Satisfied",
  evidence_ids: [evidenceId],
  digest: digest("claim_assessment"),
  created_at: now
});

const pack = (projectId: string, changeId: string, claimId: string, evidenceId: string, evaluationId: string): EvidencePackageManifest => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  package_kind: "test",
  claim_ids: [claimId],
  evidence_ids: [evidenceId],
  evaluation_ids: [evaluationId],
  digest: digest("evidence_package"),
  created_at: now
});

const impact = (projectId: string, changeId: string, evidenceId: string, validity: ImpactAssessment["new_validity"]): ImpactAssessment => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  trigger: "artifact",
  subject_type: "evidence",
  subject_id: evidenceId,
  rule: "digest_changed",
  old_input_digest: digest("old_artifact"),
  new_input_digest: digest("new_artifact", "b".repeat(64)),
  old_validity: "Valid",
  new_validity: validity,
  affected_ids: [evidenceId],
  created_at: now
});

const repairLink = (projectId: string, changeId: string, evidenceId: string): RepairWorkItemLink => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  failed_evidence_id: evidenceId,
  source_work_item_id: createInternalId(),
  task_id: createInternalId(),
  artifact_id: createInternalId(),
  repair_work_item_id: createInternalId(),
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
      "m0-m3-receipt",
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

describe("M3 store migrations", () => {
  it("upgrades M0–M2 databases to v4 without changing IDs, revisions, sequences or receipts", () => {
    const databasePath = tempDb();
    const seeded = seedV1(databasePath);
    const store = new SqliteProjectStore(databasePath);
    expect(store.getProject()).toMatchObject({ id: seeded.projectId, revision: 1 });
    expect(store.getChange(seeded.changeId)).toMatchObject({ id: seeded.changeId, revision: 8 });
    expect(store.listEvents()[0]?.event_id).toBe(seeded.eventId);
    expect(store.transaction((transaction) => transaction.getCommandReceipt(seeded.receiptId))).toMatchObject({
      command_id: seeded.receiptId,
      request_digest: "m0-m3-receipt"
    });
    const inspect = new DatabaseSync(databasePath, { readOnly: true });
    expect(getProjectStoreSchemaVersion(inspect)).toBe(8);
    expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'claims'").get()).toBeTruthy();
    expect(inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'evidence'").get()).toBeTruthy();
    expect(
      inspect.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_evidence_subject_binding'").get()
    ).toBeTruthy();
    inspect.close();
    store.close();
  });

  it("applies v4 idempotently when the same database is reopened", () => {
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

  it("writes immutable claims, evidence, evaluations and impact assessments atomically", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const requirements = requirementSet(seededProject.id, seededChange.id);
    const submitted = claim(seededProject.id, seededChange.id, requirements.id);
    const subjectId = createInternalId();
    const recorded = evidence(seededProject.id, seededChange.id, submitted.id, subjectId);
    const ext = reference(seededProject.id);
    const judged = evaluation(seededProject.id, seededChange.id, requirements.id);
    const assessed = assessment(seededProject.id, seededChange.id, submitted.id, judged.id, recorded.id);
    const packaged = pack(seededProject.id, seededChange.id, submitted.id, recorded.id, judged.id);
    const invalidated = impact(seededProject.id, seededChange.id, recorded.id, "Stale");
    const repair = repairLink(seededProject.id, seededChange.id, recorded.id);

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
      transaction.insertGateRequirementSet(requirements);
      transaction.insertClaim(submitted);
      transaction.insertExternalReference(ext);
      transaction.insertEvidence(recorded);
      transaction.insertIndependentEvaluation(judged);
      transaction.insertClaimAssessment(assessed);
      transaction.insertEvidencePackageManifest(packaged);
      transaction.insertImpactAssessment(invalidated);
      transaction.insertRepairWorkItemLink(repair);
    });

    expect(store.transaction((transaction) => transaction.getClaim(submitted.id))).toMatchObject({ id: submitted.id });
    expect(store.transaction((transaction) => transaction.getEvidence(recorded.id))).toMatchObject({
      id: recorded.id,
      subject_id: subjectId,
      subject_digest: recorded.subject_digest
    });
    expect(store.transaction((transaction) => transaction.getLatestGateRequirementSet(seededChange.id))).toMatchObject({
      id: requirements.id
    });
    expect(store.transaction((transaction) => transaction.listImpactAssessmentsBySubject(recorded.id))).toEqual([
      invalidated
    ]);
    expect("updateEvidence" in store.transaction((transaction) => transaction)).toBe(false);
    store.close();
  });

  it("rejects evidence that does not uniquely bind claim, subject type, id and digest", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const requirements = requirementSet(seededProject.id, seededChange.id);
    const submitted = claim(seededProject.id, seededChange.id, requirements.id);
    const subjectId = createInternalId();
    const first = evidence(seededProject.id, seededChange.id, submitted.id, subjectId);
    const duplicate = evidence(seededProject.id, seededChange.id, submitted.id, subjectId, first.subject_digest);

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
      transaction.insertGateRequirementSet(requirements);
      transaction.insertClaim(submitted);
      transaction.insertEvidence(first);
    });

    expect(() =>
      store.transaction((transaction) => {
        transaction.insertEvidence(duplicate);
      })
    ).toThrow(StoreConflictError);
    store.close();
  });

  it("rolls back evidence facts together with events and receipts", () => {
    const store = new SqliteProjectStore(tempDb());
    const seededProject = project();
    const seededChange = change(seededProject.id);
    const requirements = requirementSet(seededProject.id, seededChange.id);
    const submitted = claim(seededProject.id, seededChange.id, requirements.id);
    const recorded = evidence(seededProject.id, seededChange.id, submitted.id, createInternalId());
    const commandId = createInternalId();

    store.transaction((transaction) => {
      transaction.insertProject(seededProject);
      transaction.insertChange(seededChange);
      transaction.insertGateRequirementSet(requirements);
      transaction.insertClaim(submitted);
    });

    expect(() =>
      store.transaction((transaction) => {
        transaction.insertEvidence(recorded);
        const event = transaction.appendEvent({
          event_id: createInternalId(),
          event_type: "EvidenceRecorded",
          project_id: seededProject.id,
          aggregate: { object_type: "evidence", id: recorded.id, domain_version: 1 },
          aggregate_revision: 1,
          occurred_at: now,
          actor_id: seededChange.owner_actor_id,
          command_id: commandId,
          correlation_id: createInternalId(),
          payload: { evidence_id: recorded.id }
        });
        transaction.saveCommandReceipt({
          command_id: commandId,
          request_digest: "m3-rollback",
          result: {
            ok: true,
            command_id: commandId,
            correlation_id: event.correlation_id,
            aggregate: event.aggregate,
            revision: 1,
            events: [event],
            data: { evidence: recorded }
          },
          created_at: now
        });
        throw new Error("m3 rollback");
      })
    ).toThrow("m3 rollback");

    expect(store.transaction((transaction) => transaction.getEvidence(recorded.id))).toBeUndefined();
    expect(store.listEvents()).toEqual([]);
    expect(store.transaction((transaction) => transaction.getCommandReceipt(commandId))).toBeUndefined();
    store.close();
  });
});
