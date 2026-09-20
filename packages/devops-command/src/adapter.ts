import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  compileValidator,
  DevOpsAdapterInputSchema,
  SCHEMA_VERSION,
  type DevOpsAdapterInput,
  type DevOpsAdapterResult,
  type Digest
} from "@cimiloop/protocol";

const parseDevOpsAdapterInput = compileValidator<DevOpsAdapterInput>(DevOpsAdapterInputSchema);
import {
  parseDevOpsCommandConfig,
  parseDevOpsScriptResult,
  redactSecrets,
  type DevOpsAdapter,
  type DevOpsCommandConfig,
  type DevOpsExecuteOptions
} from "@cimiloop/devops";
import { runDevOpsProcess } from "./process.js";

const digestOf = (bytes: Buffer | string, subject: string): Digest => ({
  algorithm: "sha256",
  value: createHash("sha256").update(bytes).digest("hex"),
  subject
});

const lastJsonObject = (stdout: string): unknown => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"));
  const last = lines.at(-1);
  if (!last) return undefined;
  try {
    return JSON.parse(last) as unknown;
  } catch {
    return undefined;
  }
};

const unknownResult = (
  input: DevOpsAdapterInput,
  logReference: string,
  logDigest: Digest,
  summary: string
): DevOpsAdapterResult => ({
  schema_version: SCHEMA_VERSION,
  operation_key: input.operation_key,
  state: "unknown",
  log_reference: logReference,
  log_digest: logDigest,
  summary
});

export class CommandDevOpsAdapter implements DevOpsAdapter {
  readonly #config: DevOpsCommandConfig;

  constructor(config: unknown) {
    this.#config = parseDevOpsCommandConfig(config);
  }

  async execute(rawInput: unknown, options: DevOpsExecuteOptions = {}): Promise<DevOpsAdapterResult> {
    const input = parseDevOpsAdapterInput(rawInput);
    mkdirSync(this.#config.log_directory, { recursive: true });
    const logPath = join(this.#config.log_directory, `${input.operation_key.replaceAll(/[^a-z0-9._-]/gi, "_")}.log`);
    const inputPath = join(this.#config.log_directory, `${input.operation_key.replaceAll(/[^a-z0-9._-]/gi, "_")}.input.json`);
    writeFileSync(inputPath, JSON.stringify(input));
    const secretNames = options.secretNames ?? [];
    const secretValues = secretNames
      .map((name) => options.secrets?.[name])
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const operationArgs = this.#config.operations[input.operation].args;
    const exit = await runDevOpsProcess({
      executable: this.#config.executable,
      args: [
        ...this.#config.args,
        ...operationArgs,
        "--operation-key",
        input.operation_key,
        "--input",
        inputPath
      ],
      cwd: input.working_directory || this.#config.working_directory,
      env: {
        ...process.env,
        ...(options.secrets ?? {}),
        CIMILOOP_OPERATION_KEY: input.operation_key
      },
      logPath,
      timeoutMs: options.timeoutMs ?? this.#config.timeout_ms,
      redact: (chunk) => redactSecrets(chunk, secretValues)
    });
    const logDigest = digestOf(redactSecrets(exit.stdout, secretValues), "devops_log");
    const logReference = pathToFileURL(logPath).href;
    if (exit.timedOut) {
      return unknownResult(input, logReference, logDigest, "adapter timeout before a schema-validated result");
    }
    if (exit.signal !== null || exit.exitCode === 143) {
      return unknownResult(input, logReference, logDigest, `adapter terminated by signal ${exit.signal ?? "SIGTERM"}`);
    }
    try {
      const script = parseDevOpsScriptResult(lastJsonObject(exit.stdout));
      if (script.operation_key !== input.operation_key) {
        return unknownResult(input, logReference, logDigest, "adapter result operation key mismatch");
      }
      return {
        schema_version: SCHEMA_VERSION,
        operation_key: script.operation_key,
        state: script.state,
        ...(script.actual_digest ? { actual_digest: script.actual_digest } : {}),
        ...(script.health ? { health: script.health } : {}),
        ...(script.core_path ? { core_path: script.core_path } : {}),
        log_reference: logReference,
        log_digest: logDigest,
        summary: script.summary
      };
    } catch {
      return unknownResult(input, logReference, logDigest, "malformed adapter JSON result");
    }
  }
}
