import { describe, expect, it } from "vitest";
import { ProtocolValidationError, SCHEMA_VERSION, createInternalId, parseCommand } from "../src/index.js";

describe("Cimi Change Protocol command validation", () => {
  it("accepts a valid CreateChange command", () => {
    const command = {
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: "2026-09-19T00:00:00.000Z",
      project_id: createInternalId(),
      actor_id: createInternalId(),
      source: { origin: "human_cli", producer: "test" },
      payload: { title: "验证协议" }
    };

    expect(parseCommand(command)).toEqual(command);
  });

  it("rejects unknown fields and invalid IDs", () => {
    expect(() =>
      parseCommand({
        schema_version: SCHEMA_VERSION,
        command_id: "not-an-id",
        correlation_id: createInternalId(),
        command_type: "CreateChange",
        requested_at: "2026-09-19T00:00:00.000Z",
        project_id: createInternalId(),
        actor_id: createInternalId(),
        source: { origin: "human_cli", producer: "test" },
        payload: { title: "验证协议" },
        unexpected: true
      })
    ).toThrow(ProtocolValidationError);
  });
});
