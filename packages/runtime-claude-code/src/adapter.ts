import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SCHEMA_VERSION, createInternalId, type Blocker, type Digest, type Failure } from "@cimiloop/protocol";
import type {
  RuntimeAdapter,
  RuntimeAdapterConfig,
  RuntimeRunOptions,
  RuntimeRunRequest,
  RuntimeRunResult,
  RuntimeSession,
  RuntimeUnknownReason
} from "@cimiloop/runtime";
import { parseRuntimeResultFile, redactSecrets } from "./parser.js";
import { startManagedProcess } from "./process.js";

const reasonCode = (reason: RuntimeUnknownReason): string => {
  switch (reason) {
    case "timeout":
      return "RUNTIME_TIMEOUT";
    case "cancelled":
      return "RUNTIME_CANCELLED";
    case "signal":
      return "RUNTIME_SIGNAL";
    case "invalid_output":
      return "RUNTIME_INVALID_OUTPUT";
  }
};

const digestOf = (bytes: Buffer, subject: string): Digest => ({
  algorithm: "sha256",
  value: createHash("sha256").update(bytes).digest("hex"),
  subject
});

const unknownResult = (input: {
  reason: RuntimeUnknownReason;
  request: RuntimeRunRequest;
  logPath: string;
  logReference: string;
  logDigest: Digest;
}): RuntimeRunResult => {
  const now = new Date().toISOString();
  const code = reasonCode(input.reason);
  const failure: Failure = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: input.request.workItem.project_id,
    change_id: input.request.workItem.change_id,
    work_item_id: input.request.workItem.id,
    code,
    summary: `Runtime process result is unknown: ${input.reason}`,
    details_reference: input.logReference,
    created_at: now
  };
  const blocker: Blocker = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: input.request.workItem.project_id,
    change_id: input.request.workItem.change_id,
    work_item_id: input.request.workItem.id,
    code,
    summary: `Runtime process result is unknown: ${input.reason}`,
    status: "open",
    resolution_condition: "reconcile the runtime process before retrying",
    created_at: now,
    updated_at: now,
    revision: 1
  };
  return {
    kind: "unknown",
    reason: input.reason,
    logPath: input.logPath,
    logReference: input.logReference,
    logDigest: input.logDigest,
    failure,
    blocker
  };
};

const hostEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const key of ["SYSTEMROOT", "WINDIR", "TEMP", "TMP"] as const) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
};

export class ClaudeCodeRuntimeAdapter implements RuntimeAdapter {
  readonly #config: RuntimeAdapterConfig;

  constructor(config: RuntimeAdapterConfig) {
    this.#config = config;
  }

  async start(request: RuntimeRunRequest, options?: RuntimeRunOptions): Promise<RuntimeSession> {
    mkdirSync(this.#config.logDirectory, { recursive: true });
    const token = createInternalId();
    const logPath = join(this.#config.logDirectory, `${token}.log`);
    const resultPath = join(this.#config.logDirectory, `${token}.result.json`);
    const secretValues = (this.#config.secretNames ?? [])
      .map((name) => this.#config.env?.[name])
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const env: NodeJS.ProcessEnv = {
      ...hostEnv(),
      ...this.#config.env,
      CIMILOOP_RESULT_PATH: resultPath,
      CIMILOOP_CONTEXT_MANIFEST: request.contextManifestPath,
      CIMILOOP_WORKTREE: request.worktreePath,
      CIMILOOP_WORK_ITEM_ID: request.workItem.id
    };
    const managed = startManagedProcess({
      executable: this.#config.executable,
      cwd: request.worktreePath,
      env,
      logPath,
      redact: (chunk) => redactSecrets(chunk, secretValues)
    });

    let outcome: RuntimeUnknownReason | undefined;
    const timeoutMs = options?.timeoutMs ?? this.#config.timeoutMs;
    const timeout = setTimeout(() => {
      if (outcome === undefined) {
        outcome = "timeout";
        void managed.signal("SIGTERM");
      }
    }, timeoutMs);
    if (options?.cancelAfterMs !== undefined) {
      setTimeout(() => {
        if (outcome === undefined) {
          outcome = "cancelled";
          void managed.cancel();
        }
      }, options.cancelAfterMs);
    }

    const wait = async (): Promise<RuntimeRunResult> => {
      const exit = await managed.wait();
      clearTimeout(timeout);
      const logBytes = readFileSync(logPath);
      const logDigest = digestOf(logBytes, "runtime_log");
      const logReference = pathToFileURL(logPath).href;
      if (outcome !== undefined) {
        return unknownResult({ reason: outcome, request, logPath, logReference, logDigest });
      }
      let resultContents: string | undefined;
      try {
        resultContents = readFileSync(resultPath, "utf8");
      } catch {
        resultContents = undefined;
      }
      const parsed = parseRuntimeResultFile(resultContents);
      if (parsed.kind === "invalid") {
        return unknownResult({
          reason: "invalid_output",
          request,
          logPath,
          logReference,
          logDigest
        });
      }
      if (exit.exitCode === null) {
        return unknownResult({ reason: "signal", request, logPath, logReference, logDigest });
      }
      return {
        kind: "exited",
        exitCode: exit.exitCode,
        businessSuccess: false,
        logPath,
        logReference,
        logDigest
      };
    };

    return {
      processReference: managed.processReference,
      heartbeat: async () => managed.heartbeat(),
      cancel: async () => {
        if (outcome === undefined) outcome = "cancelled";
        await managed.cancel();
      },
      signal: async (name) => {
        if (outcome === undefined) outcome = "signal";
        await managed.signal(name);
      },
      wait
    };
  }

  async run(request: RuntimeRunRequest, options?: RuntimeRunOptions): Promise<RuntimeRunResult> {
    const session = await this.start(request, options);
    return session.wait();
  }
}
