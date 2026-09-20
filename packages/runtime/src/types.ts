import type { Blocker, CapabilityBinding, Digest, Failure, WorkItem } from "@cimiloop/protocol";

export interface RuntimeRunRequest {
  workItem: WorkItem;
  contextManifestPath: string;
  worktreePath: string;
  binding: CapabilityBinding;
}

export interface RuntimeAdapterConfig {
  executable: string;
  logDirectory: string;
  env?: Record<string, string>;
  secretNames?: string[];
  timeoutMs: number;
}

export interface RuntimeRunOptions {
  cancelAfterMs?: number;
  timeoutMs?: number;
}

export interface RuntimeHeartbeat {
  running: boolean;
  pid?: number;
}

export type RuntimeUnknownReason = "timeout" | "cancelled" | "invalid_output" | "signal";

export type RuntimeRunResult =
  | {
      kind: "exited";
      exitCode: number;
      signal?: string;
      businessSuccess: false;
      logPath: string;
      logReference: string;
      logDigest: Digest;
    }
  | {
      kind: "unknown";
      reason: RuntimeUnknownReason;
      logPath: string;
      logReference: string;
      logDigest: Digest;
      failure: Failure;
      blocker: Blocker;
    };

export interface RuntimeSession {
  processReference: string;
  heartbeat(): Promise<RuntimeHeartbeat>;
  cancel(): Promise<void>;
  signal(name: NodeJS.Signals): Promise<void>;
  wait(): Promise<RuntimeRunResult>;
}

export interface RuntimeAdapter {
  start(request: RuntimeRunRequest, options?: RuntimeRunOptions): Promise<RuntimeSession>;
  run(request: RuntimeRunRequest, options?: RuntimeRunOptions): Promise<RuntimeRunResult>;
}
