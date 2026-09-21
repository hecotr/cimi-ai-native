import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildContextPack, resolveCapabilities } from "@cimiloop/context";
import type { KernelResult } from "@cimiloop/kernel";
import {
  SCHEMA_VERSION,
  createInternalId,
  type AnyCommand,
  type CommandSuccess,
  type DomainError,
  type InternalId,
  type WorkItem
} from "@cimiloop/protocol";
import { evaluationCapabilityRequirement, isolateEvaluatorWorkItem } from "./isolation.js";
import { orchestratorFailure, sanitizeOrchestratorError } from "./errors.js";
import type { OrchestratorDependencies, OrchestratorResult, RecoveryResult } from "./ports.js";

const isError = (result: KernelResult): result is DomainError => "code" in result;

export class RunOrchestrator {
  readonly #deps: OrchestratorDependencies;

  constructor(dependencies: OrchestratorDependencies) {
    this.#deps = dependencies;
  }

  async executeReadyWorkItem(changeId: InternalId, workItemId?: InternalId): Promise<OrchestratorResult> {
    try {
      const scheduled = this.#command("CreateExecutionWorkItems", { change_id: changeId }, changeId);
      if (isError(scheduled)) return orchestratorFailure(scheduled.code);
      const workItem = this.#selectWorkItem(changeId, workItemId);
      if (!workItem) {
        return orchestratorFailure(workItemId ? "WORK_ITEM_NOT_EXECUTABLE" : "NO_READY_WORK_ITEM");
      }

      let current = workItem;
      if (current.status === "ready") {
        const claimed = this.#command("ClaimWorkItem", { work_item_id: current.id }, changeId);
        if (isError(claimed) || !("work_item" in claimed.data)) {
          return orchestratorFailure(isError(claimed) ? claimed.code : "CLAIM_FAILED");
        }
        current = claimed.data.work_item;
      }

      if (current.kind === "evaluation") {
        const isolation = isolateEvaluatorWorkItem(current);
        if (isolation.kind === "allowed") {
          return orchestratorFailure("EVALUATOR_WRITE_DENIED");
        }
      }
      const sources = this.#sources(current);
      const pack = buildContextPack({
        role_key: current.authorized_role_key,
        work_item: current,
        available_sources: sources
      });
      if (pack.kind !== "pack") return { kind: "blocked", workItemId: current.id, code: pack.blocker.code };

      mkdirSync(this.#deps.contextDirectory, { recursive: true });
      const manifestPath = join(this.#deps.contextDirectory, `${pack.manifest.id}.json`);
      writeFileSync(manifestPath, `${JSON.stringify(pack.manifest)}\n`);

      const resolved = resolveCapabilities({
        work_item: current,
        run_id: createInternalId(),
        requirements:
          current.kind === "evaluation"
            ? [evaluationCapabilityRequirement()]
            : [{ capability_id: "code.modify", required: true, side_effect: "workspace_write" }],
        providers: this.#deps.providers,
        actor_permissions: this.#deps.actorPermissions,
        provider_permissions: this.#deps.providerPermissions
      });
      if (resolved.kind === "blocker") {
        return { kind: "blocked", workItemId: current.id, code: resolved.blocker.code };
      }
      const worktreePath = this.#ensureWorktree(changeId);

      const started = this.#command(
        "StartRun",
        {
          work_item_id: current.id,
          context_pack_id: pack.manifest.id,
          binding_id: resolved.binding.id
        },
        changeId
      );
      if (isError(started) || !("run" in started.data)) {
        return orchestratorFailure(isError(started) ? started.code : "START_RUN_FAILED");
      }
      const run = started.data.run;
      this.#deps.processRegistry.remember(run.id, run.process_reference ?? `run://${run.id}`, false);

      const snapshot = this.#deps.workspace?.captureSnapshot({
        projectId: this.#deps.projectId,
        changeId,
        workItemId: current.id,
        runId: run.id,
        worktreePath
      });
      if (snapshot) {
        const recorded = this.#command(
          "RecordSourceSnapshot",
          {
            run_id: run.id,
            snapshot_kind: snapshot.snapshot_kind,
            dirty: snapshot.dirty,
            ...(snapshot.commit_sha ? { commit_sha: snapshot.commit_sha } : {}),
            ...(snapshot.tree_sha ? { tree_sha: snapshot.tree_sha } : {}),
            digest: snapshot.digest,
            content_reference: snapshot.content_reference
          },
          changeId
        );
        if (isError(recorded)) return orchestratorFailure(recorded.code);
      }

      const binding = run.binding_id ? this.#deps.kernel.getCapabilityBinding(run.binding_id) : resolved.binding;
      if (!binding || "code" in binding) {
        return orchestratorFailure("BINDING_NOT_FOUND");
      }
      const session = await this.#deps.runtime.start({
        workItem: current,
        contextManifestPath: manifestPath,
        worktreePath,
        binding
      });
      this.#deps.processRegistry.remember(run.id, session.processReference, true);
      this.#command("HeartbeatRun", { run_id: run.id }, changeId);
      const runtimeResult = await session.wait();
      this.#deps.processRegistry.remember(run.id, session.processReference, false);

      if (runtimeResult.kind === "exited") {
        const completed = this.#command(
          "CompleteRun",
          {
            run_id: run.id,
            summary: "process exited",
            log_reference: runtimeResult.logReference,
            log_digest: runtimeResult.logDigest
          },
          changeId
        );
        if (isError(completed) || !("run" in completed.data)) {
          return orchestratorFailure(isError(completed) ? completed.code : "COMPLETE_RUN_FAILED");
        }
        return { kind: "completed", workItemId: current.id, run: completed.data.run };
      }

      const failed = this.#command(
        "FailRun",
        {
          run_id: run.id,
          summary: runtimeResult.failure.summary,
          failure_code: runtimeResult.failure.code,
          log_reference: runtimeResult.logReference,
          log_digest: runtimeResult.logDigest
        },
        changeId
      );
      if (isError(failed) || !("run" in failed.data)) {
        return orchestratorFailure(isError(failed) ? failed.code : "FAIL_RUN_FAILED");
      }
      return { kind: "unknown", workItemId: current.id, run: failed.data.run };
    } catch (error) {
      return sanitizeOrchestratorError(error, this.#deps.logger);
    }
  }

  async recover(changeId: InternalId): Promise<RecoveryResult> {
    let heartbeated = 0;
    let failed = 0;
    for (const item of this.#deps.kernel.listWorkItemsByChange(changeId)) {
      for (const run of this.#deps.kernel.listAgentRuns(item.id)) {
        if (run.status !== "starting" && run.status !== "running") continue;
        if (this.#deps.processRegistry.isRunning(run.id)) {
          const heartbeat = this.#command("HeartbeatRun", { run_id: run.id }, changeId);
          if (!isError(heartbeat)) heartbeated += 1;
          continue;
        }
        const unknown = this.#command(
          "FailRun",
          {
            run_id: run.id,
            summary: "runtime result unknown after restart",
            failure_code: "RUNTIME_RESULT_UNKNOWN"
          },
          changeId
        );
        if (!isError(unknown)) failed += 1;
      }
    }
    return { restarted: false, heartbeated, failed };
  }

  #ensureWorktree(changeId: InternalId): string {
    if (!this.#deps.workspace) {
      throw Object.assign(new Error("WORKTREE_REQUIRED"), { code: "WORKTREE_REQUIRED" });
    }
    const location = this.#deps.workspace.ensureWorktree(changeId);
    return location.worktreePath;
  }

  #selectWorkItem(changeId: InternalId, workItemId?: InternalId): WorkItem | undefined {
    const items = this.#deps.kernel.listWorkItemsByChange(changeId);
    if (workItemId) {
      const selected = this.#deps.kernel.getWorkItem(workItemId);
      if (!selected || "code" in selected) {
        throw Object.assign(new Error("WORK_ITEM_NOT_FOUND"), { code: "WORK_ITEM_NOT_FOUND" });
      }
      if (selected.change_id !== changeId) {
        throw Object.assign(new Error("WORK_ITEM_CHANGE_MISMATCH"), { code: "WORK_ITEM_CHANGE_MISMATCH" });
      }
      if (selected.status !== "ready" && selected.status !== "claimed" && selected.status !== "running") {
        return undefined;
      }
      return selected;
    }
    const execution = items.filter((item) => item.kind === "execution");
    return (
      execution.find((item) => item.status === "claimed" || item.status === "running") ??
      execution.find((item) => item.status === "ready")
    );
  }

  #sources(workItem: WorkItem) {
    const digest = (subject: string, parts: unknown) => ({
      algorithm: "sha256" as const,
      value: createHash("sha256").update(JSON.stringify(parts)).digest("hex"),
      subject
    });
    return [
      {
        key: "contract",
        authority: "canonical" as const,
        location_ref: `cimi://contract/${workItem.contract_id}`,
        digest: digest("contract", { id: workItem.contract_id, version: workItem.contract_version }),
        freshness: "current" as const
      },
      {
        key: "policy",
        authority: "canonical" as const,
        location_ref: `cimi://policy/${workItem.policy_snapshot_id}`,
        digest: digest("policy", { id: workItem.policy_snapshot_id }),
        freshness: "current" as const
      },
      ...(workItem.plan_id
        ? [
            {
              key: "plan",
              authority: "canonical" as const,
              location_ref: `cimi://plan/${workItem.plan_id}`,
              digest: digest("plan", { id: workItem.plan_id, version: workItem.plan_version }),
              freshness: "current" as const
            }
          ]
        : [])
    ];
  }

  #command(commandType: AnyCommand["command_type"], payload: Record<string, unknown>, changeId: InternalId): KernelResult {
    const change = this.#deps.kernel.getChange(changeId);
    if ("code" in change) return change;
    const command = {
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: commandType,
      requested_at: this.#deps.now?.() ?? new Date().toISOString(),
      actor_id: this.#deps.actorId,
      project_id: this.#deps.projectId,
      expected_revision: change.revision,
      target: { object_type: "change" as const, id: changeId, domain_version: 1 },
      source: { origin: "system" as const, producer: "cimiloop-orchestrator" },
      payload
    } as AnyCommand;
    return this.#deps.kernel.execute(command);
  }
}

export type { CommandSuccess };
