import { afterEach, describe, expect, it } from "vitest";
import { DeterministicDevOpsAdapter } from "../../devops/src/deterministic.js";
import { SCHEMA_VERSION, createInternalId } from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { ExternalDeliveryWorker } from "../src/external-worker.js";
import { envelope, now, openQueuedDelivery, success } from "./delivery-harness.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];

afterEach(() => {
  while (openStores.length > 0) openStores.pop()?.close();
  while (temporaryDirectories.length > 0) temporaryDirectories.pop();
});

describe("worker vs Policy revoke", () => {
  it("does not invoke the adapter after claim if Policy is revoked first", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const adapter = new DeterministicDevOpsAdapter();
    const worker = new ExternalDeliveryWorker({
      kernel: ctx.kernel,
      store: ctx.store,
      adapter,
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      workingDirectory: ctx.directory,
      now: () => now
    });
    bootstrapPolicy(ctx);
    const pending = ctx.store.transaction((transaction) =>
      transaction.listExternalOperationsByChange(ctx.changeId).find((item) => item.state === "pending")
    );
    if (!pending) throw new Error("missing pending operation");
    const claimed = ctx.store.claimExternalOperation({
      operationId: pending.id,
      ownerId: "racer",
      now,
      leaseUntil: "2026-09-20T12:00:30.000Z"
    });
    expect(claimed).toBeTruthy();
    const project = ctx.kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    success(
      ctx.kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "RevokeProjectPolicy",
        requested_at: now,
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: project.revision,
        source: { origin: "human_cli", producer: "policy-worker-test" },
        payload: { reason: "revoke before adapter invoke" }
      })
    );
    ctx.store.releaseExternalOperationLease(pending.id);
    const recovered = await worker.recover();
    expect(adapter.calls).toEqual([]);
    expect(recovered.executed).toBe(0);
    const operation = ctx.store.transaction((transaction) => transaction.getExternalOperation(pending.id));
    expect(operation?.state).toBe("failed");
  });

  it("races recover and revoke without claiming a successful unauthorized invoke", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const adapter = new DeterministicDevOpsAdapter();
    const worker = new ExternalDeliveryWorker({
      kernel: ctx.kernel,
      store: ctx.store,
      adapter,
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      workingDirectory: ctx.directory
    });
    bootstrapPolicy(ctx);
    const project = ctx.kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    const revoke = ctx.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "RevokeProjectPolicy",
      requested_at: new Date().toISOString(),
      actor_id: ctx.actorId,
      project_id: ctx.projectId,
      expected_revision: project.revision,
      source: { origin: "human_cli", producer: "policy-worker-test" },
      payload: { reason: "concurrent revoke" }
    });
    const recovered = worker.recover();
    await Promise.all([recovered, Promise.resolve(revoke)]);
    const pending = ctx.store.transaction((transaction) =>
      transaction.listExternalOperationsByChange(ctx.changeId)
    );
    if (adapter.calls.length === 0) {
      expect(pending.every((item) => item.state !== "succeeded")).toBe(true);
    } else {
      expect(pending.some((item) => item.state === "unknown" || item.state === "succeeded")).toBe(true);
    }
    expect(
      failure(
        ctx.kernel.execute(
          envelope(
            "QueueDeployment",
            ctx.projectId,
            ctx.actorId,
            { release_id: ctx.releaseId, environment_id: ctx.environmentId },
            ctx.kernel.getChange(ctx.changeId) && !("code" in ctx.kernel.getChange(ctx.changeId)!)
              ? (ctx.kernel.getChange(ctx.changeId) as { revision: number }).revision
              : 1,
            ctx.changeId
          )
        )
      ).code
    ).toBe("POLICY_REVOKED");
  });
});

const bootstrapPolicy = (ctx: ReturnType<typeof openQueuedDelivery>): void => {
  const change = ctx.kernel.getChange(ctx.changeId);
  if ("code" in change) throw new Error(change.code);
  success(
    ctx.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "BootstrapSoloGovernance",
      requested_at: now,
      actor_id: ctx.actorId,
      project_id: ctx.projectId,
      expected_revision: change.revision,
      target: { object_type: "change", id: ctx.changeId, domain_version: 1 },
      source: { origin: "human_cli", producer: "policy-worker-test" },
      payload: {
        change_id: ctx.changeId,
        intent_owner_actor_id: ctx.actorId,
        technical_owner_actor_id: ctx.actorId
      }
    })
  );
};

const failure = (result: { code?: string; ok?: boolean }) => {
  if (!("code" in result) || !result.code) throw new Error("expected failure");
  return result as { code: string };
};
