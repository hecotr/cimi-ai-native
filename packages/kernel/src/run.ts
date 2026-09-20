import { SCHEMA_VERSION, type AgentRunRecord, type ContextPackManifest, type CapabilityBinding, type Digest, type InternalId, type ProviderDescriptor, type RunStatus, type WorkItem } from "@cimiloop/protocol";
import { requestDigest } from "./canonical.js";

const pendingLogDigest = (): Digest => ({
  algorithm: "sha256",
  value: requestDigest("pending_runtime_log"),
  subject: "runtime_log"
});

export const isOpenExecutionStatus = (status: WorkItem["status"]): boolean =>
  status === "created" || status === "ready" || status === "claimed" || status === "running";

export const nextRunAttempt = (runs: readonly AgentRunRecord[]): number =>
  runs.reduce((max, run) => Math.max(max, run.attempt), 0) + 1;

export const hasActiveRun = (runs: readonly AgentRunRecord[]): boolean =>
  runs.some((run) => run.status === "queued" || run.status === "starting" || run.status === "running");

export const allowedRunTransition = (from: RunStatus, to: RunStatus): boolean => {
  const allowed: ReadonlyArray<readonly [RunStatus, RunStatus]> = [
    ["queued", "starting"],
    ["queued", "cancelled"],
    ["starting", "running"],
    ["starting", "failed"],
    ["starting", "cancelled"],
    ["starting", "unknown"],
    ["running", "completed"],
    ["running", "failed"],
    ["running", "cancelled"],
    ["running", "unknown"]
  ];
  return allowed.some(([start, end]) => start === from && end === to);
};

export const failStatusForCode = (code: string): Extract<RunStatus, "failed" | "unknown"> =>
  code.startsWith("RUNTIME_") ? "unknown" : "failed";

export const createContextPackForWorkItem = (input: {
  id: InternalId;
  workItem: WorkItem;
  now: string;
}): ContextPackManifest => {
  const sources = [
    {
      key: "contract",
      authority: "canonical" as const,
      location_ref: `cimi://contract/${input.workItem.contract_id}`,
      digest: { algorithm: "sha256" as const, value: requestDigest(input.workItem.contract_id), subject: "contract" },
      freshness: "current" as const
    },
    {
      key: "policy",
      authority: "canonical" as const,
      location_ref: `cimi://policy/${input.workItem.policy_snapshot_id}`,
      digest: {
        algorithm: "sha256" as const,
        value: requestDigest(input.workItem.policy_snapshot_id),
        subject: "policy"
      },
      freshness: "current" as const
    },
    ...(input.workItem.plan_id
      ? [
          {
            key: "plan",
            authority: "canonical" as const,
            location_ref: `cimi://plan/${input.workItem.plan_id}`,
            digest: { algorithm: "sha256" as const, value: requestDigest(input.workItem.plan_id), subject: "plan" },
            freshness: "current" as const
          }
        ]
      : [])
  ];
  const optionalRefs = {
    ...(input.workItem.plan_id ? { plan_id: input.workItem.plan_id } : {}),
    ...(input.workItem.plan_version ? { plan_version: input.workItem.plan_version } : {}),
    ...(input.workItem.task_id ? { task_id: input.workItem.task_id } : {})
  };
  const body = {
    change_id: input.workItem.change_id,
    work_item_id: input.workItem.id,
    contract_id: input.workItem.contract_id,
    contract_version: input.workItem.contract_version,
    ...optionalRefs,
    policy_snapshot_id: input.workItem.policy_snapshot_id,
    role_key: input.workItem.authorized_role_key,
    assembly_rule_version: 1,
    sources
  };
  return {
    schema_version: SCHEMA_VERSION,
    id: input.id,
    project_id: input.workItem.project_id,
    ...body,
    validity: "valid",
    digest: { algorithm: "sha256", value: requestDigest(body), subject: "context_pack" },
    created_at: input.now
  };
};

export const createDefaultRuntimeProvider = (input: {
  id: InternalId;
  projectId: InternalId;
  now: string;
}): ProviderDescriptor => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.projectId,
  provider_type: "runtime",
  name: "claude-code",
  implementation_version: "m2",
  capability_ids: ["code.modify"],
  version_digest: { algorithm: "sha256", value: requestDigest("claude-code/m2"), subject: "provider" },
  created_at: input.now
});

export const createBindingForRun = (input: {
  id: InternalId;
  workItem: WorkItem;
  runId: InternalId;
  runtime: ProviderDescriptor;
  now: string;
}): CapabilityBinding => {
  const body = {
    work_item_id: input.workItem.id,
    run_id: input.runId,
    runtime: input.runtime,
    granted_permissions: input.workItem.permission_scope
  };
  return {
    schema_version: SCHEMA_VERSION,
    id: input.id,
    project_id: input.workItem.project_id,
    ...body,
    digest: { algorithm: "sha256", value: requestDigest(body), subject: "capability_binding" },
    created_at: input.now
  };
};

export const createStartedRun = (input: {
  id: InternalId;
  workItem: WorkItem;
  contextPackId: InternalId;
  bindingId: InternalId;
  attempt: number;
  now: string;
}): AgentRunRecord => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.workItem.project_id,
  change_id: input.workItem.change_id,
  work_item_id: input.workItem.id,
  context_pack_id: input.contextPackId,
  binding_id: input.bindingId,
  status: "running",
  attempt: input.attempt,
  summary: "Run started",
  log_reference: "pending://runtime-log",
  log_digest: pendingLogDigest(),
  started_at: input.now,
  process_reference: `run://${input.id}`,
  created_at: input.now,
  updated_at: input.now,
  revision: 1
});
