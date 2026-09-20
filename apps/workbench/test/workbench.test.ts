import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../../packages/store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../../../packages/kernel/src/kernel.js";
import { isLoopbackAddress, startWorkbench } from "../src/server.js";

const temporaryDirectories: string[] = [];
const now = "2026-09-20T00:00:00.000Z";

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  expect("ok" in result && result.ok).toBe(true);
  return result as CommandSuccess;
};

const envelope = (
  type: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: type,
  requested_at: now,
  project_id: projectId,
  actor_id: actorId,
  source: { origin: "human_cli" as const, producer: "workbench-test" },
  payload,
  ...extra
});

const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "通过 Workbench 批准 Contract。",
  outcomes: ["IntentReady"],
  scope: { in: ["Contract"], out: ["Runtime"] },
  non_goals: ["不执行"],
  acceptance: [{ key: "AC-1", statement: "Workbench 只调用 Kernel。" }],
  constraints: ["Human only"],
  risk: {
    data_exposure: "none",
    security: "none",
    reliability: "local-only",
    reversibility: "fully_reversible"
  },
  knowledge_impact: {
    product_business: { conclusion: "NoImpact" as const, rationale: "无产品变化。" },
    technical: {
      conclusion: "Update" as const,
      owner_role: "technical_owner" as const,
      gate: "change_closure" as const,
      summary: "更新说明。"
    },
    operations: { conclusion: "NoImpact" as const, rationale: "无运维变化。" },
    communication: { conclusion: "NoImpact" as const, rationale: "无沟通变化。" }
  }
});

const createReadyWorkbench = async (title = "Workbench Change") => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-workbench-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute(
      envelope("InitializeProject", createInternalId(), createInternalId(), {
        name: "Workbench",
        repository_kind: "directory",
        repository_path: directory,
        owner_name: "Human Owner"
      })
    )
  );
  if (!("project" in initialized.data)) throw new Error("expected project");
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = success(kernel.execute(envelope("CreateChange", projectId, actorId, { title })));
  if (!("change" in created.data)) throw new Error("expected change");
  success(
    kernel.execute(
      envelope(
        "BootstrapSoloGovernance",
        projectId,
        actorId,
        {
          change_id: created.data.change.id,
          intent_owner_actor_id: actorId,
          technical_owner_actor_id: actorId
        },
        {
          target: { object_type: "change", id: created.data.change.id, domain_version: 1 },
          expected_revision: created.data.change.revision
        }
      )
    )
  );
  const afterGovernance = store.getChange(created.data.change.id);
  if (!afterGovernance) throw new Error("missing change");
  success(
    kernel.execute(
      envelope("SubmitContractCandidate", projectId, actorId, contractPayload(), {
        target: { object_type: "change", id: afterGovernance.id, domain_version: 1 },
        expected_revision: afterGovernance.revision
      })
    )
  );
  const afterCandidate = store.getChange(afterGovernance.id);
  if (!afterCandidate) throw new Error("missing candidate");
  const requested = success(
    kernel.execute(
      envelope(
        "RequestIntentDecision",
        projectId,
        actorId,
        { change_id: afterCandidate.id },
        {
          target: { object_type: "change", id: afterCandidate.id, domain_version: 1 },
          expected_revision: afterCandidate.revision
        }
      )
    )
  );
  if (!("request" in requested.data)) throw new Error("expected request");
  const workbench = await startWorkbench({
    kernel,
    actorId,
    projectId,
    host: "127.0.0.1",
    port: 0,
    token: "form-token",
    databasePath: join(directory, "project.db")
  });
  return {
    store,
    kernel,
    projectId,
    actorId,
    change: store.getChange(afterCandidate.id) ?? afterCandidate,
    requestId: requested.data.request.id,
    workbench
  };
};

describe("workbench helpers", () => {
  it("accepts only loopback addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress(":ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("192.168.1.10")).toBe(false);
  });
});

describe("local workbench", () => {
  it("serves the inbox and change room, escapes HTML, and rejects stale decisions", async () => {
    const harness = await createReadyWorkbench("<script>alert(1)</script>");
    const home = await fetch(harness.workbench.url);
    expect(home.status).toBe(200);
    const homeHtml = await home.text();
    expect(homeHtml).toContain("CHG-0001");
    expect(homeHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(homeHtml).not.toContain("<script>alert(1)</script>");
    expect(homeHtml).not.toContain(harness.workbench.databasePath);
    expect(homeHtml).not.toContain("SELECT ");
    expect(homeHtml).not.toMatch(/Token：|token:/i);

    const room = await fetch(`${harness.workbench.url}/changes/${harness.change.id}`);
    expect(room.status).toBe(200);
    const roomHtml = await room.text();
    expect(roomHtml).toContain("Intent Owner 批准 Contract");
    expect(roomHtml).toContain("Task DAG");
    expect(roomHtml).toContain("Blockers");
    expect(roomHtml).toContain("Runs");
    expect(roomHtml).toContain("/decisions/");
    expect(roomHtml).not.toContain(harness.workbench.databasePath);

    const stale = await fetch(`${harness.workbench.url}/decisions/${harness.requestId}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: "form-token",
        expected_revision: "99",
        acting_role_id:
          harness.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"))?.id ?? "",
        outcome: "approve",
        reason: "过期 revision"
      })
    });
    expect(stale.status).toBe(409);
    const staleHtml = await stale.text();
    expect(staleHtml).not.toContain("form-token");
    expect(staleHtml).not.toContain(harness.workbench.databasePath);
    expect(harness.store.getChange(harness.change.id)).toMatchObject({ lifecycle_state: "Draft" });

    const approved = await fetch(`${harness.workbench.url}/decisions/${harness.requestId}`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: "form-token",
        expected_revision: String(harness.store.getChange(harness.change.id)?.revision),
        acting_role_id:
          harness.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"))?.id ?? "",
        outcome: "approve",
        reason: "Workbench 批准 Contract"
      })
    });
    expect(approved.status).toBe(303);
    expect(harness.store.getChange(harness.change.id)).toMatchObject({ lifecycle_state: "IntentReady" });
    await harness.workbench.close();
    harness.store.close();
  });
});
