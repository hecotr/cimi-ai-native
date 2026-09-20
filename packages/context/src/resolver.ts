import { createHash } from "node:crypto";
import { SCHEMA_VERSION, createInternalId, type ProviderDescriptor } from "@cimiloop/protocol";
import type { CapabilityResolveInput, CapabilityResolveResult } from "./ports.js";

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

const intersect = (...lists: readonly (readonly string[])[]): string[] => {
  const [first, ...rest] = lists;
  if (!first) return [];
  let current = first.slice();
  for (const next of rest) {
    current = current.filter((item) => next.includes(item));
  }
  return current;
};

const findProvider = (
  providers: readonly ProviderDescriptor[],
  capabilityId: string,
  providerType?: ProviderDescriptor["provider_type"]
): ProviderDescriptor | undefined =>
  providers.find(
    (provider) =>
      provider.capability_ids.includes(capabilityId) && (providerType ? provider.provider_type === providerType : true)
  );

export const resolveCapabilities = (input: CapabilityResolveInput): CapabilityResolveResult => {
  const missing = input.requirements.filter(
    (requirement) => requirement.required && !input.providers.some((provider) => provider.capability_ids.includes(requirement.capability_id))
  );
  if (missing[0]) {
    return {
      kind: "blocker",
      blocker: {
        project_id: input.work_item.project_id,
        change_id: input.work_item.change_id,
        work_item_id: input.work_item.id,
        code: "CAPABILITY_MISSING",
        summary: `缺少能力 ${missing[0].capability_id}，不能启动 Run。`,
        status: "open",
        resolution_condition: `提供已授权且实现 ${missing[0].capability_id} 的 Provider。`
      }
    };
  }

  const runtime =
    findProvider(input.providers, input.requirements[0]?.capability_id ?? "code.modify", "runtime") ??
    input.providers.find((provider) => provider.provider_type === "runtime") ??
    input.providers[0];
  if (!runtime) {
    return {
      kind: "blocker",
      blocker: {
        project_id: input.work_item.project_id,
        change_id: input.work_item.change_id,
        work_item_id: input.work_item.id,
        code: "CAPABILITY_MISSING",
        summary: "缺少 Runtime Provider。",
        status: "open",
        resolution_condition: "提供已授权的 Runtime Provider。"
      }
    };
  }

  const granted = intersect(input.actor_permissions, input.work_item.permission_scope, input.provider_permissions);
  const now = input.now ?? new Date().toISOString();
  const model = input.providers.find((provider) => provider.provider_type === "model");
  const skill = input.providers.find((provider) => provider.provider_type === "skill");
  const tools = input.providers.filter((provider) => provider.provider_type === "tool");
  const adapter = input.providers.find((provider) => provider.provider_type === "adapter");
  const bindingBody = {
    work_item_id: input.work_item.id,
    run_id: input.run_id,
    runtime,
    granted_permissions: granted
  };

  return {
    kind: "binding",
    binding: {
      schema_version: SCHEMA_VERSION,
      id: createInternalId(),
      project_id: input.work_item.project_id,
      ...bindingBody,
      ...(model ? { model } : {}),
      ...(skill ? { skill } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(adapter ? { adapter } : {}),
      digest: {
        algorithm: "sha256",
        value: digestValue(bindingBody),
        subject: "capability_binding"
      },
      created_at: now
    }
  };
};
