import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { openLocalProject, writeInstance, LocalPrePlanClarification } from "@cimiloop/local-app";
import { createIntentProject, contractBody, planBody } from "../../../tests/fixtures/intent-project.js";
import { flowSuccess } from "../../../tests/fixtures/flow-project.js";
import { startWorkbench, type WorkbenchServer } from "../src/server.js";

// Historical manual local fixtures use explicit compatibility. The final
// browser case installs a controlled Matt callback, never real Skill/S1 proof.
describe("Human clarification creates the original Plan candidate before tasks", () => {
  let root: string, f: ReturnType<typeof createIntentProject>, local: ReturnType<typeof openLocalProject>, service: LocalPrePlanClarification, server: WorkbenchServer | undefined;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-plan-clarification-"));
    f = createIntentProject(root, { databasePath: join(root, ".cimiloop", "project.db") });
    writeInstance(join(root, ".cimiloop", "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id,
      project_id: f.project.id, actor_id: f.actor.id, created_at: f.project.created_at });
    local = openLocalProject({ projectDir: root, legacyManualPlanning: true }); service = new LocalPrePlanClarification(local);
  });
  afterEach(async () => {
    await server?.close(); server = undefined; local?.store.close(); f?.store.close();
    if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-plan-clarification-")) throw Error("Unsafe cleanup");
    rmSync(root, { recursive: true, force: true });
  });
  const begin = (change: string) => ({ request_id: createInternalId(), target: "plan", requirement: "Define implementation and independent verification", background: "Current confirmed contract", constraints: ["Preserve original identity"] });
  function round() {
    const change = f.create(); f.prepareContract(change.id);
    const request = begin(change.id), session = service.begin(change.id, request).session;
    const question = { request_id: createInternalId(), expected_head: 0, kind: "question", text: "What verifies the actual task result?" };
    service.advance(change.id, session.id, question);
    service.advance(change.id, session.id, { request_id: createInternalId(), expected_head: 1, kind: "answer", question_id: question.request_id, text: "Independent evidence for A1" });
    const body = planBody(change.id, f.store.getChange(change.id)!.contract_ref!);
    const candidate = { request_id: createInternalId(), expected_head: 2, kind: "plan_candidate", requested_at: new Date().toISOString(), body };
    return { change, request, session, candidate };
  }
  it("submits one Plan candidate containing task definitions, without confirming a Plan or creating tasks", () => {
    const x = round(), before = f.store.asOfEventSequence(), result = service.advance(x.change.id, x.session.id, x.candidate);
    expect(result).toMatchObject({ session: { submitted: true, pending: false }, command_result: { command_type: "SubmitPlanProposal" } });
    expect(service.advance(x.change.id, x.session.id, x.candidate)).toEqual(result);
    expect(f.store.listIntentRecords("plan_proposal", x.change.id)).toHaveLength(1);
    expect(f.store.listIntentRecords("plan_proposal", x.change.id)[0]!.body.task_definitions).toEqual(x.candidate.body.task_definitions);
    expect(f.store.listIntentRecords("plan_version", x.change.id)).toHaveLength(0); expect(f.store.listExecutionObjects("task", x.change.id)).toHaveLength(0);
    expect(f.store.asOfEventSequence()).toBe(before + 1);
  });
  it("recovers a lost application result after actual Kernel commit using the original Plan request", () => {
    const x = round(), execute = local.kernel.execute.bind(local.kernel), before = f.store.asOfEventSequence();
    local.kernel.execute = (command => { const result = execute(command); if ((command as { command_type?: string }).command_type === "SubmitPlanProposal" && !("code" in result)) throw Error("Constructed post-commit response loss"); return result; }) as typeof local.kernel.execute;
    expect(() => service.advance(x.change.id, x.session.id, x.candidate)).toThrow("Constructed post-commit response loss");
    expect(service.show(x.change.id, x.session.id)).toMatchObject({ session: { pending: true, submitted: false } });
    local.store.close(); local = openLocalProject({ projectDir: root, legacyManualPlanning: true }); service = new LocalPrePlanClarification(local);
    const result = service.advance(x.change.id, x.session.id, x.candidate);
    expect(result).toMatchObject({ session: { pending: false, submitted: true }, command_result: { command_type: "SubmitPlanProposal" } });
    expect(service.advance(x.change.id, x.session.id, x.candidate)).toEqual(result); expect(f.store.asOfEventSequence()).toBe(before + 1);
    expect(f.store.listIntentRecords("plan_proposal", x.change.id)).toHaveLength(1); expect(f.store.listExecutionObjects("task", x.change.id)).toHaveLength(0);
  });
  it("stores the complete large Chinese Plan receipt after commit/response loss and replays it without another proposal", () => {
    const x = round(), execute = local.kernel.execute.bind(local.kernel), sequence = f.store.asOfEventSequence();
    x.candidate.body.task_definitions[0]!.outputs = Array.from({ length: 9 }, (_, index) => String(index) + "证".repeat(3500));
    expect(Buffer.byteLength(JSON.stringify(x.candidate))).toBeLessThan(131072);
    local.kernel.execute = (command => { const result = execute(command); if ((command as { command_type?: string }).command_type === "SubmitPlanProposal" && !("code" in result)) throw Error("Constructed large post-commit response loss"); return result; }) as typeof local.kernel.execute;
    expect(() => service.advance(x.change.id, x.session.id, x.candidate)).toThrow("Constructed large post-commit response loss");
    local.store.close(); local = openLocalProject({ projectDir: root, legacyManualPlanning: true }); service = new LocalPrePlanClarification(local);
    const result = service.advance(x.change.id, x.session.id, x.candidate);
    expect(result).toMatchObject({ session: { pending: false, submitted: true }, command_result: { command_type: "SubmitPlanProposal" } });
    expect(service.advance(x.change.id, x.session.id, x.candidate)).toEqual(result); expect(f.store.asOfEventSequence()).toBe(sequence + 1);
    expect(f.store.listIntentRecords("plan_proposal", x.change.id)).toHaveLength(1);
  });
  it("reads format1 unchanged alongside explicit plan format2, never reinterpreting legacy conversations", () => {
    const change = f.create(), legacy = { request_id: createInternalId(), requirement: "Legacy contract", background: "Original format1", constraints: [] };
    const original = service.begin(change.id, legacy), path = join(root, ".cimiloop/pre-plan-clarifications/originals.sqlite");
    const read = () => { const db = new DatabaseSync(path, { readOnly: true }); try { return db.prepare("SELECT body,digest FROM sessions WHERE id=?").get(legacy.request_id); } finally { db.close(); } };
    const bytes = read(); f.prepareContract(change.id); const session = service.begin(change.id, begin(change.id)).session;
    expect(session.basis.format).toBe("cimiloop/pre-plan-clarification/2.0.0"); expect(original.session.basis.format).toBe("cimiloop/pre-plan-clarification/1.0.0");
    expect(read()).toEqual(bytes); expect(service.begin(change.id, legacy)).toEqual(original);
  });
  it("rejects unconfirmed or retrospective plan sessions and candidate phase/contract mismatches before reservation", () => {
    const draft = f.create(); expect(() => service.begin(draft.id, begin(draft.id))).toThrow();
    const x = round();
    expect(() => service.advance(x.change.id, x.session.id, { ...x.candidate, kind: "candidate", body: contractBody() })).toThrow();
    expect(() => service.advance(x.change.id, x.session.id, { ...x.candidate, body: { ...x.candidate.body, contract_ref: { ...x.candidate.body.contract_ref, id: createInternalId() } } })).toThrow();
    expect(service.show(x.change.id, x.session.id).session.head).toBe(2);
    service.advance(x.change.id, x.session.id, x.candidate); expect(() => service.begin(x.change.id, begin(x.change.id))).toThrow();
  });
  it("rejects a changed confirmed contract before new questions and leaves the original session intact", () => {
    const x = round(); f.prepareContract(x.change.id, { ...contractBody(), goal: "Changed formal contract" });
    expect(() => service.advance(x.change.id, x.session.id, { request_id: createInternalId(), expected_head: 2, kind: "question", text: "New basis?" })).toThrow();
    expect(service.show(x.change.id, x.session.id).session.head).toBe(2); expect(f.store.listIntentRecords("plan_proposal", x.change.id)).toHaveLength(0);
  });
  it("does not grant technical_owner from Human answers and replays the original Kernel refusal", () => {
    const x = round(), assignment = f.store.listAssignments().find(item => item.role_key === "technical_owner" && item.actor_id === f.actor.id)!;
    flowSuccess(f.kernel.execute(f.projectCommand("EndAssignment", { assignment_id: assignment.id, expected_assignment_revision: assignment.revision, reason: "Actual permission revoked" })));
    const sequence = f.store.asOfEventSequence(), result = service.advance(x.change.id, x.session.id, x.candidate);
    expect(result.command_result).toHaveProperty("code"); expect(result.session).toMatchObject({ submitted: true, pending: false });
    expect(service.advance(x.change.id, x.session.id, x.candidate)).toEqual(result); expect(f.store.listIntentRecords("plan_proposal", x.change.id)).toHaveLength(0);
    expect(f.store.asOfEventSequence()).toBe(sequence);
  });
  it("uses the existing HTTP and compiled CLI services for the same plan conversation and exact request replay", async () => {
    const change = f.create(); f.prepareContract(change.id); server = await startWorkbench({ projectDir: root });
    const login = await fetch(server.origin + "/api/session", { method: "POST", headers: { Origin: server.origin, "Content-Type": "application/json" }, body: JSON.stringify({ bootstrap: new URL(server.bootstrapUrl).hash.slice(1) }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!, csrf = (await login.json() as { csrf: string }).csrf, request = begin(change.id);
    const response = await fetch(server.origin + "/api/changes/" + change.id + "/clarifications", { method: "POST", headers: { Origin: server.origin, Cookie: cookie, "Content-Type": "application/json", "X-CimiLoop-CSRF": csrf }, body: JSON.stringify(request) });
    expect(response.status).toBe(200); const started = await response.json();
    const file = join(root, "begin.json"); writeFileSync(file, JSON.stringify(request));
    const cli = spawnSync(process.execPath, ["apps/cli/dist/bin.js", "--json", "--project-dir", root, "clarification", "begin", change.id, "--file", file], { encoding: "utf8" });
    expect(cli.status).toBe(0); expect(JSON.parse(cli.stdout)).toEqual(started); expect(readFileSync(file, "utf8")).toBe(JSON.stringify(request));
  });
});
