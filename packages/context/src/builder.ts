import { createHash } from "node:crypto";
import { SCHEMA_VERSION, type ContextSource, type WorkItem } from "@cimiloop/protocol";
import { createInternalId } from "@cimiloop/protocol";
import type { ContextBuildInput, ContextBuildResult, ContextValidityInput, ContextValidityResult } from "./ports.js";

const ROLE_SOURCES: Record<WorkItem["authorized_role_key"], readonly string[]> = {
  project_owner: ["policy"],
  change_owner: ["contract", "plan", "policy"],
  intent_owner: ["contract", "policy"],
  technical_owner: ["contract", "plan", "policy"],
  release_owner: ["contract", "plan", "policy"]
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
};

const digestValue = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

export const selectRoleSources = (
  roleKey: WorkItem["authorized_role_key"],
  available: ContextSource[]
): ContextSource[] => {
  const allowed = new Set(ROLE_SOURCES[roleKey]);
  return available.filter((source) => allowed.has(source.key));
};

export const buildContextPack = (input: ContextBuildInput): ContextBuildResult => {
  const sources = selectRoleSources(input.role_key, input.available_sources);
  const now = input.now ?? new Date().toISOString();
  const optionalRefs = {
    ...(input.work_item.plan_id ? { plan_id: input.work_item.plan_id } : {}),
    ...(input.work_item.plan_version ? { plan_version: input.work_item.plan_version } : {}),
    ...(input.work_item.task_id ? { task_id: input.work_item.task_id } : {})
  };
  const manifestBody = {
    change_id: input.work_item.change_id,
    work_item_id: input.work_item.id,
    contract_id: input.work_item.contract_id,
    contract_version: input.work_item.contract_version,
    ...optionalRefs,
    policy_snapshot_id: input.work_item.policy_snapshot_id,
    role_key: input.role_key,
    assembly_rule_version: input.assembly_rule_version ?? 1,
    sources
  };
  return {
    kind: "pack",
    manifest: {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: input.work_item.project_id,
      ...manifestBody,
      validity: "valid",
      digest: {
        algorithm: "sha256",
        value: digestValue(manifestBody),
        subject: "context_pack"
      },
      created_at: now
    }
  };
};

export const assessContextValidity = (input: ContextValidityInput): ContextValidityResult => {
  if (input.contract_changed || input.policy_changed || input.permission_changed) return "invalid";
  if (input.ordinary_source_changed) return "stale";
  return "valid";
};
