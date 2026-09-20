import { describe, expect, it } from "vitest";
import {
  parseChangeRoomResult,
  parseDecisionInboxResult,
  type ChangeRoomResult,
  type DecisionInboxResult
} from "@cimiloop/protocol";
import { formatChangeRoom, formatDecisionInbox, inputError } from "../src/output.js";

describe("M1 CLI human output", () => {
  it("highlights role, revision and the next action", () => {
    const inbox: DecisionInboxResult = parseDecisionInboxResult({
      ok: true,
      items: [
        {
          request_id: "00000000-0000-7000-8000-000000000001",
          change_id: "00000000-0000-7000-8000-000000000002",
          display_key: "CHG-0001",
          request_type: "intent",
          required_role_key: "intent_owner",
          status: "open",
          created_at: "2026-09-20T00:00:00.000Z",
          summary: "待批准 Feature Contract"
        }
      ]
    });
    const room: ChangeRoomResult = parseChangeRoomResult({
      ok: true,
      room: {
        change_id: "00000000-0000-7000-8000-000000000002",
        display_key: "CHG-0001",
        title: "CLI Feature",
        lifecycle_state: "IntentReady",
        operating_status: "Active",
        focus: "Plan Decision",
        next_action: "Technical Owner 批准 Plan",
        contract: { domain_version: 1, intent: "形成可批准的 Contract。" },
        open_request_ids: ["00000000-0000-7000-8000-000000000003"],
        decision_ids: [],
        feedback_ids: [],
        timeline_event_ids: []
      }
    });

    expect(formatDecisionInbox(inbox)).toContain("intent_owner");
    expect(formatDecisionInbox(inbox)).toContain("CHG-0001");
    expect(formatChangeRoom(room, 4)).toContain("Revision 4");
    expect(formatChangeRoom(room, 4)).toContain("Technical Owner 批准 Plan");
  });

  it("returns a stable file error without leaking paths", () => {
    const error = inputError("CLI_INPUT_INVALID", "输入文件不符合 Cimi Change Protocol", {
      source: "contract-file"
    });
    expect(error.code).toBe("CLI_INPUT_INVALID");
    expect(JSON.stringify(error)).not.toMatch(/[A-Za-z]:\\|\/tmp\/|\\\\/);
    expect(error.details).not.toHaveProperty("path");
  });
});
