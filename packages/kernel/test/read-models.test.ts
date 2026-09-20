import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  parseChangeRoomResult,
  parseDecisionInboxResult,
  parseTimelineResult,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { ReadModelBuilder } from "../src/read-models.js";
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

const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "形成可查询的 Contract。",
  outcomes: ["IntentReady"],
  scope: { in: ["Contract"], out: ["Runtime"] },
  non_goals: ["不执行"],
  acceptance: [{ key: "AC-1", statement: "Room 可重建。" }],
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

const planPayload = () => ({
  summary: "覆盖验收与知识义务的计划。",
  verification_strategy: "用 Room 与 Timeline 查询证明投影可重建。",
  recovery_considerations: "Read Model 不是状态权威。",
  tasks: [
    { key: "define-plan", title: "形成 Plan", kind: "governance" as const, dependencies: [] },
    {
      key: "update-docs",
      title: "更新说明",
      kind: "knowledge" as const,
      knowledge_source: "technical" as const,
      dependencies: ["define-plan"]
    }
  ]
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
  source: { origin: "human_cli" as const, producer: "read-model-test" },
  payload,
  ...extra
});

const createHarness = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-read-models-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute(
      envelope("InitializeProject", createInternalId(), createInternalId(), {
        name: "Read Models",
        repository_kind: "directory",
        repository_path: directory,
        owner_name: "Human Owner"
      })
    )
  );
  if (!("project" in initialized.data)) throw new Error("expected project");
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = success(kernel.execute(envelope("CreateChange", projectId, actorId, { title: "Read Model Change" })));
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
  if (!afterCandidate) throw new Error("missing candidate change");
  const intentRequested = success(
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
  if (!("request" in intentRequested.data)) throw new Error("expected request");
  return {
    store,
    kernel,
    projectId,
    actorId,
    change: store.getChange(afterCandidate.id) ?? afterCandidate,
    intentRequestId: intentRequested.data.request.id
  };
};

describe("read model builder", () => {
  it("projects inbox items only for assigned open requests", () => {
    const builder = new ReadModelBuilder();
    const changeId = createInternalId();
    const requestId = createInternalId();
    const inbox = builder.buildInbox({
      actorId: "actor-owner",
      assignments: [
        { actor_id: "actor-owner", role_key: "intent_owner" },
        { actor_id: "actor-other", role_key: "technical_owner" }
      ],
      requests: [
        {
          id: requestId,
          change_id: changeId,
          request_type: "intent",
          required_role_key: "intent_owner",
          status: "open",
          created_at: now
        },
        {
          id: createInternalId(),
          change_id: changeId,
          request_type: "plan",
          required_role_key: "technical_owner",
          status: "open",
          created_at: now
        }
      ],
      changes: [{ id: changeId, display_key: "CHG-0001", title: "Feature" }]
    });
    expect(inbox).toEqual({
      ok: true,
      items: [
        {
          request_id: requestId,
          change_id: changeId,
          display_key: "CHG-0001",
          request_type: "intent",
          required_role_key: "intent_owner",
          status: "open",
          created_at: now,
          summary: "待批准 Feature Contract"
        }
      ]
    });
  });
});

describe("kernel read models", () => {
  it("lists only the actor's actionable inbox and parses the result", () => {
    const harness = createHarness();
    const inbox = harness.kernel.listDecisionInbox(harness.actorId);
    expect("ok" in inbox && inbox.ok).toBe(true);
    if (!("ok" in inbox) || !inbox.ok) throw new Error("expected inbox");
    expect(parseDecisionInboxResult(inbox).items).toEqual([
      {
        request_id: harness.intentRequestId,
        change_id: harness.change.id,
        display_key: harness.change.display_key,
        request_type: "intent",
        required_role_key: "intent_owner",
        status: "open",
        created_at: now,
        summary: "待批准 Feature Contract"
      }
    ]);
    const stranger = harness.kernel.listDecisionInbox(createInternalId());
    expect(stranger).toMatchObject({ ok: true, items: [] });
    harness.store.close();
  });

  it("rebuilds change room and timeline from current facts", () => {
    const harness = createHarness();
    const role = harness.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
    success(
      harness.kernel.execute(
        envelope(
          "SubmitDecision",
          harness.projectId,
          harness.actorId,
          {
            request_id: harness.intentRequestId,
            outcome: "approve",
            acting_role_id: role?.id,
            reason: "批准 Contract。"
          },
          { expected_revision: harness.store.getChange(harness.change.id)?.revision }
        )
      )
    );
    success(
      harness.kernel.execute(
        envelope("SubmitPlanCandidate", harness.projectId, harness.actorId, planPayload(), {
          target: { object_type: "change", id: harness.change.id, domain_version: 1 },
          expected_revision: harness.store.getChange(harness.change.id)?.revision
        })
      )
    );
    const planRequested = success(
      harness.kernel.execute(
        envelope(
          "RequestPlanDecision",
          harness.projectId,
          harness.actorId,
          { change_id: harness.change.id },
          {
            target: { object_type: "change", id: harness.change.id, domain_version: 1 },
            expected_revision: harness.store.getChange(harness.change.id)?.revision
          }
        )
      )
    );
    if (!("request" in planRequested.data)) throw new Error("expected plan request");
    const room = harness.kernel.getChangeRoom(harness.change.id);
    expect("ok" in room && room.ok).toBe(true);
    if (!("ok" in room) || !room.ok) throw new Error("expected room");
    const parsedRoom = parseChangeRoomResult(room);
    expect(parsedRoom.room).toMatchObject({
      change_id: harness.change.id,
      display_key: harness.change.display_key,
      title: "Read Model Change",
      lifecycle_state: "IntentReady",
      operating_status: "Active",
      focus: "Plan Decision",
      next_action: "Technical Owner 批准 Plan",
      contract: { domain_version: 1, intent: "形成可查询的 Contract。" },
      open_request_ids: [planRequested.data.request.id]
    });
    expect(parsedRoom.room.decision_ids.length).toBeGreaterThan(0);
    expect(parsedRoom.room.timeline_event_ids.length).toBeGreaterThan(0);

    const timeline = harness.kernel.getTimeline(harness.change.id);
    expect("ok" in timeline && timeline.ok).toBe(true);
    if (!("ok" in timeline) || !timeline.ok) throw new Error("expected timeline");
    const parsedTimeline = parseTimelineResult(timeline);
    const sequences = parsedTimeline.events.map((event) => event.event_sequence);
    expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
    expect(parsedTimeline.events.some((event) => event.event_type === "DecisionSubmitted")).toBe(true);
    expect(parsedTimeline.events.every((event) => event.summary.length > 0)).toBe(true);
    harness.store.close();
  });
});
