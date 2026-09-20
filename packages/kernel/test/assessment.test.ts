import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Artifact,
  type Claim,
  type CommandSuccess,
  type DomainError,
  type Evidence,
  type GateRequirementSet,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { assessClaim } from "../src/evidence/assessment.js";
import { evaluateEvidenceGate, evaluationInputDigest, findReusableEvaluation } from "../src/evidence/evaluation-gate.js";
import { CimiLoopKernel } from "../src/kernel.js";
import { createPlanningWorkItem } from "../src/work-item.js";

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

const claim = (overrides: Partial<Claim> = {}): Claim => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: createInternalId(),
  change_id: createInternalId(),
  claim_key: "AC-1",
  statement: "验收通过。",
  category: "intent",
  obligation: "required",
  source: "acceptance",
  contract_id: createInternalId(),
  contract_version: 1,
  created_at: now,
  ...overrides
});

const evidence = (target: Claim, stance: Evidence["stance"], producer: Evidence["producer_role"] = "evaluator"): Evidence => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: target.project_id,
  change_id: target.change_id,
  claim_id: target.id,
  stance,
  subject_type: "artifact",
  subject_id: createInternalId(),
  subject_digest: digest("artifact"),
  content_reference: "cimi-object://evidence/sample",
  digest: digest("evidence"),
  producer_role: producer,
  created_at: now
});

describe("claim assessment", () => {
  it("satisfies required claims with valid support and no refutes", () => {
    const target = claim();
    const support = evidence(target, "Supports", "deterministic_test");
    const assessed = assessClaim({
      claim: target,
      requirement: {
        claim_key: "AC-1",
        obligation: "required",
        source: "acceptance",
        accepted_evidence_kinds: ["deterministic_test", "evaluator"]
      },
      evidence: [support],
      validity: { [support.id]: "Valid" }
    });
    expect(assessed.result).toBe("Satisfied");
    expect(assessed.evidence_ids).toEqual([support.id]);
  });

  it("refutes instead of majority-voting when valid supports and refutes coexist", () => {
    const target = claim();
    const support = evidence(target, "Supports");
    const refute = evidence(target, "Refutes");
    const assessed = assessClaim({
      claim: target,
      requirement: {
        claim_key: "AC-1",
        obligation: "required",
        source: "acceptance",
        accepted_evidence_kinds: ["evaluator"]
      },
      evidence: [support, support, refute],
      validity: { [support.id]: "Valid", [refute.id]: "Valid" }
    });
    expect(assessed.result).toBe("Conflicted");
  });

  it("treats unresolved refutes as refuted and ignores stale supports", () => {
    const target = claim();
    const staleSupport = evidence(target, "Supports");
    const refute = evidence(target, "Refutes");
    const assessed = assessClaim({
      claim: target,
      requirement: {
        claim_key: "AC-1",
        obligation: "required",
        source: "acceptance",
        accepted_evidence_kinds: ["evaluator"]
      },
      evidence: [staleSupport, refute],
      validity: { [staleSupport.id]: "Stale", [refute.id]: "Valid" }
    });
    expect(assessed.result).toBe("Refuted");
  });

  it("marks missing or inconclusive observations insufficient", () => {
    const target = claim();
    const inconclusive = evidence(target, "Inconclusive");
    expect(
      assessClaim({
        claim: target,
        requirement: {
          claim_key: "AC-1",
          obligation: "required",
          source: "acceptance",
          accepted_evidence_kinds: ["evaluator"]
        },
        evidence: [inconclusive],
        validity: { [inconclusive.id]: "Valid" }
      }).result
    ).toBe("Insufficient");
    expect(
      assessClaim({
        claim: target,
        requirement: {
          claim_key: "AC-1",
          obligation: "required",
          source: "acceptance",
          accepted_evidence_kinds: ["evaluator"]
        },
        evidence: [],
        validity: {}
      }).result
    ).toBe("Insufficient");
  });
});

describe("evidence evaluation gate", () => {
  const required = claim();
  const human = claim({ claim_key: "policy.knowledge_closure", source: "policy", category: "boundary" });
  const policy = claim({ claim_key: "risk.security", source: "risk", category: "risk" });

  it("allows only when every required claim is satisfied and no unresolved refutes remain", () => {
    expect(
      evaluateEvidenceGate({
        assessments: [{ claim: required, result: "Satisfied" }],
        unresolvedRefutes: false
      }).result
    ).toBe("ALLOW");
    expect(
      evaluateEvidenceGate({
        assessments: [{ claim: required, result: "Satisfied" }],
        unresolvedRefutes: true
      }).result
    ).not.toBe("ALLOW");
  });

  it("routes insufficient, human judgment, conflict and hard policy without majority voting", () => {
    expect(
      evaluateEvidenceGate({
        assessments: [{ claim: required, result: "Insufficient" }],
        unresolvedRefutes: false
      }).result
    ).toBe("NEED_MORE_EVIDENCE");
    expect(
      evaluateEvidenceGate({
        assessments: [{ claim: human, result: "Insufficient" }],
        unresolvedRefutes: false
      }).result
    ).toBe("REQUIRE_HUMAN");
    expect(
      evaluateEvidenceGate({
        assessments: [{ claim: required, result: "Conflicted" }],
        unresolvedRefutes: false
      }).result
    ).toBe("REQUIRE_HUMAN");
    expect(
      evaluateEvidenceGate({
        assessments: [{ claim: policy, result: "Refuted" }],
        unresolvedRefutes: true
      }).result
    ).toBe("DENY");
  });

  it("reuses evaluations for the same input digest and creates a new record when inputs change", () => {
    const first = evaluationInputDigest({
      artifactDigest: digest("artifact"),
      requirementSetDigest: digest("requirement_set"),
      evidenceDigests: [digest("evidence")]
    });
    const same = evaluationInputDigest({
      artifactDigest: digest("artifact"),
      requirementSetDigest: digest("requirement_set"),
      evidenceDigests: [digest("evidence")]
    });
    const changed = evaluationInputDigest({
      artifactDigest: digest("artifact", "b".repeat(64)),
      requirementSetDigest: digest("requirement_set"),
      evidenceDigests: [digest("evidence")]
    });
    expect(first.value).toBe(same.value);
    expect(changed.value).not.toBe(first.value);
    const existing = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: createInternalId(),
      change_id: createInternalId(),
      artifact_id: createInternalId(),
      artifact_digest: digest("artifact"),
      requirement_set_id: createInternalId(),
      input_digest: first,
      result: "ALLOW" as const,
      reason: "required claims satisfied",
      created_at: now
    };
    expect(findReusableEvaluation([existing], first)?.id).toBe(existing.id);
    expect(findReusableEvaluation([existing], changed)).toBeUndefined();
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
  source: { origin: "system" as const, producer: "m3-assessment-test" },
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
      source: { origin: "human_cli" as const, producer: "m3-assessment-test" },
      payload: {
        name: "M3 Assessment",
        repository_kind: "directory",
        repository_path: "/tmp/m3-assessment",
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
      source: { origin: "human_cli" as const, producer: "m3-assessment-test" },
      payload: { title: "Assess" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  return {
    projectId: initialized.data.project.id,
    actorId: initialized.data.actor.id,
    changeId: created.data.change.id,
    revision: created.data.change.revision,
    lifecycle: created.data.change.lifecycle_state
  };
};

describe("CompleteEvaluation kernel command", () => {
  it("records a kernel-computed evaluation without letting evaluator result change Change state", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-assess-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const sourceWorkItem = createPlanningWorkItem({
      id: createInternalId(),
      projectId: ctx.projectId,
      changeId: ctx.changeId,
      contractId: createInternalId(),
      contractVersion: 1,
      policySnapshotId: createInternalId(),
      now
    });
    const requirementSet: GateRequirementSet = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      version: 1,
      profile_key: "feature",
      policy_snapshot_id: createInternalId(),
      contract_id: sourceWorkItem.contract_id,
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
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      work_item_id: sourceWorkItem.id,
      run_id: createInternalId(),
      context_pack_id: createInternalId(),
      binding_id: createInternalId(),
      source_snapshot_id: createInternalId(),
      contract_id: requirementSet.contract_id,
      contract_version: 1,
      plan_id: createInternalId(),
      plan_version: 1,
      status: "candidate",
      summary: "candidate artifact",
      digest: digest("artifact"),
      content_reference: "file://artifact.bin",
      created_at: now
    };
    const target = claim({
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      contract_id: requirementSet.contract_id,
      requirement_set_id: requirementSet.id,
      artifact_id: artifact.id,
      artifact_digest: artifact.digest
    });
    const support = evidence(target, "Supports");
    support.subject_id = artifact.id;
    support.subject_digest = artifact.digest;
    store.transaction((transaction) => {
      transaction.insertWorkItem(sourceWorkItem);
      transaction.insertGateRequirementSet(requirementSet);
      transaction.insertArtifact(artifact);
      transaction.insertClaim(target);
      transaction.insertEvidence(support);
    });
    const completed = success(
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
            reason: "evaluator self-score"
          },
          ctx.revision,
          ctx.changeId
        )
      )
    );
    expect("evaluation" in completed.data).toBe(true);
    if (!("evaluation" in completed.data)) throw new Error("missing evaluation");
    expect(completed.data.evaluation.result).toBe("ALLOW");
    expect(completed.data.evaluation.reason).not.toContain("evaluator self-score");
    const change = kernel.getChange(ctx.changeId);
    if ("code" in change) throw new Error(change.code);
    expect(change.lifecycle_state).toBe(ctx.lifecycle);
    const reused = success(
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
            input_digest: digest("ignored-again"),
            result: "DENY",
            reason: "second attempt"
          },
          change.revision,
          ctx.changeId
        )
      )
    );
    if (!("evaluation" in reused.data)) throw new Error("missing reused evaluation");
    expect(reused.data.evaluation.id).toBe(completed.data.evaluation.id);
  });
});
