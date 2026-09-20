import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SCHEMA_VERSION,
  createInternalId,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../../packages/kernel/src/kernel.js";

export const now = "2026-09-20T12:00:00.000Z";
export const digest = (subject: string, value = "e".repeat(64)) => ({
  algorithm: "sha256" as const,
  value,
  subject
});

export const success = (result: CommandSuccess | DomainError): CommandSuccess => {
  if (!("ok" in result && result.ok)) throw new Error(JSON.stringify(result));
  return result;
};

export const envelope = (
  type: string,
  projectId: InternalId,
  actorId: InternalId,
  payload: Record<string, unknown>,
  revision: number,
  changeId: InternalId
) => ({
  schema_version: SCHEMA_VERSION,
  command_id: createInternalId(),
  correlation_id: createInternalId(),
  command_type: type,
  requested_at: now,
  actor_id: actorId,
  project_id: projectId,
  expected_revision: revision,
  target: { object_type: "change" as const, id: changeId, domain_version: 1 },
  source: { origin: "human_cli" as const, producer: "v1-acceptance" },
  payload
});

export const contractPayload = () => ({
  profile_key: "feature" as const,
  intent: "完成 Feature 北极星闭环并保留可移植历史。",
  outcomes: ["Verified delivery", "Knowledge closed"],
  scope: { in: ["Contract", "Plan", "Artifact", "Release"], out: ["Secrets"] },
  non_goals: ["不删除历史"],
  acceptance: [{ key: "AC-1", statement: "同一 Artifact digest 完成测试与生产验证。" }],
  constraints: ["Human decisions only"],
  risk: {
    data_exposure: "none",
    security: "none",
    reliability: "local-only",
    reversibility: "fully_reversible"
  },
  knowledge_impact: {
    product_business: { conclusion: "NoImpact" as const, rationale: "无产品对外变化。" },
    technical: {
      conclusion: "Update" as const,
      owner_role: "technical_owner" as const,
      gate: "change_closure" as const,
      summary: "更新实施说明。"
    },
    operations: { conclusion: "NoImpact" as const, rationale: "无运维手册变化。" },
    communication: { conclusion: "NoImpact" as const, rationale: "无对外沟通材料。" }
  }
});

export const planPayload = () => ({
  summary: "实现、验证、更新知识后关闭。",
  verification_strategy: "独立 Evaluation 与同一 digest 的测试/生产验证。",
  recovery_considerations: "未知外部结果必须核对，不得盲目重试。",
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

export const recovery = (scope: string) => ({
  trigger: "verify_fail" as const,
  kind: "rollback" as const,
  target_digest: digest("known_good_artifact", "f".repeat(64)),
  scope: { in: [scope], out: [] },
  steps: ["restore prior digest"],
  verify_checks: ["digest" as const, "health" as const],
  authorization: "preauthorized" as const
});

export const openAcceptanceProject = (prefix: string) => {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init"], { cwd: directory, stdio: "ignore" });
  writeFileSync(join(directory, "artifact.bin"), "v1-north-star-artifact");
  const store = new SqliteProjectStore(join(directory, "project.db"));
  const kernel = new CimiLoopKernel({ store, now: () => now });
  const initialized = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "InitializeProject",
      requested_at: now,
      actor_id: createInternalId(),
      project_id: createInternalId(),
      source: { origin: "human_cli" as const, producer: "v1-acceptance" },
      payload: {
        name: "V1 Acceptance",
        repository_kind: "git",
        repository_path: directory,
        owner_name: "Owner"
      }
    })
  );
  if (!("project" in initialized.data) || !("actor" in initialized.data)) throw new Error("missing project");
  const created = success(
    kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CreateChange",
      requested_at: now,
      actor_id: initialized.data.actor.id,
      project_id: initialized.data.project.id,
      source: { origin: "human_cli" as const, producer: "v1-acceptance" },
      payload: { title: "V1 Feature north-star" }
    })
  );
  if (!("change" in created.data)) throw new Error("missing change");
  return {
    directory,
    store,
    kernel,
    projectId: initialized.data.project.id,
    actorId: initialized.data.actor.id,
    changeId: created.data.change.id,
    revision: created.data.change.revision
  };
};

export type AcceptanceContext = ReturnType<typeof openAcceptanceProject>;

export const exec = (
  ctx: AcceptanceContext,
  type: string,
  payload: Record<string, unknown>,
  revision = ctx.revision
) => {
  const result = success(ctx.kernel.execute(envelope(type, ctx.projectId, ctx.actorId, payload, revision, ctx.changeId)));
  ctx.revision = result.revision;
  return result;
};
