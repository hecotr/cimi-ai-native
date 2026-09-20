import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Claim,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../src/kernel.js";
import { isIndependentProducer } from "../src/evidence/ingest.js";
import { parseWhitelistedTestResult } from "../src/evidence/promotion.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "c".repeat(64),
  subject
});

afterEach(() => {
  while (openStores.length > 0) {
    openStores.pop()?.close();
  }
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  if (!("ok" in result && result.ok)) throw new Error(JSON.stringify(result));
  return result;
};

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const envelope = (
  type: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  revision: number,
  changeId: InternalId
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: type,
  requested_at: now,
  actor_id: actorId,
  project_id: projectId,
  expected_revision: revision,
  target: { object_type: "change" as const, id: changeId, domain_version: 1 },
  source: { origin: "system" as const, producer: "m3-ingest-test" },
  payload
});

const bootstrap = (kernel: CimiLoopKernel) => {
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m3-ingest-test" },
      payload: {
        name: "M3 Ingest",
        repository_kind: "directory",
        repository_path: "/tmp/m3-ingest",
        owner_name: "Owner"
      }
    })
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      actor_id: initialized.data.actor.id,
      project_id: initialized.data.project.id,
      source: { origin: "human_cli" as const, producer: "m3-ingest-test" },
      payload: { title: "Ingest" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  return {
    projectId: initialized.data.project.id,
    actorId: initialized.data.actor.id,
    changeId: created.data.change.id,
    revision: created.data.change.revision
  };
};

const revisionOf = (kernel: CimiLoopKernel, changeId: InternalId): number => {
  const change = kernel.getChange(changeId);
  if ("code" in change) throw new Error(change.code);
  return change.revision;
};

const evidenceOf = (result: CommandSuccess) => {
  if (!("evidence" in result.data)) throw new Error("missing evidence");
  return result.data.evidence;
};

const seedClaim = (store: SqliteProjectStore, projectId: InternalId, changeId: InternalId): Claim => {
  const claim: Claim = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: projectId,
    change_id: changeId,
    claim_key: "AC-1",
    statement: "验收通过。",
    category: "intent",
    obligation: "required",
    source: "acceptance",
    contract_id: createInternalId(),
    contract_version: 1,
    created_at: now
  };
  store.transaction((transaction) => transaction.insertClaim(claim));
  return claim;
};

describe("evidence promotion parser", () => {
  it("promotes whitelist formats and marks unreadable results invalid", () => {
    expect(parseWhitelistedTestResult("junit", '<testsuite failures="0" tests="1"></testsuite>')).toEqual({
      kind: "parsed",
      stance: "Supports"
    });
    expect(parseWhitelistedTestResult("junit", '<testsuite failures="1"><failure/></testsuite>')).toEqual({
      kind: "parsed",
      stance: "Refutes"
    });
    expect(parseWhitelistedTestResult("tap", "ok 1 file\n")).toEqual({ kind: "parsed", stance: "Supports" });
    expect(parseWhitelistedTestResult("tap", "not ok 1 file\n")).toEqual({ kind: "parsed", stance: "Refutes" });
    expect(parseWhitelistedTestResult("cimiloop_test_v1", JSON.stringify({ passed: true }))).toEqual({
      kind: "parsed",
      stance: "Supports"
    });
    expect(parseWhitelistedTestResult("junit", "not-xml")).toEqual({ kind: "invalid", reason: "unparseable" });
    expect(isIndependentProducer("executor")).toBe(false);
    expect(isIndependentProducer("evaluator")).toBe(true);
    expect(isIndependentProducer("deterministic_test")).toBe(true);
  });
});

describe("evidence ingestion commands", () => {
  it("records immutable evidence and refuses to rewrite refutes", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-ingest-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const claim = seedClaim(store, ctx.projectId, ctx.changeId);
    const subjectId = createInternalId();
    const recorded = success(
      kernel.execute(
        envelope(
          "RecordEvidence",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_id: claim.id,
            stance: "Refutes",
            subject_type: "artifact",
            subject_id: subjectId,
            subject_digest: digest("artifact"),
            content_reference: "cimi-object://evidence/refute",
            digest: digest("evidence"),
            producer_role: "evaluator"
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect(evidenceOf(recorded).stance).toBe("Refutes");
    const conflict = failure(
      kernel.execute(
        envelope(
          "RecordEvidence",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_id: claim.id,
            stance: "Supports",
            subject_type: "artifact",
            subject_id: subjectId,
            subject_digest: digest("artifact"),
            content_reference: "cimi-object://evidence/rewrite",
            digest: digest("evidence"),
            producer_role: "evaluator"
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect(conflict.code).toBe("EVIDENCE_BINDING_CONFLICT");
    const loaded = kernel.getEvidence(evidenceOf(recorded).id);
    expect("stance" in loaded && loaded.stance).toBe("Refutes");
  });

  it("promotes a junit pass and does not guess stance from unreadable output", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-promote-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const claim = seedClaim(store, ctx.projectId, ctx.changeId);
    const junit = join(directory, "junit.xml");
    writeFileSync(junit, '<testsuite failures="0" tests="1"></testsuite>\n');
    const promoted = success(
      kernel.execute(
        envelope(
          "PromoteTestResult",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_id: claim.id,
            artifact_id: createInternalId(),
            artifact_digest: digest("artifact"),
            format: "junit",
            content_reference: pathToFileURL(junit).href,
            digest: digest("test_result")
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect(evidenceOf(promoted).stance).toBe("Supports");
    expect(evidenceOf(promoted).producer_role).toBe("deterministic_test");
    const broken = join(directory, "broken.xml");
    writeFileSync(broken, "????");
    const invalid = success(
      kernel.execute(
        envelope(
          "PromoteTestResult",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_id: claim.id,
            artifact_id: createInternalId(),
            artifact_digest: digest("artifact"),
            format: "junit",
            content_reference: pathToFileURL(broken).href,
            digest: digest("test_result_invalid")
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect(evidenceOf(invalid).stance).toBe("Inconclusive");
    const impacts = store.transaction((transaction) =>
      transaction.listImpactAssessmentsBySubject(evidenceOf(invalid).id)
    );
    expect(impacts[0]?.new_validity).toBe("Invalid");
  });

  it("rejects a human origin that claims an evaluator producer role", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-ingest-role-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const claim = seedClaim(store, ctx.projectId, ctx.changeId);
    const rejected = failure(
      kernel.execute({
        ...envelope(
          "RecordEvidence",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_id: claim.id,
            stance: "Supports",
            subject_type: "artifact",
            subject_id: createInternalId(),
            subject_digest: digest("artifact"),
            content_reference: "cimi-object://evidence/claimed",
            digest: digest("evidence"),
            producer_role: "evaluator"
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        ),
        source: { origin: "human_cli" as const, producer: "m3-ingest-test" }
      })
    );
    expect(rejected.code).toBe("PRODUCER_ROLE_MISMATCH");
  });
});
