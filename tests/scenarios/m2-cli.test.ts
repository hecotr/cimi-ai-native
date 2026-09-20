import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseArtifactShowResult,
  parseCommandResult,
  parseRunListResult,
  parseRunShowResult,
  parseWorkItemListResult,
  parseWorkItemShowResult
} from "../../packages/protocol/src/index.js";

const temporaryDirectories: string[] = [];
const cli = resolve("apps/cli/dist/bin.js");
const fakeRuntime = resolve("examples/m2/fake-runtime.mjs");

const run = (projectDirectory: string, appData: string, args: string[]): unknown => {
  const output = execFileSync(
    process.execPath,
    ["--no-warnings", cli, "--project-dir", projectDirectory, "--json", ...args],
    {
      encoding: "utf8",
      env: { ...process.env, LOCALAPPDATA: appData },
      timeout: 90_000
    }
  );
  return JSON.parse(output);
};

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const contractFile = (directory: string): string => {
  const path = join(directory, "contract.json");
  writeFileSync(
    path,
    JSON.stringify({
      profile_key: "feature",
      intent: "通过 CLI 调度执行。",
      outcomes: ["Planned"],
      scope: { in: ["Plan"], out: ["Production"] },
      non_goals: ["不发布"],
      acceptance: [{ key: "AC-1", statement: "CLI 可以调度 Work Item。" }],
      constraints: ["Human only"],
      risk: {
        data_exposure: "none",
        security: "none",
        reliability: "local-only",
        reversibility: "fully_reversible"
      },
      knowledge_impact: {
        product_business: { conclusion: "NoImpact", rationale: "无产品变化。" },
        technical: {
          conclusion: "Update",
          owner_role: "technical_owner",
          gate: "change_closure",
          summary: "更新说明。"
        },
        operations: { conclusion: "NoImpact", rationale: "无运维变化。" },
        communication: { conclusion: "NoImpact", rationale: "无沟通变化。" }
      }
    })
  );
  return path;
};

const planFile = (directory: string): string => {
  const path = join(directory, "plan.json");
  writeFileSync(
    path,
    JSON.stringify({
      summary: "先实现再验证。",
      verification_strategy: "M2 CLI 场景。",
      recovery_considerations: "lease 过期后 reclaim。",
      tasks: [
        { key: "implement", title: "实现", kind: "implementation", dependencies: [] },
        { key: "verify", title: "验证", kind: "verification", dependencies: ["implement"] },
        {
          key: "update-docs",
          title: "更新说明",
          kind: "knowledge",
          knowledge_source: "technical",
          dependencies: ["verify"]
        }
      ]
    })
  );
  return path;
};

describe("cimiloop M2 CLI", () => {
  it("ticks the scheduler, claims a work item, executes a run and records an artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-m2-cli-"));
    temporaryDirectories.push(root);
    const repository = join(root, "repository");
    const appData = join(root, "app-data");
    execFileSync("git", ["init", repository], { stdio: "ignore" });
    run(repository, appData, ["init", "--owner-name", "M2 Owner", "--owner-email", "m2@example.com", "--yes"]);
    const created = run(repository, appData, ["change", "create", "--title", "CLI M2"]) as {
      data: { change: { id: string } };
    };
    const bootstrapped = run(repository, appData, ["governance", "bootstrap-solo", created.data.change.id]) as {
      data: { roles: Array<{ id: string; role_key: string }> };
    };
    const intentRole = bootstrapped.data.roles.find((role) => role.role_key === "intent_owner");
    const technicalRole = bootstrapped.data.roles.find((role) => role.role_key === "technical_owner");
    run(repository, appData, ["contract", "submit", "CHG-0001", "--file", contractFile(root)]);
    const intentRequest = run(repository, appData, ["contract", "request-review", "CHG-0001"]) as {
      data: { request: { id: string } };
    };
    run(repository, appData, [
      "decision",
      "submit",
      intentRequest.data.request.id,
      "--outcome",
      "approve",
      "--acting-role",
      intentRole?.id ?? "",
      "--reason",
      "批准 Contract"
    ]);
    run(repository, appData, ["plan", "submit", "CHG-0001", "--file", planFile(root)]);
    const planRequest = run(repository, appData, ["plan", "request-review", "CHG-0001"]) as {
      data: { request: { id: string } };
    };
    run(repository, appData, [
      "decision",
      "submit",
      planRequest.data.request.id,
      "--outcome",
      "approve",
      "--acting-role",
      technicalRole?.id ?? "",
      "--reason",
      "批准 Plan"
    ]);

    const ticked = parseCommandResult(run(repository, appData, ["scheduler", "tick", "CHG-0001"]));
    if (!("ok" in ticked) || !ticked.ok) throw new Error("scheduler tick failed");
    expect("work_items" in ticked.data).toBe(true);
    const listed = parseWorkItemListResult(run(repository, appData, ["work-item", "list", "CHG-0001"]));
    expect(listed.work_items.length).toBeGreaterThan(0);
    const workItemId = listed.work_items.find((item) => item.kind === "execution")?.id ?? "";
    const shownWorkItem = parseWorkItemShowResult(run(repository, appData, ["work-item", "show", workItemId]));
    expect(shownWorkItem.work_item.id).toBe(workItemId);
    parseCommandResult(run(repository, appData, ["work-item", "claim", workItemId]));
    parseRunShowResult(run(repository, appData, ["work-item", "execute", workItemId, "--executable", fakeRuntime]));
    const runs = parseRunListResult(run(repository, appData, ["run", "list", workItemId]));
    expect(runs.runs[0]?.status).toBe("completed");
    expect(JSON.stringify(runs)).not.toContain("super-secret");
    const recorded = parseCommandResult(
      run(repository, appData, [
        "artifact",
        "record",
        runs.runs[0]?.id ?? "",
        "--file",
        join(root, "out.bin"),
        "--summary",
        "cli artifact"
      ])
    );
    if (!("ok" in recorded) || !recorded.ok) throw new Error("artifact record failed");
    expect("artifact" in recorded.data).toBe(true);
    if ("artifact" in recorded.data) {
      const shown = parseArtifactShowResult(run(repository, appData, ["artifact", "show", recorded.data.artifact.id]));
      expect(shown.artifact.content_reference.startsWith("file:")).toBe(true);
    }
  }, 240_000);
});
