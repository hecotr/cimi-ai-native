import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  ChangeSchema,
  CommandSuccessSchema,
  EventEnvelopeSchema,
  ProjectSchema,
  SCHEMA_VERSION,
  compileValidator,
  type Actor,
  type Assignment,
  type Change,
  type CommandSuccess,
  type EventEnvelope,
  type InternalId,
  type Project,
  type Role,
  type TransitionRecord
} from "@cimiloop/protocol";
import {
  StoreConflictError,
  type CommandReceipt,
  type OutboxMessage,
  type ProjectStore,
  type ProposedEvent,
  type StoreTransaction
} from "@cimiloop/store";

const parseProject = compileValidator<Project>(ProjectSchema);
const parseChange = compileValidator<Change>(ChangeSchema);
const parseEvent = compileValidator<EventEnvelope>(EventEnvelopeSchema);
const parseCommandSuccess = compileValidator<CommandSuccess>(CommandSuccessSchema);

type SqlRow = Record<string, unknown>;

const json = (value: unknown): string => JSON.stringify(value);
const parseJson = (value: unknown): unknown => JSON.parse(String(value));

const migrations = `
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
`;

class SqliteTransaction implements StoreTransaction {
  constructor(private readonly database: DatabaseSync) {}

  getCommandReceipt(commandId: InternalId): CommandReceipt | undefined {
    const row = this.database
      .prepare("SELECT command_id, request_digest, result_json, created_at FROM command_receipts WHERE command_id = ?")
      .get(commandId) as SqlRow | undefined;
    if (!row) return undefined;
    return {
      command_id: String(row.command_id),
      request_digest: String(row.request_digest),
      result: parseCommandSuccess(parseJson(row.result_json)),
      created_at: String(row.created_at)
    };
  }

  saveCommandReceipt(receipt: CommandReceipt): void {
    this.database
      .prepare(
        "INSERT INTO command_receipts(command_id, request_digest, result_json, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(receipt.command_id, receipt.request_digest, json(receipt.result), receipt.created_at);
  }

  getCurrentProject(): Project | undefined {
    const row = this.database.prepare("SELECT payload_json FROM projects LIMIT 1").get() as SqlRow | undefined;
    return row ? parseProject(parseJson(row.payload_json)) : undefined;
  }

  getProject(projectId: InternalId): Project | undefined {
    const row = this.database.prepare("SELECT payload_json FROM projects WHERE id = ?").get(projectId) as
      | SqlRow
      | undefined;
    return row ? parseProject(parseJson(row.payload_json)) : undefined;
  }

  insertProject(project: Project): void {
    this.database
      .prepare("INSERT INTO projects(id, revision, payload_json) VALUES (?, ?, ?)")
      .run(project.id, project.revision, json(project));
    this.database
      .prepare("INSERT INTO project_counters(project_id, change_number, event_sequence) VALUES (?, 0, 0)")
      .run(project.id);
  }

  insertActor(actor: Actor): void {
    this.database
      .prepare("INSERT INTO actors(id, revision, payload_json) VALUES (?, ?, ?)")
      .run(actor.id, actor.revision, json(actor));
  }

  insertRole(role: Role): void {
    this.database
      .prepare("INSERT INTO roles(id, role_key, revision, payload_json) VALUES (?, ?, ?, ?)")
      .run(role.id, role.role_key, role.revision, json(role));
  }

  insertAssignment(assignment: Assignment): void {
    this.database
      .prepare(
        "INSERT INTO assignments(id, project_id, actor_id, role_id, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        assignment.id,
        assignment.project_id,
        assignment.actor_id,
        assignment.role_id,
        assignment.revision,
        json(assignment)
      );
  }

  getChange(idOrKey: string): Change | undefined {
    const row = this.database
      .prepare("SELECT payload_json FROM changes WHERE id = ? OR display_key = ? LIMIT 1")
      .get(idOrKey, idOrKey) as SqlRow | undefined;
    return row ? parseChange(parseJson(row.payload_json)) : undefined;
  }

  nextChangeDisplayKey(projectId: InternalId): string {
    const row = this.database
      .prepare("UPDATE project_counters SET change_number = change_number + 1 WHERE project_id = ? RETURNING change_number")
      .get(projectId) as SqlRow | undefined;
    if (!row) throw new Error("Project counter not found");
    return `CHG-${String(Number(row.change_number)).padStart(4, "0")}`;
  }

  insertChange(change: Change): void {
    this.database
      .prepare(
        `INSERT INTO changes(
          id, project_id, display_key, lifecycle_state, operating_status, revision, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        change.id,
        change.project_id,
        change.display_key,
        change.lifecycle_state,
        change.operating_status,
        change.revision,
        json(change)
      );
  }

  updateChange(change: Change, expectedRevision: number): void {
    const result = this.database
      .prepare(
        `UPDATE changes
         SET lifecycle_state = ?, operating_status = ?, revision = ?, payload_json = ?
         WHERE id = ? AND revision = ?`
      )
      .run(
        change.lifecycle_state,
        change.operating_status,
        change.revision,
        json(change),
        change.id,
        expectedRevision
      );
    if (Number(result.changes) !== 1) {
      const row = this.database.prepare("SELECT revision FROM changes WHERE id = ?").get(change.id) as SqlRow | undefined;
      throw new StoreConflictError("Change revision conflict", row ? Number(row.revision) : undefined);
    }
  }

  insertTransition(record: TransitionRecord): void {
    this.database
      .prepare(
        `INSERT INTO transition_records(id, project_id, change_id, command_id, occurred_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(record.id, record.project_id, record.change_id, record.command_id, record.occurred_at, json(record));
  }

  appendEvent(proposed: ProposedEvent): EventEnvelope {
    const sequenceRow = this.database
      .prepare(
        "UPDATE project_counters SET event_sequence = event_sequence + 1 WHERE project_id = ? RETURNING event_sequence"
      )
      .get(proposed.project_id) as SqlRow | undefined;
    if (!sequenceRow) throw new Error("Project event counter not found");
    const event = parseEvent({
      schema_version: SCHEMA_VERSION,
      ...proposed,
      event_sequence: Number(sequenceRow.event_sequence)
    });
    this.database
      .prepare(
        `INSERT INTO event_ledger(
          event_id, project_id, event_sequence, aggregate_type, aggregate_id,
          aggregate_revision, event_type, occurred_at, envelope_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.event_id,
        event.project_id,
        event.event_sequence,
        event.aggregate.object_type,
        event.aggregate.id,
        event.aggregate_revision,
        event.event_type,
        event.occurred_at,
        json(event)
      );
    return event;
  }

  enqueueOutbox(message: OutboxMessage): void {
    this.database
      .prepare(
        `INSERT INTO outbox_messages(
          id, project_id, event_id, status, attempt_count, available_at, lease_until, created_at, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        message.id,
        message.project_id,
        message.event_id,
        message.status,
        message.attempt_count,
        message.available_at,
        message.lease_until ?? null,
        message.created_at,
        message.delivered_at ?? null
      );
  }
}

export class SqliteProjectStore implements ProjectStore {
  readonly #database: DatabaseSync;

  constructor(readonly databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath, {
      timeout: 5000,
      defensive: true,
      allowExtension: false
    });
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA busy_timeout = 5000");
    this.#database.exec(migrations);
    this.#database
      .prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, ?)")
      .run(new Date().toISOString());
  }

  transaction<T>(work: (transaction: StoreTransaction) => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = work(new SqliteTransaction(this.#database));
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  getProject(): Project | undefined {
    const row = this.#database.prepare("SELECT payload_json FROM projects LIMIT 1").get() as SqlRow | undefined;
    return row ? parseProject(parseJson(row.payload_json)) : undefined;
  }

  getChange(idOrKey: string): Change | undefined {
    const row = this.#database
      .prepare("SELECT payload_json FROM changes WHERE id = ? OR display_key = ? LIMIT 1")
      .get(idOrKey, idOrKey) as SqlRow | undefined;
    return row ? parseChange(parseJson(row.payload_json)) : undefined;
  }

  listChanges(): Change[] {
    const rows = this.#database
      .prepare("SELECT payload_json FROM changes ORDER BY CAST(SUBSTR(display_key, 5) AS INTEGER)")
      .all() as SqlRow[];
    return rows.map((row) => parseChange(parseJson(row.payload_json)));
  }

  listEvents(): EventEnvelope[] {
    const rows = this.#database
      .prepare("SELECT envelope_json FROM event_ledger ORDER BY event_sequence")
      .all() as SqlRow[];
    return rows.map((row) => parseEvent(parseJson(row.envelope_json)));
  }

  listOutbox(status?: OutboxMessage["status"]): OutboxMessage[] {
    const rows = (status
      ? this.#database
          .prepare("SELECT * FROM outbox_messages WHERE status = ? ORDER BY created_at")
          .all(status)
      : this.#database.prepare("SELECT * FROM outbox_messages ORDER BY created_at").all()) as SqlRow[];
    return rows.map((row) => ({
      id: String(row.id),
      project_id: String(row.project_id),
      event_id: String(row.event_id),
      status: String(row.status) as OutboxMessage["status"],
      attempt_count: Number(row.attempt_count),
      available_at: String(row.available_at),
      ...(row.lease_until ? { lease_until: String(row.lease_until) } : {}),
      created_at: String(row.created_at),
      ...(row.delivered_at ? { delivered_at: String(row.delivered_at) } : {})
    }));
  }

  claimOutbox(now: string, leaseUntil: string): OutboxMessage | undefined {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#database
        .prepare(
          `SELECT * FROM outbox_messages
           WHERE available_at <= ?
             AND (status = 'pending' OR (status = 'processing' AND lease_until <= ?))
           ORDER BY created_at, rowid
           LIMIT 1`
        )
        .get(now, now) as SqlRow | undefined;
      if (!row) {
        this.#database.exec("COMMIT");
        return undefined;
      }
      this.#database
        .prepare(
          `UPDATE outbox_messages
           SET status = 'processing', attempt_count = attempt_count + 1, lease_until = ?
           WHERE id = ?`
        )
        .run(leaseUntil, String(row.id));
      this.#database.exec("COMMIT");
      return {
        id: String(row.id),
        project_id: String(row.project_id),
        event_id: String(row.event_id),
        status: "processing",
        attempt_count: Number(row.attempt_count) + 1,
        available_at: String(row.available_at),
        lease_until: leaseUntil,
        created_at: String(row.created_at),
        ...(row.delivered_at ? { delivered_at: String(row.delivered_at) } : {})
      };
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  markOutboxDelivered(messageId: InternalId, deliveredAt: string): void {
    const result = this.#database
      .prepare(
        `UPDATE outbox_messages
         SET status = 'delivered', delivered_at = ?, lease_until = NULL
         WHERE id = ? AND status = 'processing'`
      )
      .run(deliveredAt, messageId);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Outbox message is not claimed");
  }

  releaseOutbox(messageId: InternalId, availableAt: string): void {
    const result = this.#database
      .prepare(
        `UPDATE outbox_messages
         SET status = 'pending', available_at = ?, lease_until = NULL
         WHERE id = ? AND status = 'processing'`
      )
      .run(availableAt, messageId);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Outbox message is not claimed");
  }

  close(): void {
    this.#database.close();
  }
}
