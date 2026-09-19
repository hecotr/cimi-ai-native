import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { InternalId } from "@cimiloop/protocol";
import type { ProjectRegistry, RegistryProject } from "@cimiloop/store";

type SqlRow = Record<string, unknown>;

export class SqliteProjectRegistry implements ProjectRegistry {
  readonly #database: DatabaseSync;

  constructor(readonly databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath, {
      timeout: 5000,
      defensive: true,
      allowExtension: false
    });
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        repository_path TEXT NOT NULL UNIQUE,
        database_path TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  register(project: RegistryProject): void {
    this.#database
      .prepare(
        `INSERT INTO projects(project_id, repository_path, database_path, last_opened_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           repository_path = excluded.repository_path,
           database_path = excluded.database_path,
           last_opened_at = excluded.last_opened_at`
      )
      .run(project.project_id, project.repository_path, project.database_path, project.last_opened_at);
  }

  findByRepository(repositoryPath: string): RegistryProject | undefined {
    const row = this.#database
      .prepare("SELECT * FROM projects WHERE repository_path = ?")
      .get(repositoryPath) as SqlRow | undefined;
    return row ? this.#map(row) : undefined;
  }

  list(): RegistryProject[] {
    return (this.#database.prepare("SELECT * FROM projects ORDER BY last_opened_at DESC").all() as SqlRow[]).map(
      (row) => this.#map(row)
    );
  }

  close(): void {
    this.#database.close();
  }

  #map(row: SqlRow): RegistryProject {
    return {
      project_id: String(row.project_id) as InternalId,
      repository_path: String(row.repository_path),
      database_path: String(row.database_path),
      last_opened_at: String(row.last_opened_at)
    };
  }
}
