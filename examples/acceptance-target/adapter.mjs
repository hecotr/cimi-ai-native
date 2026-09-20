import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const operation = valueAfter("--operation");
const operationKey = valueAfter("--operation-key") ?? "";
const inputPath = valueAfter("--input");
const root = process.env.CIMILOOP_ACCEPTANCE_ROOT;
const target = process.env.CIMILOOP_ACCEPTANCE_TARGET === "prod" ? "prod" : "test";
const fault = process.env.CIMILOOP_ACCEPTANCE_FAULT ?? "";

if (!root || !operation || !inputPath) {
  process.stderr.write("acceptance adapter requires root, operation and input\n");
  process.exit(2);
}

const input = JSON.parse(readFileSync(inputPath, "utf8"));
const requestedDigest = String(input.artifact_digest?.value ?? "");
const envDir = join(root, "envs", target);
const currentPath = join(envDir, "CURRENT");
const previousPath = join(envDir, "PREVIOUS");
const healthPath = join(envDir, "HEALTH");
const releaseDir = (digest) => join(envDir, "releases", digest);
const artifactDir = (digest) => join(root, "artifacts", digest);
const operationPath = join(root, "operations", `${operationKey.replaceAll(/[^a-z0-9._-]/gi, "_")}.json`);

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
};

const emit = (result) => {
  writeJson(operationPath, { ...result, target, operation, operation_key: operationKey });
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

const hang = () => {
  setInterval(() => undefined, 60_000);
};

const digestObject = (value) => ({
  algorithm: "sha256",
  value,
  subject: "artifact"
});

const otherArtifact = (requested) =>
  readdirSync(join(root, "artifacts")).find((digest) => digest !== requested) ?? requested;

const copyArtifact = (digest) => {
  const source = join(artifactDir(digest), "payload.txt");
  if (!existsSync(source)) {
    throw new Error(`artifact ${digest} is not present`);
  }
  const destinationDir = releaseDir(digest);
  mkdirSync(destinationDir, { recursive: true });
  copyFileSync(source, join(destinationDir, "payload.txt"));
};

const readCurrent = () => (existsSync(currentPath) ? readFileSync(currentPath, "utf8").trim() : "");
const readHealth = () => (existsSync(healthPath) ? readFileSync(healthPath, "utf8").trim() : "healthy");

const switchCurrent = (digest) => {
  mkdirSync(envDir, { recursive: true });
  const current = readCurrent();
  if (current && current !== digest) {
    writeFileSync(previousPath, `${current}\n`);
  }
  writeFileSync(currentPath, `${digest}\n`);
};

const statusOf = (digest) => {
  const health = readHealth();
  const matches = digest !== "" && digest === requestedDigest;
  const healthy = health === "healthy";
  return {
    actual: digest || undefined,
    health: digest ? (healthy ? "healthy" : "unhealthy") : "unknown",
    core_path: digest ? (healthy && matches ? "pass" : "fail") : "unknown"
  };
};

try {
  if (operation === "deploy" && fault === "timeout-before-effect") {
    hang();
  } else if (operation === "build") {
    if (!existsSync(join(artifactDir(requestedDigest), "payload.txt"))) {
      throw new Error("build artifact missing");
    }
    emit({
      schema_version: "1.0.0",
      operation_key: operationKey,
      state: "succeeded",
      actual_digest: digestObject(requestedDigest),
      summary: "artifact is present"
    });
  } else if (operation === "deploy") {
    const installed = fault === "wrong-digest" ? otherArtifact(requestedDigest) : requestedDigest;
    copyArtifact(installed);
    switchCurrent(installed);
    writeFileSync(healthPath, fault === "health-failure" ? "unhealthy\n" : "healthy\n");
    if (fault === "timeout-after-effect") {
      hang();
    } else {
      emit({
        schema_version: "1.0.0",
        operation_key: operationKey,
        state: "succeeded",
        actual_digest: digestObject(installed),
        summary: `deployed ${installed} to ${target}`
      });
    }
  } else if (operation === "status" || operation === "verify") {
    const current = readCurrent();
    const status = statusOf(current);
    const failed = operation === "verify" && (status.health !== "healthy" || status.core_path !== "pass");
    emit({
      schema_version: "1.0.0",
      operation_key: operationKey,
      state: failed ? "failed" : "succeeded",
      ...(status.actual ? { actual_digest: digestObject(status.actual) } : {}),
      health: status.health,
      core_path: status.core_path,
      summary: failed ? `${operation} failed for ${target}` : `${operation} succeeded for ${target}`
    });
  } else if (operation === "recover") {
    copyArtifact(requestedDigest);
    switchCurrent(requestedDigest);
    writeFileSync(healthPath, "healthy\n");
    emit({
      schema_version: "1.0.0",
      operation_key: operationKey,
      state: "succeeded",
      actual_digest: digestObject(requestedDigest),
      summary: `recovered ${requestedDigest} on ${target}`
    });
  } else if (operation === "reconcile") {
    const recorded = existsSync(operationPath) ? JSON.parse(readFileSync(operationPath, "utf8")) : undefined;
    const current = readCurrent();
    emit({
      schema_version: "1.0.0",
      operation_key: operationKey,
      state: recorded || current ? "succeeded" : "not_found",
      ...(current ? { actual_digest: digestObject(current) } : {}),
      summary: recorded ? "reconciled recorded operation" : current ? "reconciled current digest" : "operation not found"
    });
  } else {
    throw new Error(`unsupported operation ${operation}`);
  }
} catch (error) {
  emit({
    schema_version: "1.0.0",
    operation_key: operationKey,
    state: "failed",
    summary: error instanceof Error ? error.message : "acceptance adapter failed"
  });
}
