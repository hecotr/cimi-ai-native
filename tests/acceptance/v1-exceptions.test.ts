import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInternalId, SCHEMA_VERSION } from "../../packages/protocol/src/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/project-store.js";
import { CimiLoopKernel } from "../../packages/kernel/src/kernel.js";
import {
  contractPayload,
  digest,
  exec,
  openAcceptanceProject,
  planPayload,
  success,
  type AcceptanceContext
} from "./helpers.js";

const temporary: Array<{ store: { close(): void }; directory: string }> = [];

afterEach(() => {
  while (temporary.length > 0) {
    const item = temporary.pop();
    item?.store.close();
    if (item) rmSync(item.directory, { recursive: true, force: true });
  }
});

const approveToPlanned = (ctx: AcceptanceContext) => {
  exec(ctx, "BootstrapSoloGovernance", {
    change_id: ctx.changeId,
    intent_owner_actor_id: ctx.actorId,
    technical_owner_actor_id: ctx.actorId
  });
  exec(ctx, "SubmitContractCandidate", contractPayload());
  const intent = exec(ctx, "RequestIntentDecision", { change_id: ctx.changeId });
  if (!("request" in intent.data)) throw new Error("missing intent");
  const intentRole = ctx.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
  const technicalRole = ctx.store.transaction((transaction) => transaction.getRoleByKey("technical_owner"));
  exec(ctx, "SubmitDecision", {
    request_id: intent.data.request.id,
    outcome: "approve",
    acting_role_id: intentRole!.id,
    reason: "Approve contract."
  });
  exec(ctx, "SubmitPlanCandidate", planPayload());
  const plan = exec(ctx, "RequestPlanDecision", { change_id: ctx.changeId });
  if (!("request" in plan.data)) throw new Error("missing plan");
  exec(ctx, "SubmitDecision", {
    request_id: plan.data.request.id,
    outcome: "approve",
    acting_role_id: technicalRole!.id,
    reason: "Approve plan."
  });
};

describe("V1 exception acceptance", () => {
  it("keeps evaluator self-score from passing an empty evidence set", () => {
    const ctx = openAcceptanceProject("cimiloop-v1-eval-fail-");
    temporary.push(ctx);
    approveToPlanned(ctx);
    const evaluation = ctx.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "CompleteEvaluation",
      requested_at: "2026-09-20T12:00:00.000Z",
      actor_id: ctx.actorId,
      project_id: ctx.projectId,
      expected_revision: ctx.revision,
      target: { object_type: "change", id: ctx.changeId, domain_version: 1 },
      source: { origin: "system" as const, producer: "v1-acceptance" },
      payload: {
        change_id: ctx.changeId,
        evaluation_id: createInternalId(),
        artifact_id: createInternalId(),
        artifact_digest: digest("missing"),
        requirement_set_id: createInternalId(),
        input_digest: digest("input"),
        result: "ALLOW",
        reason: "model self-score"
      }
    });
    if ("ok" in evaluation && evaluation.ok && "evaluation" in evaluation.data) {
      expect(evaluation.data.evaluation.result).not.toBe("ALLOW");
    } else {
      expect("code" in evaluation).toBe(true);
    }
  });

  it("rejects a stale decision after the candidate digest changes", () => {
    const ctx = openAcceptanceProject("cimiloop-v1-stale-decision-");
    temporary.push(ctx);
    exec(ctx, "BootstrapSoloGovernance", {
      change_id: ctx.changeId,
      intent_owner_actor_id: ctx.actorId,
      technical_owner_actor_id: ctx.actorId
    });
    exec(ctx, "SubmitContractCandidate", contractPayload());
    const first = exec(ctx, "RequestIntentDecision", { change_id: ctx.changeId });
    if (!("request" in first.data)) throw new Error("missing request");
    exec(ctx, "SubmitContractCandidate", {
      ...contractPayload(),
      intent: "修订后的 Contract 使旧 Decision Request 过期。"
    });
    const role = ctx.store.transaction((transaction) => transaction.getRoleByKey("intent_owner"));
    const stale = ctx.kernel.execute({
      schema_version: SCHEMA_VERSION,
      command_id: createInternalId(),
      correlation_id: createInternalId(),
      command_type: "SubmitDecision",
      requested_at: "2026-09-20T12:00:00.000Z",
      actor_id: ctx.actorId,
      project_id: ctx.projectId,
      expected_revision: ctx.revision,
      target: { object_type: "change", id: ctx.changeId, domain_version: 1 },
      source: { origin: "human_cli" as const, producer: "v1-acceptance" },
      payload: {
        request_id: first.data.request.id,
        outcome: "approve",
        acting_role_id: role!.id,
        reason: "Approve stale request."
      }
    });
    expect(stale).toMatchObject({ code: expect.stringMatching(/STALE|EXPIRED|DIGEST|DECISION/) });
  });

  it("reopens the same database after restart and preserves revision", () => {
    const ctx = openAcceptanceProject("cimiloop-v1-restart-");
    temporary.push(ctx);
    const before = ctx.store.getProject();
    const events = ctx.store.listEvents().length;
    ctx.store.close();
    const reopened = new SqliteProjectStore(join(ctx.directory, "project.db"));
    temporary.push({ store: reopened, directory: ctx.directory });
    expect(reopened.getProject()).toMatchObject({ id: before?.id, revision: before?.revision });
    expect(reopened.listEvents()).toHaveLength(events);
    const kernel = new CimiLoopKernel({ store: reopened, now: () => "2026-09-20T12:00:00.000Z" });
    expect(kernel.getProject()).toMatchObject({ id: before?.id });
  });

  it("stages export/import without activating runtime ownership", () => {
    const ctx = openAcceptanceProject("cimiloop-v1-portable-");
    temporary.push(ctx);
    const project = ctx.kernel.getProject();
    if ("code" in project) throw new Error(project.code);
    const exported = success(
      ctx.kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "ExportProject",
        requested_at: "2026-09-20T12:00:00.000Z",
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: project.revision,
        source: { origin: "human_cli" as const, producer: "v1-acceptance" },
        payload: { scope: "project" }
      })
    );
    if (!("export_manifest" in exported.data)) throw new Error("missing export");
    const bytes = JSON.stringify({
      manifest: exported.data.export_manifest,
      facts: exported.data.export_manifest.entries
    });
    const bundle = join(ctx.directory, "bundle.json");
    writeFileSync(bundle, bytes);
    const staged = success(
      ctx.kernel.execute({
        schema_version: SCHEMA_VERSION,
        command_id: createInternalId(),
        correlation_id: createInternalId(),
        command_type: "StageImport",
        requested_at: "2026-09-20T12:00:00.000Z",
        actor_id: ctx.actorId,
        project_id: ctx.projectId,
        expected_revision: ctx.kernel.getProject() && !("code" in ctx.kernel.getProject())
          ? (ctx.kernel.getProject() as { revision: number }).revision
          : 1,
        source: { origin: "human_cli" as const, producer: "v1-acceptance" },
        payload: {
          bundle_reference: `file://${bundle.replaceAll("\\", "/")}`,
          bundle_digest: {
            algorithm: "sha256",
            value: createHash("sha256").update(bytes).digest("hex"),
            subject: "import_bundle"
          }
        }
      })
    );
    if (!("import_report" in staged.data)) throw new Error("missing report");
    expect(staged.data.import_report).toMatchObject({ status: "staged", runtime_ownership: "dormant" });
  });

  it("blocks close when knowledge obligations are incomplete", () => {
    const ctx = openAcceptanceProject("cimiloop-v1-knowledge-");
    temporary.push(ctx);
    approveToPlanned(ctx);
    const proposed = exec(ctx, "ProposeClose", {
      change_id: ctx.changeId,
      residual_risk: "No open production defects.",
      known_issues: []
    });
    if (!("closure_evaluation" in proposed.data)) throw new Error("missing closure");
    expect(proposed.data.closure_evaluation.result).not.toBe("ALLOW");
    expect(proposed.data.closure_evaluation.knowledge_complete).toBe(false);
  });
});
