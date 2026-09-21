import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type ExportManifest,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { createPlanningWorkItem } from "../src/work-item.js";
import { CimiLoopKernel } from "../src/kernel.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";

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

const digestOf = (bytes: string) => ({
  algorithm: "sha256" as const,
  value: createHash("sha256").update(bytes).digest("hex"),
  subject: "import_bundle"
});

const hex = (subject: string) => ({
  algorithm: "sha256" as const,
  value: createHash("sha256").update(subject).digest("hex"),
  subject
});

const writeBundle = (directory: string, name: string, manifest: ExportManifest) => {
  const bytes = JSON.stringify({ manifest });
  const bundlePath = join(directory, name);
  writeFileSync(bundlePath, bytes);
  return { bytes, bundlePath, digest: digestOf(bytes) };
};

const initialize = (kernel: CimiLoopKernel, directory: string, name: string) => {
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m5-import-test" },
      payload: {
        name,
        repository_kind: "directory",
        repository_path: directory,
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
      source: { origin: "human_cli" as const, producer: "m5-import-test" },
      payload: { title: `${name} change` }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  return {
    project: initialized.data.project,
    actor: initialized.data.actor,
    change: created.data.change
  };
};

const seedRestorableFacts = (
  store: SqliteProjectStore,
  projectId: InternalId,
  changeId: InternalId,
  actorId: InternalId
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
  const artifactId = createInternalId();
  const claimId = createInternalId();
  const evidenceId = createInternalId();
  const requirementSetId = createInternalId();
  const evaluationId = createInternalId();
  const environmentId = createInternalId();
  const releaseId = createInternalId();
  const deploymentId = createInternalId();
  const knowledgeId = createInternalId();
  const closureId = createInternalId();
  const artifactDigest = hex("artifact");
  store.transaction((transaction) => {
    transaction.insertWorkItem(workItem);
    transaction.insertArtifact({
      schema_version: SCHEMA_VERSION,
      id: artifactId,
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
      summary: "imported artifact",
      digest: artifactDigest,
      content_reference: "cimi-object://artifact/source",
      created_at: now
    });
    transaction.insertClaim({
      schema_version: SCHEMA_VERSION,
      id: claimId,
      project_id: projectId,
      change_id: changeId,
      claim_key: "acceptance.main",
      statement: "The change meets the contract.",
      category: "outcome",
      obligation: "required",
      source: "acceptance",
      contract_id: workItem.contract_id,
      contract_version: 1,
      created_at: now
    });
    transaction.insertEvidence({
      schema_version: SCHEMA_VERSION,
      id: evidenceId,
      project_id: projectId,
      change_id: changeId,
      claim_id: claimId,
      stance: "Supports",
      subject_type: "artifact",
      subject_id: artifactId,
      subject_digest: artifactDigest,
      content_reference: "cimi-object://evidence/source",
      digest: hex("evidence"),
      producer_role: "deterministic_test",
      created_at: now
    });
    transaction.insertGateRequirementSet({
      schema_version: SCHEMA_VERSION,
      id: requirementSetId,
      project_id: projectId,
      change_id: changeId,
      version: 1,
      profile_key: "feature",
      policy_snapshot_id: workItem.policy_snapshot_id,
      contract_id: workItem.contract_id,
      contract_version: 1,
      items: [
        {
          claim_key: "acceptance.main",
          obligation: "required",
          source: "acceptance",
          accepted_evidence_kinds: ["deterministic_test"]
        }
      ],
      digest: hex("requirement_set"),
      created_at: now
    });
    transaction.insertIndependentEvaluation({
      schema_version: SCHEMA_VERSION,
      id: evaluationId,
      project_id: projectId,
      change_id: changeId,
      artifact_id: artifactId,
      artifact_digest: artifactDigest,
      requirement_set_id: requirementSetId,
      input_digest: hex("evaluation_input"),
      result: "ALLOW",
      reason: "required claims are satisfied",
      created_at: now
    });
    transaction.insertEnvironment({
      schema_version: SCHEMA_VERSION,
      id: environmentId,
      project_id: projectId,
      environment_key: "test",
      kind: "test",
      display_name: "Test",
      owner_actor_id: actorId,
      adapter_ref: "cimi-adapter://test",
      status: "active",
      created_at: now,
      updated_at: now,
      revision: 1
    });
    transaction.insertRelease({
      schema_version: SCHEMA_VERSION,
      id: releaseId,
      project_id: projectId,
      change_id: changeId,
      kind: "test",
      artifact_id: artifactId,
      artifact_digest: artifactDigest,
      environment_id: environmentId,
      contract_id: workItem.contract_id,
      contract_version: 1,
      policy_snapshot_id: workItem.policy_snapshot_id,
      status: "verified",
      authorization_digest: hex("release_auth"),
      created_at: now,
      updated_at: now,
      revision: 1
    });
    transaction.insertDeployment({
      schema_version: SCHEMA_VERSION,
      id: deploymentId,
      project_id: projectId,
      change_id: changeId,
      release_id: releaseId,
      environment_id: environmentId,
      artifact_digest: artifactDigest,
      status: "succeeded",
      created_at: now,
      updated_at: now,
      revision: 1
    });
    transaction.insertKnowledgeUpdateEvidence({
      schema_version: SCHEMA_VERSION,
      id: knowledgeId,
      project_id: projectId,
      change_id: changeId,
      task_id: createInternalId(),
      knowledge_source: "technical",
      conclusion: "Update",
      external_reference_id: createInternalId(),
      evidence_id: evidenceId,
      digest: hex("knowledge"),
      created_at: now
    });
    transaction.insertClosureEvaluation({
      schema_version: SCHEMA_VERSION,
      id: closureId,
      project_id: projectId,
      change_id: changeId,
      disposition: "closed",
      result: "ALLOW",
      knowledge_complete: true,
      residual_risk: "none",
      known_issues: [],
      gaps: [],
      digest: hex("closure"),
      created_at: now
    });
  });
  return {
    artifactId,
    evidenceId,
    evaluationId,
    releaseId,
    deploymentId,
    knowledgeId,
    closureId,
    artifactDigest
  };
};

const exportManifest = (kernel: CimiLoopKernel, projectId: InternalId, actorId: InternalId) => {
  const project = kernel.getProject();
  if ("code" in project) throw new Error(project.code);
  const exported = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "ExportProject",
      requested_at: now,
      actor_id: actorId,
      project_id: projectId,
      expected_revision: project.revision,
      source: { origin: "human_cli" as const, producer: "m5-import-test" },
      payload: { scope: "project" }
    })
  );
  if (!("export_manifest" in exported.data)) throw new Error("missing export");
  return exported.data.export_manifest;
};

const stageAndCommit = (
  kernel: CimiLoopKernel,
  directory: string,
  manifest: ExportManifest,
  actorId: InternalId,
  projectId: InternalId,
  expectedRevision: number
) => {
  const packed = writeBundle(directory, `${manifest.id}.json`, manifest);
  const fileHash = createHash("sha256").update(readFileSync(packed.bundlePath)).digest("hex");
  if (fileHash !== packed.digest.value) {
    throw new Error(`precheck digest mismatch file=${fileHash} claimed=${packed.digest.value} path=${packed.bundlePath}`);
  }
  const staged = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "StageImport",
      requested_at: now,
      actor_id: actorId,
      project_id: projectId,
      expected_revision: expectedRevision,
      source: { origin: "human_cli" as const, producer: "m5-import-test" },
      payload: {
        bundle_reference: `file://${packed.bundlePath.replaceAll("\\", "/")}`,
        bundle_digest: packed.digest
      }
    })
  );
  if (!("import_report" in staged.data)) throw new Error("missing report");
  const committed = kernel.execute({
    schema_version: SCHEMA_VERSION,
    command_id: createInternalId(),
    correlation_id: createInternalId(),
    command_type: "CommitImport",
    requested_at: now,
    actor_id: actorId,
    project_id: projectId,
    expected_revision: expectedRevision,
    source: { origin: "human_cli" as const, producer: "m5-import-test" },
    payload: { import_report_id: staged.data.import_report.id }
  });
  return { staged: staged.data.import_report, committed };
};

describe("StageImport and CommitImport", () => {
  it("materializes a complete project into an empty store as dormant", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "cimiloop-import-source-"));
    const targetDir = mkdtempSync(join(tmpdir(), "cimiloop-import-target-"));
    temporaryDirectories.push(sourceDir, targetDir);
    const sourceStore = new SqliteProjectStore(join(sourceDir, "project.db"));
    const targetStore = new SqliteProjectStore(join(targetDir, "project.db"));
    openStores.push(sourceStore, targetStore);
    const source = new CimiLoopKernel({ store: sourceStore, now: () => now });
    const target = new CimiLoopKernel({ store: targetStore, now: () => now });
    const ctx = initialize(source, sourceDir, "Portable Source");
    const seeded = seedRestorableFacts(sourceStore, ctx.project.id, ctx.change.id, ctx.actor.id);
    const manifest = exportManifest(source, ctx.project.id, ctx.actor.id);
    expect(manifest.entries.some((entry) => entry.object_type === "project" && entry.payload.id === ctx.project.id)).toBe(
      true
    );
    expect(manifest.entries.some((entry) => entry.object_type === "artifact" && entry.payload.id === seeded.artifactId)).toBe(
      true
    );
    const result = stageAndCommit(target, targetDir, manifest, createInternalId(), manifest.project_id, 1);
    const committed = success(result.committed);
    if (!("import_report" in committed.data)) throw new Error("missing commit");
    expect(committed.data.import_report).toMatchObject({ status: "accepted", runtime_ownership: "dormant" });
    expect(target.getProject()).toMatchObject({ id: ctx.project.id, name: "Portable Source" });
    expect(target.getChange(ctx.change.id)).toMatchObject({ id: ctx.change.id, title: "Portable Source change" });
    const timeline = target.getTimeline(ctx.change.id);
    if ("code" in timeline) throw new Error(timeline.code);
    expect(timeline.events.length).toBeGreaterThan(0);
    expect(target.getArtifact(seeded.artifactId)).toMatchObject({
      id: seeded.artifactId,
      digest: seeded.artifactDigest
    });
    expect(target.getEvidence(seeded.evidenceId)).toMatchObject({ id: seeded.evidenceId, stance: "Supports" });
    expect(target.getIndependentEvaluation(seeded.evaluationId)).toMatchObject({
      id: seeded.evaluationId,
      result: "ALLOW"
    });
    expect(target.getRelease(seeded.releaseId)).toMatchObject({ id: seeded.releaseId, status: "verified" });
    expect(target.getDeployment(seeded.deploymentId)).toMatchObject({ id: seeded.deploymentId, status: "succeeded" });
    const knowledge = targetStore.transaction((transaction) =>
      transaction.listKnowledgeUpdateEvidenceByChange(ctx.change.id)
    );
    expect(knowledge.map((item) => item.id)).toContain(seeded.knowledgeId);
    const closures = targetStore.transaction((transaction) => transaction.listClosureEvaluationsByChange(ctx.change.id));
    expect(closures.map((item) => item.id)).toContain(seeded.closureId);
  });

  it("rejects divergent local history and keeps the local project", () => {
    const leftDir = mkdtempSync(join(tmpdir(), "cimiloop-import-left-"));
    const rightDir = mkdtempSync(join(tmpdir(), "cimiloop-import-right-"));
    temporaryDirectories.push(leftDir, rightDir);
    const leftStore = new SqliteProjectStore(join(leftDir, "project.db"));
    const rightStore = new SqliteProjectStore(join(rightDir, "project.db"));
    openStores.push(leftStore, rightStore);
    const left = new CimiLoopKernel({ store: leftStore, now: () => now });
    const right = new CimiLoopKernel({ store: rightStore, now: () => now });
    const local = initialize(left, leftDir, "Local");
    const foreign = initialize(right, rightDir, "Foreign");
    const manifest = exportManifest(right, foreign.project.id, foreign.actor.id);
    const afterLocal = left.getProject();
    if ("code" in afterLocal) throw new Error(afterLocal.code);
    expect(
      failure(stageAndCommit(left, leftDir, manifest, local.actor.id, local.project.id, afterLocal.revision).committed)
        .code
    ).toBe("DIVERGENT_HISTORY");
    expect(left.getProject()).toMatchObject({ id: local.project.id, name: "Local" });
  });

  it("treats a re-imported export of the same project as identical history", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-import-identical-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = initialize(kernel, directory, "Identical");
    const manifest = exportManifest(kernel, ctx.project.id, ctx.actor.id);
    const afterExport = kernel.getProject();
    if ("code" in afterExport) throw new Error(afterExport.code);
    const committed = success(
      stageAndCommit(kernel, directory, manifest, ctx.actor.id, ctx.project.id, afterExport.revision).committed
    );
    if (!("import_report" in committed.data)) throw new Error("missing commit");
    expect(committed.data.import_report.status).toBe("accepted");
    expect(committed.data.import_report.summary).toMatch(/idempotent/i);
    expect(kernel.getChange(ctx.change.id)).toMatchObject({ id: ctx.change.id });
  });

  it("removes orphan staging on the next StageImport and keeps live staged bundles", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-import-orphan-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = initialize(kernel, directory, "Orphan");
    const manifest = exportManifest(kernel, ctx.project.id, ctx.actor.id);
    const packed = writeBundle(directory, `${manifest.id}.json`, manifest);
    const orphanDir = join(directory, ".cimiloop", "staging", "orphan-left-behind");
    mkdirSync(orphanDir, { recursive: true });
    writeFileSync(join(orphanDir, "bundle.json"), "partial-orphan");
    const afterExport = kernel.getProject();
    if ("code" in afterExport) throw new Error(afterExport.code);
    const staged = success(
      kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "StageImport",
        requested_at: now,
        actor_id: ctx.actor.id,
        project_id: ctx.project.id,
        expected_revision: afterExport.revision,
        source: { origin: "human_cli" as const, producer: "m5-import-test" },
        payload: {
          bundle_reference: `file://${packed.bundlePath.replaceAll("\\", "/")}`,
          bundle_digest: packed.digest
        }
      })
    );
    if (!("import_report" in staged.data)) throw new Error("missing report");
    expect(existsSync(orphanDir)).toBe(false);
    const live = readdirSync(join(directory, ".cimiloop", "staging"));
    expect(live.length).toBe(1);
    expect(staged.data.import_report.summary).toMatch(/bundle_digest=/);
    expect(staged.data.import_report.summary).toMatch(/content_digest=/);
  });
});
