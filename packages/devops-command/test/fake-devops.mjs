import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const operationIndex = args.indexOf("--operation");
const operation = operationIndex >= 0 ? args[operationIndex + 1] : "unknown";
const keyIndex = args.indexOf("--operation-key");
const operationKey = keyIndex >= 0 ? args[keyIndex + 1] : "";
const behavior = process.env.CIMILOOP_FAKE_DEVOPS ?? "ok";

const digest = {
  algorithm: "sha256",
  value: "b".repeat(64),
  subject: "artifact"
};

if (behavior === "hang") {
  setInterval(() => undefined, 60_000);
} else if (behavior === "malformed") {
  process.stdout.write("not-json\n");
  process.exit(0);
} else if (behavior === "signal") {
  process.exit(143);
} else {
  if (process.env.CIMILOOP_DEVOPS_SECRET) {
    process.stdout.write(`leaked=${process.env.CIMILOOP_DEVOPS_SECRET}\n`);
  }
  process.stdout.write(
    JSON.stringify({
      schema_version: "1.0.0",
      operation_key: operationKey,
      state: "succeeded",
      actual_digest: digest,
      health: operation === "verify" || operation === "status" ? "healthy" : undefined,
      core_path: operation === "verify" ? "pass" : undefined,
      summary: `${operation} completed`
    })
  );
  process.stdout.write("\n");
  if (process.env.CIMILOOP_RESULT_PATH) {
    writeFileSync(process.env.CIMILOOP_RESULT_PATH, `${operation}:${operationKey}`);
  }
  process.exit(0);
}
