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
const now = "2026-09-20T12:00:00.000Z";
const digest = (subject: string, value = "e".repeat(64)) => ({
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
  source: { origin: "human_cli" as const, producer: "m4-release-decision-test" },
  payload
});

const recovery = {
  trigger: "verify_fail" as const,
  kind: "rollback" as const,
  target_digest: digest("known_good_artifact", "f".repeat(64)),
  scope: { in: ["production.service"], out: [] },
  steps: ["restore prior digest"],
  verify_checks: ["digest" as const, "health" as const],
  authorization: "preauthorized" as const
};

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
      source: { origin: "human_cli" as const, producer: "m4-release-decision-test" },
      payload: {
        name: "M4 Release Decision",
        repository_kind: "directory",
        repository_path: "/tmp/m4-release-decision",
        owner_name: "Owner"
      }
    })
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data) || !("assignment" in initialized.data)) {
    throw new Error("missing project");
  }
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      actor_id: initialized.data.actor.id,
      project_id: initialized.data.project.id,
      source: { origin: "human_cli" as const, producer: "m4-release-decision-test" },
      payload: { title: "Release Decision" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  return {
    projectId: initialized.data.project.id,
    actorId: initialized.data.actor.id,
    roleId: initialized.data.assignment.role_id,
    changeId: created.data.change.id,
    revision: created.data.change.revision
  };
};

const allowArtifact = (store: SqliteProjectStore, kernel: CimiLoopKernel, ctx: ReturnType<typeof bootstrap>) => {
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
    items: [
      { claim_key: "AC-1", obligation: "required", source: "acceptance", accepted_evidence_kinds: ["evaluator"] }
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
      statement: "Artifact 可通过生产发布。",
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
  success(
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
        ctx.revision,
        ctx.changeId
      )
    )
  );
  const change = kernel.getChange(ctx.changeId);
  if ("code" in change) throw new Error(change.code);
  return { artifact, revision: change.revision };
};

const createProductionRelease = (
  kernel: CimiLoopKernel,
  store: SqliteProjectStore,
  ctx: ReturnType<typeof bootstrap>,
  artifact: Artifact,
  revision: number
) => {
  const testEnvironment = success(
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
        revision,
        ctx.changeId
      )
    )
  );
  if (!("environment" in testEnvironment.data)) throw new Error("missing test environment");
  const testRelease = success(
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
          environment_id: testEnvironment.data.environment.id,
          scope: { in: ["acceptance.service"], out: [] },
          window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery
        },
        testEnvironment.revision,
        ctx.changeId
      )
    )
  );
  if (!("release" in testRelease.data)) throw new Error("missing test release");
  const verifiedTestReleaseId = testRelease.data.release.id;
  store.transaction((transaction) => {
    const release = transaction.getRelease(verifiedTestReleaseId);
    if (!release) throw new Error("missing stored test release");
    transaction.updateRelease({ ...release, status: "verified", revision: release.revision + 1 }, release.revision);
  });
  const environment = success(
    kernel.execute(
      envelope(
        "RegisterEnvironment",
        ctx.projectId,
        ctx.actorId,
        {
          environment_key: "prod",
          kind: "production",
          display_name: "Production",
          adapter_ref: "file://examples/acceptance-target"
        },
        testRelease.revision,
        ctx.changeId
      )
    )
  );
  if (!("environment" in environment.data)) throw new Error("missing environment");
  const created = success(
    kernel.execute(
      envelope(
        "CreateRelease",
        ctx.projectId,
        ctx.actorId,
        {
          change_id: ctx.changeId,
          kind: "production",
          artifact_id: artifact.id,
          artifact_digest: artifact.digest,
          environment_id: environment.data.environment.id,
          scope: { in: ["production.service"], out: [] },
          window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
          recovery
        },
        environment.revision,
        ctx.changeId
      )
    )
  );
  if (!("release" in created.data)) throw new Error("missing release");
  return { environment: environment.data.environment, release: created.data.release, revision: created.revision };
};

describe("M4 production release decision", () => {
  it("approves only the concrete release and expires when authorization facts change", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-decision-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const allowed = allowArtifact(store, kernel, ctx);
    const first = createProductionRelease(kernel, store, ctx, allowed.artifact, allowed.revision);
    expect(first.release.status).toBe("drafted");

    const requested = success(
      kernel.execute(
        envelope("RequestReleaseDecision", ctx.projectId, ctx.actorId, { release_id: first.release.id }, first.revision, ctx.changeId)
      )
    );
    expect("request" in requested.data).toBe(true);
    if (!("request" in requested.data)) throw new Error("missing request");
    expect(requested.data.request.request_type).toBe("release");

    store.transaction((transaction) => {
      const release = transaction.getRelease(first.release.id);
      if (!release) throw new Error("missing release");
      transaction.updateRelease(
        {
          ...release,
          authorization_digest: digest("stale_release", "1".repeat(64)),
          revision: release.revision + 1
        },
        release.revision
      );
    });
    const stale = kernel.execute(
      envelope(
        "SubmitDecision",
        ctx.projectId,
        ctx.actorId,
        {
          request_id: requested.data.request.id,
          outcome: "approve",
          acting_role_id: ctx.roleId,
          reason: "approve stale release"
        },
        requested.revision,
        ctx.changeId
      )
    );
    expect(stale).toMatchObject({ code: "DECISION_REQUEST_EXPIRED" });

    const secondEnv = success(
      kernel.execute(
        envelope(
          "RegisterEnvironment",
          ctx.projectId,
          ctx.actorId,
          {
            environment_key: "prod-b",
            kind: "production",
            display_name: "Production B",
            adapter_ref: "file://examples/acceptance-target"
          },
          requested.revision,
          ctx.changeId
        )
      )
    );
    if (!("environment" in secondEnv.data)) throw new Error("missing env b");
    const second = success(
      kernel.execute(
        envelope(
          "CreateRelease",
          ctx.projectId,
          ctx.actorId,
          {
            change_id: ctx.changeId,
            kind: "production",
            artifact_id: allowed.artifact.id,
            artifact_digest: allowed.artifact.digest,
            environment_id: secondEnv.data.environment.id,
            scope: { in: ["production.other"], out: [] },
            window: { starts_at: now, ends_at: "2026-09-21T12:00:00.000Z" },
            recovery
          },
          secondEnv.revision,
          ctx.changeId
        )
      )
    );
    if (!("release" in second.data)) throw new Error("missing second release");
    const secondReleaseId = second.data.release.id;
    const firstReleaseId = first.release.id;
    const secondRequest = success(
      kernel.execute(
        envelope("RequestReleaseDecision", ctx.projectId, ctx.actorId, { release_id: second.data.release.id }, second.revision, ctx.changeId)
      )
    );
    if (!("request" in secondRequest.data)) throw new Error("missing second request");
    const approved = success(
      kernel.execute(
        envelope(
          "SubmitDecision",
          ctx.projectId,
          ctx.actorId,
          {
            request_id: secondRequest.data.request.id,
            outcome: "approve",
            acting_role_id: ctx.roleId,
            reason: "approve this production release only"
          },
          secondRequest.revision,
          ctx.changeId
        )
      )
    );
    const authorized = store.transaction((transaction) => transaction.getRelease(secondReleaseId));
    const other = store.transaction((transaction) => transaction.getRelease(firstReleaseId));
    expect(authorized?.status).toBe("authorized");
    expect(authorized?.decision_id).toBeTruthy();
    expect(other?.status).toBe("drafted");
    expect("decision" in approved.data).toBe(true);
  });

  it("does not authorize or queue after later evidence no longer allows the artifact", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-m4-stale-eval-"));
    temporaryDirectories.push(directory);
    const store = new SqliteProjectStore(join(directory, "project.db"));
    openStores.push(store);
    const kernel = new CimiLoopKernel({ store, now: () => now });
    const ctx = bootstrap(kernel);
    const allowed = allowArtifact(store, kernel, ctx);
    const created = createProductionRelease(kernel, store, ctx, allowed.artifact, allowed.revision);
    const requested = success(
      kernel.execute(
        envelope("RequestReleaseDecision", ctx.projectId, ctx.actorId, { release_id: created.release.id }, created.revision, ctx.changeId)
      )
    );
    if (!("request" in requested.data)) throw new Error("missing request");
    store.transaction((transaction) => {
      const previous = transaction.listIndependentEvaluationsByChange(ctx.changeId).at(-1);
      if (!previous) throw new Error("missing evaluation");
      transaction.insertIndependentEvaluation({
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        project_id: ctx.projectId,
        change_id: ctx.changeId,
        artifact_id: allowed.artifact.id,
        artifact_digest: allowed.artifact.digest,
        requirement_set_id: previous.requirement_set_id,
        input_digest: digest("later_eval", "2".repeat(64)),
        result: "DENY",
        reason: "new refutes after release drafted",
        created_at: now
      });
    });
    const approved = kernel.execute(
      envelope(
        "SubmitDecision",
        ctx.projectId,
        ctx.actorId,
        {
          request_id: requested.data.request.id,
          outcome: "approve",
          acting_role_id: ctx.roleId,
          reason: "approve after evidence changed"
        },
        requested.revision,
        ctx.changeId
      )
    );
    expect(approved).toMatchObject({ code: "DECISION_REQUEST_EXPIRED" });
    expect(store.transaction((transaction) => transaction.getRelease(created.release.id))?.status).toBe("drafted");
  });
});
