import { createHash } from "node:crypto";
import type { DevOpsAdapter } from "@cimiloop/devops";
import type { KernelResult } from "@cimiloop/kernel";
import {
  SCHEMA_VERSION,
  createInternalId,
  type AnyCommand,
  type Change,
  type DevOpsAdapterResult,
  type DomainError,
  type ExternalOperation,
  type InternalId,
  type Reconciliation
} from "@cimiloop/protocol";
import type { ExternalOperationLease, ProjectStore } from "@cimiloop/store";

export interface ExternalWorkerKernel {
  execute(input: unknown): KernelResult;
  getChange(idOrKey: string): Change | DomainError;
}

export interface ExternalWorkerDependencies {
  kernel: ExternalWorkerKernel;
  store: Pick<
    ProjectStore,
    | "transaction"
    | "listChanges"
    | "claimExternalOperation"
    | "markExternalOperationInvokeStarted"
    | "markExternalOperationInvokeFinished"
    | "getExternalOperationLease"
    | "listInvokedUnrecordedOperations"
    | "listAbandonedExternalInvokes"
    | "releaseExternalOperationLease"
  >;
  adapter: DevOpsAdapter;
  projectId: InternalId;
  actorId: InternalId;
  workingDirectory: string;
  now?: () => string;
  ownerId?: string;
  leaseMs?: number;
  pollIntervalMs?: number;
}

export interface ExternalWorkerResult {
  reconciled: number;
  executed: number;
  recordedUnknown: number;
}

export interface ExternalWorkerLifecycle {
  running: boolean;
  stopped: boolean;
  ownerId: string;
}

const digest = (subject: string, value: string) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

const conclusionFor = (state: ExternalOperation["state"]): Reconciliation["conclusion"] => {
  if (state === "succeeded") return "confirmed_success";
  if (state === "failed") return "confirmed_failure";
  if (state === "not_found") return "not_found";
  return "still_unknown";
};

const unknownAdapterResult = (operation: ExternalOperation, summary: string): DevOpsAdapterResult => ({
  schema_version: SCHEMA_VERSION,
  operation_key: operation.operation_key,
  state: "unknown",
  log_reference: "file://logs/adapter-unknown.log",
  log_digest: digest("adapter_timeout", createHash("sha256").update(operation.id).digest("hex")),
  summary
});

const parseStoredResult = (lease: ExternalOperationLease): DevOpsAdapterResult | undefined => {
  if (!lease.adapter_result_json) return undefined;
  try {
    return JSON.parse(lease.adapter_result_json) as DevOpsAdapterResult;
  } catch {
    return undefined;
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ExternalDeliveryWorker {
  readonly #deps: ExternalWorkerDependencies;
  readonly #ownerId: string;
  readonly #leaseMs: number;
  readonly #pollIntervalMs: number;
  #running = false;
  #stopped = true;

  constructor(dependencies: ExternalWorkerDependencies) {
    this.#deps = dependencies;
    this.#ownerId = dependencies.ownerId ?? createInternalId();
    this.#leaseMs = dependencies.leaseMs ?? 30_000;
    this.#pollIntervalMs = dependencies.pollIntervalMs ?? 1_000;
  }

  lifecycle(): ExternalWorkerLifecycle {
    return { running: this.#running, stopped: this.#stopped, ownerId: this.#ownerId };
  }

  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#stopped = false;
    try {
      while (this.#running) {
        await this.recover();
        if (!this.#running) break;
        await sleep(this.#pollIntervalMs);
      }
    } finally {
      this.#running = false;
      this.#stopped = true;
    }
  }

  stop(): void {
    this.#running = false;
  }

  async recover(): Promise<ExternalWorkerResult> {
    const recordedUnknown = await this.#recordFinishedInvokes();
    const abandoned = await this.#escalateAbandonedInvokes();
    const reconciled = await this.#reconcileUnknown();
    const executed = await this.#executePending();
    return {
      reconciled,
      executed: executed.executed,
      recordedUnknown: recordedUnknown + abandoned + executed.recordedUnknown
    };
  }

  async #recordFinishedInvokes(): Promise<number> {
    let recordedUnknown = 0;
    for (const item of this.#deps.store.listInvokedUnrecordedOperations()) {
      const stored = parseStoredResult(item.lease);
      const result = stored ?? unknownAdapterResult(item.operation, "adapter result persisted but Kernel record failed");
      const recorded = this.#recordResult(item.operation, result);
      if ("code" in recorded) {
        const retried = this.#recordResult(item.operation, result);
        if ("code" in retried) {
          this.#command("RequestReconciliation", { operation_id: item.operation.id }, item.operation.change_id);
          recordedUnknown += 1;
          continue;
        }
      }
      if (result.state === "unknown") recordedUnknown += 1;
      this.#deps.store.releaseExternalOperationLease(item.operation.id);
    }
    return recordedUnknown;
  }

  async #escalateAbandonedInvokes(): Promise<number> {
    let recordedUnknown = 0;
    for (const item of this.#deps.store.listAbandonedExternalInvokes(this.#now())) {
      const result = unknownAdapterResult(
        item.operation,
        "worker crashed after claiming an external operation; result is unknown and must be reconciled"
      );
      this.#deps.store.markExternalOperationInvokeFinished(item.operation.id, item.lease.owner_id, this.#now(), result);
      const recorded = this.#recordResult(item.operation, result);
      if ("code" in recorded) {
        this.#command("RequestReconciliation", { operation_id: item.operation.id }, item.operation.change_id);
      }
      recordedUnknown += 1;
    }
    return recordedUnknown;
  }

  async #reconcileUnknown(): Promise<number> {
    const unknowns = this.#deps.store.transaction((transaction) => transaction.listUnknownExternalOperations());
    let reconciled = 0;
    for (const operation of unknowns) {
      const requested = this.#command("RequestReconciliation", { operation_id: operation.id }, operation.change_id);
      if ("code" in requested) continue;
      const result = await this.#invoke(operation, "reconcile");
      const recorded = this.#command(
        "RecordReconciliation",
        {
          operation_id: operation.id,
          conclusion: conclusionFor(result.state),
          summary: result.summary,
          ...(result.actual_digest ? { observed_digest: result.actual_digest } : {}),
          observed_state: result.state
        },
        operation.change_id
      );
      if (!("code" in recorded)) reconciled += 1;
    }
    return reconciled;
  }

  async #executePending(): Promise<{ executed: number; recordedUnknown: number }> {
    const pending = this.#deps.store.transaction((transaction) => this.#pendingOperations(transaction));
    let executed = 0;
    let recordedUnknown = 0;
    for (const operation of pending) {
      if (operation.operation_kind === "reconcile") continue;
      const existing = this.#deps.store.getExternalOperationLease(operation.id);
      if (existing?.invoke_started_at) continue;
      const claimed = this.#deps.store.claimExternalOperation({
        operationId: operation.id,
        ownerId: this.#ownerId,
        now: this.#now(),
        leaseUntil: this.#leaseUntil()
      });
      if (!claimed) continue;
      if (!this.#deps.store.markExternalOperationInvokeStarted(operation.id, this.#ownerId, this.#now())) {
        continue;
      }
      let result: DevOpsAdapterResult;
      try {
        result = await this.#invoke(operation, operation.operation_kind);
      } catch {
        result = unknownAdapterResult(operation, "adapter threw before a determinate result");
      }
      this.#deps.store.markExternalOperationInvokeFinished(operation.id, this.#ownerId, this.#now(), result);
      const recorded = this.#recordResult(operation, result);
      if ("code" in recorded) {
        const retried = this.#recordResult(operation, result);
        if ("code" in retried) {
          this.#command("RequestReconciliation", { operation_id: operation.id }, operation.change_id);
          recordedUnknown += 1;
          continue;
        }
      }
      this.#deps.store.releaseExternalOperationLease(operation.id);
      executed += 1;
      if (result.state === "unknown") recordedUnknown += 1;
    }
    return { executed, recordedUnknown };
  }

  #pendingOperations(transaction: { listExternalOperationsByChange(changeId: InternalId): ExternalOperation[] }): ExternalOperation[] {
    return this.#deps.store
      .listChanges()
      .flatMap((change) => transaction.listExternalOperationsByChange(change.id))
      .filter((item) => item.state === "pending");
  }

  async #invoke(operation: ExternalOperation, kind: ExternalOperation["operation_kind"]) {
    return this.#deps.adapter.execute({
      schema_version: SCHEMA_VERSION,
      operation_key: operation.id,
      operation_id: operation.id,
      operation: kind,
      environment_id: operation.environment_id,
      release_id: operation.release_id,
      artifact_digest: operation.artifact_digest,
      working_directory: this.#deps.workingDirectory,
      config_digest: digest(
        "devops_config",
        createHash("sha256").update(this.#deps.workingDirectory).digest("hex")
      ),
      input_reference: `cimi-object://operation/${operation.id}`
    });
  }

  #recordResult(operation: ExternalOperation, result: DevOpsAdapterResult): KernelResult {
    return this.#command(
      "RecordOperationResult",
      {
        operation_id: operation.id,
        operation_key: operation.operation_key,
        state: result.state,
        log_reference: result.log_reference,
        log_digest: result.log_digest,
        summary: result.summary,
        ...(result.actual_digest ? { actual_digest: result.actual_digest } : {}),
        ...(result.health ? { health: result.health } : {}),
        ...(result.core_path ? { core_path: result.core_path } : {})
      },
      operation.change_id
    );
  }

  #command(commandType: AnyCommand["command_type"], payload: Record<string, unknown>, changeId: InternalId): KernelResult {
    const change = this.#deps.kernel.getChange(changeId);
    if ("code" in change) return change;
    return this.#deps.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: commandType,
      requested_at: this.#now(),
      actor_id: this.#deps.actorId,
      project_id: this.#deps.projectId,
      expected_revision: change.revision,
      target: { object_type: "change" as const, id: changeId, domain_version: 1 },
      source: { origin: "system" as const, producer: "cimiloop-external-worker" },
      payload
    });
  }

  #now(): string {
    return this.#deps.now?.() ?? new Date().toISOString();
  }

  #leaseUntil(): string {
    return new Date(Date.parse(this.#now()) + this.#leaseMs).toISOString();
  }
}
