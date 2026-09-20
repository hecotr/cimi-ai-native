import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/dist/index.js";
import {
  SCHEMA_VERSION,
  createInternalId,
  type AnyCommand,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../packages/protocol/dist/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/dist/index.js";

const temporaryDirectories: string[] = [];

const createStore = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m0-test-"));
  temporaryDirectories.push(directory);
  return {
    directory,
    databasePath: join(directory, "project.db"),
    store: new SqliteProjectStore(join(directory, "project.db"))
  };
};

const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  expect("ok" in result && result.ok).toBe(true);
  return result as CommandSuccess;
};

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const commandBase = (commandType: AnyCommand["command_type"], commandId = createInternalId()) => ({
  schema_version: SCHEMA_VERSION,
  command_id: commandId,
  correlation_id: createInternalId(),
  command_type: commandType,
  requested_at: "2026-09-19T00:00:00.000Z",
  source: { origin: "human_cli" as const, producer: "scenario-test" }
});

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("M0 recoverable vertical slice", () => {
  it("keeps state, events, outbox and idempotency consistent", () => {
    const fixture = createStore();
    const kernel = new CimiLoopKernel({ store: fixture.store, now: () => "2026-09-19T00:00:00.000Z" });

    const initialized = success(
      kernel.execute({
        ...commandBase("InitializeProject"),
        payload: {
          name: "M0 Test",
          repository_kind: "git",
          repository_path: fixture.directory,
          owner_name: "Test Owner",
          owner_email: "test@example.com"
        }
      })
    );
    if (!("project" in initialized.data)) throw new Error("Expected initialization result");
    const project = initialized.data.project as { id: InternalId };
    const actor = initialized.data.actor as { id: InternalId };

    expect(() =>
      fixture.store.transaction((transaction) => {
        transaction.nextChangeDisplayKey(project.id);
        throw new Error("simulated crash before commit");
      })
    ).toThrow("simulated crash before commit");

    const createCommandId = createInternalId();
    const createCommand = {
      ...commandBase("CreateChange", createCommandId),
      project_id: project.id,
      actor_id: actor.id,
      payload: { title: "M0 first Change" }
    };
    const created = success(kernel.execute(createCommand));
    if (!("change" in created.data)) throw new Error("Expected change result");
    const replayed = success(
      kernel.execute({
        ...createCommand,
        correlation_id: createInternalId(),
        requested_at: "2026-09-19T00:00:01.000Z"
      })
    );
    expect(replayed).toEqual(created);
    expect(fixture.store.listEvents()).toHaveLength(2);
    expect(fixture.store.listOutbox()).toHaveLength(2);

    const reused = failure(kernel.execute({ ...createCommand, payload: { title: "Different payload" } }));
    expect(reused.code).toBe("COMMAND_ID_REUSED");
    expect(fixture.store.listEvents()).toHaveLength(2);

    const change = created.data.change as { id: InternalId; revision: number; display_key: string };
    expect(change.display_key).toBe("CHG-0001");
    const paused = success(
      kernel.execute({
        ...commandBase("PauseChange"),
        project_id: project.id,
        actor_id: actor.id,
        target: { object_type: "change", id: change.id, domain_version: 1 },
        expected_revision: 1,
        payload: { reason: "等待确认" }
      })
    );
    expect(paused.revision).toBe(2);

    const staleResume = failure(
      kernel.execute({
        ...commandBase("ResumeChange"),
        project_id: project.id,
        actor_id: actor.id,
        target: { object_type: "change", id: change.id, domain_version: 1 },
        expected_revision: 1,
        payload: {}
      })
    );
    expect(staleResume.code).toBe("REVISION_CONFLICT");
    expect(fixture.store.listEvents()).toHaveLength(3);

    const resumed = success(
      kernel.execute({
        ...commandBase("ResumeChange"),
        project_id: project.id,
        actor_id: actor.id,
        target: { object_type: "change", id: change.id, domain_version: 1 },
        expected_revision: 2,
        payload: {}
      })
    );
    expect(resumed.revision).toBe(3);
    expect(fixture.store.listEvents().map((event) => event.event_sequence)).toEqual([1, 2, 3, 4]);
    expect(fixture.store.listOutbox("pending")).toHaveLength(4);

    const invalidResume = failure(
      kernel.execute({
        ...commandBase("ResumeChange"),
        project_id: project.id,
        actor_id: actor.id,
        target: { object_type: "change", id: change.id, domain_version: 1 },
        expected_revision: 3,
        payload: {}
      })
    );
    expect(invalidResume.code).toBe("CHANGE_NOT_PAUSED");
    expect(fixture.store.listEvents()).toHaveLength(4);

    fixture.store.close();
    const reopened = new SqliteProjectStore(fixture.databasePath);
    expect(reopened.getChange("CHG-0001")).toMatchObject({ operating_status: "Active", revision: 3 });
    expect(reopened.listEvents()).toHaveLength(4);
    expect(reopened.listOutbox()).toHaveLength(4);

    const claimed = reopened.claimOutbox("2026-09-19T00:01:00.000Z", "2026-09-19T00:02:00.000Z");
    expect(claimed).toMatchObject({ status: "processing", attempt_count: 1 });
    reopened.close();

    const afterWorkerCrash = new SqliteProjectStore(fixture.databasePath);
    try {
      const reclaimed = afterWorkerCrash.claimOutbox(
        "2026-09-19T00:03:00.000Z",
        "2026-09-19T00:04:00.000Z"
      );
      expect(reclaimed?.id).toBe(claimed?.id);
      expect(reclaimed?.attempt_count).toBe(2);
      if (!reclaimed) throw new Error("Expected an outbox message");
      afterWorkerCrash.markOutboxDelivered(reclaimed.id, "2026-09-19T00:03:01.000Z");
      expect(afterWorkerCrash.listOutbox("delivered")).toHaveLength(1);
    } finally {
      afterWorkerCrash.close();
    }
  });
});
