import { Type, type Static } from "typebox";

export const WorkItemKindSchema = Type.Union([
  Type.Literal("planning"),
  Type.Literal("execution"),
  Type.Literal("evaluation"),
  Type.Literal("repair")
]);

export const WorkItemStatusSchema = Type.Union([
  Type.Literal("created"),
  Type.Literal("ready"),
  Type.Literal("claimed"),
  Type.Literal("running"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
  Type.Literal("blocked")
]);

export const RunStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("starting"),
  Type.Literal("running"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
  Type.Literal("unknown")
]);

export const LeaseStatusSchema = Type.Union([
  Type.Literal("active"),
  Type.Literal("expired"),
  Type.Literal("released"),
  Type.Literal("reclaimed")
]);

export const ResourceLockStatusSchema = Type.Union([Type.Literal("held"), Type.Literal("released")]);

export const ResourceTypeSchema = Type.Union([Type.Literal("worktree"), Type.Literal("change_workspace")]);

export const ArtifactStatusSchema = Type.Union([Type.Literal("candidate"), Type.Literal("superseded")]);

export const ContextValiditySchema = Type.Union([
  Type.Literal("valid"),
  Type.Literal("stale"),
  Type.Literal("invalid")
]);

export const ContextAuthoritySchema = Type.Union([
  Type.Literal("canonical"),
  Type.Literal("derived"),
  Type.Literal("reference"),
  Type.Literal("runtime_observation")
]);

export const ContextFreshnessSchema = Type.Union([
  Type.Literal("current"),
  Type.Literal("stale"),
  Type.Literal("unavailable")
]);

export const ProviderTypeSchema = Type.Union([
  Type.Literal("skill"),
  Type.Literal("tool"),
  Type.Literal("model"),
  Type.Literal("adapter"),
  Type.Literal("runtime")
]);

export const CapabilitySideEffectSchema = Type.Union([
  Type.Literal("none"),
  Type.Literal("workspace_write"),
  Type.Literal("external")
]);

export const SnapshotKindSchema = Type.Union([
  Type.Literal("git_commit"),
  Type.Literal("explicit_dirty_manifest")
]);

export const BlockerStatusSchema = Type.Union([Type.Literal("open"), Type.Literal("resolved")]);

export const CapabilityIdSchema = Type.String({
  pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$",
  minLength: 3,
  maxLength: 128
});

export const PermissionKeySchema = Type.String({
  pattern: "^[a-z][a-z0-9_.]*$",
  minLength: 1,
  maxLength: 128
});

export const GitShaSchema = Type.String({ pattern: "^[0-9a-f]{40}$" });

export const ContentReferenceSchema = Type.String({ minLength: 1, maxLength: 500 });

export const WorkItemBudgetSchema = Type.Object(
  {
    max_duration_ms: Type.Integer({ minimum: 1 }),
    max_retries: Type.Integer({ minimum: 0 })
  },
  { additionalProperties: false }
);

export const RunTransitionSchema = Type.Union([
  Type.Object({ from: Type.Literal("queued"), to: Type.Literal("starting") }, { additionalProperties: false }),
  Type.Object({ from: Type.Literal("queued"), to: Type.Literal("cancelled") }, { additionalProperties: false }),
  Type.Object({ from: Type.Literal("starting"), to: Type.Literal("running") }, { additionalProperties: false }),
  Type.Object({ from: Type.Literal("starting"), to: Type.Literal("failed") }, { additionalProperties: false }),
  Type.Object({ from: Type.Literal("starting"), to: Type.Literal("cancelled") }, { additionalProperties: false }),
  Type.Object({ from: Type.Literal("starting"), to: Type.Literal("unknown") }, { additionalProperties: false }),
  Type.Object({ from: Type.Literal("running"), to: Type.Literal("completed") }, { additionalProperties: false }),
  Type.Object({ from: Type.Literal("running"), to: Type.Literal("failed") }, { additionalProperties: false }),
  Type.Object({ from: Type.Literal("running"), to: Type.Literal("cancelled") }, { additionalProperties: false }),
  Type.Object({ from: Type.Literal("running"), to: Type.Literal("unknown") }, { additionalProperties: false })
]);

export type WorkItemKind = Static<typeof WorkItemKindSchema>;
export type WorkItemStatus = Static<typeof WorkItemStatusSchema>;
export type RunStatus = Static<typeof RunStatusSchema>;
export type LeaseStatus = Static<typeof LeaseStatusSchema>;
export type ArtifactStatus = Static<typeof ArtifactStatusSchema>;
export type ContextValidity = Static<typeof ContextValiditySchema>;
export type ProviderType = Static<typeof ProviderTypeSchema>;
export type SnapshotKind = Static<typeof SnapshotKindSchema>;
export type RunTransition = Static<typeof RunTransitionSchema>;
