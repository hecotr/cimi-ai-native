import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/dist/index.js";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../packages/protocol/dist/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/dist/index.js";
import type { ProjectStore } from "../../packages/store/dist/index.js";

const temporaryDirectories: string[] = [];

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

const createFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m0-reliability-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "project.db");
  const store = new SqliteProjectStore(databasePath);
  const kernel = new CimiLoopKernel({ store, now: () => "2026-09-20T00:00:00.000Z" });
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: "2026-09-20T00:00:00.000Z",
      source: { origin: "human_cli", producer: "reliability-test" },
      payload: {
        name: "M0 Reliability",
        repository_kind: "git",
        repository_path: directory,
        owner_name: "Test Owner"
      }
    })
  );
  if (!("project" in initialized.data)) throw new Error("Expected initialization result");
  return {
    directory,
    databasePath,
    store,
    projectId: (initialized.data.project as { id: InternalId }).id,
    actorId: (initialized.data.actor as { id: InternalId }).id
  };
};

describe("M0 reliability acceptance", () => {
  it("can reopen the same database repeatedly without changing authoritative state", () => {
    const fixture = createFixture();
    fixture.store.close();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reopened = new SqliteProjectStore(fixture.databasePath);
      expect(reopened.getProject()).toMatchObject({ id: fixture.projectId, revision: 1 });
      expect(reopened.listEvents()).toHaveLength(1);
      reopened.close();
    }
  });

  it("recovers a committed result when the original response is lost", () => {
    const fixture = createFixture();
    const commandId = createInternalId();
    let loseNextResponse = true;
    const responseLosingStore: ProjectStore = {
      transaction: (work) => {
        const result = fixture.store.transaction(work);
        if (loseNextResponse) {
          loseNextResponse = false;
          throw new Error("simulated response loss after commit");
        }
        return result;
      },
      getProject: () => fixture.store.getProject(),
      getChange: (idOrKey) => fixture.store.getChange(idOrKey),
      listChanges: () => fixture.store.listChanges(),
      listEvents: () => fixture.store.listEvents(),
      listOutbox: (status) => fixture.store.listOutbox(status),
      claimOutbox: (now, leaseUntil) => fixture.store.claimOutbox(now, leaseUntil),
      markOutboxDelivered: (messageId, deliveredAt) => fixture.store.markOutboxDelivered(messageId, deliveredAt),
      releaseOutbox: (messageId, availableAt) => fixture.store.releaseOutbox(messageId, availableAt),
      claimExternalOperation: (input) => fixture.store.claimExternalOperation(input),
      markExternalOperationInvokeStarted: (operationId, ownerId, at) =>
        fixture.store.markExternalOperationInvokeStarted(operationId, ownerId, at),
      markExternalOperationInvokeFinished: (operationId, ownerId, at, result) =>
        fixture.store.markExternalOperationInvokeFinished(operationId, ownerId, at, result),
      getExternalOperationLease: (operationId) => fixture.store.getExternalOperationLease(operationId),
      listInvokedUnrecordedOperations: () => fixture.store.listInvokedUnrecordedOperations(),
      listAbandonedExternalInvokes: (at) => fixture.store.listAbandonedExternalInvokes(at),
      releaseExternalOperationLease: (operationId) => fixture.store.releaseExternalOperationLease(operationId),
      close: () => fixture.store.close()
    };
    const kernel = new CimiLoopKernel({
      store: responseLosingStore,
      now: () => "2026-09-20T00:00:01.000Z"
    });
    const command = {
      schema_version: SCHEMA_VERSION,
      command_id: commandId,
      correlation_id: createInternalId(),
      command_type: "CreateChange" as const,
      requested_at: "2026-09-20T00:00:01.000Z",
      project_id: fixture.projectId,
      actor_id: fixture.actorId,
      source: { origin: "human_cli" as const, producer: "reliability-test" },
      payload: { title: "Recover committed receipt" }
    };

    expect(kernel.execute(command)).toMatchObject({ code: "STORE_FAILURE", retryable: true });
    expect(kernel.execute(command)).toMatchObject({ ok: true, command_id: commandId, revision: 1 });
    expect(fixture.store.listChanges()).toHaveLength(1);
    expect(fixture.store.listEvents()).toHaveLength(2);
    expect(fixture.store.listOutbox()).toHaveLength(2);
    fixture.store.close();
  });

  it("rejects the losing client when two clients update the same revision", () => {
    const fixture = createFixture();
    const firstClient = new CimiLoopKernel({
      store: fixture.store,
      now: () => "2026-09-20T00:00:01.000Z"
    });
    const created = success(
      firstClient.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "CreateChange",
        requested_at: "2026-09-20T00:00:01.000Z",
        project_id: fixture.projectId,
        actor_id: fixture.actorId,
        source: { origin: "human_cli", producer: "first-client" },
        payload: { title: "Concurrent update" }
      })
    );
    if (!("change" in created.data)) throw new Error("Expected change result");
    const change = created.data.change as { id: InternalId; revision: number };
    const secondStore = new SqliteProjectStore(fixture.databasePath);
    const secondClient = new CimiLoopKernel({
      store: secondStore,
      now: () => "2026-09-20T00:00:02.000Z"
    });
    const secondClientSnapshot = secondClient.getChange(change.id) as { revision: number };

    expect(
      firstClient.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "PauseChange",
        requested_at: "2026-09-20T00:00:02.000Z",
        project_id: fixture.projectId,
        actor_id: fixture.actorId,
        target: { object_type: "change", id: change.id, domain_version: 1 },
        expected_revision: change.revision,
        source: { origin: "human_cli", producer: "first-client" },
        payload: { reason: "first client wins" }
      })
    ).toMatchObject({ ok: true, revision: 2 });

    expect(
      secondClient.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "ResumeChange",
        requested_at: "2026-09-20T00:00:03.000Z",
        project_id: fixture.projectId,
        actor_id: fixture.actorId,
        target: { object_type: "change", id: change.id, domain_version: 1 },
        expected_revision: secondClientSnapshot.revision,
        source: { origin: "human_cli", producer: "second-client" },
        payload: {}
      })
    ).toMatchObject({ code: "REVISION_CONFLICT", retryable: false });
    expect(fixture.store.getChange(change.id)).toMatchObject({ operating_status: "Paused", revision: 2 });
    expect(fixture.store.listEvents()).toHaveLength(3);
    secondStore.close();
    fixture.store.close();
  });
});
