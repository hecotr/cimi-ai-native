import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import * as protocol from "../src/index.js";

const { ProtocolValidationError, SCHEMA_VERSION, createInternalId, parseCommand } = protocol;

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

  it("publishes validators for every machine-readable result", () => {
    expect(protocol.parseCommandResult).toBeTypeOf("function");
    expect(protocol.parseChangeListResult).toBeTypeOf("function");
    expect(protocol.parseChangeShowResult).toBeTypeOf("function");
    expect(protocol.parseDoctorResult).toBeTypeOf("function");
    expect(protocol.parseErrorResult).toBeTypeOf("function");
  });

  it("rejects malformed command success data", () => {
    const changeId = createInternalId();
    expect(() =>
      protocol.parseCommandResult({
        ok: true,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        aggregate: { object_type: "change", id: changeId, domain_version: 1 },
        revision: 1,
        events: [],
        data: { change: "not-a-change" }
      })
    ).toThrow(ProtocolValidationError);
  });

  it("keeps exported JSON Schema artifacts synchronized with protocolSchemas", () => {
    const schemaDirectory = resolve("packages/protocol/schemas");
    const exportedNames = readdirSync(schemaDirectory)
      .filter((name) => name.endsWith(".schema.json"))
      .map((name) => name.replace(".schema.json", ""))
      .sort();
    const declaredNames = Object.keys(protocol.protocolSchemas).sort();

    expect(exportedNames).toEqual(declaredNames);
    for (const name of declaredNames) {
      const artifact = JSON.parse(readFileSync(resolve(schemaDirectory, `${name}.schema.json`), "utf8"));
      expect(artifact).toEqual({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: `${name}.v1`,
        ...protocol.protocolSchemas[name as keyof typeof protocol.protocolSchemas]
      });
    }
  });

  it("loads every exported JSON Schema into one strict registry", () => {
    const schemaDirectory = resolve("packages/protocol/schemas");
    const artifacts = readdirSync(schemaDirectory)
      .filter((name) => name.endsWith(".schema.json"))
      .map((name) => JSON.parse(readFileSync(resolve(schemaDirectory, name), "utf8")));
    const registry = new Ajv2020({ strict: true, allErrors: true });

    expect(() => {
      for (const artifact of artifacts) registry.addSchema(artifact);
    }).not.toThrow();
  });
});
