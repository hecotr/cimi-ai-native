import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { TSchema } from "typebox";
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

const schemaNamed = (name: string): TSchema => {
  expect(protocol.protocolSchemas).toHaveProperty(name);
  return (protocol.protocolSchemas as Record<string, TSchema>)[name]!;
};

const parseNamed = (name: string, value: unknown): unknown =>
  protocol.compileValidator(schemaNamed(name))(value);

const m1Id = (): string => protocol.createInternalId();

describe("M1 domain schemas", () => {
  const validDecision = () => ({
    schema_version: protocol.SCHEMA_VERSION,
    id: m1Id(),
    project_id: m1Id(),
    change_id: m1Id(),
    request_id: m1Id(),
    actor_id: m1Id(),
    acting_role_id: m1Id(),
    outcome: "approve",
    reason: "范围与验收完整，批准当前 Contract Candidate。",
    created_at: "2026-09-20T00:00:00.000Z"
  });

  const validProfile = () => ({
    schema_version: protocol.SCHEMA_VERSION,
    id: m1Id(),
    project_id: m1Id(),
    profile_key: "feature",
    display_name: "Feature",
    domain_version: 1,
    created_at: "2026-09-20T00:00:00.000Z"
  });

  const validKnowledge = () => ({
    schema_version: protocol.SCHEMA_VERSION,
    id: m1Id(),
    project_id: m1Id(),
    change_id: m1Id(),
    revision: 1,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    sources: {
      product_business: { conclusion: "NoImpact", rationale: "不改变对外产品说明。" },
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

  const validContractVersion = () => ({
    schema_version: protocol.SCHEMA_VERSION,
    id: m1Id(),
    contract_id: m1Id(),
    project_id: m1Id(),
    change_id: m1Id(),
    domain_version: 1,
    profile_key: "feature",
    intent: "建立可批准的 Contract。",
    outcomes: ["进入 IntentReady"],
    scope: { in: ["Contract"], out: ["Runtime"] },
    non_goals: ["不执行 Runtime"],
    acceptance: [{ key: "AC-1", statement: "Contract v1 已批准。" }],
    constraints: ["Agent 不得批准"],
    candidate_id: m1Id(),
    created_at: "2026-09-20T00:00:00.000Z"
  });

  it("accepts legal M1 outcomes, profiles, knowledge conclusions and versions starting at 1", () => {
    expect(parseNamed("Decision", validDecision())).toMatchObject({ outcome: "approve" });
    expect(parseNamed("ChangeProfile", validProfile())).toMatchObject({ profile_key: "feature", domain_version: 1 });
    expect(parseNamed("KnowledgeImpactAssessment", validKnowledge())).toMatchObject({ revision: 1 });
    expect(parseNamed("ContractVersion", validContractVersion())).toMatchObject({ domain_version: 1 });
  });

  it("rejects illegal decision outcomes", () => {
    expect(() => parseNamed("Decision", { ...validDecision(), outcome: "maybe_later" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("rejects illegal change profiles", () => {
    expect(() => parseNamed("ChangeProfile", { ...validProfile(), profile_key: "hotfix" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("rejects illegal knowledge conclusions", () => {
    const knowledge = validKnowledge();
    knowledge.sources.product_business.conclusion = "Skip";
    expect(() => parseNamed("KnowledgeImpactAssessment", knowledge)).toThrow(protocol.ProtocolValidationError);
  });

  it("rejects official versions and candidate revisions below 1", () => {
    expect(() => parseNamed("ContractVersion", { ...validContractVersion(), domain_version: 0 })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("KnowledgeImpactAssessment", { ...validKnowledge(), revision: 0 })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("rejects extra top-level fields and only allows namespaced extensions", () => {
    expect(() => parseNamed("Decision", { ...validDecision(), unexpected: true })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() =>
      parseNamed("ChangeProfile", { ...validProfile(), extensions: { unnamespaced: { ok: true } } })
    ).toThrow(protocol.ProtocolValidationError);
    expect(parseNamed("ChangeProfile", { ...validProfile(), extensions: { "acme.custom": { flag: true } } })).toMatchObject(
      { extensions: { "acme.custom": { flag: true } } }
    );
  });
});
