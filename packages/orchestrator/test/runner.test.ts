import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { GitWorktreeWorkspace } from "../../workspace-git/src/index.js";
import { CimiLoopKernel } from "../../kernel/src/kernel.js";
import {
  SCHEMA_VERSION,
  createInternalId,
  type Blocker,
  type CommandSuccess,
  type DomainError,
  type Failure,
  type InternalId,
  type ProviderDescriptor
} from "../../protocol/src/index.js";
import type { RuntimeAdapter, RuntimeRunRequest, RuntimeRunResult, RuntimeSession } from "../../runtime/src/index.js";
import { SqliteProjectStore } from "../../store-sqlite/src/project-store.js";
import type { ProjectStore, StoreTransaction } from "../../store/src/index.js";
import { MemoryProcessRegistry, RunOrchestrator } from "../src/index.js";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];
const now = "2026-09-20T00:00:00.000Z";

afterEach(() => {
  while (openStores.length > 0) {
    openStores.pop()?.close();
  }
});

afterAll(() => {
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

const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "c".repeat(64),
  subject
});

const envelope = (
  commandType: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  expectedRevision: number,
  changeId?: InternalId
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: commandType,
  requested_at: now,
  actor_id: actorId,
  project_id: projectId,
  expected_revision: expectedRevision,
  target: changeId ? { object_type: "change" as const, id: changeId, domain_version: 1 } : undefined,
  source: { origin: "human_cli" as const, producer: "m2-orchestrator-test" },
  payload
});

const contractPayload = () => ({
  profile_key: "feature" as const,
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
    product_business: { conclusion: "NoImpact" as const, rationale: "无产品变化。" },
    technical: {
      conclusion: "Update" as const,
      owner_role: "technical_owner" as const,
      gate: "change_closure" as const,
      summary: "更新说明。"
    },
    operations: { conclusion: "NoImpact" as const, rationale: "无运维变化。" },
    communication: { conclusion: "NoImpact" as const, rationale: "无沟通变化。" }
  }
});

const planPayload = () => ({
  summary: "先做无依赖实现，再验证。",
  verification_strategy: "Orchestrator 测试。",
  recovery_considerations: "提交后故障必须核对 process reference。",
  tasks: [
    { key: "implement", title: "实现", kind: "implementation" as const, dependencies: [] },
    { key: "verify", title: "验证", kind: "verification" as const, dependencies: ["implement"] },
    {
      key: "update-docs",
      title: "更新说明",
      kind: "knowledge" as const,
      knowledge_source: "technical" as const,
      dependencies: ["verify"]
    }
  ]
});

const wrapStore = (store: SqliteProjectStore, fault?: "insertAgentRun" | "afterStartRunCommit"): ProjectStore => ({
  transaction: (work) => {
    let startedRun = false;
    const result = store.transaction((transaction) => {
      if (!fault) return work(transaction);
      return work(
        new Proxy(transaction, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (property === "insertAgentRun" && typeof value === "function") {
              return (...args: unknown[]) => {
                if (fault === "insertAgentRun") {
                  throw new Error("injected failure at insertAgentRun");
                }
                startedRun = true;
                return (value as (...input: unknown[]) => unknown).apply(target, args);
              };
            }
            return typeof value === "function" ? value.bind(target) : value;
          }
        })
      );
    });
    if (fault === "afterStartRunCommit" && startedRun) {
      throw new Error("simulated response loss after StartRun commit");
    }
    return result;
  },
  getProject: () => store.getProject(),
  getChange: (idOrKey) => store.getChange(idOrKey),
  listChanges: () => store.listChanges(),
  listEvents: () => store.listEvents(),
  listOutbox: (status) => store.listOutbox(status),
  claimOutbox: (nowValue, leaseUntil) => store.claimOutbox(nowValue, leaseUntil),
  markOutboxDelivered: (messageId, deliveredAt) => store.markOutboxDelivered(messageId, deliveredAt),
  releaseOutbox: (messageId, availableAt) => store.releaseOutbox(messageId, availableAt),
  claimExternalOperation: (input) => store.claimExternalOperation(input),
  markExternalOperationInvokeStarted: (operationId, ownerId, at) =>
    store.markExternalOperationInvokeStarted(operationId, ownerId, at),
  markExternalOperationInvokeFinished: (operationId, ownerId, at, result) =>
    store.markExternalOperationInvokeFinished(operationId, ownerId, at, result),
  getExternalOperationLease: (operationId) => store.getExternalOperationLease(operationId),
  listInvokedUnrecordedOperations: () => store.listInvokedUnrecordedOperations(),
  listAbandonedExternalInvokes: (at) => store.listAbandonedExternalInvokes(at),
  releaseExternalOperationLease: (operationId) => store.releaseExternalOperationLease(operationId),
  close: () => store.close()
});

class FakeRuntime implements RuntimeAdapter {
  starts = 0;
  behavior: "exited" | "unknown" = "exited";
  lastRequest: RuntimeRunRequest | undefined;

  async start(request: RuntimeRunRequest): Promise<RuntimeSession> {
    this.starts += 1;
    this.lastRequest = request;
    return {
      processReference: `pid://fake-${this.starts}`,
      heartbeat: async () => ({ running: true, pid: this.starts }),
      cancel: async () => undefined,
      signal: async () => undefined,
      wait: async () => this.result()
    };
  }

  async run(request: RuntimeRunRequest): Promise<RuntimeRunResult> {
    const session = await this.start(request);
    return session.wait();
  }

  private result(): RuntimeRunResult {
    const logPath = "/tmp/fake.log";
    const logReference = "file:///tmp/fake.log";
    const logDigest = digest("runtime_log");
    if (this.behavior === "unknown") {
      const failure: Failure = {
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        project_id: this.lastRequest?.workItem.project_id ?? createInternalId(),
        change_id: this.lastRequest?.workItem.change_id ?? createInternalId(),
        code: "RUNTIME_TIMEOUT",
        summary: "timeout",
        details_reference: logReference,
        created_at: now
      };
      const blocker: Blocker = {
        schema_version: SCHEMA_VERSION,
        id: createInternalId(),
        project_id: failure.project_id,
        change_id: failure.change_id,
        code: "RUNTIME_TIMEOUT",
        summary: "timeout",
        status: "open",
        resolution_condition: "reconcile the runtime process before retrying",
        created_at: now,
        updated_at: now,
        revision: 1
      };
      return { kind: "unknown", reason: "timeout", logPath, logReference, logDigest, failure, blocker };
    }
    return {
      kind: "exited",
      exitCode: 0,
      businessSuccess: false,
      logPath,
      logReference,
      logDigest
    };
  }
}

const provider = (projectId: InternalId): ProviderDescriptor => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: projectId,
  provider_type: "runtime",
  name: "claude-code",
  implementation_version: "fake",
  capability_ids: ["code.modify"],
  version_digest: digest("provider"),
  created_at: now
});

const initGitRepo = (directory: string): void => {
  const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--template=", directory], {
    stdio: "ignore",
    env: gitEnv
  });
  writeFileSync(join(directory, "README.md"), "orch\n");
  execFileSync(
    "git",
    ["-C", directory, "-c", "user.email=orch@example.com", "-c", "user.name=Orch", "add", "README.md"],
    { stdio: "ignore", env: gitEnv }
  );
  execFileSync(
    "git",
    ["-C", directory, "-c", "user.email=orch@example.com", "-c", "user.name=Orch", "commit", "-m", "init"],
    { stdio: "ignore", env: gitEnv }
  );
};

const openPlanned = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m2-orch-"));
  temporaryDirectories.push(directory);
  initGitRepo(directory);
  mkdirSync(join(directory, "context"));
  const raw = new SqliteProjectStore(join(directory, "project.db"));
  openStores.push(raw);
  const kernel = new CimiLoopKernel({ store: raw, now: () => now });
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "m2-orchestrator-test" },
      payload: {
        name: "M2 Orchestrator",
        repository_kind: "directory",
        repository_path: directory,
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
      source: { origin: "human_cli" as const, producer: "m2-orchestrator-test" },
      payload: { title: "M2 orchestrator" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  const changeId = created.data.change.id;
  const revisionOf = () => {
    const loaded = kernel.getChange(changeId);
    if ("code" in loaded) throw new Error(loaded.code);
    return loaded.revision;
  };
  success(
    kernel.execute(
      envelope(
        "BootstrapSoloGovernance",
        projectId,
        actorId,
        { change_id: changeId, intent_owner_actor_id: actorId, technical_owner_actor_id: actorId },
        revisionOf(),
        changeId
      )
    )
  );
  success(kernel.execute(envelope("SubmitContractCandidate", projectId, actorId, contractPayload(), revisionOf(), changeId)));
  const intentRequest = success(
    kernel.execute(envelope("RequestIntentDecision", projectId, actorId, { change_id: changeId }, revisionOf(), changeId))
  );
  if (!("request" in intentRequest.data)) throw new Error("missing request");
  const intentOwner = kernel.listRoles().find((role) => role.role_key === "intent_owner");
  success(
    kernel.execute(
      envelope(
        "SubmitDecision",
        projectId,
        actorId,
        {
          request_id: intentRequest.data.request.id,
          outcome: "approve",
          acting_role_id: intentOwner?.id ?? actorId,
          reason: "批准 Contract"
        },
        revisionOf(),
        changeId
      )
    )
  );
  success(kernel.execute(envelope("SubmitPlanCandidate", projectId, actorId, planPayload(), revisionOf(), changeId)));
  const planRequest = success(
    kernel.execute(envelope("RequestPlanDecision", projectId, actorId, { change_id: changeId }, revisionOf(), changeId))
  );
  if (!("request" in planRequest.data)) throw new Error("missing plan request");
  const technical = kernel.listRoles().find((role) => role.role_key === "technical_owner");
  success(
    kernel.execute(
      envelope(
        "SubmitDecision",
        projectId,
        actorId,
        {
          request_id: planRequest.data.request.id,
          outcome: "approve",
          acting_role_id: technical?.id ?? actorId,
          reason: "批准 Plan"
        },
        revisionOf(),
        changeId
      )
    )
  );
  return { directory, raw, kernel, projectId, actorId, changeId };
};

const createOrchestrator = (
  kernel: CimiLoopKernel,
  projectId: InternalId,
  actorId: InternalId,
  directory: string,
  runtime: FakeRuntime,
  registry = new MemoryProcessRegistry()
) =>
  new RunOrchestrator({
    kernel,
    runtime,
    processRegistry: registry,
    projectId,
    actorId,
    worktreePath: join(directory, "worktrees"),
    workspace: new GitWorktreeWorkspace({
      repositoryPath: directory,
      worktreeRoot: join(directory, "worktrees")
    }),
    repositoryPath: directory,
    contextDirectory: join(directory, "context"),
    providers: [provider(projectId)],
    actorPermissions: ["workspace.write", "git.commit"],
    providerPermissions: ["workspace.write", "git.commit"]
  });

describe("M2 run orchestrator", () => {
  it("records runtime facts without completing tasks, and retries as a new run", async () => {
    const planned = openPlanned();
    const runtime = new FakeRuntime();
    const orchestrator = createOrchestrator(planned.kernel, planned.projectId, planned.actorId, planned.directory, runtime);
    const first = await orchestrator.executeReadyWorkItem(planned.changeId);
    expect(first.kind).toBe("completed");
    expect(runtime.starts).toBe(1);
    if (first.kind !== "completed") throw new Error("expected completed");
    const firstRunId = first.run.id;
    const change = planned.kernel.getChange(planned.changeId);
    if ("code" in change) throw new Error(change.code);
    expect(change.lifecycle_state).toBe("Executing");
    const workItem = planned.kernel.getWorkItem(first.workItemId);
    if (!workItem || "code" in workItem) throw new Error("missing work item");
    expect(workItem.status).not.toBe("completed");

    const second = await orchestrator.executeReadyWorkItem(planned.changeId);
    expect(second.kind).toBe("completed");
    if (second.kind !== "completed") throw new Error("expected second completed");
    expect(second.run.id).not.toBe(firstRunId);
    expect(second.run.attempt).toBe(2);
    expect(second.workItemId).toBe(first.workItemId);
    expect(runtime.starts).toBe(2);
  });

  it("does not start a process when StartRun fails before commit", async () => {
    const planned = openPlanned();
    const runtime = new FakeRuntime();
    const kernel = new CimiLoopKernel({ store: wrapStore(planned.raw, "insertAgentRun"), now: () => now });
    const orchestrator = createOrchestrator(kernel, planned.projectId, planned.actorId, planned.directory, runtime);
    const result = await orchestrator.executeReadyWorkItem(planned.changeId);
    expect(result.kind).toBe("failed");
    expect(runtime.starts).toBe(0);
    expect(kernel.listAgentRuns(planned.kernel.listWorkItemsByChange(planned.changeId)[0]?.id ?? createInternalId())).toEqual([]);
  });

  it("does not restart a known running process after a post-commit crash", async () => {
    const planned = openPlanned();
    const runtime = new FakeRuntime();
    const crashing = new CimiLoopKernel({ store: wrapStore(planned.raw, "afterStartRunCommit"), now: () => now });
    const registry = new MemoryProcessRegistry();
    const crashingOrch = createOrchestrator(
      crashing,
      planned.projectId,
      planned.actorId,
      planned.directory,
      runtime,
      registry
    );
    const crashed = await crashingOrch.executeReadyWorkItem(planned.changeId);
    expect(crashed.kind).toBe("failed");
    expect(runtime.starts).toBe(0);
    const items = planned.kernel.listWorkItemsByChange(planned.changeId);
    const execution = items.find((item) => item.kind === "execution");
    const runs = execution ? planned.kernel.listAgentRuns(execution.id) : [];
    expect(runs.length).toBeGreaterThan(0);
    if (runs[0]) registry.remember(runs[0].id, "pid://recovered", true);
    const recovered = createOrchestrator(planned.kernel, planned.projectId, planned.actorId, planned.directory, runtime, registry);
    const recovery = await recovered.recover(planned.changeId);
    expect(recovery.restarted).toBe(false);
    expect(runtime.starts).toBe(0);
    expect(recovery.heartbeated).toBeGreaterThan(0);
  });

  it("creates a new work item when the authorization boundary changes", async () => {
    const planned = openPlanned();
    const runtime = new FakeRuntime();
    const orchestrator = createOrchestrator(planned.kernel, planned.projectId, planned.actorId, planned.directory, runtime);
    const first = await orchestrator.executeReadyWorkItem(planned.changeId);
    if (first.kind !== "completed") throw new Error("expected first completed");
    planned.raw.transaction((transaction) => {
      const current = transaction.getLatestPolicySnapshot(planned.projectId);
      if (!current) throw new Error("missing policy");
      transaction.insertPolicySnapshot({
        ...current,
        id: createInternalId(),
        policy_revision: current.policy_revision + 1,
        digest: digest("policy_v2"),
        created_at: now
      });
    });
    const replaced = await orchestrator.executeReadyWorkItem(planned.changeId);
    expect(replaced.kind).toBe("completed");
    if (replaced.kind !== "completed") throw new Error("expected replaced");
    expect(replaced.workItemId).not.toBe(first.workItemId);
    const old = planned.kernel.getWorkItem(first.workItemId);
    if (!old || "code" in old) throw new Error("missing old work item");
    expect(old.status).toBe("cancelled");
  });

  it("records unknown runtime results as failure/blocker facts", async () => {
    const planned = openPlanned();
    const runtime = new FakeRuntime();
    runtime.behavior = "unknown";
    const orchestrator = createOrchestrator(planned.kernel, planned.projectId, planned.actorId, planned.directory, runtime);
    const result = await orchestrator.executeReadyWorkItem(planned.changeId);
    expect(result.kind).toBe("unknown");
    const change = planned.kernel.getChange(planned.changeId);
    if ("code" in change) throw new Error(change.code);
    expect(change.lifecycle_state).toBe("Executing");
    expect(planned.kernel.listOpenBlockers(planned.changeId).some((blocker) => blocker.code === "RUNTIME_TIMEOUT")).toBe(
      true
    );
  });

  it("executes only the specified work item when multiple items are ready", async () => {
    const planned = openPlanned();
    const orchestrator = createOrchestrator(
      planned.kernel,
      planned.projectId,
      planned.actorId,
      planned.directory,
      new FakeRuntime()
    );
    const change = planned.kernel.getChange(planned.changeId);
    if ("code" in change) throw new Error(change.code);
    success(
      planned.kernel.execute(
        envelope(
          "CreateExecutionWorkItems",
          planned.projectId,
          planned.actorId,
          { change_id: planned.changeId },
          change.revision,
          planned.changeId
        )
      )
    );
    const original = planned.kernel
      .listWorkItemsByChange(planned.changeId)
      .find((item) => item.kind === "execution" && item.status === "ready");
    if (!original) throw new Error("missing original");
    const extraId = createInternalId();
    planned.raw.transaction((transaction) => {
      transaction.insertWorkItem({
        ...original,
        id: extraId,
        status: "ready",
        revision: 1
      });
    });
    const targeted = await orchestrator.executeReadyWorkItem(planned.changeId, extraId);
    expect(targeted.kind).toBe("completed");
    if (targeted.kind !== "completed") throw new Error("expected targeted");
    expect(targeted.workItemId).toBe(extraId);
    expect(targeted.workItemId).not.toBe(original.id);
    expect(planned.kernel.getWorkItem(original.id)).toMatchObject({ id: original.id, status: "ready" });
  });

  it("executes two ready work items in parallel without swapping the requested ids", async () => {
    const planned = openPlanned();
    const change = planned.kernel.getChange(planned.changeId);
    if ("code" in change) throw new Error(change.code);
    success(
      planned.kernel.execute(
        envelope(
          "CreateExecutionWorkItems",
          planned.projectId,
          planned.actorId,
          { change_id: planned.changeId },
          change.revision,
          planned.changeId
        )
      )
    );
    const original = planned.kernel
      .listWorkItemsByChange(planned.changeId)
      .find((item) => item.kind === "execution" && item.status === "ready");
    if (!original) throw new Error("missing original");
    const firstId = createInternalId();
    const secondId = createInternalId();
    planned.raw.transaction((transaction) => {
      transaction.insertWorkItem({ ...original, id: firstId, status: "ready", revision: 1 });
      transaction.insertWorkItem({ ...original, id: secondId, status: "ready", revision: 1 });
    });
    const [first, second] = await Promise.all([
      createOrchestrator(
        planned.kernel,
        planned.projectId,
        planned.actorId,
        planned.directory,
        new FakeRuntime()
      ).executeReadyWorkItem(planned.changeId, firstId),
      createOrchestrator(
        planned.kernel,
        planned.projectId,
        planned.actorId,
        planned.directory,
        new FakeRuntime()
      ).executeReadyWorkItem(planned.changeId, secondId)
    ]);
    const executed = [first, second].filter((item) => item.kind === "completed");
    expect(executed.length).toBeGreaterThanOrEqual(1);
    expect(executed.every((item) => item.kind === "completed" && (item.workItemId === firstId || item.workItemId === secondId))).toBe(
      true
    );
    if (first.kind === "completed") expect(first.workItemId).toBe(firstId);
    if (second.kind === "completed") expect(second.workItemId).toBe(secondId);
  });

  it("refuses to execute a work item that is not claimed or ready", async () => {
    const planned = openPlanned();
    const orchestrator = createOrchestrator(
      planned.kernel,
      planned.projectId,
      planned.actorId,
      planned.directory,
      new FakeRuntime()
    );
    const first = await orchestrator.executeReadyWorkItem(planned.changeId);
    if (first.kind !== "completed") throw new Error("missing first run");
    planned.raw.transaction((transaction) => {
      const current = transaction.getWorkItem(first.workItemId);
      if (!current) throw new Error("missing");
      transaction.updateWorkItem({ ...current, status: "blocked", revision: current.revision + 1 }, current.revision);
    });
    const result = await orchestrator.executeReadyWorkItem(planned.changeId, first.workItemId);
    expect(result).toEqual({ kind: "failed", error: "WORK_ITEM_NOT_EXECUTABLE" });
  });

  it("records a real dirty SourceSnapshot digest that is not derived from the run id", async () => {
    const planned = openPlanned();
    const workspace = new GitWorktreeWorkspace({
      repositoryPath: planned.directory,
      worktreeRoot: join(planned.directory, "worktrees")
    });
    const worktree = workspace.ensureWorktree(planned.changeId);
    writeFileSync(join(worktree.worktreePath, "dirty.txt"), "dirty worktree\n");
    const result = await createOrchestrator(
      planned.kernel,
      planned.projectId,
      planned.actorId,
      planned.directory,
      new FakeRuntime()
    ).executeReadyWorkItem(planned.changeId);
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") throw new Error("expected completed");
    const recorded = planned.raw.listEvents().filter((event) => event.event_type === "SourceSnapshotRecorded").at(-1);
    const snapshotId = recorded?.payload.snapshot_id;
    expect(typeof snapshotId).toBe("string");
    const stored = planned.raw.transaction((transaction) =>
      transaction.getSourceSnapshot(String(snapshotId) as typeof result.run.id)
    );
    expect(stored?.dirty).toBe(true);
    expect(stored?.snapshot_kind).toBe("explicit_dirty_manifest");
    expect(stored?.digest.value).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.digest.value).not.toBe(createHash("sha256").update(result.run.id).digest("hex"));
    expect(stored?.run_id).toBe(result.run.id);
  });

  it("sanitizes leaked paths, tokens, and provider bodies from orchestrator failures", async () => {
    const planned = openPlanned();
    const logs: string[] = [];
    const runtime = new FakeRuntime();
    runtime.start = async () => {
      throw new Error('failed at C:\\Users\\secret\\repo token=super-secret Provider body {"api_key":"abc"}');
    };
    const result = await new RunOrchestrator({
      kernel: planned.kernel,
      runtime,
      processRegistry: new MemoryProcessRegistry(),
      projectId: planned.projectId,
      actorId: planned.actorId,
      worktreePath: join(planned.directory, "worktrees"),
      workspace: new GitWorktreeWorkspace({
        repositoryPath: planned.directory,
        worktreeRoot: join(planned.directory, "worktrees")
      }),
      repositoryPath: planned.directory,
      contextDirectory: join(planned.directory, "context"),
      providers: [provider(planned.projectId)],
      actorPermissions: ["workspace.write", "git.commit"],
      providerPermissions: ["workspace.write", "git.commit"],
      logger: {
        error(_message, diagnostic) {
          logs.push(diagnostic);
        }
      }
    }).executeReadyWorkItem(planned.changeId);
    expect(result).toEqual({ kind: "failed", error: "ORCHESTRATOR_FAILURE" });
    expect(JSON.stringify(result)).not.toMatch(/Users|super-secret|api_key/);
    expect(logs.join("\n")).toContain("[REDACTED]");
    expect(logs.join("\n")).not.toMatch(/super-secret/);
  });
});
