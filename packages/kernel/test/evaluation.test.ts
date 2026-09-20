import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Artifact,
  type CommandSuccess,
  type DomainError,
  type GateRequirementSet,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../src/kernel.js";
import { createPlanningWorkItem } from "../src/work-item.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "e".repeat(64),
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
  source: { origin: "system" as const, producer: "m3-evaluation-test" },
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
      source: { origin: "human_cli" as const, producer: "m3-evaluation-test" },
      payload: {
        name: "M3 Evaluation",
        repository_kind: "directory",
        repository_path: "/tmp/m3-evaluation",
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
      source: { origin: "human_cli" as const, producer: "m3-evaluation-test" },
      payload: { title: "Evaluate" }
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

const seedFacts = (store: SqliteProjectStore, projectId: InternalId, changeId: InternalId) => {
  const sourceWorkItem = createPlanningWorkItem({
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
    policy_snapshot_id: createInternalId(),
    contract_id: createInternalId(),
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
  store.transaction((transaction) => {
    transaction.insertWorkItem(sourceWorkItem);
    transaction.insertGateRequirementSet(requirementSet);
    transaction.insertArtifact(artifact);
  });
  return { requirementSet, artifact };
};

describe("independent evaluation work items", () => {
  it("creates an evaluation work item and retries as a new run", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-eval-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const { requirementSet, artifact } = seedFacts(store, ctx.projectId, ctx.changeId);
    const requested = success(
      kernel.execute(
        envelope(
          "RequestEvaluation",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            artifact_id: artifact.id,
            artifact_digest: artifact.digest,
            requirement_set_id: requirementSet.id
          },
          ctx.revision,
          ctx.changeId
        )
      )
    );
    expect("work_item" in requested.data).toBe(true);
    if (!("work_item" in requested.data)) throw new Error("missing work item");
    expect(requested.data.work_item.kind).toBe("evaluation");
    expect(requested.data.work_item.permission_scope).not.toContain("workspace.write");
    expect(requested.data.work_item.extensions?.["cimiloop.evaluation"]).toMatchObject({
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      requirement_set_id: requirementSet.id
    });
    const claimed = success(
      kernel.execute(
        envelope(
          "ClaimWorkItem",
          ctx.projectId,
          ctx.actorId,
          { work_item_id: requested.data.work_item.id },
          requested.revision,
          ctx.changeId
        )
      )
    );
    if (!("work_item" in claimed.data)) throw new Error("missing claimed work item");
    const first = success(
      kernel.execute(
        envelope(
          "StartRun",
          ctx.projectId,
          ctx.actorId,
          {
            work_item_id: claimed.data.work_item.id,
            context_pack_id: createInternalId(),
            binding_id: createInternalId()
          },
          claimed.revision,
          ctx.changeId
        )
      )
    );
    if (!("run" in first.data)) throw new Error("missing run");
    expect(first.data.run.attempt).toBe(1);
    const pack = kernel.getContextPackManifest(first.data.run.context_pack_id ?? createInternalId());
    if ("code" in pack) throw new Error(pack.code);
    expect(pack.sources.every((source) => source.key !== "executor_transcript")).toBe(true);
    const completed = success(
      kernel.execute(
        envelope(
          "CompleteRun",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: first.data.run.id,
            summary: "evaluation attempt finished",
            log_reference: "file://logs/eval-1.log",
            log_digest: digest("runtime_log")
          },
          first.revision,
          ctx.changeId
        )
      )
    );
    const second = success(
      kernel.execute(
        envelope(
          "StartRun",
          ctx.projectId,
          ctx.actorId,
          {
            work_item_id: claimed.data.work_item.id,
            context_pack_id: createInternalId(),
            binding_id: createInternalId()
          },
          completed.revision,
          ctx.changeId
        )
      )
    );
    if (!("run" in second.data)) throw new Error("missing second run");
    expect(second.data.run.id).not.toBe(first.data.run.id);
    expect(second.data.run.attempt).toBe(2);
    expect(kernel.listAgentRuns(claimed.data.work_item.id)).toHaveLength(2);
  });
});
