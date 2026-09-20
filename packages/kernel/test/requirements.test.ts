import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createInternalId, type ContractVersion, type PolicySnapshot, type RiskAssessment } from "../../protocol/src/index.js";
import { draftClaimsFromRequirementSet } from "../src/evidence/claims.js";
import { resolveGateRequirementSet } from "../src/evidence/requirements.js";

const now = "2026-09-20T00:00:00.000Z";

const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "a".repeat(64),
  subject
});

const contract = (acceptanceKey = "AC-1"): ContractVersion => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  contract_id: createInternalId(),
  project_id: createInternalId(),
  change_id: createInternalId(),
  domain_version: 1,
  candidate_id: createInternalId(),
  profile_key: "feature",
  intent: "交付可验证制品。",
  outcomes: ["Artifact 可评价"],
  scope: { in: ["Kernel"], out: ["Production"] },
  non_goals: ["不发布"],
  acceptance: [{ key: acceptanceKey, statement: "独立评价通过。" }],
  constraints: ["Human only"],
  created_at: now
});

const policy = (projectId: string): PolicySnapshot => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  policy_id: createInternalId(),
  policy_revision: 1,
  digest: digest("project_policy"),
  created_at: now
});

const risk = (projectId: string, changeId: string, security = "none"): RiskAssessment => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  change_id: changeId,
  risk_profile_id: createInternalId(),
  profile_revision: 1,
  dimensions: {
    data_exposure: "none",
    security,
    reliability: "local-only",
    reversibility: "fully_reversible"
  },
  created_at: now
});

describe("gate requirement resolver", () => {
  it("derives required acceptance, integrity and policy claims from core inputs", () => {
    const version = contract();
    const snapshot = policy(version.project_id);
    const assessment = risk(version.project_id, version.change_id);
    const resolved = resolveGateRequirementSet({
      id: createInternalId(),
      now,
      version: 1,
      profile_key: "feature",
      policy: snapshot,
      contract: version,
      risk: assessment
    });
    expect(resolved.items.some((item) => item.claim_key === "AC-1" && item.obligation === "required" && item.source === "acceptance")).toBe(true);
    expect(resolved.items.some((item) => item.claim_key === "integrity.digest" && item.source === "contract")).toBe(true);
    expect(resolved.items.some((item) => item.claim_key === "policy.knowledge_closure" && item.obligation === "conditional" && item.source === "policy")).toBe(true);
    expect(resolved.items.every((item) => item.accepted_evidence_kinds.length > 0)).toBe(true);
    expect(resolved.digest.subject).toBe("gate_requirement_set");
  });

  it("adds a required risk claim when security is not none and ignores unknown extensions", () => {
    const version = {
      ...contract(),
      extensions: { "vendor.unknown": { extra: true } }
    };
    const snapshot = {
      ...policy(version.project_id),
      extensions: { "vendor.policy": { skip: true } }
    };
    const assessment = {
      ...risk(version.project_id, version.change_id, "elevated"),
      extensions: { "vendor.risk": { score: 99 } }
    };
    const resolved = resolveGateRequirementSet({
      id: createInternalId(),
      now,
      version: 1,
      profile_key: "feature",
      policy: snapshot,
      contract: version,
      risk: assessment
    });
    expect(resolved.items.some((item) => item.claim_key === "risk.security" && item.obligation === "required" && item.source === "risk")).toBe(true);
    expect(JSON.stringify(resolved.items)).not.toContain("vendor.unknown");
    expect(JSON.stringify(resolved.digest)).not.toContain("vendor.risk");
  });

  it("reuses the digest for identical inputs and changes it when acceptance changes", () => {
    const firstContract = contract("AC-1");
    const snapshot = policy(firstContract.project_id);
    const assessment = risk(firstContract.project_id, firstContract.change_id);
    const first = resolveGateRequirementSet({
      id: createInternalId(),
      now,
      version: 1,
      profile_key: "feature",
      policy: snapshot,
      contract: firstContract,
      risk: assessment
    });
    const replayed = resolveGateRequirementSet({
      id: createInternalId(),
      now: "2026-09-20T01:00:00.000Z",
      version: 1,
      profile_key: "feature",
      policy: snapshot,
      contract: firstContract,
      risk: assessment
    });
    const changed = resolveGateRequirementSet({
      id: createInternalId(),
      now,
      version: 2,
      profile_key: "feature",
      policy: snapshot,
      contract: contract("AC-2"),
      risk: assessment
    });
    expect(replayed.digest.value).toBe(first.digest.value);
    expect(changed.digest.value).not.toBe(first.digest.value);
    expect(changed.version).toBe(2);
    const drafted = draftClaimsFromRequirementSet({
      requirementSet: first,
      contract: firstContract,
      now,
      id: () => createInternalId()
    });
    expect(drafted.some((item) => item.claim_key === "AC-1" && item.obligation === "required")).toBe(true);
    expect(drafted.every((item) => item.requirement_set_id === first.id)).toBe(true);
  });
});
