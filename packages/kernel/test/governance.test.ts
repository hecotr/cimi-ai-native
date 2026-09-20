import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { computePolicySnapshotDigest } from "../src/policy.js";
import { CimiLoopKernel } from "../src/kernel.js";

const temporaryDirectories: string[] = [];
const now = "2026-09-20T00:00:00.000Z";

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  expect("ok" in result && result.ok).toBe(true);
  return result as CommandSuccess;
};

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const createHarness = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-governance-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      source: { origin: "human_cli", producer: "governance-test" },
      payload: {
        name: "Governance",
        repository_kind: "directory",
        repository_path: directory,
        owner_name: "Human Owner",
        owner_email: "owner@example.com"
      }
    })
  );
  if (!("project" in initialized.data)) throw new Error("expected project");
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      project_id: initialized.data.project.id,
      actor_id: initialized.data.actor.id,
      source: { origin: "human_cli", producer: "governance-test" },
      payload: { title: "Governance Change" }
    })
  );
  if (!("change" in created.data)) throw new Error("expected change");
  return {
    directory,
    store,
    kernel,
    projectId: initialized.data.project.id,
    actorId: initialized.data.actor.id,
    change: created.data.change
  };
};

const bootstrapCommand = (
  harness: ReturnType<typeof createHarness>,
  extra: { origin?: "human_cli" | "agent"; commandId?: InternalId } = {}
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: extra.commandId ?? createInternalId(),
  correlation_id: createInternalId(),
  command_type: "BootstrapSoloGovernance" as const,
  requested_at: now,
  project_id: harness.projectId,
  actor_id: harness.actorId,
  target: { object_type: "change" as const, id: harness.change.id, domain_version: 1 },
  expected_revision: harness.change.revision,
  source: { origin: extra.origin ?? "human_cli", producer: "governance-test" },
  payload: {
    change_id: harness.change.id,
    intent_owner_actor_id: harness.actorId,
    technical_owner_actor_id: harness.actorId
  }
});

describe("solo governance", () => {
  it("creates Change, Intent and Technical Owner assignments plus a human-only policy", () => {
    const harness = createHarness();
    const result = success(harness.kernel.execute(bootstrapCommand(harness)));
    expect(result.data).toMatchObject({
      policy: {
        intent_required_role: "intent_owner",
        plan_required_role: "technical_owner",
        decisions_human_only: true,
        knowledge_tasks_required: true
      }
    });

    const roles = harness.store.transaction((transaction) => transaction.listRoles().map((role) => role.role_key));
    expect(roles).toEqual(expect.arrayContaining(["project_owner", "change_owner", "intent_owner", "technical_owner"]));
    const assignments = harness.store.transaction((transaction) => transaction.listAssignments(harness.projectId));
    expect(assignments).toHaveLength(4);
    expect(assignments.every((assignment) => assignment.actor_id === harness.actorId)).toBe(true);
    expect(harness.store.listEvents().some((event) => event.event_type === "SoloGovernanceBootstrapped")).toBe(true);
    expect(harness.store.listOutbox()).toHaveLength(harness.store.listEvents().length);
    harness.store.close();
  });

  it("rejects an Agent Actor bootstrap without writing governance facts", () => {
    const harness = createHarness();
    const eventsBefore = harness.store.listEvents().length;
    const result = failure(harness.kernel.execute(bootstrapCommand(harness, { origin: "agent" })));
    expect(result.code).toBe("HUMAN_ACTOR_REQUIRED");
    expect(harness.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"))).toBeUndefined();
    expect(harness.store.listEvents()).toHaveLength(eventsBefore);
    harness.store.close();
  });

  it("replays the same bootstrap command id without duplicating roles or events", () => {
    const harness = createHarness();
    const commandId = createInternalId();
    const first = success(harness.kernel.execute(bootstrapCommand(harness, { commandId })));
    const second = success(harness.kernel.execute(bootstrapCommand(harness, { commandId })));
    expect(second).toEqual(first);
    expect(harness.store.transaction((transaction) => transaction.listRoles())).toHaveLength(4);
    expect(harness.store.listEvents().filter((event) => event.event_type === "SoloGovernanceBootstrapped")).toHaveLength(
      1
    );
    harness.store.close();
  });

  it("does not silently create governance facts when an old project is reopened", () => {
    const harness = createHarness();
    const databasePath = join(harness.directory, "project.db");
    harness.store.close();
    const reopened = new SqliteProjectStore(databasePath);
    expect(reopened.transaction((transaction) => transaction.getRoleByKey("intent_owner"))).toBeUndefined();
    expect(reopened.transaction((transaction) => transaction.getProjectPolicy(harness.projectId))).toBeUndefined();
    reopened.close();
  });

  it("computes a stable digest for the same normalized policy input", () => {
    const left = computePolicySnapshotDigest({
      intent_required_role: "intent_owner",
      plan_required_role: "technical_owner",
      decisions_human_only: true,
      knowledge_tasks_required: true
    });
    const right = computePolicySnapshotDigest({
      knowledge_tasks_required: true,
      decisions_human_only: true,
      plan_required_role: "technical_owner",
      intent_required_role: "intent_owner"
    });
    expect(left).toMatch(/^[0-9a-f]{64}$/);
    expect(left).toBe(right);
  });
});
