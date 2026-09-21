import { existsSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CommandDevOpsAdapter } from "@cimiloop/devops-command";
import { DeterministicDevOpsAdapter, type DevOpsAdapter } from "@cimiloop/devops";
import { SCHEMA_VERSION, type Environment } from "@cimiloop/protocol";

export type AdapterResolutionErrorCode =
  | "ADAPTER_REF_MISSING"
  | "ADAPTER_REF_UNKNOWN"
  | "ADAPTER_REF_INVALID"
  | "ADAPTER_REF_FORBIDDEN"
  | "ADAPTER_REF_NOT_FOUND"
  | "ADAPTER_REF_ESCAPE";

export class AdapterResolutionError extends Error {
  constructor(
    readonly code: AdapterResolutionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AdapterResolutionError";
  }
}

export interface AdapterResolverOptions {
  projectRepositoryPath: string;
  workingDirectory: string;
  allowedRoots?: readonly string[];
  logDirectory?: string;
  allowTestDeterministic?: boolean;
}

export interface ResolvedAdapter {
  adapter: DevOpsAdapter;
  kind: "command" | "deterministic";
  scriptPath?: string;
}

const TEST_ONLY_REFS = new Set([
  "cimi-adapter://deterministic",
  "cimi-adapter://test-deterministic"
]);

const isUnc = (value: string): boolean => {
  const normalized = value.replaceAll("/", "\\");
  return normalized.startsWith("\\\\") || /^[\\/]{2}[^\\/]/.test(value);
};

const insideRoot = (root: string, candidate: string): boolean => {
  const cmpRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const cmpCandidate = process.platform === "win32" ? candidate.toLowerCase() : candidate;
  const prefix = cmpRoot.endsWith(sep) ? cmpRoot : cmpRoot + sep;
  return cmpCandidate === cmpRoot || cmpCandidate.startsWith(prefix);
};

const packageRepoRoot = (): string => fileURLToPath(new URL("../../..", import.meta.url));

const collectAllowedRoots = (options: AdapterResolverOptions): string[] => {
  const extra = (process.env.CIMILOOP_ADAPTER_ROOT ?? "")
    .split(delimiter)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [
    options.projectRepositoryPath,
    options.workingDirectory,
    packageRepoRoot(),
    ...extra,
    ...(options.allowedRoots ?? [])
  ]
    .filter((item) => item.length > 0)
    .map((item) => resolve(item));
};

const realExisting = (path: string): string | undefined => {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
};

const resolveUnderRoots = (candidate: string, roots: readonly string[]): string => {
  if (isUnc(candidate)) {
    throw new AdapterResolutionError("ADAPTER_REF_ESCAPE", "UNC adapter paths are not allowed");
  }
  const absolute = isAbsolute(candidate) ? resolve(candidate) : undefined;
  const attempts = [
    ...(absolute ? [absolute] : []),
    ...roots.map((root) => resolve(root, candidate))
  ];
  for (const attempt of attempts) {
    const real = realExisting(attempt);
    if (!real) continue;
    if (isUnc(real)) {
      throw new AdapterResolutionError("ADAPTER_REF_ESCAPE", "UNC adapter paths are not allowed");
    }
    if (!roots.some((root) => {
      const realRoot = realExisting(root);
      return realRoot ? insideRoot(realRoot, real) : false;
    })) {
      continue;
    }
    const stats = statSync(real);
    if (stats.isDirectory()) {
      const script = join(real, "adapter.mjs");
      const scriptReal = realExisting(script);
      if (!scriptReal) {
        throw new AdapterResolutionError("ADAPTER_REF_NOT_FOUND", "adapter directory is missing adapter.mjs");
      }
      if (!insideRoot(real, scriptReal)) {
        throw new AdapterResolutionError("ADAPTER_REF_ESCAPE", "adapter.mjs escaped its directory");
      }
      return scriptReal;
    }
    return real;
  }
  throw new AdapterResolutionError("ADAPTER_REF_NOT_FOUND", "adapter script is not inside an authorized root");
};

const parseFileRef = (adapterRef: string): string => {
  const raw = adapterRef.slice("file:".length).replace(/^\/\//, "");
  if (raw.startsWith("localhost/") || raw.startsWith("127.0.0.1/")) {
    return raw.replace(/^[^/]+\//, "/");
  }
  if (/^[a-zA-Z]\//.test(raw) && raw.includes(":")) {
    try {
      return fileURLToPath(adapterRef);
    } catch {
      return decodeURIComponent(raw);
    }
  }
  if (isUnc(raw) || raw.startsWith("//") || raw.startsWith("\\\\")) {
    throw new AdapterResolutionError("ADAPTER_REF_ESCAPE", "UNC adapter paths are not allowed");
  }
  try {
    if (adapterRef.startsWith("file:///") || /^file:\/\/[a-zA-Z]:/.test(adapterRef)) {
      return fileURLToPath(adapterRef);
    }
  } catch {
    // relative file refs such as file://examples/acceptance-target
  }
  return decodeURIComponent(raw.replace(/^\/*/, ""));
};

const commandConfig = (scriptPath: string, options: AdapterResolverOptions) => {
  const executable = /\s/.test(process.execPath) ? "node" : process.execPath;
  const operation = (name: string) => ({ args: ["--operation", name] });
  return {
    schema_version: SCHEMA_VERSION,
    executable,
    args: [scriptPath],
    working_directory: options.workingDirectory,
    log_directory: options.logDirectory ?? join(options.workingDirectory, ".cimiloop", "adapter-logs"),
    timeout_ms: 30_000,
    operations: {
      build: operation("build"),
      deploy: operation("deploy"),
      status: operation("status"),
      verify: operation("verify"),
      recover: operation("recover"),
      reconcile: operation("reconcile")
    }
  };
};

export class AdapterRegistry {
  readonly #options: AdapterResolverOptions;
  readonly #cache = new Map<string, ResolvedAdapter>();

  constructor(options: AdapterResolverOptions) {
    this.#options = options;
  }

  resolve(environment: Pick<Environment, "adapter_ref" | "kind">): ResolvedAdapter {
    const adapterRef = environment.adapter_ref?.trim();
    if (!adapterRef) {
      throw new AdapterResolutionError("ADAPTER_REF_MISSING", "Environment.adapter_ref is required");
    }
    const cacheKey = `${environment.kind}:${adapterRef}`;
    const cached = this.#cache.get(cacheKey);
    if (cached) return cached;
    const resolved = this.#resolve(adapterRef, environment.kind);
    this.#cache.set(cacheKey, resolved);
    return resolved;
  }

  #resolve(adapterRef: string, kind: Environment["kind"]): ResolvedAdapter {
    if (TEST_ONLY_REFS.has(adapterRef)) {
      if (kind === "production") {
        throw new AdapterResolutionError(
          "ADAPTER_REF_FORBIDDEN",
          "production environment cannot use a test-only deterministic adapter"
        );
      }
      if (!this.#options.allowTestDeterministic && process.env.CIMILOOP_ALLOW_TEST_ADAPTER !== "1") {
        throw new AdapterResolutionError(
          "ADAPTER_REF_FORBIDDEN",
          "deterministic adapter is test-only and must be explicitly allowed"
        );
      }
      return { adapter: new DeterministicDevOpsAdapter(), kind: "deterministic" };
    }
    if (adapterRef.startsWith("cimi-adapter://command")) {
      const url = new URL(adapterRef);
      const script = url.searchParams.get("script");
      if (!script) {
        throw new AdapterResolutionError("ADAPTER_REF_INVALID", "cimi-adapter://command requires script=");
      }
      const scriptPath = resolveUnderRoots(script, collectAllowedRoots(this.#options));
      return {
        adapter: new CommandDevOpsAdapter(commandConfig(scriptPath, this.#options)),
        kind: "command",
        scriptPath
      };
    }
    if (adapterRef.startsWith("cimi-adapter://")) {
      throw new AdapterResolutionError("ADAPTER_REF_UNKNOWN", `unsupported adapter reference ${adapterRef}`);
    }
    if (adapterRef.startsWith("file:")) {
      const parsed = parseFileRef(adapterRef);
      if (parsed.includes("..") || relative(".", parsed).startsWith("..")) {
        const roots = collectAllowedRoots(this.#options);
        const scriptPath = resolveUnderRoots(parsed, roots);
        return {
          adapter: new CommandDevOpsAdapter(commandConfig(scriptPath, this.#options)),
          kind: "command",
          scriptPath
        };
      }
      const scriptPath = resolveUnderRoots(parsed, collectAllowedRoots(this.#options));
      return {
        adapter: new CommandDevOpsAdapter(commandConfig(scriptPath, this.#options)),
        kind: "command",
        scriptPath
      };
    }
    throw new AdapterResolutionError("ADAPTER_REF_UNKNOWN", `unsupported adapter reference ${adapterRef}`);
  }
}

export const createProductAdapterResolver = (options: AdapterResolverOptions): AdapterRegistry =>
  new AdapterRegistry(options);

export const adapterSecretsFor = (
  environment: Pick<Environment, "kind">,
  workingDirectory: string
): Record<string, string> => ({
  CIMILOOP_ACCEPTANCE_ROOT: process.env.CIMILOOP_ACCEPTANCE_ROOT ?? workingDirectory,
  CIMILOOP_ACCEPTANCE_TARGET: environment.kind === "production" ? "prod" : "test"
});
