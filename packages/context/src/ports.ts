import type {
  Blocker,
  CapabilityBinding,
  ContextPackManifest,
  ContextSource,
  ContextValidity,
  InternalId,
  ProviderDescriptor,
  WorkItem
} from "@cimiloop/protocol";

export interface ContextBuildInput {
  role_key: WorkItem["authorized_role_key"];
  work_item: WorkItem;
  available_sources: ContextSource[];
  assembly_rule_version?: number;
  now?: string;
}

export interface CapabilityRequirementInput {
  capability_id: string;
  required: boolean;
  side_effect: "none" | "workspace_write" | "external";
}

export interface CapabilityResolveInput {
  work_item: WorkItem;
  run_id: InternalId;
  requirements: CapabilityRequirementInput[];
  providers: ProviderDescriptor[];
  actor_permissions: string[];
  provider_permissions: string[];
  now?: string;
}

export interface ContextValidityInput {
  contract_changed: boolean;
  policy_changed: boolean;
  permission_changed: boolean;
  ordinary_source_changed: boolean;
}

export type ContextBuildResult =
  | { kind: "pack"; manifest: ContextPackManifest }
  | { kind: "blocker"; blocker: Omit<Blocker, "id" | "created_at" | "updated_at" | "revision" | "schema_version"> };

export type CapabilityResolveResult =
  | { kind: "binding"; binding: CapabilityBinding }
  | { kind: "blocker"; blocker: Omit<Blocker, "id" | "created_at" | "updated_at" | "revision" | "schema_version"> };

export type ContextValidityResult = ContextValidity;
