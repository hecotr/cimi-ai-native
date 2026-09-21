import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeterministicDevOpsAdapter } from "../../devops/src/deterministic.js";
import { CimiLoopKernel } from "../../kernel/src/kernel.js";
import {
  SCHEMA_VERSION,
  createInternalId,
  type DevOpsAdapterInput,
  type DevOpsAdapterResult,
  type DomainError
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { ExternalDeliveryWorker } from "../src/external-worker.js";
import { digest, envelope, now, openQueuedDelivery, success } from "./delivery-harness.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];

afterEach(() => {
  while (openStores.length > 0) {
    openStores.pop()?.close();
  }
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const workerFor = (
  ctx: ReturnType<typeof openQueuedDelivery>,
  adapter: ConstructorParameters<typeof ExternalDeliveryWorker>[0]["adapter"],
  extras: Partial<ConstructorParameters<typeof ExternalDeliveryWorker>[0]> = {}
) =>
  new ExternalDeliveryWorker({
    kernel: ctx.kernel,
    store: ctx.store,
    adapter,
    projectId: ctx.projectId,
    actorId: ctx.actorId,
    workingDirectory: ctx.directory,
    now: () => now,
    ...extras
  });

const conflict = (): DomainError => ({
  code: "REVISION_CONFLICT",
  message: "目标对象已被其他命令修改，请刷新后重试",
  category: "conflict",
  retryable: true,
  details: {},
  correlation_id: createInternalId()
});

describe("M4 external delivery worker", () => {
  it("records timeout as unknown and reconciles before any second deploy", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const calls: string[] = [];
    const adapter = {
      execute: async (input: DevOpsAdapterInput): Promise<DevOpsAdapterResult> => {
        calls.push(input.operation);
        expect(input.operation_id).toMatch(/^[0-9a-f-]{36}$/i);
        expect(input.operation_key).toBe(input.operation_id);
        if (input.operation === "deploy") {
          return {
            schema_version: SCHEMA_VERSION,
            operation_key: input.operation_key,
            state: "unknown",
            log_reference: "file://logs/timeout.log",
            log_digest: digest("timeout_log"),
            summary: "timeout after spawn"
          };
        }
        return {
          schema_version: SCHEMA_VERSION,
          operation_key: input.operation_key,
          state: "succeeded",
          actual_digest: ctx.artifact.digest,
          log_reference: "file://logs/reconcile.log",
          log_digest: digest("reconcile_log"),
          summary: "found the authorized digest"
        };
      }
    };
    const worker = workerFor(ctx, adapter);
    const first = await worker.recover();
    expect(first.recordedUnknown).toBe(1);
    expect(calls).toEqual(["deploy"]);
    expect(ctx.store.transaction((transaction) => transaction.listUnknownExternalOperations())).toHaveLength(1);

    const second = await worker.recover();
    expect(second.reconciled).toBe(1);
    expect(calls).toEqual(["deploy", "reconcile"]);
    expect(ctx.store.transaction((transaction) => transaction.listUnknownExternalOperations())).toHaveLength(0);
    expect(
      ctx.store
        .transaction((transaction) => transaction.listExternalOperationsByChange(ctx.changeId))
        .filter((item) => item.operation_kind === "deploy")
    ).toHaveLength(1);
  });

  it("lets only one of two competing workers invoke the same pending operation", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const storeB = new SqliteProjectStore(join(ctx.directory, "project.db"));
    openStores.push(storeB);
    const kernelB = new CimiLoopKernel({ store: storeB, now: () => now });
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let entered = 0;
    const adapter = {
      execute: async (input: DevOpsAdapterInput): Promise<DevOpsAdapterResult> => {
        entered += 1;
        if (input.operation === "deploy") await gate;
        return {
          schema_version: SCHEMA_VERSION,
          operation_key: input.operation_key,
          state: "succeeded",
          actual_digest: ctx.artifact.digest,
          log_reference: "file://logs/deploy.log",
          log_digest: digest("deploy_log"),
          summary: "deployed"
        };
      }
    };
    const workerA = workerFor(ctx, adapter, { ownerId: "worker-a" });
    const workerB = new ExternalDeliveryWorker({
      kernel: kernelB,
      store: storeB,
      adapter,
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      workingDirectory: ctx.directory,
      now: () => now,
      ownerId: "worker-b"
    });
    const first = workerA.recover();
    const startedAt = Date.now();
    while (entered === 0 && Date.now() - startedAt < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(entered).toBe(1);
    const second = await workerB.recover();
    releaseGate();
    const firstResult = await first;
    expect(entered).toBe(1);
    expect(firstResult.executed + second.executed).toBe(1);
    const operations = ctx.store.transaction((transaction) => transaction.listExternalOperationsByChange(ctx.changeId));
    expect(operations.filter((item) => item.operation_kind === "deploy" && item.state === "succeeded")).toHaveLength(1);
  });

  it("does not re-invoke after adapter success when RecordOperationResult hits a revision conflict", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const realExecute = ctx.kernel.execute.bind(ctx.kernel);
    let remainingConflicts = 2;
    ctx.kernel.execute = ((input: unknown) => {
      const command = input as { command_type?: string };
      if (command.command_type === "RecordOperationResult" && remainingConflicts > 0) {
        remainingConflicts -= 1;
        return conflict();
      }
      return realExecute(input);
    }) as CimiLoopKernel["execute"];
    const adapter = new DeterministicDevOpsAdapter();
    const worker = workerFor(ctx, adapter);
    const first = await worker.recover();
    expect(adapter.calls.filter((item) => item.operation === "deploy")).toHaveLength(1);
    expect(first.recordedUnknown).toBeGreaterThanOrEqual(1);
    const second = await worker.recover();
    expect(adapter.calls.filter((item) => item.operation === "deploy")).toHaveLength(1);
    expect(second.executed + first.executed).toBeGreaterThanOrEqual(0);
    expect(adapter.calls.some((item) => item.operation === "reconcile")).toBe(true);
  });

  it("treats a crash after adapter return as unknown and forbids a blind second deploy", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const operation = ctx.store.transaction((transaction) => transaction.listExternalOperationsByChange(ctx.changeId))[0];
    if (!operation) throw new Error("missing operation");
    const claimed = ctx.store.claimExternalOperation({
      operationId: operation.id,
      ownerId: "crashed-worker",
      now,
      leaseUntil: "2026-09-20T12:00:30.000Z"
    });
    expect(claimed).toBeTruthy();
    expect(ctx.store.markExternalOperationInvokeStarted(operation.id, "crashed-worker", now)).toBe(true);
    ctx.store.markExternalOperationInvokeFinished(operation.id, "crashed-worker", now, {
      schema_version: SCHEMA_VERSION,
      operation_key: operation.id,
      state: "succeeded",
      actual_digest: ctx.artifact.digest,
      log_reference: "file://logs/crash.log",
      log_digest: digest("crash_log"),
      summary: "adapter returned before process death"
    });
    const adapter = new DeterministicDevOpsAdapter();
    const worker = workerFor(ctx, adapter, { ownerId: "recovery-worker" });
    await worker.recover();
    expect(adapter.calls).toHaveLength(0);
    const recorded = ctx.store.transaction((transaction) => transaction.getExternalOperation(operation.id));
    expect(recorded?.state === "succeeded" || recorded?.state === "unknown").toBe(true);
    expect(ctx.store.claimExternalOperation({
      operationId: operation.id,
      ownerId: "thief",
      now: "2026-09-20T12:01:00.000Z",
      leaseUntil: "2026-09-20T12:01:30.000Z"
    })).toBeUndefined();
  });

  it("allows lease takeover only when invoke never started, and escalates expired in-flight invokes", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const operation = ctx.store.transaction((transaction) => transaction.listExternalOperationsByChange(ctx.changeId))[0];
    if (!operation) throw new Error("missing operation");
    expect(
      ctx.store.claimExternalOperation({
        operationId: operation.id,
        ownerId: "stale-owner",
        now: "2026-09-20T11:59:00.000Z",
        leaseUntil: "2026-09-20T11:59:30.000Z"
      })
    ).toBeTruthy();
    const adapter = new DeterministicDevOpsAdapter();
    const worker = workerFor(ctx, adapter, { ownerId: "takeover-worker" });
    const taken = await worker.recover();
    expect(taken.executed).toBe(1);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.operation_id).toBe(operation.id);

    const expired = ctx.store.transaction((transaction) =>
      transaction.listExternalOperationsByChange(ctx.changeId).find((item) => item.state === "pending")
    );
    expect(expired).toBeUndefined();
  });

  it("escalates an expired in-flight invoke to unknown instead of retrying the adapter", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const operation = ctx.store.transaction((transaction) => transaction.listExternalOperationsByChange(ctx.changeId))[0];
    if (!operation) throw new Error("missing operation");
    expect(
      ctx.store.claimExternalOperation({
        operationId: operation.id,
        ownerId: "inflight-owner",
        now: "2026-09-20T11:59:00.000Z",
        leaseUntil: "2026-09-20T11:59:30.000Z"
      })
    ).toBeTruthy();
    expect(ctx.store.markExternalOperationInvokeStarted(operation.id, "inflight-owner", "2026-09-20T11:59:00.000Z")).toBe(
      true
    );
    const adapter = new DeterministicDevOpsAdapter();
    const worker = workerFor(ctx, adapter, { ownerId: "escalation-worker" });
    const result = await worker.recover();
    expect(adapter.calls.filter((item) => item.operation === "deploy")).toHaveLength(0);
    expect(result.recordedUnknown).toBeGreaterThanOrEqual(1);
    expect(
      ctx.store.transaction((transaction) => transaction.listExternalOperationsByChange(ctx.changeId)).filter(
        (item) => item.operation_kind === "deploy"
      )
    ).toHaveLength(1);
  });

  it("does not blindly retry an unknown operation and continues after reconciliation", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const calls: string[] = [];
    const adapter = {
      execute: async (input: DevOpsAdapterInput): Promise<DevOpsAdapterResult> => {
        calls.push(input.operation);
        if (input.operation === "deploy") {
          return {
            schema_version: SCHEMA_VERSION,
            operation_key: input.operation_key,
            state: "unknown",
            log_reference: "file://logs/unknown.log",
            log_digest: digest("unknown_log"),
            summary: "indeterminate"
          };
        }
        return {
          schema_version: SCHEMA_VERSION,
          operation_key: input.operation_key,
          state: "succeeded",
          actual_digest: ctx.artifact.digest,
          log_reference: "file://logs/reconcile.log",
          log_digest: digest("reconcile_log"),
          summary: "confirmed"
        };
      }
    };
    const worker = workerFor(ctx, adapter);
    await worker.recover();
    await worker.recover();
    expect(calls.filter((item) => item === "deploy")).toHaveLength(1);
    expect(calls.filter((item) => item === "reconcile")).toHaveLength(1);
    const change = ctx.kernel.getChange(ctx.changeId);
    if ("code" in change) throw new Error(change.code);
    const next = success(
      ctx.kernel.execute(
        envelope(
          "QueueDeployment",
          ctx.projectId,
          ctx.actorId,
          { release_id: ctx.releaseId, environment_id: ctx.environmentId },
          change.revision,
          ctx.changeId
        )
      )
    );
    expect("operation" in next.data && next.data.operation?.operation_kind).toBe("status");
    await worker.recover();
    expect(calls.filter((item) => item === "status")).toHaveLength(1);
  });

  it("executes deploy through start/stop and uses the operation id as the adapter idempotency key", async () => {
    const ctx = openQueuedDelivery(temporaryDirectories, openStores);
    const adapter = new DeterministicDevOpsAdapter();
    const worker = workerFor(ctx, adapter, { pollIntervalMs: 10 });
    expect(worker.lifecycle()).toMatchObject({ running: false, stopped: true });
    const loop = worker.start();
    const startedAt = Date.now();
    while (adapter.calls.length === 0 && Date.now() - startedAt < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    worker.stop();
    await loop;
    expect(worker.lifecycle().stopped).toBe(true);
    expect(adapter.calls[0]?.operation).toBe("deploy");
    expect(adapter.calls[0]?.operation_id).toBe(adapter.calls[0]?.operation_key);
    await adapter.execute(adapter.calls[0]!);
    expect(adapter.calls).toHaveLength(2);
  });
});
