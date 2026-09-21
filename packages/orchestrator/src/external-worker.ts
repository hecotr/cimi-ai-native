import { createHash } from "node:crypto";
import type { DevOpsAdapter } from "@cimiloop/devops";
import type { KernelResult } from "@cimiloop/kernel";
import { isPolicyRevoked } from "@cimiloop/kernel";
import {
  SCHEMA_VERSION,
  createInternalId,
  type AnyCommand,
  type Change,
  type DevOpsAdapterResult,
  type DomainError,
  type Environment,
  type ExternalOperation,
  type InternalId,
  type Reconciliation
} from "@cimiloop/protocol";
import type { ExternalOperationLease, ProjectStore, RuntimeOwnershipState } from "@cimiloop/store";
import {
  AdapterResolutionError,
  adapterSecretsFor,
  type AdapterRegistry
} from "./adapter-resolver.js";

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
  adapter?: DevOpsAdapter;
  resolver?: AdapterRegistry;
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

const failedAdapterResult = (operation: ExternalOperation, summary: string): DevOpsAdapterResult => ({
  schema_version: SCHEMA_VERSION,
  operation_key: operation.operation_key,
  state: "failed",
  log_reference: "file://logs/adapter-blocked.log",
  log_digest: digest("adapter_blocked", createHash("sha256").update(operation.id).digest("hex")),
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
    if (!dependencies.adapter && !dependencies.resolver) {
      throw new Error("ADAPTER_RESOLVER_REQUIRED");
    }
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
    if (this.#ownership() !== "active") {
      return { reconciled: 0, executed: 0, recordedUnknown: 0 };
    }
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
    if (this.#policyRevoked() || this.#ownership() !== "active") return 0;
    const unknowns = this.#deps.store.transaction((transaction) => transaction.listUnknownExternalOperations());
    let reconciled = 0;
    for (const operation of unknowns) {
      const requested = this.#command("RequestReconciliation", { operation_id: operation.id }, operation.change_id);
      if ("code" in requested) continue;
      const invoked = await this.#invokeGuarded(operation, "reconcile");
      if (!invoked) continue;
      const recorded = this.#command(
        "RecordReconciliation",
        {
          operation_id: operation.id,
          conclusion: conclusionFor(invoked.state),
          summary: invoked.summary,
          ...(invoked.actual_digest ? { observed_digest: invoked.actual_digest } : {}),
          observed_state: invoked.state
        },
        operation.change_id
      );
      if (!("code" in recorded)) reconciled += 1;
    }
    return reconciled;
  }

  async #executePending(): Promise<{ executed: number; recordedUnknown: number }> {
    if (this.#ownership() !== "active") return { executed: 0, recordedUnknown: 0 };
    const pending = this.#deps.store.transaction((transaction) => this.#pendingOperations(transaction));
    let executed = 0;
    let recordedUnknown = 0;
    for (const operation of pending) {
      if (operation.operation_kind === "reconcile") continue;
      const existing = this.#deps.store.getExternalOperationLease(operation.id);
      if (existing?.invoke_started_at) continue;
      if (this.#ownership() !== "active") break;
      if (this.#policyRevoked()) {
        this.#blockPending(operation, "current Policy is revoked; pending operation was not invoked");
        continue;
      }
      const claimed = this.#deps.store.claimExternalOperation({
        operationId: operation.id,
        ownerId: this.#ownerId,
        now: this.#now(),
        leaseUntil: this.#leaseUntil()
      });
      if (!claimed) continue;
      if (this.#ownership() !== "active") {
        this.#deps.store.releaseExternalOperationLease(operation.id);
        break;
      }
      if (this.#policyRevoked()) {
        this.#blockPending(operation, "current Policy is revoked; pending operation was not invoked");
        this.#deps.store.releaseExternalOperationLease(operation.id);
        continue;
      }
      const resolved = this.#resolveAdapter(operation);
      if ("error" in resolved) {
        const result = failedAdapterResult(operation, resolved.error);
        this.#deps.store.markExternalOperationInvokeFinished(operation.id, this.#ownerId, this.#now(), result);
        this.#recordResult(operation, result);
        this.#deps.store.releaseExternalOperationLease(operation.id);
        continue;
      }
      if (!this.#deps.store.markExternalOperationInvokeStarted(operation.id, this.#ownerId, this.#now())) {
        continue;
      }
      if (this.#policyRevoked()) {
        const result = failedAdapterResult(
          operation,
          "Policy was revoked after claim; adapter was not invoked"
        );
        this.#deps.store.markExternalOperationInvokeFinished(operation.id, this.#ownerId, this.#now(), result);
        this.#recordResult(operation, result);
        this.#deps.store.releaseExternalOperationLease(operation.id);
        continue;
      }
      let result: DevOpsAdapterResult;
      try {
        result = await resolved.adapter.execute(
          {
            schema_version: SCHEMA_VERSION,
            operation_key: operation.id,
            operation_id: operation.id,
            operation: operation.operation_kind,
            environment_id: operation.environment_id,
            release_id: operation.release_id,
            artifact_digest: operation.artifact_digest,
            working_directory: this.#deps.workingDirectory,
            config_digest: digest(
              "devops_config",
              createHash("sha256").update(this.#deps.workingDirectory).digest("hex")
            ),
            input_reference: `cimi-object://operation/${operation.id}`
          },
          { secrets: resolved.secrets }
        );
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

  async #invokeGuarded(operation: ExternalOperation, kind: ExternalOperation["operation_kind"]) {
    if (this.#ownership() !== "active" || this.#policyRevoked()) return undefined;
    const resolved = this.#resolveAdapter(operation);
    if ("error" in resolved) {
      return failedAdapterResult(operation, resolved.error);
    }
    return resolved.adapter.execute(
      {
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
      },
      { secrets: resolved.secrets }
    );
  }

  #resolveAdapter(operation: ExternalOperation):
    | { adapter: DevOpsAdapter; secrets: Record<string, string> }
    | { error: string } {
    const environment = this.#deps.store.transaction((transaction) =>
      transaction.getEnvironment(operation.environment_id)
    );
    if (!environment) {
      return { error: "ADAPTER_REF_MISSING: Environment was not found for the operation" };
    }
    if (this.#deps.resolver) {
      try {
        const resolved = this.#deps.resolver.resolve(environment);
        return { adapter: resolved.adapter, secrets: adapterSecretsFor(environment, this.#deps.workingDirectory) };
      } catch (error) {
        const code = error instanceof AdapterResolutionError ? error.code : "ADAPTER_REF_INVALID";
        const message = error instanceof Error ? error.message : "adapter resolution failed";
        return { error: `${code}: ${message}` };
      }
    }
    if (this.#deps.adapter) {
      return { adapter: this.#deps.adapter, secrets: adapterSecretsFor(environment, this.#deps.workingDirectory) };
    }
    return { error: "ADAPTER_RESOLVER_REQUIRED: no adapter or resolver configured" };
  }

  #blockPending(operation: ExternalOperation, summary: string): void {
    const result = failedAdapterResult(operation, summary);
    this.#recordResult(operation, result);
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

  #ownership(): RuntimeOwnershipState {
    return this.#deps.store.transaction((transaction) => {
      const current = transaction.getCurrentProject();
      const projectId = current?.id ?? this.#deps.projectId;
      return transaction.getProjectRuntimeOwnership(projectId)?.ownership ?? "active";
    });
  }

  #policyRevoked(): boolean {
    const snapshot = this.#deps.store.transaction((transaction) =>
      transaction.getLatestPolicySnapshot(this.#deps.projectId)
    );
    return isPolicyRevoked(snapshot);
  }

  #now(): string {
    return this.#deps.now?.() ?? new Date().toISOString();
  }

  #leaseUntil(): string {
    return new Date(Date.parse(this.#now()) + this.#leaseMs).toISOString();
  }
}

export type { Environment };
