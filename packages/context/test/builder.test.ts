import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createInternalId, type WorkItem } from "../../protocol/src/index.js";
import { assessContextValidity, buildContextPack, resolveCapabilities } from "../src/index.js";

const now = "2026-09-20T00:00:00.000Z";
const digest = (subject: string) => ({
  algorithm: "sha256" as const,
  value: "a".repeat(64),
  subject
});

const workItem = (): WorkItem => ({
  schema_version: SCHEMA_VERSION,
  id: createInternalId(),
  project_id: createInternalId(),
  change_id: createInternalId(),
  kind: "execution",
  status: "ready",
  contract_id: createInternalId(),
  contract_version: 1,
  plan_id: createInternalId(),
  plan_version: 1,
  task_id: createInternalId(),
  policy_snapshot_id: createInternalId(),
  authorized_role_key: "technical_owner",
  permission_scope: ["workspace.write", "git.commit"],
  budget: { max_duration_ms: 600000, max_retries: 1 },
  stop_conditions: ["timeout"],
  authorization_digest: digest("work_item_authorization"),
  created_at: now,
  updated_at: now,
  revision: 1
});

describe("M2 context builder and capability resolver", () => {
  it("selects the minimum role-scoped sources and records digest, freshness and authority", () => {
    const item = workItem();
    const pack = buildContextPack({
      role_key: "technical_owner",
      work_item: item,
      available_sources: [
        {
          key: "contract",
          authority: "canonical",
          location_ref: "cimi://contract/1",
          digest: digest("contract"),
          freshness: "current"
        },
        {
          key: "plan",
          authority: "canonical",
          location_ref: "cimi://plan/1",
          digest: digest("plan"),
          freshness: "current"
        },
        {
          key: "policy",
          authority: "canonical",
          location_ref: "cimi://policy/1",
          digest: digest("policy"),
          freshness: "current"
        },
        {
          key: "chat-history",
          authority: "reference",
          location_ref: "cimi://chat/full",
          digest: digest("chat"),
          freshness: "current"
        }
      ]
    });
    expect(pack.kind).toBe("pack");
    if (pack.kind !== "pack") throw new Error("expected pack");
    expect(pack.manifest.role_key).toBe("technical_owner");
    expect(pack.manifest.sources.map((source) => source.key).sort()).toEqual(["contract", "plan", "policy"]);
    expect(pack.manifest.sources.every((source) => source.authority === "canonical")).toBe(true);
    expect(pack.manifest.validity).toBe("valid");
    expect("secret" in pack.manifest).toBe(false);
  });

  it("creates a blocker when a required capability is missing", () => {
    const resolved = resolveCapabilities({
      work_item: workItem(),
      run_id: createInternalId(),
      requirements: [
        {
          capability_id: "code.modify",
          required: true,
          side_effect: "workspace_write"
        }
      ],
      providers: [],
      actor_permissions: ["workspace.write"],
      provider_permissions: ["workspace.write"]
    });
    expect(resolved.kind).toBe("blocker");
    if (resolved.kind !== "blocker") throw new Error("expected blocker");
    expect(resolved.blocker.code).toBe("CAPABILITY_MISSING");
  });

  it("intersects actor, work-item and provider permissions on a binding", () => {
    const item = workItem();
    const runtimeId = createInternalId();
    const resolved = resolveCapabilities({
      work_item: item,
      run_id: createInternalId(),
      requirements: [
        {
          capability_id: "code.modify",
          required: true,
          side_effect: "workspace_write"
        }
      ],
      providers: [
        {
          schema_version: SCHEMA_VERSION,
          id: runtimeId,
          project_id: item.project_id,
          provider_type: "runtime",
          name: "claude-code",
          implementation_version: "1.0.0",
          capability_ids: ["code.modify"],
          version_digest: digest("provider_claude_code"),
          created_at: now
        }
      ],
      actor_permissions: ["workspace.write", "git.commit", "network.egress"],
      provider_permissions: ["workspace.write", "secrets.read"]
    });
    expect(resolved.kind).toBe("binding");
    if (resolved.kind !== "binding") throw new Error("expected binding");
    expect(resolved.binding.granted_permissions.sort()).toEqual(["workspace.write"]);
    expect(resolved.binding.runtime.id).toBe(runtimeId);
    expect(resolved.binding.runtime.version_digest.value).toHaveLength(64);
  });

  it("marks packs invalid for contract, policy or permission changes and stale for ordinary source drift", () => {
    expect(
      assessContextValidity({
        contract_changed: true,
        policy_changed: false,
        permission_changed: false,
        ordinary_source_changed: false
      })
    ).toBe("invalid");
    expect(
      assessContextValidity({
        contract_changed: false,
        policy_changed: true,
        permission_changed: false,
        ordinary_source_changed: false
      })
    ).toBe("invalid");
    expect(
      assessContextValidity({
        contract_changed: false,
        policy_changed: false,
        permission_changed: true,
        ordinary_source_changed: false
      })
    ).toBe("invalid");
    expect(
      assessContextValidity({
        contract_changed: false,
        policy_changed: false,
        permission_changed: false,
        ordinary_source_changed: true
      })
    ).toBe("stale");
    expect(
      assessContextValidity({
        contract_changed: false,
        policy_changed: false,
        permission_changed: false,
        ordinary_source_changed: false
      })
    ).toBe("valid");
  });
});
