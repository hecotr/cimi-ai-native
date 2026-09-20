import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Actor,
  type Assignment,
  type Change,
  type CommandSuccess,
  type EventEnvelope,
  type InternalId,
  type Project,
  type Role,
  type TransitionRecord
} from "../../packages/protocol/dist/index.js";
import {
  StoreConflictError,
  type OutboxMessage,
  type ProjectStore
} from "../../packages/store/dist/index.js";

export interface ProjectStoreContractFactory {
  create(): ProjectStore;
  reopen(): ProjectStore;
}

const timestamp = "2026-09-20T00:00:00.000Z";

const createProject = (): Project => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  name: "Store Contract",
  repository_kind: "git",
  repository_path: "C:/store-contract",
  instance_id: createInternalId(),
  created_at: timestamp,
  revision: 1
});

const createChange = (projectId: InternalId, ownerActorId = createInternalId()): Change => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  display_key: "CHG-0001",
  title: "Store contract change",
  lifecycle_state: "Draft",
  operating_status: "Active",
  owner_actor_id: ownerActorId,
  source: { origin: "human_cli", producer: "store-contract" },
  created_at: timestamp,
  updated_at: timestamp,
  revision: 1
});

export const projectStoreContract = (
  adapterName: string,
  createFactory: () => ProjectStoreContractFactory
): void => {
  describe(`${adapterName} ProjectStore contract`, () => {
    it("rolls back every authoritative write when a transaction fails", () => {
      const factory = createFactory();
      const store = factory.create();
      const project = createProject();
      const actor: Actor = {
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        actor_type: "human",
        display_name: "Store Contract Owner",
        identity_source: "git_config",
        created_at: timestamp,
        revision: 1
      };
      const role: Role = {
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        role_key: "project_owner",
        display_name: "项目负责人",
        created_at: timestamp,
        revision: 1
      };
      const assignment: Assignment = {
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        project_id: project.id,
        actor_id: actor.id,
        role_id: role.id,
        scope_type: "project",
        scope_id: project.id,
        effective_at: timestamp,
        created_at: timestamp,
        revision: 1
      };
      const change = createChange(project.id, actor.id);
      const commandId = createInternalId();
      const transition: TransitionRecord = {
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        project_id: project.id,
        change_id: change.id,
        command_id: commandId,
        transition_type: "change_paused",
        from_status: "Active",
        to_status: "Paused",
        reason: "rollback contract",
        actor_id: actor.id,
        occurred_at: timestamp
      };

      expect(() =>
        store.transaction((transaction) => {
          transaction.insertProject(project);
          transaction.insertActor(actor);
          transaction.insertRole(role);
          transaction.insertAssignment(assignment);
          transaction.insertChange(change);
          transaction.insertTransition(transition);
          const event = transaction.appendEvent({
            event_id: createInternalId(),
            event_type: "ChangeCreated",
            project_id: project.id,
            aggregate: { object_type: "change", id: change.id, domain_version: 1 },
            aggregate_revision: 1,
            occurred_at: timestamp,
            actor_id: change.owner_actor_id,
            command_id: commandId,
            correlation_id: createInternalId(),
            payload: { display_key: change.display_key }
          });
          transaction.enqueueOutbox({
            id: createInternalId(),
            project_id: project.id,
            event_id: event.event_id,
            status: "pending",
            attempt_count: 0,
            available_at: timestamp,
            created_at: timestamp
          });
          transaction.saveCommandReceipt({
            command_id: commandId,
            request_digest: "rollback-digest",
            result: {
              ok: true,
              command_id: commandId,
              correlation_id: event.correlation_id,
              aggregate: event.aggregate,
              revision: 1,
              events: [event],
              data: { change }
            },
            created_at: timestamp
          });
          throw new Error("contract rollback");
        })
      ).toThrow("contract rollback");

      expect(store.getProject()).toBeUndefined();
      expect(store.getChange(change.id)).toBeUndefined();
      expect(store.listEvents()).toEqual([]);
      expect(store.listOutbox()).toEqual([]);
      expect(store.transaction((transaction) => transaction.getCommandReceipt(commandId))).toBeUndefined();
      store.transaction((transaction) => {
        transaction.insertProject(project);
        transaction.insertActor(actor);
        transaction.insertRole(role);
        transaction.insertAssignment(assignment);
        transaction.insertChange(change);
        transaction.insertTransition(transition);
      });
      expect(store.getProject()).toMatchObject({ id: project.id });
      expect(store.getChange(change.id)).toMatchObject({ id: change.id });
      store.close();
    });

    it("persists receipts, continuous events and current state across reopen", () => {
      const factory = createFactory();
      let store = factory.create();
      const project = createProject();
      const change = createChange(project.id);
      const commandId = createInternalId();
      let firstEvent: EventEnvelope | undefined;

      store.transaction((transaction) => {
        transaction.insertProject(project);
        transaction.insertChange(change);
        firstEvent = transaction.appendEvent({
          event_id: createInternalId(),
          event_type: "ChangeCreated",
          project_id: project.id,
          aggregate: { object_type: "change", id: change.id, domain_version: 1 },
          aggregate_revision: 1,
          occurred_at: timestamp,
          actor_id: change.owner_actor_id,
          command_id: commandId,
          correlation_id: createInternalId(),
          payload: { display_key: change.display_key }
        });
        const result: CommandSuccess = {
          ok: true,
          command_id: commandId,
          correlation_id: firstEvent.correlation_id,
          aggregate: firstEvent.aggregate,
          revision: 1,
          events: [firstEvent],
          data: { change }
        };
        transaction.saveCommandReceipt({
          command_id: commandId,
          request_digest: "digest-1",
          result,
          created_at: timestamp
        });
      });

      const updated = { ...change, operating_status: "Paused" as const, revision: 2, updated_at: timestamp };
      store.transaction((transaction) => {
        transaction.updateChange(updated, 1);
        transaction.appendEvent({
          event_id: createInternalId(),
          event_type: "ChangePaused",
          project_id: project.id,
          aggregate: { object_type: "change", id: change.id, domain_version: 1 },
          aggregate_revision: 2,
          occurred_at: timestamp,
          actor_id: change.owner_actor_id,
          command_id: createInternalId(),
          correlation_id: createInternalId(),
          payload: {}
        });
      });

      store.close();
      store = factory.reopen();
      const current = store.getChange(change.id);
      const events = store.listEvents();
      const lastEvent = events.at(-1);
      expect(current).toMatchObject({ operating_status: "Paused", revision: 2 });
      expect(events.map((event) => event.event_sequence)).toEqual([1, 2]);
      expect(lastEvent).toMatchObject({
        event_type: "ChangePaused",
        aggregate: { object_type: "change", id: current?.id },
        aggregate_revision: current?.revision
      });
      expect(
        store.transaction((transaction) => transaction.getCommandReceipt(commandId))
      ).toMatchObject({ command_id: commandId, request_digest: "digest-1" });
      store.close();
    });

    it("rejects stale revisions and preserves the winning state", () => {
      const factory = createFactory();
      const store = factory.create();
      const project = createProject();
      const change = createChange(project.id);
      store.transaction((transaction) => {
        transaction.insertProject(project);
        transaction.insertChange(change);
      });

      store.transaction((transaction) => {
        transaction.updateChange({ ...change, operating_status: "Paused", revision: 2 }, 1);
      });
      expect(() =>
        store.transaction((transaction) => {
          transaction.updateChange({ ...change, pause_reason: "stale", revision: 2 }, 1);
        })
      ).toThrow(StoreConflictError);
      expect(store.getChange(change.id)).toMatchObject({ operating_status: "Paused", revision: 2 });
      store.close();
    });

    it("reclaims expired outbox leases and delivers each message once", () => {
      const factory = createFactory();
      let store = factory.create();
      const project = createProject();
      const eventId = createInternalId();
      const message: OutboxMessage = {
        id: createInternalId(),
        project_id: project.id,
        event_id: eventId,
        status: "pending",
        attempt_count: 0,
        available_at: timestamp,
        created_at: timestamp
      };
      store.transaction((transaction) => {
        transaction.insertProject(project);
        transaction.appendEvent({
          event_id: eventId,
          event_type: "ProjectInitialized",
          project_id: project.id,
          aggregate: { object_type: "project", id: project.id, domain_version: 1 },
          aggregate_revision: 1,
          occurred_at: timestamp,
          actor_id: createInternalId(),
          command_id: createInternalId(),
          correlation_id: createInternalId(),
          payload: {}
        });
        transaction.enqueueOutbox(message);
      });

      expect(store.claimOutbox("2026-09-20T00:00:01.000Z", "2026-09-20T00:01:00.000Z")).toMatchObject({
        id: message.id,
        attempt_count: 1
      });
      store.close();
      store = factory.reopen();
      const reclaimed = store.claimOutbox("2026-09-20T00:02:00.000Z", "2026-09-20T00:03:00.000Z");
      expect(reclaimed).toMatchObject({ id: message.id, attempt_count: 2 });
      if (!reclaimed) throw new Error("Expected expired lease to be reclaimed");
      store.markOutboxDelivered(reclaimed.id, "2026-09-20T00:02:01.000Z");
      expect(store.claimOutbox("2026-09-20T00:04:00.000Z", "2026-09-20T00:05:00.000Z")).toBeUndefined();
      expect(store.listOutbox("delivered")).toHaveLength(1);
      store.close();
    });
  });
};
