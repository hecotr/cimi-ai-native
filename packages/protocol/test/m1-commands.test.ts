import { describe, expect, it } from "vitest";
import * as protocol from "../src/index.js";

const id = (): string => protocol.createInternalId();

const source = { origin: "human_cli" as const, producer: "m1-command-test" };

const envelope = (commandType: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  schema_version: protocol.SCHEMA_VERSION,
  command_id: id(),
  correlation_id: id(),
  command_type: commandType,
  requested_at: "2026-09-20T00:00:00.000Z",
  actor_id: id(),
  project_id: id(),
  target: { object_type: "change", id: id(), domain_version: 1 },
  expected_revision: 1,
  source,
  payload,
  ...extra
});

const contractPayload = () => ({
  profile_key: "feature",
  intent: "建立可批准的 Contract。",
  outcomes: ["进入 IntentReady"],
  scope: { in: ["Contract"], out: ["Runtime"] },
  non_goals: ["不执行 Runtime"],
  acceptance: [{ key: "AC-1", statement: "Contract v1 已批准。" }],
  constraints: ["Agent 不得批准"],
  risk: {
    data_exposure: "none",
    security: "none",
    reliability: "local-only",
    reversibility: "fully_reversible"
  },
  knowledge_impact: {
    product_business: { conclusion: "NoImpact", rationale: "无产品说明变化。" },
    technical: {
      conclusion: "Update",
      owner_role: "technical_owner",
      gate: "change_closure",
      summary: "更新实施说明。"
    },
    operations: { conclusion: "NoImpact", rationale: "无运维手册变化。" },
    communication: { conclusion: "NoImpact", rationale: "无对外沟通材料。" }
  }
});

const planPayload = () => ({
  summary: "覆盖验收与知识义务。",
  verification_strategy: "通过 Kernel 场景测试证明 Planned。",
  recovery_considerations: "写失败必须整单回滚。",
  tasks: [
    { key: "define-contract", title: "批准 Contract", kind: "governance", dependencies: [] },
    { key: "update-docs", title: "更新说明", kind: "knowledge", dependencies: ["define-contract"], knowledge_source: "technical" }
  ]
});

const m1Commands = () => [
  envelope("BootstrapSoloGovernance", {
    change_id: id(),
    intent_owner_actor_id: id(),
    technical_owner_actor_id: id()
  }),
  envelope("SubmitContractCandidate", contractPayload()),
  envelope("RequestIntentDecision", { change_id: id() }),
  envelope("SubmitDecision", {
    request_id: id(),
    outcome: "approve",
    acting_role_id: id(),
    reason: "范围完整，批准。"
  }),
  envelope("SubmitContractAmendment", { ...contractPayload(), base_version: 1 }),
  envelope("SubmitPlanCandidate", planPayload()),
  envelope("RequestPlanDecision", { change_id: id() }),
  envelope("SubmitPlanAmendment", { ...planPayload(), base_version: 1 })
];

describe("M1 command parsers", () => {
  it("parses the eight M1 commands", () => {
    for (const command of m1Commands()) {
      expect(protocol.parseCommand(command)).toMatchObject({ command_type: command.command_type });
    }
  });

  it("requires expected revision on mutating M1 commands", () => {
    const valid = envelope("SubmitContractCandidate", contractPayload());
    expect(protocol.parseCommand(valid).expected_revision).toBe(1);

    const { expected_revision: _omitted, ...withoutRevision } = valid;
    expect(() => protocol.parseCommand(withoutRevision)).toThrow(protocol.ProtocolValidationError);
  });

  it("requires acting role on SubmitDecision", () => {
    const valid = envelope("SubmitDecision", {
      request_id: id(),
      outcome: "approve",
      acting_role_id: id(),
      reason: "批准"
    });
    expect(protocol.parseCommand(valid)).toMatchObject({ command_type: "SubmitDecision" });

    const missingRole = envelope("SubmitDecision", {
      request_id: id(),
      outcome: "approve",
      reason: "批准"
    });
    expect(() => protocol.parseCommand(missingRole)).toThrow(protocol.ProtocolValidationError);
  });
});

describe("M1 command success and query results", () => {
  it("accepts a strict M1 decision-request success payload", () => {
    const requestId = id();
    const result = {
      ok: true as const,
      command_id: id(),
      correlation_id: id(),
      aggregate: { object_type: "decision_request", id: requestId, domain_version: 1 },
      revision: 1,
      events: [],
      data: {
        request: {
          schema_version: protocol.SCHEMA_VERSION,
          id: requestId,
          project_id: id(),
          change_id: id(),
          request_type: "intent",
          required_role_key: "intent_owner",
          candidate_id: id(),
          candidate_revision: 1,
          profile_id: id(),
          profile_version: 1,
          risk_assessment_id: id(),
          knowledge_assessment_id: id(),
          policy_snapshot_id: id(),
          digest: {
            algorithm: "sha256",
            value: "a".repeat(64),
            subject: "intent_decision_request"
          },
          status: "open",
          created_at: "2026-09-20T00:00:00.000Z",
          updated_at: "2026-09-20T00:00:00.000Z",
          revision: 1
        }
      }
    };

    expect(protocol.parseCommandResult(result)).toMatchObject({ ok: true });
  });

  it("rejects arbitrary command success data records", () => {
    expect(() =>
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "change", id: id(), domain_version: 1 },
        revision: 1,
        events: [],
        data: { secret: "do-not-store", transcript: "full chat" }
      })
    ).toThrow(protocol.ProtocolValidationError);
  });

  it("parses inbox, room and timeline query results without secrets or paths", () => {
    const inbox = {
      ok: true as const,
      items: [
        {
          request_id: id(),
          change_id: id(),
          display_key: "CHG-0001",
          request_type: "intent",
          required_role_key: "intent_owner",
          status: "open",
          created_at: "2026-09-20T00:00:00.000Z",
          summary: "待批准 Feature Contract"
        }
      ]
    };
    const room = {
      ok: true as const,
      room: {
        change_id: id(),
        display_key: "CHG-0001",
        title: "M1 Feature",
        lifecycle_state: "Draft",
        operating_status: "Active",
        focus: "Intent Decision",
        next_action: "Intent Owner 批准 Contract",
        open_request_ids: [id()],
        decision_ids: [],
        feedback_ids: [],
        timeline_event_ids: [id()]
      }
    };
    const timeline = {
      ok: true as const,
      events: [
        {
          event_id: id(),
          event_type: "ChangeCreated",
          event_sequence: 1,
          occurred_at: "2026-09-20T00:00:00.000Z",
          summary: "创建 Draft Change"
        }
      ]
    };

    expect(protocol.parseDecisionInboxResult(inbox)).toEqual(inbox);
    expect(protocol.parseChangeRoomResult(room)).toEqual(room);
    expect(protocol.parseTimelineResult(timeline)).toEqual(timeline);

    expect(() =>
      protocol.parseChangeRoomResult({
        ...room,
        room: {
          ...room.room,
          database_path: "C:\\\\secret\\\\project.db",
          transcript: "hidden conversation"
        }
      })
    ).toThrow(protocol.ProtocolValidationError);
  });
});
