import { describe, expect, it } from "vitest";
import type { TSchema } from "typebox";
import * as protocol from "../src/index.js";

const id = (): string => protocol.createInternalId();

const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "a".repeat(64),
  subject
});

const timestamp = "2026-09-20T00:00:00.000Z";

const schemaNamed = (name: string): TSchema => {
  expect(protocol.protocolSchemas).toHaveProperty(name);
  return (protocol.protocolSchemas as Record<string, TSchema>)[name]!;
};

const parseNamed = (name: string, value: unknown): unknown =>
  protocol.compileValidator(schemaNamed(name))(value);

const source = { origin: "system" as const, producer: "m2-schema-test" };

const envelope = (commandType: string, payload: Record<string, unknown>) => ({
  schema_version: protocol.SCHEMA_VERSION,
  command_id: id(),
  correlation_id: id(),
  command_type: commandType,
  requested_at: timestamp,
  actor_id: id(),
  project_id: id(),
  target: { object_type: "work_item", id: id(), domain_version: 1 },
  expected_revision: 1,
  source,
  payload
});

const validWorkItem = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  kind: "execution",
  status: "ready",
  contract_id: id(),
  contract_version: 1,
  plan_id: id(),
  plan_version: 1,
  task_id: id(),
  policy_snapshot_id: id(),
  authorized_role_key: "technical_owner",
  permission_scope: ["workspace.write", "git.commit"],
  budget: {
    max_duration_ms: 600000,
    max_retries: 2
  },
  stop_conditions: ["timeout", "budget_exhausted", "cancel_requested"],
  authorization_digest: digest("work_item_authorization"),
  created_at: timestamp,
  updated_at: timestamp,
  revision: 1
});

const validLease = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  work_item_id: id(),
  owner_actor_id: id(),
  owner_run_id: id(),
  status: "active",
  acquired_at: timestamp,
  expires_at: "2026-09-20T00:10:00.000Z",
  created_at: timestamp,
  updated_at: timestamp,
  revision: 1
});

const validCapabilityRequirement = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  work_item_id: id(),
  capability_id: "code.modify",
  required: true,
  side_effect: "workspace_write",
  created_at: timestamp
});

const validProviderDescriptor = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  provider_type: "runtime",
  name: "claude-code",
  implementation_version: "1.0.0",
  capability_ids: ["code.modify"],
  version_digest: digest("provider_claude_code"),
  created_at: timestamp
});

const validContextSource = () => ({
  key: "contract",
  authority: "canonical",
  location_ref: "cimi://contract/current",
  digest: digest("context_source_contract"),
  freshness: "current"
});

const validContextPack = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  work_item_id: id(),
  contract_id: id(),
  contract_version: 1,
  plan_id: id(),
  plan_version: 1,
  task_id: id(),
  policy_snapshot_id: id(),
  role_key: "technical_owner",
  assembly_rule_version: 1,
  validity: "valid",
  sources: [validContextSource()],
  digest: digest("context_pack"),
  created_at: timestamp
});

const validBinding = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  work_item_id: id(),
  run_id: id(),
  runtime: validProviderDescriptor(),
  model: {
    ...validProviderDescriptor(),
    id: id(),
    provider_type: "model",
    name: "claude-sonnet",
    version_digest: digest("provider_model")
  },
  granted_permissions: ["workspace.write"],
  digest: digest("capability_binding"),
  created_at: timestamp
});

const validRun = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  work_item_id: id(),
  context_pack_id: id(),
  binding_id: id(),
  status: "running",
  attempt: 1,
  summary: "正在隔离 worktree 中执行授权任务。",
  log_reference: "cimi-object://runs/log",
  log_digest: digest("run_log"),
  started_at: timestamp,
  created_at: timestamp,
  updated_at: timestamp,
  revision: 1
});

const validSnapshot = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  work_item_id: id(),
  run_id: id(),
  snapshot_kind: "git_commit",
  commit_sha: "b".repeat(40),
  tree_sha: "c".repeat(40),
  dirty: false,
  digest: digest("source_snapshot"),
  content_reference: "git://repo#commit",
  created_at: timestamp
});

const validArtifact = () => ({
  schema_version: protocol.SCHEMA_VERSION,
  id: id(),
  project_id: id(),
  change_id: id(),
  work_item_id: id(),
  run_id: id(),
  context_pack_id: id(),
  binding_id: id(),
  source_snapshot_id: id(),
  contract_id: id(),
  contract_version: 1,
  plan_id: id(),
  plan_version: 1,
  status: "candidate",
  summary: "隔离执行产生的不可变候选制品。",
  digest: digest("artifact"),
  content_reference: "cimi-object://artifacts/candidate",
  created_at: timestamp
});

const validTransition = () => ({
  from: "running",
  to: "completed"
});

describe("M2 domain schemas", () => {
  it("accepts bounded work items, leases, context packs, bindings, runs, snapshots and artifacts", () => {
    expect(parseNamed("WorkItem", validWorkItem())).toMatchObject({ kind: "execution", status: "ready" });
    expect(parseNamed("Lease", validLease())).toMatchObject({ status: "active" });
    expect(parseNamed("CapabilityRequirement", validCapabilityRequirement())).toMatchObject({
      capability_id: "code.modify"
    });
    expect(parseNamed("ProviderDescriptor", validProviderDescriptor())).toMatchObject({ provider_type: "runtime" });
    expect(parseNamed("ContextPackManifest", validContextPack())).toMatchObject({ validity: "valid" });
    expect(parseNamed("CapabilityBinding", validBinding())).toMatchObject({ granted_permissions: ["workspace.write"] });
    expect(parseNamed("AgentRunRecord", validRun())).toMatchObject({ status: "running" });
    expect(parseNamed("SourceSnapshot", validSnapshot())).toMatchObject({ snapshot_kind: "git_commit", dirty: false });
    expect(parseNamed("Artifact", validArtifact())).toMatchObject({ status: "candidate" });
    expect(parseNamed("RunTransition", validTransition())).toEqual(validTransition());
    expect(parseNamed("ResourceLock", {
      schema_version: protocol.SCHEMA_VERSION,
      id: id(),
      project_id: id(),
      resource_type: "worktree",
      resource_key: "change/CHG-0001",
      holder_work_item_id: id(),
      status: "held",
      acquired_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
      revision: 1
    })).toMatchObject({ resource_type: "worktree" });
    expect(parseNamed("Failure", {
      schema_version: protocol.SCHEMA_VERSION,
      id: id(),
      project_id: id(),
      change_id: id(),
      work_item_id: id(),
      run_id: id(),
      code: "RUNTIME_TIMEOUT",
      summary: "Run 超过预算后停止。",
      details_reference: "cimi-object://failures/timeout",
      created_at: timestamp
    })).toMatchObject({ code: "RUNTIME_TIMEOUT" });
    expect(parseNamed("Blocker", {
      schema_version: protocol.SCHEMA_VERSION,
      id: id(),
      project_id: id(),
      change_id: id(),
      work_item_id: id(),
      code: "CAPABILITY_MISSING",
      summary: "缺少 code.modify 能力，不能启动 Run。",
      status: "open",
      resolution_condition: "提供已授权的 Claude Code Runtime。",
      created_at: timestamp,
      updated_at: timestamp,
      revision: 1
    })).toMatchObject({ status: "open" });
  });

  it("rejects illegal leases", () => {
    expect(() => parseNamed("Lease", { ...validLease(), status: "stolen" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => {
      const lease = validLease() as Record<string, unknown>;
      delete lease.owner_actor_id;
      parseNamed("Lease", lease);
    }).toThrow(protocol.ProtocolValidationError);
    expect(() => parseNamed("Lease", { ...validLease(), secret: "lease-token" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("rejects illegal digests", () => {
    expect(() =>
      parseNamed("Artifact", { ...validArtifact(), digest: { algorithm: "md5", value: "abc", subject: "artifact" } })
    ).toThrow(protocol.ProtocolValidationError);
    expect(() =>
      parseNamed("Artifact", {
        ...validArtifact(),
        digest: { algorithm: "sha256", value: "A".repeat(64), subject: "artifact" }
      })
    ).toThrow(protocol.ProtocolValidationError);
  });

  it("rejects illegal capability fields and secret values", () => {
    expect(() => parseNamed("ProviderDescriptor", { ...validProviderDescriptor(), provider_type: "unrestricted" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("ProviderDescriptor", { ...validProviderDescriptor(), secret: "sk-secret" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() =>
      parseNamed("CapabilityRequirement", { ...validCapabilityRequirement(), api_key: "env-secret" })
    ).toThrow(protocol.ProtocolValidationError);
    expect(() => parseNamed("CapabilityBinding", { ...validBinding(), token: "binding-secret" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("rejects illegal run transitions and change-advancing statuses", () => {
    expect(() => parseNamed("RunTransition", { from: "completed", to: "running" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("RunTransition", { from: "failed", to: "queued" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("AgentRunRecord", { ...validRun(), status: "change_advanced" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("AgentRunRecord", { ...validRun(), status: "task_completed" })).toThrow(
      protocol.ProtocolValidationError
    );
  });

  it("rejects secrets, transcripts and raw content on manifests and artifacts", () => {
    expect(() => parseNamed("ContextPackManifest", { ...validContextPack(), secret: "prompt-token" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() =>
      parseNamed("ContextPackManifest", {
        ...validContextPack(),
        sources: [{ ...validContextSource(), content: "full contract text copied into sqlite" }]
      })
    ).toThrow(protocol.ProtocolValidationError);
    expect(() => parseNamed("AgentRunRecord", { ...validRun(), transcript: "full agent chat" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("AgentRunRecord", { ...validRun(), stdout: "raw logs" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("Artifact", { ...validArtifact(), content: "binary-bytes" })).toThrow(
      protocol.ProtocolValidationError
    );
    expect(() => parseNamed("Artifact", { ...validArtifact(), password: "artifact-secret" })).toThrow(
      protocol.ProtocolValidationError
    );
  });
});

describe("M2 command parsers", () => {
  const commands = () => [
    envelope("CreatePlanningWorkItem", { change_id: id() }),
    envelope("CreateExecutionWorkItems", { change_id: id() }),
    envelope("ClaimWorkItem", { work_item_id: id() }),
    envelope("StartRun", { work_item_id: id(), context_pack_id: id(), binding_id: id() }),
    envelope("HeartbeatRun", { run_id: id() }),
    envelope("CompleteRun", {
      run_id: id(),
      summary: "本次尝试结束。",
      log_reference: "cimi-object://runs/log",
      log_digest: digest("run_log")
    }),
    envelope("FailRun", { run_id: id(), summary: "进程超时。", failure_code: "RUNTIME_TIMEOUT" }),
    envelope("CancelRun", { run_id: id(), reason: "操作者取消。" }),
    envelope("RecordSourceSnapshot", {
      run_id: id(),
      snapshot_kind: "git_commit",
      dirty: false,
      commit_sha: "b".repeat(40),
      tree_sha: "c".repeat(40),
      digest: digest("source_snapshot"),
      content_reference: "git://repo#commit"
    }),
    envelope("RecordArtifact", {
      run_id: id(),
      source_snapshot_id: id(),
      context_pack_id: id(),
      binding_id: id(),
      digest: digest("artifact"),
      content_reference: "cimi-object://artifacts/candidate",
      summary: "记录不可变制品。"
    }),
    envelope("ReclaimExpiredLease", { lease_id: id() })
  ];

  it("parses the eleven M2 execution commands", () => {
    for (const command of commands()) {
      expect(protocol.parseCommand(command)).toMatchObject({ command_type: command.command_type });
    }
  });

  it("requires expected revision and rejects secret command fields", () => {
    const valid = envelope("ClaimWorkItem", { work_item_id: id() });
    expect(protocol.parseCommand(valid).expected_revision).toBe(1);
    const { expected_revision: _omitted, ...withoutRevision } = valid;
    expect(() => protocol.parseCommand(withoutRevision)).toThrow(protocol.ProtocolValidationError);
    expect(() => protocol.parseCommand(envelope("StartRun", {
      work_item_id: id(),
      context_pack_id: id(),
      binding_id: id(),
      secret: "runtime-token"
    }))).toThrow(protocol.ProtocolValidationError);
  });
});

describe("M2 command success results", () => {
  it("accepts a strict work item and run success payload", () => {
    const workItem = validWorkItem();
    const run = validRun();
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "work_item", id: workItem.id, domain_version: 1 },
        revision: 2,
        events: [],
        data: { work_item: workItem, lease: validLease() }
      })
    ).toMatchObject({ ok: true });
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "agent_run", id: run.id, domain_version: 1 },
        revision: 3,
        events: [],
        data: { run }
      })
    ).toMatchObject({ ok: true });
    expect(
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "artifact", id: id(), domain_version: 1 },
        revision: 4,
        events: [],
        data: { artifact: validArtifact(), snapshot: validSnapshot() }
      })
    ).toMatchObject({ ok: true });
  });

  it("rejects success payloads that smuggle transcripts or secrets", () => {
    expect(() =>
      protocol.parseCommandResult({
        ok: true,
        command_id: id(),
        correlation_id: id(),
        aggregate: { object_type: "agent_run", id: id(), domain_version: 1 },
        revision: 1,
        events: [],
        data: { run: validRun(), transcript: "hidden", secret: "token" }
      })
    ).toThrow(protocol.ProtocolValidationError);
  });
});
