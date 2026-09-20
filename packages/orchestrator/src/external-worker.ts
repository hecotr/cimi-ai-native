import { createHash } from "node:crypto";
import type { DevOpsAdapter } from "@cimiloop/devops";
import type { KernelResult } from "@cimiloop/kernel";
import {
  SCHEMA_VERSION,
  createInternalId,
  type AnyCommand,
  type Change,
  type DomainError,
  type ExternalOperation,
  type InternalId,
  type Reconciliation
} from "@cimiloop/protocol";
import type { ProjectStore, StoreTransaction } from "@cimiloop/store";

export interface ExternalWorkerKernel {
  execute(input: unknown): KernelResult;
  getChange(idOrKey: string): Change | DomainError;
}

export interface ExternalWorkerDependencies {
  kernel: ExternalWorkerKernel;
  store: Pick<ProjectStore, "transaction" | "listChanges">;
  adapter: DevOpsAdapter;
  projectId: InternalId;
  actorId: InternalId;
  workingDirectory: string;
  now?: () => string;
}

export interface ExternalWorkerResult {
  reconciled: number;
  executed: number;
  recordedUnknown: number;
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

export class ExternalDeliveryWorker {
  readonly #deps: ExternalWorkerDependencies;

  constructor(dependencies: ExternalWorkerDependencies) {
    this.#deps = dependencies;
  }

  async recover(): Promise<ExternalWorkerResult> {
    const reconciled = await this.#reconcileUnknown();
    const executed = await this.#executePending();
    return { reconciled, executed: executed.executed, recordedUnknown: executed.recordedUnknown };
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
      let result;
      try {
        result = await this.#invoke(operation, operation.operation_kind);
      } catch {
        result = {
          schema_version: SCHEMA_VERSION,
          operation_key: operation.operation_key,
          state: "unknown" as const,
          log_reference: "file://logs/adapter-timeout.log",
          log_digest: digest("adapter_timeout", createHash("sha256").update(operation.operation_key).digest("hex")),
          summary: "adapter threw before a determinate result"
        };
      }
      const recorded = this.#command(
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
      if ("code" in recorded) continue;
      executed += 1;
      if (result.state === "unknown") recordedUnknown += 1;
    }
    return { executed, recordedUnknown };
  }

  #pendingOperations(transaction: StoreTransaction): ExternalOperation[] {
    return this.#deps.store
      .listChanges()
      .flatMap((change) => transaction.listExternalOperationsByChange(change.id))
      .filter((item) => item.state === "pending");
  }

  async #invoke(operation: ExternalOperation, kind: ExternalOperation["operation_kind"]) {
    return this.#deps.adapter.execute({
      schema_version: SCHEMA_VERSION,
      operation_key: operation.operation_key,
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

  #command(commandType: AnyCommand["command_type"], payload: Record<string, unknown>, changeId: InternalId): KernelResult {
    const change = this.#deps.kernel.getChange(changeId);
    if ("code" in change) return change;
    return this.#deps.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: commandType,
      requested_at: this.#deps.now?.() ?? new Date().toISOString(),
      actor_id: this.#deps.actorId,
      project_id: this.#deps.projectId,
      expected_revision: change.revision,
      target: { object_type: "change" as const, id: changeId, domain_version: 1 },
      source: { origin: "system" as const, producer: "cimiloop-external-worker" },
      payload
    });
  }
}
