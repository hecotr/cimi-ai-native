import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CIMILOOP_ACCEPTANCE_ROOT;
const portFile = process.env.CIMILOOP_ACCEPTANCE_PORT_FILE;
if (!root || !portFile) {
  process.stderr.write("acceptance server requires CIMILOOP_ACCEPTANCE_ROOT and CIMILOOP_ACCEPTANCE_PORT_FILE\n");
  process.exit(2);
}

const readTarget = (target) => {
  const envDir = join(root, "envs", target === "prod" ? "prod" : "test");
  const digest = existsSync(join(envDir, "CURRENT")) ? readFileSync(join(envDir, "CURRENT"), "utf8").trim() : "";
  const health = existsSync(join(envDir, "HEALTH")) ? readFileSync(join(envDir, "HEALTH"), "utf8").trim() : "unknown";
  const payload = digest && existsSync(join(envDir, "releases", digest, "payload.txt"));
  return {
    digest,
    health: digest ? health : "unknown",
    core_path: digest && health === "healthy" && payload ? "pass" : digest ? "fail" : "unknown"
  };
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const target = url.searchParams.get("target") ?? "test";
  const status = readTarget(target);
  const body = JSON.stringify(status);
  response.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address === null || typeof address === "string") {
    process.exit(2);
  }
  writeFileSync(portFile, `${address.port}\n`);
});
