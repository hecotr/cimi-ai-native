import { describe, expect, it } from "vitest";
import type { TSchema } from "typebox";
import * as protocol from "../src/index.js";

const id = (): string => protocol.createInternalId();

const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "a".repeat(64),
  subject
});

const timestamp = "2026-09-20T00:00:00.000Z";

const schemaNamed = (name: string): TSchema => {
  expect(protocol.protocolSchemas).toHaveProperty(name);
  return (protocol.protocolSchemas as Record<string, TSchema>)[name]!;
};

const parseNamed = (name: string, value: unknown): unknown =>
  protocol.compileValidator(schemaNamed(name))(value);

const source = { origin: "system" as const, producer: "m3-schema-test" };

const envelope = (commandType: string, payload: Record<string, unknown>) => ({
  schema_version: protocol.SCHEMA_VERSION,
  command_id: id(),
  correlation_id: id(),
  command_type: commandType,
  requested_at: timestamp,
  actor_id: id(),
  project_id: id(),
  target: { object_type: "change", id: id(), domain_version: 1 },
  expected_revision: 1,
  source,
  payload
});

const validClaim = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  claim_key: "AC-1",
  statement: "Artifact 满足验收条件。",
  category: "intent",
  obligation: "required",
  source: "acceptance",
  contract_id: id(),
  contract_version: 1,
  requirement_set_id: id(),
  created_at: timestamp
});

const validExternalReference = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  reference: "file://evidence/junit.xml",
  digest: digest("external_reference"),
  media_type: "application/xml",
  summary: "JUnit 报告引用",
  created_at: timestamp
});

const validEvidence = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  claim_id: id(),
  stance: "Supports",
  subject_type: "artifact",
  subject_id: id(),
  subject_digest: digest("artifact"),
  content_reference: "cimi-object://evidence/junit",
  digest: digest("evidence"),
  producer_role: "deterministic_test",
  created_at: timestamp
});

const validRequirementItem = () => ({
  claim_key: "AC-1",
  obligation: "required",
  source: "acceptance",
  accepted_evidence_kinds: ["deterministic_test"]
});

const validRequirementSet = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  version: 1,
  profile_key: "feature",
  policy_snapshot_id: id(),
  contract_id: id(),
  contract_version: 1,
  items: [validRequirementItem()],
  digest: digest("gate_requirement_set"),
  created_at: timestamp
});

const validClaimAssessment = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  claim_id: id(),
  evaluation_id: id(),
  result: "Satisfied",
  evidence_ids: [id()],
  digest: digest("claim_assessment"),
  created_at: timestamp
});

const validIndependentEvaluation = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  artifact_id: id(),
  artifact_digest: digest("artifact"),
  requirement_set_id: id(),
  input_digest: digest("evaluation_input"),
  result: "ALLOW",
  reason: "required claims satisfied and no open refutes",
  created_at: timestamp
});

const validEvidencePackage = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  package_kind: "test",
  claim_ids: [id()],
  evidence_ids: [id()],
  evaluation_ids: [id()],
  digest: digest("evidence_package"),
  created_at: timestamp
});

const validImpactAssessment = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  trigger: "artifact",
  subject_type: "evidence",
  subject_id: id(),
  rule: "digest_changed",
  old_input_digest: digest("old_artifact"),
  new_input_digest: digest("new_artifact"),
  old_validity: "Valid",
  new_validity: "Stale",
  affected_ids: [id()],
  created_at: timestamp
});

const validRepairLink = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  failed_evidence_id: id(),
  source_work_item_id: id(),
  task_id: id(),
  artifact_id: id(),
  repair_work_item_id: id(),
  created_at: timestamp
});

const validGateEvaluation = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  gate_type: "intent",
  result: "ALLOW",
  policy_snapshot_id: id(),
  digest: digest("gate_evaluation"),
  created_at: timestamp
});

describe("M3 evidence schemas", () => {
  it("parses claim, evidence, requirement, evaluation and impact objects", () => {
    expect(parseNamed("Claim", validClaim())).toMatchObject({ obligation: "required" });
    expect(parseNamed("Evidence", validEvidence())).toMatchObject({ stance: "Supports" });
    expect(parseNamed("ExternalReference", validExternalReference())).toMatchObject({
      media_type: "application/xml"
    });
    expect(parseNamed("GateRequirementSet", validRequirementSet())).toMatchObject({ version: 1 });
    expect(parseNamed("ClaimAssessment", validClaimAssessment())).toMatchObject({ result: "Satisfied" });
    expect(parseNamed("IndependentEvaluation", validIndependentEvaluation())).toMatchObject({ result: "ALLOW" });
    expect(parseNamed("EvidencePackageManifest", validEvidencePackage())).toMatchObject({ package_kind: "test" });
    expect(parseNamed("ImpactAssessment", validImpactAssessment())).toMatchObject({ new_validity: "Stale" });
    expect(parseNamed("RepairWorkItemLink", validRepairLink())).toMatchObject({
      failed_evidence_id: expect.any(String)
    });
  });

  it("rejects illegal stance and validity values", () => {
    expect(() => parseNamed("Evidence", { ...validEvidence(), stance: "Pass" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("Evidence", { ...validEvidence(), stance: "supports" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("ImpactAssessment", { ...validImpactAssessment(), new_validity: "expired" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("ImpactAssessment", { ...validImpactAssessment(), old_validity: "ok" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("rejects illegal digests and missing subject bindings", () => {
    expect(() =>
      parseNamed("Evidence", {
        ...validEvidence(),
        digest: { algorithm: "md5", value: "abc", subject: "evidence" }
      })
    ).toThrow(protocol.ProtocolValidationError);
    expect(() =>
      parseNamed("Evidence", {
        ...validEvidence(),
        subject_digest: { algorithm: "sha256", value: "A".repeat(64), subject: "artifact" }
      })
    ).toThrow(protocol.ProtocolValidationError);
    const { subject_digest: _omitted, ...unbound } = validEvidence();
    expect(() => parseNamed("Evidence", unbound)).toThrow(protocol.ProtocolValidationError);
    const { subject_id: _id, ...withoutSubject } = validEvidence();
    expect(() => parseNamed("Evidence", withoutSubject)).toThrow(protocol.ProtocolValidationError);
  });

  it("rejects secrets, raw logs and copied content on evidence objects", () => {
    expect(() => parseNamed("Evidence", { ...validEvidence(), secret: "sk-secret" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("Evidence", { ...validEvidence(), raw_log: "<xml/>" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("ExternalReference", { ...validExternalReference(), token: "bearer-secret" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("ExternalReference", { ...validExternalReference(), password: "pwd" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() =>
      parseNamed("EvidencePackageManifest", { ...validEvidencePackage(), transcript: "full evaluator chat" })
    ).toThrow(protocol.ProtocolValidationError);
    expect(() => parseNamed("Claim", { ...validClaim(), api_key: "env-secret" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("extends GateEvaluation with evaluation bindings and still rejects secrets", () => {
    expect(
      parseNamed("GateEvaluation", {
        ...validGateEvaluation(),
        requirement_set_id: id(),
        artifact_id: id(),
        artifact_digest: digest("artifact"),
        independent_evaluation_id: id(),
        reason: "independent evaluation allow"
      })
    ).toMatchObject({ result: "ALLOW" });
    expect(() => parseNamed("GateEvaluation", { ...validGateEvaluation(), secret: "token" })).toThrow(
      protocol.ProtocolValidationError
    );
  });
});

describe("M3 command parsers", () => {
  const commands = () => [
    envelope("SubmitClaim", {
      change_id: id(),
      claim_key: "AC-1",
      statement: "实现满足验收。",
      category: "intent",
      obligation: "required",
      source: "acceptance"
    }),
    envelope("RecordEvidence", {
      change_id: id(),
      claim_id: id(),
      stance: "Supports",
      subject_type: "artifact",
      subject_id: id(),
      subject_digest: digest("artifact"),
      content_reference: "cimi-object://evidence/1",
      digest: digest("evidence"),
      producer_role: "deterministic_test"
    }),
    envelope("PromoteTestResult", {
      change_id: id(),
      claim_id: id(),
      artifact_id: id(),
      artifact_digest: digest("artifact"),
      format: "junit",
      content_reference: "file://reports/junit.xml",
      digest: digest("test_result")
    }),
    envelope("RequestEvaluation", {
      change_id: id(),
      artifact_id: id(),
      artifact_digest: digest("artifact"),
      requirement_set_id: id()
    }),
    envelope("CompleteEvaluation", {
      change_id: id(),
      evaluation_id: id(),
      artifact_id: id(),
      artifact_digest: digest("artifact"),
      requirement_set_id: id(),
      input_digest: digest("evaluation_input"),
      result: "ALLOW",
      reason: "required claims satisfied"
    }),
    envelope("AssessImpact", {
      change_id: id(),
      trigger: "artifact",
      subject_type: "evidence",
      subject_id: id(),
      rule: "digest_changed",
      old_input_digest: digest("old_artifact"),
      new_input_digest: digest("new_artifact"),
      new_validity: "Stale",
      affected_ids: [id()]
    }),
    envelope("CreateRepairWorkItem", {
      change_id: id(),
      failed_evidence_id: id(),
      source_work_item_id: id(),
      artifact_id: id(),
      task_id: id()
    })
  ];

  it("parses the seven M3 evidence commands", () => {
    for (const command of commands()) {
      expect(protocol.parseCommand(command)).toMatchObject({ command_type: command.command_type });
    }
  });

  it("requires expected revision and rejects secret command fields", () => {
    const valid = envelope("RecordEvidence", {
      change_id: id(),
      claim_id: id(),
      stance: "Refutes",
      subject_type: "artifact",
      subject_id: id(),
      subject_digest: digest("artifact"),
      content_reference: "cimi-object://evidence/refute",
      digest: digest("evidence"),
      producer_role: "evaluator"
    });
    expect(protocol.parseCommand(valid).expected_revision).toBe(1);
    const { expected_revision: _omitted, ...withoutRevision } = valid;
    expect(() => protocol.parseCommand(withoutRevision)).toThrow(protocol.ProtocolValidationError);
    expect(() =>
      protocol.parseCommand(
        envelope("PromoteTestResult", {
          change_id: id(),
          claim_id: id(),
          artifact_id: id(),
          artifact_digest: digest("artifact"),
          format: "junit",
          content_reference: "file://reports/junit.xml",
          digest: digest("test_result"),
          secret: "ci-token"
        })
      )
    ).toThrow(protocol.ProtocolValidationError);
    expect(() =>
      protocol.parseCommand(
        envelope("PromoteTestResult", {
          change_id: id(),
          claim_id: id(),
          artifact_id: id(),
          artifact_digest: digest("artifact"),
          format: "unknown_ci",
          content_reference: "file://reports/out.txt",
          digest: digest("test_result")
        })
      )
    ).toThrow(protocol.ProtocolValidationError);
  });
});

describe("M3 command success results", () => {
  it("accepts a strict claim, evidence and evaluation success payload", () => {
    const claim = validClaim();
    const evidence = validEvidence();
    const evaluation = validIndependentEvaluation();
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "claim", id: claim.id, domain_version: 1 },
        revision: 2,
        events: [],
        data: { claim }
      })
    ).toMatchObject({ ok: true });
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "evidence", id: evidence.id, domain_version: 1 },
        revision: 3,
        events: [],
        data: { evidence }
      })
    ).toMatchObject({ ok: true });
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "independent_evaluation", id: evaluation.id, domain_version: 1 },
        revision: 4,
        events: [],
        data: { evaluation, assessments: [validClaimAssessment()] }
      })
    ).toMatchObject({ ok: true });
  });

  it("rejects success payloads that smuggle secrets or raw logs", () => {
    expect(() =>
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "evidence", id: id(), domain_version: 1 },
        revision: 1,
        events: [],
        data: { evidence: validEvidence(), secret: "token", raw_log: "hidden" }
      })
    ).toThrow(protocol.ProtocolValidationError);
  });
});
