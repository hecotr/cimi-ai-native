import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createInternalId, type Artifact, type Claim, type ContextSource, type WorkItem } from "../../protocol/src/index.js";
import { buildEvaluatorContext } from "../src/context.js";
import { planEvaluation } from "../src/planner.js";
import { denyProductionWrite } from "../src/runner.js";

const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "d".repeat(64),
  subject
});

const artifact = (): Artifact => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: createInternalId(),
  change_id: createInternalId(),
  work_item_id: createInternalId(),
  run_id: createInternalId(),
  context_pack_id: createInternalId(),
  binding_id: createInternalId(),
  source_snapshot_id: createInternalId(),
  contract_id: createInternalId(),
  contract_version: 1,
  plan_id: createInternalId(),
  plan_version: 1,
  status: "candidate",
  summary: "candidate artifact",
  digest: digest("artifact"),
  content_reference: "file://artifact.bin",
  created_at: now
});

const claim = (changeId: string, projectId: string): Claim => ({
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
});

describe("independent evaluator planner", () => {
  it("plans an evaluation work item bound to artifact digest without write permissions", () => {
    const candidate = artifact();
    const planned = planEvaluation({
      artifact: candidate,
      requirementSetId: createInternalId(),
      contractId: candidate.contract_id,
      contractVersion: candidate.contract_version,
      policySnapshotId: createInternalId(),
      now
    });
    expect(planned.kind).toBe("evaluation");
    expect(planned.permission_scope).not.toContain("workspace.write");
    expect(planned.permission_scope).toContain("workspace.read");
    expect(planned.extensions?.["cimiloop.evaluation"]).toMatchObject({
      artifact_id: candidate.id,
      artifact_digest: candidate.digest
    });
  });

  it("builds context without executor transcripts and denies production writes", () => {
    const candidate = artifact();
    const sources: ContextSource[] = [
      {
        key: "contract",
        authority: "canonical",
        location_ref: "cimi://contract/current",
        digest: digest("contract"),
        freshness: "current"
      },
      {
        key: "artifact",
        authority: "canonical",
        location_ref: candidate.content_reference,
        digest: candidate.digest,
        freshness: "current"
      }
    ];
    const pack = buildEvaluatorContext({
      artifact: candidate,
      claims: [claim(candidate.change_id, candidate.project_id)],
      sources
    });
    expect(pack.sources.every((source) => source.key !== "executor_transcript")).toBe(true);
    expect(JSON.stringify(pack)).not.toContain("full conversation");
    const workItem: WorkItem = {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: candidate.project_id,
      change_id: candidate.change_id,
      kind: "evaluation",
      status: "claimed",
      contract_id: candidate.contract_id,
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
    if (denied.kind !== "denied") throw new Error("expected write denial");
    expect(denied.failure.code).toBe("EVALUATOR_WRITE_DENIED");
  });
});
