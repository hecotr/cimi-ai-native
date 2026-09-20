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
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { evaluateIntentGate } from "../src/gates/intent-gate.js";
import { CimiLoopKernel } from "../src/kernel.js";

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

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "批准后进入 IntentReady。",
  outcomes: ["IntentReady"],
  scope: { in: ["Contract"], out: ["Runtime"] },
  non_goals: ["不执行"],
  acceptance: [{ key: "AC-1", statement: "Contract v1 已批准。" }],
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
  source: { origin: "human_cli" as const, producer: "intent-test" },
  payload,
  ...extra
});

const createReadyChange = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-intent-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute(
      envelope("InitializeProject", createInternalId(), createInternalId(), {
        name: "Intent",
        repository_kind: "directory",
        repository_path: directory,
        owner_name: "Human Owner"
      })
    )
  );
  if (!("project" in initialized.data)) throw new Error("expected project");
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = success(
    kernel.execute(envelope("CreateChange", projectId, actorId, { title: "Intent Change" }))
  );
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
  const change = store.getChange(created.data.change.id);
  if (!change) throw new Error("missing change");
  success(
    kernel.execute(
      envelope("SubmitContractCandidate", projectId, actorId, contractPayload(), {
        target: { object_type: "change", id: change.id, domain_version: 1 },
        expected_revision: change.revision
      })
    )
  );
  const current = store.getChange(change.id);
  if (!current) throw new Error("missing updated change");
  return { store, kernel, projectId, actorId, change: current };
};

describe("intent gate results", () => {
  it("covers ALLOW, REQUIRE_HUMAN, NEED_MORE_EVIDENCE and DENY", () => {
    expect(evaluateIntentGate({ hasCompleteCandidate: true, hasHumanApproval: true, digestMatches: true, rejected: false })).toBe(
      "ALLOW"
    );
    expect(
      evaluateIntentGate({ hasCompleteCandidate: true, hasHumanApproval: false, digestMatches: true, rejected: false })
    ).toBe("REQUIRE_HUMAN");
    expect(
      evaluateIntentGate({ hasCompleteCandidate: false, hasHumanApproval: false, digestMatches: true, rejected: false })
    ).toBe("NEED_MORE_EVIDENCE");
    expect(evaluateIntentGate({ hasCompleteCandidate: true, hasHumanApproval: true, digestMatches: true, rejected: true })).toBe(
      "DENY"
    );
  });
});

describe("intent decisions", () => {
  it("approves a contract through a human intent owner and enters IntentReady", () => {
    const harness = createReadyChange();
    const requested = success(
      harness.kernel.execute(
        envelope(
          "RequestIntentDecision",
          harness.projectId,
          harness.actorId,
          { change_id: harness.change.id },
          {
            target: { object_type: "change", id: harness.change.id, domain_version: 1 },
            expected_revision: harness.change.revision
          }
        )
      )
    );
    if (!("request" in requested.data)) throw new Error("expected request");
    const role = harness.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
    const approved = success(
      harness.kernel.execute(
        envelope(
          "SubmitDecision",
          harness.projectId,
          harness.actorId,
          {
            request_id: requested.data.request.id,
            outcome: "approve",
            acting_role_id: role?.id,
            reason: "范围与验收完整，批准。"
          },
          { expected_revision: harness.store.getChange(harness.change.id)?.revision }
        )
      )
    );
    expect(harness.store.getChange(harness.change.id)).toMatchObject({
      lifecycle_state: "IntentReady",
      operating_status: "Active"
    });
    expect(approved.data).toMatchObject({
      gate: { result: "ALLOW", gate_type: "intent" },
      contract: { domain_version: 1 }
    });
    harness.store.close();
  });

  it("keeps Draft Active on request_changes and Pauses on reject", () => {
    const requestChanges = createReadyChange();
    const requested = success(
      requestChanges.kernel.execute(
        envelope(
          "RequestIntentDecision",
          requestChanges.projectId,
          requestChanges.actorId,
          { change_id: requestChanges.change.id },
          {
            target: { object_type: "change", id: requestChanges.change.id, domain_version: 1 },
            expected_revision: requestChanges.change.revision
          }
        )
      )
    );
    if (!("request" in requested.data)) throw new Error("expected request");
    const role = requestChanges.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
    success(
      requestChanges.kernel.execute(
        envelope(
          "SubmitDecision",
          requestChanges.projectId,
          requestChanges.actorId,
          {
            request_id: requested.data.request.id,
            outcome: "request_changes",
            acting_role_id: role?.id,
            reason: "验收需要补充。",
            feedback: [{ category: "acceptance", body: "补充可观察验收。" }]
          },
          { expected_revision: requestChanges.store.getChange(requestChanges.change.id)?.revision }
        )
      )
    );
    expect(requestChanges.store.getChange(requestChanges.change.id)).toMatchObject({
      lifecycle_state: "Draft",
      operating_status: "Active"
    });
    requestChanges.store.close();

    const rejected = createReadyChange();
    const rejectRequest = success(
      rejected.kernel.execute(
        envelope(
          "RequestIntentDecision",
          rejected.projectId,
          rejected.actorId,
          { change_id: rejected.change.id },
          {
            target: { object_type: "change", id: rejected.change.id, domain_version: 1 },
            expected_revision: rejected.change.revision
          }
        )
      )
    );
    if (!("request" in rejectRequest.data)) throw new Error("expected request");
    const rejectRole = rejected.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
    success(
      rejected.kernel.execute(
        envelope(
          "SubmitDecision",
          rejected.projectId,
          rejected.actorId,
          {
            request_id: rejectRequest.data.request.id,
            outcome: "reject",
            acting_role_id: rejectRole?.id,
            reason: "超出范围。"
          },
          { expected_revision: rejected.store.getChange(rejected.change.id)?.revision }
        )
      )
    );
    expect(rejected.store.getChange(rejected.change.id)).toMatchObject({
      lifecycle_state: "Draft",
      operating_status: "Paused"
    });
    rejected.store.close();
  });

  it("rejects agent decisions and expires stale requests after candidate change", () => {
    const harness = createReadyChange();
    const requested = success(
      harness.kernel.execute(
        envelope(
          "RequestIntentDecision",
          harness.projectId,
          harness.actorId,
          { change_id: harness.change.id },
          {
            target: { object_type: "change", id: harness.change.id, domain_version: 1 },
            expected_revision: harness.change.revision
          }
        )
      )
    );
    if (!("request" in requested.data)) throw new Error("expected request");
    const role = harness.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
    const agentDenied = failure(
      harness.kernel.execute({
        ...envelope(
          "SubmitDecision",
          harness.projectId,
          harness.actorId,
          {
            request_id: requested.data.request.id,
            outcome: "approve",
            acting_role_id: role?.id,
            reason: "Agent 试图批准。"
          },
          { expected_revision: harness.store.getChange(harness.change.id)?.revision }
        ),
        source: { origin: "agent", producer: "rogue-agent" }
      })
    );
    expect(agentDenied.code).toBe("HUMAN_ACTOR_REQUIRED");
    expect(harness.store.transaction((transaction) => transaction.listDecisions(harness.change.id))).toEqual([]);

    const current = harness.store.getChange(harness.change.id);
    success(
      harness.kernel.execute(
        envelope("SubmitContractCandidate", harness.projectId, harness.actorId, {
          ...contractPayload(),
          intent: "候选已变化。"
        }, {
          target: { object_type: "change", id: harness.change.id, domain_version: 1 },
          expected_revision: current?.revision
        })
      )
    );
    const stale = failure(
      harness.kernel.execute(
        envelope(
          "SubmitDecision",
          harness.projectId,
          harness.actorId,
          {
            request_id: requested.data.request.id,
            outcome: "approve",
            acting_role_id: role?.id,
            reason: "使用过期请求批准。"
          },
          { expected_revision: harness.store.getChange(harness.change.id)?.revision }
        )
      )
    );
    expect(stale.code).toBe("DECISION_REQUEST_EXPIRED");
    expect(harness.store.getChange(harness.change.id)).toMatchObject({ lifecycle_state: "Draft" });
    harness.store.close();
  });
});
