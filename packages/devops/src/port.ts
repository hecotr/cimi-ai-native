import type { DevOpsAdapterInput, DevOpsAdapterResult } from "@cimiloop/protocol";

export interface DevOpsExecuteOptions {
  secrets?: Record<string, string>;
  secretNames?: readonly string[];
  timeoutMs?: number;
}

export interface DevOpsAdapter {
  execute(input: DevOpsAdapterInput, options?: DevOpsExecuteOptions): Promise<DevOpsAdapterResult>;
}
