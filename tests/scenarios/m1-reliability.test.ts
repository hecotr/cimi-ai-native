import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/kernel.js";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";
import type { ProjectStore, StoreTransaction } from "../../packages/store/src/index.js";

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

const contractPayload = (intent = "可靠性测试 Contract") => ({
  profile_key: "feature" as const,
  intent,
  outcomes: ["IntentReady"],
  scope: { in: ["Contract"], out: ["Runtime"] },
  non_goals: ["不执行"],
  acceptance: [{ key: "AC-1", statement: "失败必须回滚。" }],
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
  source: { origin: "human_cli" as const, producer: "m1-reliability" },
  payload,
  ...extra
});

const wrapStore = (store: SqliteProjectStore, fault?: keyof StoreTransaction | "commit"): ProjectStore => ({
  transaction: (work) => {
    if (fault === "commit") {
      const result = store.transaction(work);
      throw new Error("simulated response loss after commit");
    }
    return store.transaction((transaction) => {
      if (!fault) return work(transaction);
      return work(
        new Proxy(transaction, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (property === fault && typeof value === "function") {
              return () => {
                throw new Error(`injected failure at ${String(property)}`);
              };
            }
            return typeof value === "function" ? value.bind(target) : value;
          }
        })
      );
    });
  },
  getProject: () => store.getProject(),
  getChange: (idOrKey) => store.getChange(idOrKey),
  listChanges: () => store.listChanges(),
  listEvents: () => store.listEvents(),
  listOutbox: (status) => store.listOutbox(status),
  claimOutbox: (nowValue, leaseUntil) => store.claimOutbox(nowValue, leaseUntil),
  markOutboxDelivered: (messageId, deliveredAt) => store.markOutboxDelivered(messageId, deliveredAt),
  releaseOutbox: (messageId, availableAt) => store.releaseOutbox(messageId, availableAt),
  close: () => store.close()
});

const createReadyRequest = (title = "Reliability") => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m1-reliability-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "project.db");
  const store = new SqliteProjectStore(databasePath);
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute(
      envelope("InitializeProject", createInternalId(), createInternalId(), {
        name: "M1 Reliability",
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
  const role = store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
  return {
    directory,
    databasePath,
    store,
    kernel,
    projectId,
    actorId,
    change: store.getChange(afterCandidate.id) ?? afterCandidate,
    requestId: requested.data.request.id,
    roleId: role?.id
  };
};

describe("M1 reliability", () => {
  it("rolls back Decision, Version, Change, Transition, Event, Outbox and Receipt together", () => {
    for (const fault of [
      "insertDecision",
      "insertContractVersion",
      "updateChange",
      "insertTransition",
      "appendEvent",
      "enqueueOutbox",
      "saveCommandReceipt"
    ] as const) {
      const fixture = createReadyRequest(fault);
      const eventsBefore = fixture.store.listEvents().length;
      const outboxBefore = fixture.store.listOutbox().length;
      const kernel = new CimiLoopKernel({ store: wrapStore(fixture.store, fault), now: () => now });
      const result = failure(
        kernel.execute(
          envelope(
            "SubmitDecision",
            fixture.projectId,
            fixture.actorId,
            {
              request_id: fixture.requestId,
              outcome: "approve",
              acting_role_id: fixture.roleId,
              reason: "注入失败"
            },
            { expected_revision: fixture.store.getChange(fixture.change.id)?.revision }
          )
        )
      );
      expect(result.code).toBe("STORE_FAILURE");
      fixture.store.close();
      const reopened = new SqliteProjectStore(fixture.databasePath);
      expect(reopened.getChange(fixture.change.id)).toMatchObject({
        lifecycle_state: "Draft",
        revision: fixture.change.revision
      });
      expect(reopened.listEvents()).toHaveLength(eventsBefore);
      expect(reopened.listOutbox()).toHaveLength(outboxBefore);
      expect(
        reopened.transaction((transaction) => transaction.getCurrentContract(fixture.change.id))
      ).toBeUndefined();
      expect(reopened.transaction((transaction) => transaction.listDecisions(fixture.change.id))).toEqual([]);
      reopened.close();
    }
  });

  it("returns the original receipt after a lost response and does not duplicate facts", () => {
    const fixture = createReadyRequest("lost-response");
    const commandId = createInternalId();
    let loseOnce = true;
    const store: ProjectStore = {
      ...wrapStore(fixture.store),
      transaction: (work) => {
        const result = fixture.store.transaction(work);
        if (loseOnce) {
          loseOnce = false;
          throw new Error("simulated response loss after commit");
        }
        return result;
      }
    };
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const command = envelope(
      "SubmitDecision",
      fixture.projectId,
      fixture.actorId,
      {
        request_id: fixture.requestId,
        outcome: "approve",
        acting_role_id: fixture.roleId,
        reason: "响应丢失后重放"
      },
      { expected_revision: fixture.store.getChange(fixture.change.id)?.revision, command_id: commandId }
    );
    expect(kernel.execute(command)).toMatchObject({ code: "STORE_FAILURE", retryable: true });
    const replayed = success(kernel.execute(command));
    expect(replayed.command_id).toBe(commandId);
    expect(fixture.store.getChange(fixture.change.id)).toMatchObject({ lifecycle_state: "IntentReady" });
    expect(
      fixture.store.listEvents().filter((event) => event.event_type === "DecisionSubmitted")
    ).toHaveLength(1);
    expect(fixture.store.transaction((transaction) => transaction.listDecisions(fixture.change.id))).toHaveLength(1);
    fixture.store.close();
  });

  it("lets only one of two stores approve the same revision", () => {
    const fixture = createReadyRequest("dual-store");
    const first = new CimiLoopKernel({ store: fixture.store, now: () => now });
    const secondStore = new SqliteProjectStore(fixture.databasePath);
    const second = new CimiLoopKernel({ store: secondStore, now: () => now });
    const revision = fixture.store.getChange(fixture.change.id)?.revision;
    const winner = success(
      first.execute(
        envelope(
          "SubmitDecision",
          fixture.projectId,
          fixture.actorId,
          {
            request_id: fixture.requestId,
            outcome: "approve",
            acting_role_id: fixture.roleId,
            reason: "第一个客户端"
          },
          { expected_revision: revision }
        )
      )
    );
    const loser = failure(
      second.execute(
        envelope(
          "SubmitDecision",
          fixture.projectId,
          fixture.actorId,
          {
            request_id: fixture.requestId,
            outcome: "approve",
            acting_role_id: fixture.roleId,
            reason: "第二个客户端"
          },
          { expected_revision: revision }
        )
      )
    );
    expect(winner.data).toMatchObject({ contract: { domain_version: 1 } });
    expect(loser.code).toBe("REVISION_CONFLICT");
    expect(fixture.store.transaction((transaction) => transaction.getCurrentContract(fixture.change.id))).toMatchObject({
      domain_version: 1
    });
    secondStore.close();
    fixture.store.close();
  });

  it("expires an intent request after the candidate changes", () => {
    const fixture = createReadyRequest("stale-inputs");
    success(
      fixture.kernel.execute(
        envelope("SubmitContractCandidate", fixture.projectId, fixture.actorId, contractPayload("候选已变化"), {
          target: { object_type: "change", id: fixture.change.id, domain_version: 1 },
          expected_revision: fixture.store.getChange(fixture.change.id)?.revision
        })
      )
    );
    const expired = failure(
      fixture.kernel.execute(
        envelope(
          "SubmitDecision",
          fixture.projectId,
          fixture.actorId,
          {
            request_id: fixture.requestId,
            outcome: "approve",
            acting_role_id: fixture.roleId,
            reason: "使用过期请求"
          },
          { expected_revision: fixture.store.getChange(fixture.change.id)?.revision }
        )
      )
    );
    expect(expired.code).toBe("DECISION_REQUEST_EXPIRED");
    expect(fixture.store.getChange(fixture.change.id)).toMatchObject({ lifecycle_state: "Draft" });
    expect(fixture.store.transaction((transaction) => transaction.getCurrentContract(fixture.change.id))).toBeUndefined();
    fixture.store.close();
  });
});
