import { describe, expect, it } from "vitest";
import type { TSchema } from "typebox";
import * as protocol from "../src/index.js";

const id = (): string => protocol.createInternalId();

const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "a".repeat(64),
  subject
});

const timestamp = "2026-09-20T18:00:00.000Z";

const schemaNamed = (name: string): TSchema => {
  expect(protocol.protocolSchemas).toHaveProperty(name);
  return (protocol.protocolSchemas as Record<string, TSchema>)[name]!;
};

const parseNamed = (name: string, value: unknown): unknown =>
  protocol.compileValidator(schemaNamed(name))(value);

const source = { origin: "human_cli" as const, producer: "m5-schema-test" };

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

const validLearningCandidate = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  source_kind: "failure",
  source_id: id(),
  summary: "Retry created a duplicate deploy key.",
  status: "proposed",
  promoted: false,
  digest: digest("learning_candidate"),
  created_at: timestamp
});

const validKnowledgeUpdateEvidence = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  task_id: id(),
  knowledge_source: "technical",
  conclusion: "Update",
  external_reference_id: id(),
  evidence_id: id(),
  digest: digest("knowledge_update"),
  created_at: timestamp
});

const validClosureEvaluation = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  disposition: "closed",
  result: "ALLOW",
  knowledge_complete: true,
  residual_risk: "none",
  known_issues: [],
  gaps: [],
  digest: digest("closure_evaluation"),
  created_at: timestamp
});

const validPortableEntry = (objectId = id()) => ({
  object_type: "change",
  schema_version: protocol.SCHEMA_VERSION,
  id: objectId,
  digest: digest("portable_entry"),
  payload_reference: "cimi-object://export/change.json"
});

const validExportManifest = () => {
  const first = validPortableEntry();
  return {
    portable_schema_version: protocol.PORTABLE_SCHEMA_VERSION,
    id: id(),
    project_id: id(),
    exported_at: timestamp,
    exporter_actor_id: id(),
    source_instance_id: id(),
    ids: [first.id],
    entries: [first],
    event_sequence_start: 1,
    event_sequence_end: 4,
    latest_revision: 4,
    ownership_state: "active",
    excluded: [{ kind: "secret", reason: "credentials are never exported" }],
    content_digest: digest("export_content"),
    manifest_digest: digest("export_manifest")
  };
};

const validImportReport = () => ({
  portable_schema_version: protocol.PORTABLE_SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  staged_at: timestamp,
  status: "staged",
  runtime_ownership: "dormant",
  conflicts: [],
  duplicate_ids: [],
  digest_mismatches: [],
  summary: "Staged without activating runtime ownership."
});

describe("M5 closure and portability schemas", () => {
  it("accepts closed, cancelled, superseded and archived dispositions and rejects deletion", () => {
    for (const disposition of ["closed", "cancelled", "superseded", "archived"] as const) {
      expect(parseNamed("ClosureEvaluation", { ...validClosureEvaluation(), disposition })).toMatchObject({
        disposition
      });
    }
    expect(() => parseNamed("ClosureEvaluation", { ...validClosureEvaluation(), disposition: "deleted" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(parseNamed("ArchiveRecord", {
      schema_version: protocol.SCHEMA_VERSION,
      id: id(),
      project_id: id(),
      change_id: id(),
      disposition: "archived",
      reason: "Hide a completed change from the default workbench.",
      created_at: timestamp
    })).toMatchObject({ disposition: "archived" });
    expect(parseNamed("CancellationRecord", {
      schema_version: protocol.SCHEMA_VERSION,
      id: id(),
      project_id: id(),
      change_id: id(),
      disposition: "cancelled",
      reason: "Scope withdrawn before delivery.",
      cleanup_summary: "No external deploy was queued.",
      residual_responsibility: "Owner will notify stakeholders.",
      created_at: timestamp
    })).toMatchObject({ disposition: "cancelled" });
    expect(parseNamed("SupersessionRecord", {
      schema_version: protocol.SCHEMA_VERSION,
      id: id(),
      project_id: id(),
      change_id: id(),
      successor_change_id: id(),
      disposition: "superseded",
      reason: "Replaced by a narrower change.",
      created_at: timestamp
    })).toMatchObject({ disposition: "superseded" });
    expect(() =>
      parseNamed("SupersessionRecord", {
        schema_version: protocol.SCHEMA_VERSION,
        id: id(),
        project_id: id(),
        change_id: id(),
        disposition: "superseded",
        reason: "Missing successor would erase lineage.",
        created_at: timestamp
      })
    ).toThrow(protocol.ProtocolValidationError);
  });

  it("keeps export/import schema version independent and requires manifest digests", () => {
    expect(protocol.PORTABLE_SCHEMA_VERSION).not.toBe(protocol.SCHEMA_VERSION);
    const manifest = validExportManifest();
    expect(parseNamed("ExportManifest", manifest)).toMatchObject({
      portable_schema_version: protocol.PORTABLE_SCHEMA_VERSION,
      ownership_state: "active"
    });
    expect(() => parseNamed("ExportManifest", { ...manifest, portable_schema_version: protocol.SCHEMA_VERSION })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("ExportManifest", { ...manifest, manifest_digest: undefined })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("rejects duplicate portable object IDs", () => {
    const first = validPortableEntry();
    const second = { ...validPortableEntry(first.id), object_type: "release" };
    expect(() =>
      parseNamed("ExportManifest", {
        ...validExportManifest(),
        ids: [first.id, first.id],
        entries: [first, second]
      })
    ).toThrow(protocol.ProtocolValidationError);
    expect(parseNamed("PortableObjectEntry", first)).toMatchObject({ id: first.id });
  });

  it("forces imported runtime ownership to stay dormant", () => {
    expect(parseNamed("ImportReport", validImportReport())).toMatchObject({ runtime_ownership: "dormant" });
    expect(() => parseNamed("ImportReport", { ...validImportReport(), runtime_ownership: "active" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("keeps learning candidates unpromoted until a decision exists", () => {
    expect(parseNamed("LearningCandidate", validLearningCandidate())).toMatchObject({ promoted: false });
    expect(() => parseNamed("LearningCandidate", { ...validLearningCandidate(), promoted: true })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(
      parseNamed("LearningCandidate", {
        ...validLearningCandidate(),
        status: "accepted",
        promoted: true,
        decision_id: id()
      })
    ).toMatchObject({ promoted: true });
    expect(parseNamed("KnowledgeUpdateEvidence", validKnowledgeUpdateEvidence())).toMatchObject({
      conclusion: "Update"
    });
    expect(parseNamed("AttentionItem", {
      schema_version: protocol.SCHEMA_VERSION,
      id: id(),
      project_id: id(),
      change_id: id(),
      kind: "knowledge_gap",
      subject_id: id(),
      summary: "Technical knowledge task is still open.",
      status: "open",
      created_at: timestamp,
      updated_at: timestamp,
      revision: 1
    })).toMatchObject({ kind: "knowledge_gap" });
  });
});

describe("M5 commands", () => {
  it("parses closure and portability commands and rejects secret-bearing payloads", () => {
    const commands = [
      ["RecordKnowledgeUpdate", {
        change_id: id(),
        task_id: id(),
        knowledge_source: "technical",
        conclusion: "Update",
        external_reference_id: id(),
        evidence_id: id()
      }],
      ["ProposeClose", { change_id: id(), residual_risk: "none", known_issues: [] }],
      ["CloseChange", { change_id: id(), closure_evaluation_id: id() }],
      ["CancelChange", { change_id: id(), reason: "Withdrawn", cleanup_summary: "No deploy" }],
      ["SupersedeChange", { change_id: id(), successor_change_id: id(), reason: "Narrower replacement" }],
      ["ArchiveChange", { change_id: id(), reason: "Completed last quarter" }],
      ["CreateLearningCandidate", {
        change_id: id(),
        source_kind: "recovery",
        source_id: id(),
        summary: "Preauthorized rollback succeeded."
      }],
      ["ExportProject", { scope: "project" }],
      ["StageImport", { bundle_reference: "file://exports/project.cimi", bundle_digest: digest("export_bundle") }],
      ["CommitImport", { import_report_id: id() }]
    ] as const;
    for (const [commandType, payload] of commands) {
      expect(protocol.parseCommand(envelope(commandType, payload))).toMatchObject({ command_type: commandType });
    }
    expect(() =>
      protocol.parseCommand(
        envelope("ExportProject", { scope: "project", secret: "token", process_env: { TOKEN: "x" } })
      )
    ).toThrow(protocol.ProtocolValidationError);
  });
});

describe("M5 command success results", () => {
  it("accepts closure, learning and staged import payloads", () => {
    const evaluation = validClosureEvaluation();
    const candidate = validLearningCandidate();
    const report = validImportReport();
    const manifest = validExportManifest();
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "change", id: evaluation.change_id, domain_version: 1 },
        revision: 12,
        events: [],
        data: { closure_evaluation: evaluation }
      })
    ).toMatchObject({ ok: true });
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "learning_candidate", id: candidate.id, domain_version: 1 },
        revision: 13,
        events: [],
        data: { learning_candidate: candidate }
      })
    ).toMatchObject({ ok: true });
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "project", id: report.project_id, domain_version: 1 },
        revision: 14,
        events: [],
        data: { import_report: report, export_manifest: manifest }
      })
    ).toMatchObject({ ok: true });
  });
});
