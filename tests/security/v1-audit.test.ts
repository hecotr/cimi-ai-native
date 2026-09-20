import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError
} from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../../packages/kernel/src/kernel.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";

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

describe("V1 authority audit trail", () => {
  it("records actor, command, and policy snapshot for authority-changing actions", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-v1-audit-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const initialized = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "InitializeProject",
        requested_at: now,
        actor_id: createInternalId(),
        project_id: createInternalId(),
        source: { origin: "human_cli" as const, producer: "v1-audit-test" },
        payload: {
          name: "Audit",
          repository_kind: "directory",
          repository_path: directory,
          owner_name: "Owner"
        }
      })
    );
    if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
    const projectId = initialized.data.project.id;
    const actorId = initialized.data.actor.id;
    const created = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CreateChange",
        requested_at: now,
        actor_id: actorId,
        project_id: projectId,
        source: { origin: "human_cli" as const, producer: "v1-audit-test" },
        payload: { title: "Audited change" }
      })
    );
    if (!("change" in created.data)) throw new Error("missing change");
    const bootstrapped = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "BootstrapSoloGovernance",
        requested_at: now,
        actor_id: actorId,
        project_id: projectId,
        expected_revision: created.data.change.revision,
        target: { object_type: "change", id: created.data.change.id, domain_version: 1 },
        source: { origin: "human_cli" as const, producer: "v1-audit-test" },
        payload: {
          change_id: created.data.change.id,
          intent_owner_actor_id: actorId,
          technical_owner_actor_id: actorId
        }
      })
    );
    const events = store.listEvents();
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const event of events) {
      expect(event.actor_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(event.command_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(event.correlation_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(event.event_type.length).toBeGreaterThan(0);
    }
    expect(events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["ProjectInitialized", "ChangeCreated", "SoloGovernanceBootstrapped"])
    );
    if (!("policy" in bootstrapped.data)) throw new Error("missing policy");
    expect(bootstrapped.data.policy.decisions_human_only).toBe(true);
    const snapshot = store.transaction((transaction) => transaction.getLatestPolicySnapshot(projectId));
    expect(snapshot?.id).toBeTruthy();
    expect(snapshot?.project_id).toBe(projectId);
  });
});
