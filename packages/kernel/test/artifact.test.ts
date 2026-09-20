import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../protocol/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../src/kernel.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";
const sha = "a".repeat(40);
const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "e".repeat(64),
  subject
});
const logDigest = {
  algorithm: "sha256" as const,
  value: "b".repeat(64),
  subject: "runtime_log"
};

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
  if (!("ok" in result && result.ok)) {
    throw new Error(`expected success, got ${JSON.stringify(result)}`);
  }
  return result;
};

const failure = (result: CommandSuccess | DomainError): DomainError => {
  expect("code" in result).toBe(true);
  return result as DomainError;
};

const envelope = (
  commandType: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  expectedRevision: number,
  changeId: InternalId
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: commandType,
  requested_at: now,
  actor_id: actorId,
  project_id: projectId,
  expected_revision: expectedRevision,
  target: { object_type: "change" as const, id: changeId, domain_version: 1 },
  source: { origin: "system" as const, producer: "m2-artifact-test" },
  payload
});

const revisionOf = (kernel: CimiLoopKernel, changeId: InternalId) => {
  const loaded = kernel.getChange(changeId);
  if ("code" in loaded) throw new Error(loaded.code);
  return loaded.revision;
};

const bootstrapRunning = (kernel: CimiLoopKernel) => {
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m2-artifact-test" },
      payload: {
        name: "M2 Artifact",
        repository_kind: "directory",
        repository_path: "/tmp/m2-artifact",
        owner_name: "Owner"
      }
    })
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      actor_id: actorId,
      project_id: projectId,
      source: { origin: "human_cli" as const, producer: "m2-artifact-test" },
      payload: { title: "M2 artifact" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  const changeId = created.data.change.id;
  const exec = (type: string, payload: Record<string, unknown>) =>
    success(kernel.execute(envelope(type, projectId, actorId, payload, revisionOf(kernel, changeId), changeId)));
  exec("BootstrapSoloGovernance", {
    change_id: changeId,
    intent_owner_actor_id: actorId,
    technical_owner_actor_id: actorId
  });
  exec("SubmitContractCandidate", {
    profile_key: "feature",
    intent: "进入可调度执行。",
    outcomes: ["Planned"],
    scope: { in: ["Plan"], out: ["Production"] },
    non_goals: ["不发布"],
    acceptance: [{ key: "AC-1", statement: "Ready Task 可生成 Work Item。" }],
    constraints: ["Human only"],
    risk: {
      data_exposure: "none",
      security: "none",
      reliability: "local-only",
      reversibility: "fully_reversible"
    },
    knowledge_impact: {
      product_business: { conclusion: "NoImpact", rationale: "无产品变化。" },
      technical: {
        conclusion: "Update",
        owner_role: "technical_owner",
        gate: "change_closure",
        summary: "更新说明。"
      },
      operations: { conclusion: "NoImpact", rationale: "无运维变化。" },
      communication: { conclusion: "NoImpact", rationale: "无沟通变化。" }
    }
  });
  const intentRequest = exec("RequestIntentDecision", { change_id: changeId });
  if (!("request" in intentRequest.data)) throw new Error("missing request");
  const intentOwner = kernel.listRoles().find((role) => role.role_key === "intent_owner");
  exec("SubmitDecision", {
    request_id: intentRequest.data.request.id,
    outcome: "approve",
    acting_role_id: intentOwner?.id ?? actorId,
    reason: "批准 Contract"
  });
  exec("SubmitPlanCandidate", {
    summary: "先做无依赖实现，再验证。",
    verification_strategy: "Artifact 测试。",
    recovery_considerations: "digest 不可变。",
    tasks: [
      { key: "implement", title: "实现", kind: "implementation", dependencies: [] },
      { key: "verify", title: "验证", kind: "verification", dependencies: ["implement"] },
      {
        key: "update-docs",
        title: "更新说明",
        kind: "knowledge",
        knowledge_source: "technical",
        dependencies: ["verify"]
      }
    ]
  });
  const planRequest = exec("RequestPlanDecision", { change_id: changeId });
  if (!("request" in planRequest.data)) throw new Error("missing plan request");
  const technical = kernel.listRoles().find((role) => role.role_key === "technical_owner");
  exec("SubmitDecision", {
    request_id: planRequest.data.request.id,
    outcome: "approve",
    acting_role_id: technical?.id ?? actorId,
    reason: "批准 Plan"
  });
  const items = exec("CreateExecutionWorkItems", { change_id: changeId });
  if (!("work_items" in items.data) || !items.data.work_items[0]) throw new Error("missing work item");
  exec("ClaimWorkItem", { work_item_id: items.data.work_items[0].id });
  const started = exec("StartRun", {
    work_item_id: items.data.work_items[0].id,
    context_pack_id: createInternalId(),
    binding_id: createInternalId()
  });
  if (!("run" in started.data)) throw new Error("missing run");
  return {
    kernel,
    projectId,
    actorId,
    changeId,
    workItemId: items.data.work_items[0].id,
    run: started.data.run
  };
};

const openKernel = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m2-artifact-"));
  temporaryDirectories.push(directory);
  const store = new SqliteProjectStore(join(directory, "project.db"));
  openStores.push(store);
  return { directory, store, kernel: new CimiLoopKernel({ store, now: () => now }) };
};

describe("M2 source snapshot and artifact", () => {
  it("does not create an artifact when a run completes", () => {
    const { kernel } = openKernel();
    const ctx = bootstrapRunning(kernel);
    success(
      kernel.execute(
        envelope(
          "CompleteRun",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            summary: "process exited",
            log_reference: "file://logs/run.log",
            log_digest: logDigest
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect(kernel.listArtifactsByChange(ctx.changeId)).toEqual([]);
  });

  it("records a snapshot and artifact bound to run, context, binding and digest", () => {
    const { kernel, directory } = openKernel();
    const ctx = bootstrapRunning(kernel);
    const artifactFile = join(directory, "artifact.bin");
    writeFileSync(artifactFile, "hello");
    const snapshot = success(
      kernel.execute(
        envelope(
          "RecordSourceSnapshot",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            snapshot_kind: "git_commit",
            dirty: false,
            commit_sha: sha,
            tree_sha: sha,
            digest: digest("source_snapshot"),
            content_reference: `git://${sha}`
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect("snapshot" in snapshot.data).toBe(true);
    if (!("snapshot" in snapshot.data)) throw new Error("missing snapshot");
    expect(snapshot.data.snapshot.run_id).toBe(ctx.run.id);
    expect(snapshot.data.snapshot.work_item_id).toBe(ctx.workItemId);

    const recorded = success(
      kernel.execute(
        envelope(
          "RecordArtifact",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            source_snapshot_id: snapshot.data.snapshot.id,
            context_pack_id: ctx.run.context_pack_id,
            binding_id: ctx.run.binding_id,
            digest: digest("artifact"),
            content_reference: pathToFileURL(artifactFile).href,
            summary: "candidate output"
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect("artifact" in recorded.data).toBe(true);
    if (!("artifact" in recorded.data)) throw new Error("missing artifact");
    expect(recorded.data.artifact.status).toBe("candidate");
    expect(recorded.data.artifact.run_id).toBe(ctx.run.id);
    expect(recorded.data.artifact.source_snapshot_id).toBe(snapshot.data.snapshot.id);
    expect(recorded.data.artifact.context_pack_id).toBe(ctx.run.context_pack_id);
    expect(recorded.data.artifact.binding_id).toBe(ctx.run.binding_id);
    expect(recorded.data.artifact.digest.value).toBe("e".repeat(64));
  });

  it("shares digest across provenance and supersedes previous candidates without changing digest", () => {
    const { kernel, directory } = openKernel();
    const ctx = bootstrapRunning(kernel);
    const firstFile = join(directory, "first.bin");
    const secondFile = join(directory, "second.bin");
    writeFileSync(firstFile, "same");
    writeFileSync(secondFile, "same");
    const snapshot = success(
      kernel.execute(
        envelope(
          "RecordSourceSnapshot",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            snapshot_kind: "explicit_dirty_manifest",
            dirty: true,
            digest: digest("source_snapshot"),
            content_reference: `worktree://${ctx.changeId}#dirty`
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    if (!("snapshot" in snapshot.data)) throw new Error("missing snapshot");
    const first = success(
      kernel.execute(
        envelope(
          "RecordArtifact",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            source_snapshot_id: snapshot.data.snapshot.id,
            context_pack_id: ctx.run.context_pack_id,
            binding_id: ctx.run.binding_id,
            digest: digest("artifact"),
            content_reference: pathToFileURL(firstFile).href,
            summary: "first candidate"
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    if (!("artifact" in first.data)) throw new Error("missing first artifact");
    const second = success(
      kernel.execute(
        envelope(
          "RecordArtifact",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            source_snapshot_id: snapshot.data.snapshot.id,
            context_pack_id: ctx.run.context_pack_id,
            binding_id: ctx.run.binding_id,
            digest: digest("artifact"),
            content_reference: pathToFileURL(secondFile).href,
            summary: "second candidate"
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    if (!("artifact" in second.data)) throw new Error("missing second artifact");
    expect(second.data.artifact.id).not.toBe(first.data.artifact.id);
    expect(second.data.artifact.digest.value).toBe(first.data.artifact.digest.value);
    const previous = kernel.getArtifact(first.data.artifact.id);
    if (!previous || "code" in previous) throw new Error("missing previous artifact");
    expect(previous.status).toBe("superseded");
    expect(previous.digest.value).toBe(first.data.artifact.digest.value);
  });

  it("rejects missing provenance and missing local files", () => {
    const { kernel } = openKernel();
    const ctx = bootstrapRunning(kernel);
    const missingSnapshot = failure(
      kernel.execute(
        envelope(
          "RecordArtifact",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            source_snapshot_id: createInternalId(),
            context_pack_id: ctx.run.context_pack_id,
            binding_id: ctx.run.binding_id,
            digest: digest("artifact"),
            content_reference: "file:///missing/artifact.bin",
            summary: "invalid"
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect(missingSnapshot.code).toBe("SNAPSHOT_NOT_FOUND");

    const snapshot = success(
      kernel.execute(
        envelope(
          "RecordSourceSnapshot",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            snapshot_kind: "git_commit",
            dirty: false,
            commit_sha: sha,
            tree_sha: sha,
            digest: digest("source_snapshot"),
            content_reference: `git://${sha}`
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    if (!("snapshot" in snapshot.data)) throw new Error("missing snapshot");
    const missingFile = failure(
      kernel.execute(
        envelope(
          "RecordArtifact",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            source_snapshot_id: snapshot.data.snapshot.id,
            context_pack_id: ctx.run.context_pack_id,
            binding_id: ctx.run.binding_id,
            digest: digest("artifact"),
            content_reference: "file:///missing/artifact.bin",
            summary: "invalid"
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect(missingFile.code).toBe("ARTIFACT_REFERENCE_INVALID");

    const invalidKind = failure(
      kernel.execute(
        envelope(
          "RecordSourceSnapshot",
          ctx.projectId,
          ctx.actorId,
          {
            run_id: ctx.run.id,
            snapshot_kind: "git_commit",
            dirty: true,
            digest: digest("source_snapshot"),
            content_reference: `git://${sha}`
          },
          revisionOf(kernel, ctx.changeId),
          ctx.changeId
        )
      )
    );
    expect(invalidKind.code).toBe("SNAPSHOT_KIND_INVALID");
  });
});
