import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const cli = resolve("apps/cli/dist/bin.js");

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

const spawnJson = (projectDirectory: string, appData: string, args: string[]) =>
  spawnSync(process.execPath, ["--no-warnings", cli, "--project-dir", projectDirectory, "--json", ...args], {
    encoding: "utf8",
    env: { ...process.env, LOCALAPPDATA: appData }
  });

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
      intent: "通过 CLI 批准 Contract。",
      outcomes: ["IntentReady"],
      scope: { in: ["Contract"], out: ["Runtime"] },
      non_goals: ["不执行 Runtime"],
      acceptance: [{ key: "AC-1", statement: "CLI 可以提交并批准 Contract。" }],
      constraints: ["Agent 不得批准"],
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
          summary: "更新 CLI 说明。"
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
      summary: "通过 CLI 形成可批准 Plan。",
      verification_strategy: "用 CLI 场景测试证明 Draft 到 Planned。",
      recovery_considerations: "失败命令不得留下部分事实。",
      tasks: [
        { key: "define-plan", title: "形成 Plan", kind: "governance", dependencies: [] },
        {
          key: "update-docs",
          title: "更新说明",
          kind: "knowledge",
          knowledge_source: "technical",
          dependencies: ["define-plan"]
        }
      ]
    })
  );
  return path;
};

describe("cimiloop M1 CLI", () => {
  it("runs contract and plan approval through JSON commands", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-m1-cli-"));
    temporaryDirectories.push(root);
    const repository = join(root, "repository");
    const appData = join(root, "app-data");
    execFileSync("git", ["init", repository], { stdio: "ignore" });

    run(repository, appData, ["init", "--owner-name", "CLI Owner", "--owner-email", "cli@example.com", "--yes"]);
    const created = run(repository, appData, ["change", "create", "--title", "CLI M1"]) as {
      data: { change: { id: string } };
    };
    const bootstrapped = run(repository, appData, [
      "governance",
      "bootstrap-solo",
      created.data.change.id
    ]) as {
      data: { roles: Array<{ id: string; role_key: string }> };
    };
    const intentRole = bootstrapped.data.roles.find((role) => role.role_key === "intent_owner");
    const technicalRole = bootstrapped.data.roles.find((role) => role.role_key === "technical_owner");
    expect(intentRole && technicalRole).toBeTruthy();

    run(repository, appData, ["contract", "submit", "CHG-0001", "--file", contractFile(root)]);
    const intentRequest = run(repository, appData, ["contract", "request-review", "CHG-0001"]) as {
      data: { request: { id: string } };
      revision: number;
    };
    const inbox = run(repository, appData, ["decision", "inbox"]) as { items: Array<{ request_id: string }> };
    expect(inbox.items[0]?.request_id).toBe(intentRequest.data.request.id);
    run(repository, appData, [
      "decision",
      "submit",
      intentRequest.data.request.id,
      "--outcome",
      "approve",
      "--acting-role",
      intentRole?.id ?? "",
      "--reason",
      "CLI 批准 Contract"
    ]);

    run(repository, appData, ["plan", "submit", "CHG-0001", "--file", planFile(root)]);
    const planRequest = run(repository, appData, ["plan", "request-review", "CHG-0001"]) as {
      data: { request: { id: string } };
    };
    const approved = run(repository, appData, [
      "decision",
      "submit",
      planRequest.data.request.id,
      "--outcome",
      "approve",
      "--acting-role",
      technicalRole?.id ?? "",
      "--reason",
      "CLI 批准 Plan"
    ]) as { data: { change: { lifecycle_state: string } } };
    expect(approved.data.change.lifecycle_state).toBe("Planned");

    const room = run(repository, appData, ["room", "show", "CHG-0001"]) as {
      room: { lifecycle_state: string; next_action: string };
    };
    const timeline = run(repository, appData, ["timeline", "CHG-0001"]) as {
      events: Array<{ event_sequence: number }>;
    };
    expect(room.room.lifecycle_state).toBe("Planned");
    expect(room.room.next_action.length).toBeGreaterThan(0);
    expect(timeline.events.map((event) => event.event_sequence)).toEqual(
      timeline.events.map((event) => event.event_sequence).sort((left, right) => left - right)
    );
  }, 240_000);

  it("returns schema-valid JSON for illegal files without leaking paths", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-m1-cli-error-"));
    temporaryDirectories.push(root);
    const repository = join(root, "repository");
    const appData = join(root, "app-data");
    execFileSync("git", ["init", repository], { stdio: "ignore" });
    run(repository, appData, ["init", "--owner-name", "CLI Owner", "--yes"]);
    run(repository, appData, ["change", "create", "--title", "CLI invalid"]);
    const invalid = join(root, "bad.json");
    writeFileSync(invalid, "{not-json");
    const result = spawnJson(repository, appData, ["contract", "submit", "CHG-0001", "--file", invalid]);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as { ok: false; error: { code: string; details?: Record<string, unknown> } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("CLI_INPUT_INVALID");
    expect(result.stdout).not.toContain(invalid);
    expect(result.stdout).not.toContain(root);
    expect(parsed.error.details).not.toHaveProperty("path");
  }, 20_000);
});
