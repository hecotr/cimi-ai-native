import { createHash } from "node:crypto";
import { SCHEMA_VERSION, type DevOpsAdapterInput, type DevOpsAdapterResult } from "@cimiloop/protocol";
import type { DevOpsAdapter, DevOpsExecuteOptions } from "./port.js";

const digest = (subject: string, value: string) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

export type DeterministicAdapterBehavior = (
  input: DevOpsAdapterInput
) => DevOpsAdapterResult | "throw";

const defaultSuccess = (input: DevOpsAdapterInput): DevOpsAdapterResult => ({
  schema_version: SCHEMA_VERSION,
  operation_key: input.operation_key,
  state: "succeeded",
  actual_digest: input.artifact_digest,
  health: "healthy",
  core_path: "pass",
  log_reference: `file://logs/${input.operation_id}.log`,
  log_digest: digest("operation_log", createHash("sha256").update(input.operation_id).digest("hex")),
  summary: `${input.operation} succeeded`
});

export class DeterministicDevOpsAdapter implements DevOpsAdapter {
  readonly calls: DevOpsAdapterInput[] = [];
  readonly #replay = new Map<string, DevOpsAdapterResult>();
  readonly #behavior: DeterministicAdapterBehavior;

  constructor(behavior?: DeterministicAdapterBehavior) {
    this.#behavior = behavior ?? defaultSuccess;
  }

  async execute(input: DevOpsAdapterInput, _options?: DevOpsExecuteOptions): Promise<DevOpsAdapterResult> {
    this.calls.push(input);
    const replayed = this.#replay.get(input.operation_id);
    if (replayed) return replayed;
    const result = this.#behavior(input);
    if (result === "throw") {
      throw new Error("adapter threw before a determinate result");
    }
    this.#replay.set(input.operation_id, result);
    return result;
  }
}
