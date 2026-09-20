import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../src/kernel.js";
import { validateKnowledgeImpact } from "../src/knowledge-impact.js";
import { validateRiskDimensions } from "../src/risk.js";

const temporaryDirectories: string[] = [];
const now = "2026-09-20T00:00:00.000Z";

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  expect("ok" in result && result.ok).toBe(true);
  return result as CommandSuccess;
};

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "形成可批准的 Feature Contract。",
  outcomes: ["进入 IntentReady"],
  scope: { in: ["Contract"], out: ["Runtime"] },
  non_goals: ["不执行 Runtime"],
  acceptance: [{ key: "AC-1", statement: "Contract Candidate 可被 Decision 绑定。" }],
  constraints: ["Agent 不得批准"],
  risk: {
    data_exposure: "none",
    security: "none",
    reliability: "local-only",
    reversibility: "fully_reversible"
  },
  knowledge_impact: {
    product_business: { conclusion: "NoImpact" as const, rationale: "无产品说明变化。" },
    technical: {
      conclusion: "Update" as const,
      owner_role: "technical_owner" as const,
      gate: "change_closure" as const,
      summary: "更新实施说明。"
    },
    operations: { conclusion: "NoImpact" as const, rationale: "无运维手册变化。" },
    communication: { conclusion: "NoImpact" as const, rationale: "无对外沟通材料。" }
  }
});

const createHarness = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-contract-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      source: { origin: "human_cli", producer: "contract-test" },
      payload: {
        name: "Contract",
        repository_kind: "directory",
        repository_path: directory,
        owner_name: "Human Owner"
      }
    })
  );
  if (!("project" in initialized.data)) throw new Error("expected project");
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      project_id: initialized.data.project.id,
      actor_id: initialized.data.actor.id,
      source: { origin: "human_cli", producer: "contract-test" },
      payload: { title: "Contract Change" }
    })
  );
  if (!("change" in created.data)) throw new Error("expected change");
  success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "BootstrapSoloGovernance",
      requested_at: now,
      project_id: initialized.data.project.id,
      actor_id: initialized.data.actor.id,
      target: { object_type: "change", id: created.data.change.id, domain_version: 1 },
      expected_revision: created.data.change.revision,
      source: { origin: "human_cli", producer: "contract-test" },
      payload: {
        change_id: created.data.change.id,
        intent_owner_actor_id: initialized.data.actor.id,
        technical_owner_actor_id: initialized.data.actor.id
      }
    })
  );
  return {
    store,
    kernel,
    projectId: initialized.data.project.id,
    actorId: initialized.data.actor.id,
    change: created.data.change
  };
};

describe("contract candidate and impact assessment", () => {
  it("starts candidates at revision 1 and persists risk plus knowledge atomically", () => {
    const harness = createHarness();
    const submitted = success(
      harness.kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "SubmitContractCandidate",
        requested_at: now,
        project_id: harness.projectId,
        actor_id: harness.actorId,
        target: { object_type: "change", id: harness.change.id, domain_version: 1 },
        expected_revision: harness.change.revision,
        source: { origin: "human_cli", producer: "contract-test" },
        payload: contractPayload()
      })
    );
    expect(submitted.data).toMatchObject({
      candidate: { revision: 1, profile_key: "feature", intent: "形成可批准的 Feature Contract。" }
    });
    if (!("candidate" in submitted.data)) throw new Error("expected candidate");
    const candidateId = submitted.data.candidate.id;
    expect(
      harness.store.transaction((transaction) => transaction.getContractCandidate(candidateId))
    ).toMatchObject({ revision: 1 });
    expect(
      harness.store.transaction((transaction) => transaction.getRiskProfileByChange(harness.change.id))
    ).toBeTruthy();
    expect(
      harness.store.transaction((transaction) => transaction.getKnowledgeImpactAssessmentByChange(harness.change.id))
    ).toMatchObject({ revision: 1 });
    expect(harness.store.getChange(harness.change.id)).toMatchObject({ revision: 2, lifecycle_state: "Draft" });
    harness.store.close();
  });

  it("rejects a stale change revision and writes nothing", () => {
    const harness = createHarness();
    const eventsBefore = harness.store.listEvents().length;
    const result = failure(
      harness.kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "SubmitContractCandidate",
        requested_at: now,
        project_id: harness.projectId,
        actor_id: harness.actorId,
        target: { object_type: "change", id: harness.change.id, domain_version: 1 },
        expected_revision: 99,
        source: { origin: "human_cli", producer: "contract-test" },
        payload: contractPayload()
      })
    );
    expect(result.code).toBe("REVISION_CONFLICT");
    expect(harness.store.listEvents()).toHaveLength(eventsBefore);
    expect(
      harness.store.transaction((transaction) => transaction.getContractCandidateByChange(harness.change.id))
    ).toBeUndefined();
    harness.store.close();
  });

  it("rejects incomplete risk or knowledge conclusions in pure validators", () => {
    expect(() =>
      validateRiskDimensions({
        data_exposure: "none",
        security: "none",
        reliability: "",
        reversibility: "fully_reversible"
      })
    ).toThrow(/reliability/);
    expect(() =>
      validateKnowledgeImpact({
        product_business: { conclusion: "NoImpact", rationale: "" },
        technical: { conclusion: "Update", owner_role: "technical_owner", gate: "change_closure", summary: "x" },
        operations: { conclusion: "NoImpact", rationale: "ok" },
        communication: { conclusion: "NoImpact", rationale: "ok" }
      })
    ).toThrow(/rationale/);
  });
});
