import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Claim,
  type CommandSuccess,
  type DomainError,
  type Evidence,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { classifyImpact, projectValidity } from "../src/evidence/impact.js";
import { CimiLoopKernel } from "../src/kernel.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string, value = "a".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
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

describe("precise impact classification", () => {
  const artifactId = createInternalId();
  const binding = {
    subject_type: "artifact" as const,
    subject_id: artifactId,
    subject_digest: digest("artifact")
  };

  it("only applies to evidence that binds the changed subject", () => {
    expect(
      classifyImpact({
        trigger: "artifact",
        binding,
        change: { subject_type: "artifact", subject_id: artifactId, old_digest: digest("artifact"), new_digest: digest("artifact", "b".repeat(64)) }
      }).applies
    ).toBe(true);
    expect(
      classifyImpact({
        trigger: "artifact",
        binding,
        change: { subject_type: "artifact", subject_id: createInternalId(), old_digest: digest("artifact"), new_digest: digest("artifact", "b".repeat(64)) }
      }).applies
    ).toBe(false);
    expect(
      classifyImpact({
        trigger: "environment",
        binding,
        change: { subject_type: "environment", subject_id: createInternalId(), old_digest: digest("env"), new_digest: digest("env", "b".repeat(64)) }
      }).applies
    ).toBe(false);
  });

  it("marks digest changes stale or superseded and integrity failures invalid", () => {
    expect(
      classifyImpact({
        trigger: "artifact",
        binding,
        change: {
          subject_type: "artifact",
          subject_id: artifactId,
          old_digest: digest("artifact"),
          new_digest: digest("artifact", "b".repeat(64))
        }
      })
    ).toMatchObject({ applies: true, new_validity: "Stale", rule: "artifact_digest_changed" });
    expect(
      classifyImpact({
        trigger: "artifact",
        binding,
        change: {
          subject_type: "artifact",
          subject_id: artifactId,
          old_digest: digest("artifact"),
          new_digest: digest("artifact", "b".repeat(64)),
          replacement: true
        }
      })
    ).toMatchObject({ applies: true, new_validity: "Superseded", rule: "artifact_digest_superseded" });
    expect(
      classifyImpact({
        trigger: "artifact",
        binding,
        change: {
          subject_type: "artifact",
          subject_id: artifactId,
          old_digest: digest("artifact"),
          new_digest: digest("artifact"),
          integrity_broken: true
        }
      })
    ).toMatchObject({ applies: true, new_validity: "Invalid", rule: "evidence_integrity_broken" });
    expect(
      classifyImpact({
        trigger: "artifact",
        binding: { ...binding, subject_id: createInternalId() },
        change: {
          subject_type: "artifact",
          subject_id: artifactId,
          old_digest: digest("artifact"),
          new_digest: digest("artifact"),
          subject_mismatch: true
        }
      })
    ).toMatchObject({ applies: true, new_validity: "Invalid", rule: "evidence_subject_mismatch" });
  });

  it("projects current validity from append-only impact assessments", () => {
    expect(projectValidity([])).toBe("Valid");
    expect(
      projectValidity([
        { new_validity: "Stale" },
        { new_validity: "Superseded" }
      ])
    ).toBe("Superseded");
  });
});

const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  if (!("ok" in result && result.ok)) throw new Error(JSON.stringify(result));
  return result;
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
  source: { origin: "system" as const, producer: "m3-impact-test" },
  payload
});

describe("AssessImpact kernel command", () => {
  it("records an immutable impact without rewriting evidence payload", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-impact-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const initialized = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "InitializeProject",
        requested_at: now,
        actor_id: createInternalId(),
        project_id: createInternalId(),
        source: { origin: "human_cli" as const, producer: "m3-impact-test" },
        payload: {
          name: "M3 Impact",
          repository_kind: "directory",
          repository_path: "/tmp/m3-impact",
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
        source: { origin: "human_cli" as const, producer: "m3-impact-test" },
        payload: { title: "Impact" }
      })
    );
    if (!("change" in created.data)) throw new Error("missing change");
    const claim: Claim = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: initialized.data.project.id,
      change_id: created.data.change.id,
      claim_key: "AC-1",
      statement: "验收通过。",
      category: "intent",
      obligation: "required",
      source: "acceptance",
      contract_id: createInternalId(),
      contract_version: 1,
      created_at: now
    };
    const recorded: Evidence = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: initialized.data.project.id,
      change_id: created.data.change.id,
      claim_id: claim.id,
      stance: "Supports",
      subject_type: "artifact",
      subject_id: createInternalId(),
      subject_digest: digest("artifact"),
      content_reference: "cimi-object://evidence/keep",
      digest: digest("evidence"),
      producer_role: "evaluator",
      created_at: now
    };
    store.transaction((transaction) => {
      transaction.insertClaim(claim);
      transaction.insertEvidence(recorded);
    });
    const assessed = success(
      kernel.execute(
        envelope(
          "AssessImpact",
          initialized.data.project.id,
          initialized.data.actor.id,
          {
            change_id: created.data.change.id,
            trigger: "artifact",
            subject_type: "artifact",
            subject_id: recorded.subject_id,
            rule: "artifact_digest_changed",
            old_input_digest: recorded.subject_digest,
            new_input_digest: digest("artifact", "b".repeat(64)),
            old_validity: "Valid",
            new_validity: "Stale",
            affected_ids: [recorded.id]
          },
          created.data.change.revision,
          created.data.change.id
        )
      )
    );
    expect("impact" in assessed.data).toBe(true);
    if (!("impact" in assessed.data)) throw new Error("missing impact");
    expect(assessed.data.impact.new_validity).toBe("Stale");
    expect(assessed.data.impact.affected_ids).toEqual([recorded.id]);
    const unchanged = kernel.getEvidence(recorded.id);
    if ("code" in unchanged) throw new Error(unchanged.code);
    expect(unchanged.stance).toBe("Supports");
    expect(unchanged.digest.value).toBe(recorded.digest.value);
    expect(unchanged.content_reference).toBe(recorded.content_reference);
  });
});
