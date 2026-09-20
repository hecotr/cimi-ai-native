import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { denyProductionWrite } from "../../packages/evaluator/src/runner.js";
import { CimiLoopKernel } from "../../packages/kernel/src/kernel.js";
import { createPlanningWorkItem } from "../../packages/kernel/src/work-item.js";
import {
  SCHEMA_VERSION,
  createInternalId,
  parseEvidencePackageShowResult,
  type Artifact,
  type CommandSuccess,
  type DomainError,
  type Evidence,
  type GateRequirementSet,
  type InternalId,
  type WorkItem
} from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";

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
  source: { origin: "system" as const, producer: "m3-scenario" },
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
      source: { origin: "human_cli" as const, producer: "m3-scenario" },
      payload: {
        name: "M3 Scenarios",
        repository_kind: "directory",
        repository_path: "/tmp/m3-scenarios",
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
      source: { origin: "human_cli" as const, producer: "m3-scenario" },
      payload: { title: "Evidence scenarios" }
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

const seedArtifact = (
  store: SqliteProjectStore,
  projectId: InternalId,
  changeId: InternalId,
  artifactDigest = digest("artifact")
) => {
  const workItem = createPlanningWorkItem({
    id: createInternalId(),
    projectId,
    changeId,
    contractId: createInternalId(),
    contractVersion: 1,
    policySnapshotId: createInternalId(),
    now
  });
  const requirementSet: GateRequirementSet = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: projectId,
    change_id: changeId,
    version: 1,
    profile_key: "feature",
    policy_snapshot_id: workItem.policy_snapshot_id,
    contract_id: workItem.contract_id,
    contract_version: 1,
    items: [
      {
        claim_key: "AC-1",
        obligation: "required",
        source: "acceptance",
        accepted_evidence_kinds: ["evaluator"]
      }
    ],
    digest: digest("requirement_set"),
    created_at: now
  };
  const artifact: Artifact = {
    schema_version: SCHEMA_VERSION,
    id: createInternalId(),
    project_id: projectId,
    change_id: changeId,
    work_item_id: workItem.id,
    run_id: createInternalId(),
    context_pack_id: createInternalId(),
    binding_id: createInternalId(),
    source_snapshot_id: createInternalId(),
    contract_id: workItem.contract_id,
    contract_version: 1,
    plan_id: createInternalId(),
    plan_version: 1,
    status: "candidate",
    summary: "scenario artifact",
    digest: artifactDigest,
    content_reference: "file://artifact.bin",
    created_at: now
  };
  store.transaction((transaction) => {
    transaction.insertWorkItem(workItem);
    transaction.insertGateRequirementSet(requirementSet);
    transaction.insertArtifact(artifact);
  });
  return { workItem, requirementSet, artifact };
};

describe("M3 evidence scenarios", () => {
  it("allows only after independent evidence, not because an artifact exists", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m3-pass-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const { requirementSet, artifact } = seedArtifact(store, ctx.projectId, ctx.changeId);
    const empty = success(
      kernel.execute(
        envelope(
          "CompleteEvaluation",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            evaluation_id: createInternalId(),
            artifact_id: artifact.id,
            artifact_digest: artifact.digest,
            requirement_set_id: requirementSet.id,
            input_digest: digest("ignored"),
            result: "ALLOW",
            reason: "artifact exists"
          },
          ctx.revision,
          ctx.changeId
        )
      )
    );
    if (!("evaluation" in empty.data)) throw new Error("missing evaluation");
    expect(empty.data.evaluation.result).toBe("NEED_MORE_EVIDENCE");
    const submitted = success(
      kernel.execute(
        envelope(
          "SubmitClaim",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_key: "AC-1",
            statement: "验收通过。",
            category: "intent",
            obligation: "required",
            source: "acceptance",
            requirement_set_id: requirementSet.id,
            artifact_id: artifact.id,
            artifact_digest: artifact.digest
          },
          empty.revision,
          ctx.changeId
        )
      )
    );
    if (!("claim" in submitted.data)) throw new Error("missing claim");
    const recorded = success(
      kernel.execute(
        envelope(
          "RecordEvidence",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_id: submitted.data.claim.id,
            stance: "Supports",
            subject_type: "artifact",
            subject_id: artifact.id,
            subject_digest: artifact.digest,
            content_reference: "cimi-object://evidence/pass",
            digest: digest("evidence"),
            producer_role: "evaluator"
          },
          submitted.revision,
          ctx.changeId
        )
      )
    );
    const allowed = success(
      kernel.execute(
        envelope(
          "CompleteEvaluation",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            evaluation_id: createInternalId(),
            artifact_id: artifact.id,
            artifact_digest: artifact.digest,
            requirement_set_id: requirementSet.id,
            input_digest: digest("ignored"),
            result: "DENY",
            reason: "model self-score"
          },
          recorded.revision,
          ctx.changeId
        )
      )
    );
    if (!("evaluation" in allowed.data)) throw new Error("missing allowed evaluation");
    expect(allowed.data.evaluation.result).toBe("ALLOW");
    const pack = kernel.getEvidencePackage(ctx.changeId);
    if ("code" in pack) throw new Error(pack.code);
    expect(parseEvidencePackageShowResult(pack).package.evidence_ids.length).toBeGreaterThan(0);
    expect(JSON.stringify(pack)).not.toContain("full conversation");
    expect(JSON.stringify(pack)).not.toContain("SECRET");
  });

  it("blocks ALLOW on refutes, creates a repair loop, and re-evaluates a new artifact", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m3-repair-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const { workItem, requirementSet, artifact } = seedArtifact(store, ctx.projectId, ctx.changeId);
    const submitted = success(
      kernel.execute(
        envelope(
          "SubmitClaim",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_key: "AC-1",
            statement: "验收通过。",
            category: "intent",
            obligation: "required",
            source: "acceptance",
            requirement_set_id: requirementSet.id
          },
          ctx.revision,
          ctx.changeId
        )
      )
    );
    if (!("claim" in submitted.data)) throw new Error("missing claim");
    const refuted = success(
      kernel.execute(
        envelope(
          "RecordEvidence",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_id: submitted.data.claim.id,
            stance: "Refutes",
            subject_type: "artifact",
            subject_id: artifact.id,
            subject_digest: artifact.digest,
            content_reference: "cimi-object://evidence/refute",
            digest: digest("evidence-refute"),
            producer_role: "evaluator"
          },
          submitted.revision,
          ctx.changeId
        )
      )
    );
    if (!("evidence" in refuted.data)) throw new Error("missing evidence");
    const denied = success(
      kernel.execute(
        envelope(
          "CompleteEvaluation",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            evaluation_id: createInternalId(),
            artifact_id: artifact.id,
            artifact_digest: artifact.digest,
            requirement_set_id: requirementSet.id,
            input_digest: digest("ignored"),
            result: "ALLOW",
            reason: "should not allow"
          },
          refuted.revision,
          ctx.changeId
        )
      )
    );
    if (!("evaluation" in denied.data)) throw new Error("missing denied evaluation");
    expect(denied.data.evaluation.result).not.toBe("ALLOW");
    const repaired = success(
      kernel.execute(
        envelope(
          "CreateRepairWorkItem",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            failed_evidence_id: refuted.data.evidence.id,
            source_work_item_id: workItem.id,
            artifact_id: artifact.id,
            task_id: createInternalId()
          },
          denied.revision,
          ctx.changeId
        )
      )
    );
    expect("repair_link" in repaired.data).toBe(true);
    const nextDigest = digest("artifact", "b".repeat(64));
    const nextArtifact: Artifact = {
      ...artifact,
      id: createInternalId(),
      digest: nextDigest,
      content_reference: "file://artifact-v2.bin",
      summary: "repaired artifact"
    };
    store.transaction((transaction) => transaction.insertArtifact(nextArtifact));
    const support = success(
      kernel.execute(
        envelope(
          "RecordEvidence",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            claim_id: submitted.data.claim.id,
            stance: "Supports",
            subject_type: "artifact",
            subject_id: nextArtifact.id,
            subject_digest: nextDigest,
            content_reference: "cimi-object://evidence/pass-v2",
            digest: digest("evidence-pass-v2"),
            producer_role: "evaluator"
          },
          repaired.revision,
          ctx.changeId
        )
      )
    );
    success(
      kernel.execute(
        envelope(
          "AssessImpact",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            trigger: "artifact",
            subject_type: "artifact",
            subject_id: artifact.id,
            rule: "artifact_digest_changed",
            old_input_digest: artifact.digest,
            new_input_digest: nextDigest,
            old_validity: "Valid",
            new_validity: "Stale",
            affected_ids: [refuted.data.evidence.id]
          },
          support.revision,
          ctx.changeId
        )
      )
    );
    const change = kernel.getChange(ctx.changeId);
    if ("code" in change) throw new Error(change.code);
    const passed = success(
      kernel.execute(
        envelope(
          "CompleteEvaluation",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            evaluation_id: createInternalId(),
            artifact_id: nextArtifact.id,
            artifact_digest: nextDigest,
            requirement_set_id: requirementSet.id,
            input_digest: digest("ignored"),
            result: "DENY",
            reason: "old allow must not reuse"
          },
          change.revision,
          ctx.changeId
        )
      )
    );
    if (!("evaluation" in passed.data)) throw new Error("missing new evaluation");
    expect(passed.data.evaluation.id).not.toBe(denied.data.evaluation.id);
    expect(passed.data.evaluation.result).toBe("ALLOW");
    const kept = kernel.getArtifact(artifact.id);
    if ("code" in kept) throw new Error(kept.code);
    expect(kept.digest.value).toBe(artifact.digest.value);
  });

  it("denies evaluator production writes", () => {
    const workItem: WorkItem = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: createInternalId(),
      change_id: createInternalId(),
      kind: "evaluation",
      status: "claimed",
      contract_id: createInternalId(),
      contract_version: 1,
      policy_snapshot_id: createInternalId(),
      authorized_role_key: "technical_owner",
      permission_scope: ["workspace.read", "evidence.record"],
      budget: { max_duration_ms: 60000, max_retries: 1 },
      stop_conditions: ["timeout"],
      authorization_digest: digest("work_item_authorization"),
      created_at: now,
      updated_at: now,
      revision: 1
    };
    const denied = denyProductionWrite(workItem);
    expect(denied.kind).toBe("denied");
    if (denied.kind !== "denied") throw new Error("expected denial");
    expect(denied.failure.code).toBe("EVALUATOR_WRITE_DENIED");
  });
});
