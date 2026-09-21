import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CimiLoopKernel } from "../../kernel/src/kernel.js";
import { createPlanningWorkItem } from "../../kernel/src/work-item.js";
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

export const now = "2026-09-20T12:00:00.000Z";
export const digest = (subject: string, value = "e".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

export const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  if (!("ok" in result && result.ok)) throw new Error(JSON.stringify(result));
  return result;
};

export const envelope = (
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
  source: { origin: "system" as const, producer: "m4-external-worker-test" },
  payload
});

export interface QueuedDeliveryContext {
  directory: string;
  store: SqliteProjectStore;
  kernel: CimiLoopKernel;
  projectId: InternalId;
  actorId: InternalId;
  changeId: InternalId;
  artifact: Artifact;
  releaseId: InternalId;
  environmentId: InternalId;
}

export const openQueuedDelivery = (directories: string[], stores: SqliteProjectStore[]): QueuedDeliveryContext => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-worker-"));
  directories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  stores.push(store);
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
      source: { origin: "human_cli" as const, producer: "m4-external-worker-test" },
      payload: {
        name: "M4 Worker",
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
      source: { origin: "human_cli" as const, producer: "m4-external-worker-test" },
      payload: { title: "Worker" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  const ctx = {
    projectId: initialized.data.project.id,
    actorId: initialized.data.actor.id,
    changeId: created.data.change.id
  };
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
    policy_snapshot_id: sourceWorkItem.policy_snapshot_id,
    contract_id: sourceWorkItem.contract_id,
    contract_version: 1,
    items: [{ claim_key: "AC-1", obligation: "required", source: "acceptance", accepted_evidence_kinds: ["evaluator"] }],
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
  store.transaction((transaction) => {
    transaction.insertWorkItem(sourceWorkItem);
    transaction.insertGateRequirementSet(requirementSet);
    transaction.insertArtifact(artifact);
    transaction.insertClaim({
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      claim_key: "AC-1",
      statement: "Artifact 可部署。",
      category: "intent",
      obligation: "required",
      source: "acceptance",
      contract_id: requirementSet.contract_id,
      contract_version: 1,
      requirement_set_id: requirementSet.id,
      artifact_id: artifact.id,
      artifact_digest: artifact.digest,
      created_at: now
    });
    const claim = transaction.listClaimsByChange(ctx.changeId)[0];
    if (!claim) throw new Error("missing claim");
    transaction.insertEvidence({
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: ctx.projectId,
      change_id: ctx.changeId,
      claim_id: claim.id,
      stance: "Supports",
      subject_type: "artifact",
      subject_id: artifact.id,
      subject_digest: artifact.digest,
      content_reference: "cimi-object://evidence/allow",
      digest: digest("evidence"),
      producer_role: "evaluator",
      created_at: now
    });
  });
  const afterEval = success(
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
          reason: "ignored"
        },
        created.data.change.revision,
        ctx.changeId
      )
    )
  );
  const environment = success(
    kernel.execute(
      envelope(
        "RegisterEnvironment",
        ctx.projectId,
        ctx.actorId,
        {
          environment_key: "acceptance-test",
          kind: "test",
          display_name: "Acceptance Test",
          adapter_ref: "file://examples/acceptance-target"
        },
        afterEval.revision,
        ctx.changeId
      )
    )
  );
  if (!("environment" in environment.data)) throw new Error("missing environment");
  const release = success(
    kernel.execute(
      envelope(
        "CreateRelease",
        ctx.projectId,
        ctx.actorId,
        {
          change_id: ctx.changeId,
          kind: "test",
          artifact_id: artifact.id,
          artifact_digest: artifact.digest,
          environment_id: environment.data.environment.id,
          scope: { in: ["acceptance.service"], out: [] },
          window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery: {
            trigger: "unknown_timeout",
            kind: "rollback",
            target_digest: digest("known_good_artifact", "f".repeat(64)),
            scope: { in: ["acceptance.service"], out: [] },
            steps: ["query operation key"],
            verify_checks: ["digest"],
            authorization: "preauthorized"
          }
        },
        environment.revision,
        ctx.changeId
      )
    )
  );
  if (!("release" in release.data)) throw new Error("missing release");
  success(
    kernel.execute(
      envelope(
        "QueueDeployment",
        ctx.projectId,
        ctx.actorId,
        { release_id: release.data.release.id, environment_id: environment.data.environment.id },
        release.revision,
        ctx.changeId
      )
    )
  );
  return {
    directory,
    store,
    kernel,
    projectId: ctx.projectId,
    actorId: ctx.actorId,
    changeId: ctx.changeId,
    artifact,
    releaseId: release.data.release.id,
    environmentId: environment.data.environment.id
  };
};
