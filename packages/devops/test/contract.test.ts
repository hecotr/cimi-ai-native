import { describe, expect, it } from "vitest";
import { parseDevOpsCommandConfig } from "../src/index.js";

const validConfig = () => ({
  schema_version: "1.0.0",
  executable: "C:/tools/devops-adapter.mjs",
  args: ["--project", "acceptance"],
  working_directory: "examples/acceptance-target",
  log_directory: "var/devops-logs",
  timeout_ms: 5_000,
  operations: {
    build: { args: ["--operation", "build"] },
    deploy: { args: ["--operation", "deploy"] },
    status: { args: ["--operation", "status"] },
    verify: { args: ["--operation", "verify"] },
    recover: { args: ["--operation", "recover"] },
    reconcile: { args: ["--operation", "reconcile"] }
  }
});

describe("DevOps command config contract", () => {
  it("accepts an argv-only project config for every operation", () => {
    expect(parseDevOpsCommandConfig(validConfig())).toMatchObject({
      executable: "C:/tools/devops-adapter.mjs",
      operations: { deploy: { args: ["--operation", "deploy"] } }
    });
  });

  it("rejects shell concatenation, secret fields and process env maps", () => {
    expect(() =>
      parseDevOpsCommandConfig({ ...validConfig(), command: "node adapter.mjs && rm -rf /" })
    ).toThrow();
    expect(() => parseDevOpsCommandConfig({ ...validConfig(), shell: true })).toThrow();
    expect(() => parseDevOpsCommandConfig({ ...validConfig(), executable: "node -e deploy" })).toThrow();
    expect(() => parseDevOpsCommandConfig({ ...validConfig(), secret: "deploy-token" })).toThrow();
    expect(() =>
      parseDevOpsCommandConfig({
        ...validConfig(),
        process_env: { DEPLOY_TOKEN: "hidden" }
      })
    ).toThrow();
  });
});
