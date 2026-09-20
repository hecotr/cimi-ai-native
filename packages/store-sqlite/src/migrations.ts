import type { DatabaseSync } from "node:sqlite";

export interface ProjectStoreMigration {
  version: number;
  sql: string;
}

export const PROJECT_STORE_MIGRATIONS: readonly ProjectStoreMigration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS project_counters (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  change_number INTEGER NOT NULL DEFAULT 0,
  event_sequence INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  role_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  display_key TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL,
  operating_status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(project_id, display_key)
) STRICT;

CREATE TABLE IF NOT EXISTS transition_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  command_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS event_ledger (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  event_sequence INTEGER NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_revision INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  UNIQUE(project_id, event_sequence)
) STRICT;

CREATE TABLE IF NOT EXISTS outbox_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  event_id TEXT NOT NULL UNIQUE REFERENCES event_ledger(event_id),
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'delivered')),
  attempt_count INTEGER NOT NULL,
  available_at TEXT NOT NULL,
  lease_until TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS command_receipts (
  command_id TEXT PRIMARY KEY,
  request_digest TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_changes_project ON changes(project_id, display_key);
CREATE INDEX IF NOT EXISTS idx_events_project_sequence ON event_ledger(project_id, event_sequence);
CREATE INDEX IF NOT EXISTS idx_outbox_status_available ON outbox_messages(status, available_at);
`
  },
  {
    version: 2,
    sql: `
CREATE TABLE IF NOT EXISTS change_profiles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  profile_key TEXT NOT NULL,
  domain_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(project_id, profile_key, domain_version)
) STRICT;

CREATE TABLE IF NOT EXISTS project_policies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS policy_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  policy_id TEXT NOT NULL,
  policy_revision INTEGER NOT NULL,
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS contract_candidates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL UNIQUE REFERENCES changes(id),
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS contract_versions (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  domain_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(contract_id, domain_version)
) STRICT;

CREATE TABLE IF NOT EXISTS contract_amendments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  contract_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS risk_profiles (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL UNIQUE REFERENCES changes(id),
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS risk_assessments (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id),
  risk_profile_id TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS knowledge_impact_assessments (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id),
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS plan_candidates (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL UNIQUE REFERENCES changes(id),
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS plan_versions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  change_id TEXT NOT NULL REFERENCES changes(id),
  domain_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(plan_id, domain_version)
) STRICT;

CREATE TABLE IF NOT EXISTS plan_amendments (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id),
  plan_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id),
  plan_id TEXT NOT NULL,
  plan_version INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(plan_id, plan_version, task_key)
) STRICT;

CREATE TABLE IF NOT EXISTS decision_requests (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id),
  request_type TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id),
  request_id TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS gate_evaluations (
  id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL REFERENCES changes(id),
  gate_type TEXT NOT NULL,
  result TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_change_profiles_project ON change_profiles(project_id, profile_key);
CREATE INDEX IF NOT EXISTS idx_contract_versions_change ON contract_versions(change_id, domain_version);
CREATE INDEX IF NOT EXISTS idx_plan_versions_change ON plan_versions(change_id, domain_version);
CREATE INDEX IF NOT EXISTS idx_decision_requests_open ON decision_requests(status, change_id);
CREATE INDEX IF NOT EXISTS idx_decisions_change ON decisions(change_id);
CREATE INDEX IF NOT EXISTS idx_feedback_decision ON feedback(decision_id);
CREATE INDEX IF NOT EXISTS idx_gate_evaluations_change ON gate_evaluations(change_id);
CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(plan_id, plan_version);
`
  },
  {
    version: 3,
    sql: `
CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  task_id TEXT,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  owner_actor_id TEXT NOT NULL,
  status TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS resource_locks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  holder_work_item_id TEXT NOT NULL REFERENCES work_items(id),
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS provider_descriptors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  provider_type TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS context_pack_manifests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS capability_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  run_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS source_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  run_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  run_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leases_active_work_item ON leases(work_item_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_locks_held_resource ON resource_locks(resource_type, resource_key) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_work_items_ready ON work_items(change_id, status) WHERE status = 'ready';
CREATE INDEX IF NOT EXISTS idx_work_items_change ON work_items(change_id, status);
CREATE INDEX IF NOT EXISTS idx_leases_expires ON leases(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_work_item ON agent_runs(work_item_id, attempt);
CREATE INDEX IF NOT EXISTS idx_artifacts_change ON artifacts(change_id, status);
CREATE INDEX IF NOT EXISTS idx_artifacts_digest ON artifacts(digest);

CREATE TABLE IF NOT EXISTS blockers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  work_item_id TEXT,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_blockers_open ON blockers(change_id, status) WHERE status = 'open';
`
  },
  {
    version: 4,
    sql: `
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  claim_key TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS external_references (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  claim_id TEXT NOT NULL REFERENCES claims(id),
  stance TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_digest TEXT NOT NULL,
  environment_ref TEXT,
  context_pack_id TEXT,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS gate_requirement_sets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  version INTEGER NOT NULL,
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(change_id, version)
) STRICT;

CREATE TABLE IF NOT EXISTS independent_evaluations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  artifact_id TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  requirement_set_id TEXT NOT NULL REFERENCES gate_requirement_sets(id),
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS claim_assessments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  claim_id TEXT NOT NULL REFERENCES claims(id),
  evaluation_id TEXT NOT NULL REFERENCES independent_evaluations(id),
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS evidence_package_manifests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  package_kind TEXT NOT NULL,
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS impact_assessments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  new_validity TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS repair_work_item_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_id TEXT NOT NULL REFERENCES changes(id),
  failed_evidence_id TEXT NOT NULL REFERENCES evidence(id),
  repair_work_item_id TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_subject_binding
  ON evidence(claim_id, subject_type, subject_id, subject_digest, COALESCE(environment_ref, ''), COALESCE(context_pack_id, ''));
CREATE INDEX IF NOT EXISTS idx_claims_change ON claims(change_id, claim_key);
CREATE INDEX IF NOT EXISTS idx_evidence_change ON evidence(change_id, stance);
CREATE INDEX IF NOT EXISTS idx_requirement_sets_change ON gate_requirement_sets(change_id, version);
CREATE INDEX IF NOT EXISTS idx_evaluations_change ON independent_evaluations(change_id);
CREATE INDEX IF NOT EXISTS idx_impact_subject ON impact_assessments(subject_type, subject_id);
`
  }
];

type SqlRow = Record<string, unknown>;

export const getProjectStoreSchemaVersion = (database: DatabaseSync): number => {
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get() as SqlRow | undefined;
  if (!table) return 0;
  const row = database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as SqlRow;
  return Number(row.version);
};

export const applyProjectStoreMigrations = (database: DatabaseSync, targetVersion = Number.POSITIVE_INFINITY): void => {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  for (const migration of PROJECT_STORE_MIGRATIONS) {
    if (migration.version > targetVersion) continue;
    if (migration.version <= getProjectStoreSchemaVersion(database)) continue;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database
        .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
        .run(migration.version, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      if (database.isTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }
};
