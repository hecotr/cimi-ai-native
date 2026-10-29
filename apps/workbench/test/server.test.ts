import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInternalId, type CommandSuccess, type IntentShowResult } from "@cimiloop/protocol/v2";
import { openLocalProject, writeInstance } from "@cimiloop/local-app";
import { createRunProject } from "../../../tests/fixtures/run-project.js";
import { contractBody } from "../../../tests/fixtures/intent-project.js";
import { flowSuccess } from "../../../tests/fixtures/flow-project.js";
import { startWorkbench, type WorkbenchServer } from "../src/server.js";

describe("local Workbench uses native project authority", () => {
  let directory: string, f: ReturnType<typeof createRunProject>, workbench: WorkbenchServer;
  let cookie: string, csrf: string;
  const request = async (path: string, body?: unknown, extra: Record<string, string> = {}) => {
    const response = await fetch(`${workbench.origin}${path}`, { headers: { Cookie: cookie, Connection: "close", ...(body === undefined ? {} : {
      Origin: workbench.origin, "Content-Type": "application/json", "X-CimiLoop-CSRF": csrf }), ...extra },
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  const command = (command_type: string, payload: unknown, target?: { object_type: string; id: string }, expected_revision?: number, acting_role = "project_owner") => ({
    command_id: createInternalId(), requested_at: new Date().toISOString(), command_type, payload, acting_role,
    ...(target ? { target } : {}), ...(expected_revision === undefined ? {} : { expected_revision }) });
  const post = async (input: ReturnType<typeof command>) => {
    const result = await request("/api/commands", input); expect(result.status).toBe(200); return result.body as CommandSuccess;
  };
  const login = async (server: WorkbenchServer) => {
    const response = await fetch(`${server.origin}/api/session`, { method: "POST", headers: { Origin: server.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ bootstrap: new URL(server.bootstrapUrl).hash.slice(1) }) });
    expect(response.status).toBe(200); const body = await response.json() as { csrf: string };
    const value = response.headers.get("set-cookie")!;
    expect(value).toContain("HttpOnly"); expect(value).toContain("SameSite=Strict");
    return { cookie: value.split(";")[0]!, csrf: body.csrf };
  };
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "cimiloop-workbench-test-")); f = createRunProject(directory);
    writeInstance(join(dirname(f.path), "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: f.project.created_at });
    workbench = await startWorkbench({ projectDir: directory }); ({ cookie, csrf } = await login(workbench));
  }, 60_000);
  afterAll(async () => {
    await workbench?.close(); f?.store.close();
    if (directory) {
      if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith("cimiloop-workbench-test-")) throw new Error("Unsafe test cleanup");
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("serves a real project, task readiness, versions and Provider admission", async () => {
    const response = await request("/api/dashboard"); expect(response.status).toBe(200);
    expect(response.body.project.id).toBe(f.project.id); expect(response.body.flow.changes.some((change: { id: string }) => change.id === f.change.id)).toBe(true);
    expect(response.body.execution.tasks).toHaveLength(2); expect(response.body.execution.readiness).toHaveLength(2);
    expect(response.body.providers).toHaveProperty("admission");
    const context = await request("/api/context"); expect(context.body.actor_id).toBe(f.actor.id);
    expect(JSON.stringify(response.body)).not.toContain(csrf); expect(JSON.stringify(response.body)).not.toContain(cookie);
  });
  it("requires a session on every native query", async () => {
    for (const path of ["/api/context", "/api/dashboard", "/api/decisions", `/api/changes/${f.change.id}`, `/api/objects/task/${f.task().id}`]) {
      const response = await fetch(`${workbench.origin}${path}`); expect(response.status).toBe(401);
    }
  });
  it("binds the loopback Host and rejects foreign origins and cross-site reads", async () => {
    // Fetch owns its Host header. A raw HTTP request exercises the actual
    // rebinding boundary rather than assuming Fetch forwarded an override.
    const status = await new Promise<number | undefined>((done, reject) => {
      const outgoing = httpRequest(`${workbench.origin}/api/dashboard`, { headers: { Host: "untrusted.example", Cookie: cookie } }, response => {
        response.resume(); response.on("end", () => done(response.statusCode));
      }); outgoing.on("error", reject); outgoing.end();
    });
    expect(status).toBe(403);
    expect((await request("/api/dashboard", undefined, { Origin: "https://untrusted.example" })).status).toBe(403);
    expect((await request("/api/dashboard", undefined, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
  });
  it("never lets a root page or static asset disclose the login capability", async () => {
    for (const path of ["/", "/changes/any"]) {
      const response = await fetch(`${workbench.origin}${path}`), text = await response.text();
      expect(response.status).toBe(200); expect(text).not.toContain(new URL(workbench.bootstrapUrl).hash.slice(1));
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("consumes the bootstrap capability only once", async () => {
    const response = await request("/api/session", { bootstrap: new URL(workbench.bootstrapUrl).hash.slice(1) });
    expect(response.status).toBe(401); expect(response.body.code).toBe("BOOTSTRAP_REJECTED");
  });
  it("rejects writes without the exact Origin and CSRF while preserving events", async () => {
    const before = f.store.listEvents().length, input = command("CreateChange", { title: "Must not exist" });
    for (const extra of [{ Origin: "" }, { Origin: "https://untrusted.example" }, { "X-CimiLoop-CSRF": "invalid" }]) expect((await request("/api/commands", input, extra)).status).toBe(403);
    const absent = await fetch(`${workbench.origin}/api/commands`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-CimiLoop-CSRF": csrf }, body: JSON.stringify(input) });
    expect(absent.status).toBe(403); expect(f.store.listEvents()).toHaveLength(before);
  });
  it("rejects caller, project, origin, repository and initialization overrides", async () => {
    const before = f.store.listEvents().length;
    for (const extra of [{ actor_id: f.reviewer.id }, { project_id: createInternalId() }, { source: { origin: "human_cli" } }, { repository_path: directory }, { schema_version: "1.0.0" }]) {
      expect((await request("/api/commands", { ...command("CreateChange", { title: "Forged" }), ...extra })).status).toBe(400);
    }
    expect((await request("/api/commands", command("InitializeProject", {}))).status).toBe(400);
    expect(f.store.listEvents()).toHaveLength(before);
  });
  it("uses the native receipt for identical requests and conflicting reuse", async () => {
    const before = f.store.listEvents().length, input = command("CreateChange", { title: "Browser requirement", requirement_owner_actor_id: f.actor.id });
    const [first, second] = await Promise.all([request("/api/commands", input), request("/api/commands", input)]);
    expect(first.status).toBe(200); expect(second.body).toEqual(first.body); expect(f.store.listEvents()).toHaveLength(before + 1);
    expect((await request("/api/commands", { ...input, payload: { title: "Different request" } })).body.code).toBe("COMMAND_ID_REUSED");
    const result = first.body as CommandSuccess; if (result.command_type !== "CreateChange") throw new Error("Expected change");
    expect(f.kernel.getChange(result.data.change.id)).toEqual(result.data.change);
    expect(result.data.change.source.origin).toBe("human_ui");
  });
  it("keeps native role checks, revision conflicts and current diagnostics", async () => {
    const created = await post(command("CreateChange", { title: "Native CAS", requirement_owner_actor_id: f.actor.id }));
    if (created.command_type !== "CreateChange") throw new Error("Expected change");
    const change = created.data.change, target = { object_type: "change", id: change.id };
    const unauthorized = await request("/api/commands", command("PauseChange", { reason: "Unauthorized" }, target, change.revision, "release_owner"));
    expect(unauthorized.status).toBe(403);
    const results = await Promise.all(["A", "B"].map(reason => request("/api/commands", command("PauseChange", { reason }, target, change.revision, "change_owner"))));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const conflict = results.find(result => result.status === 409)!;
    expect(conflict.body.code).toBe("REVISION_CONFLICT"); expect(conflict.body.details.diagnostic.current.revision).toBe(change.revision + 1);
  });
  it("creates a planning version only with the configured Flow Owner and native Project CAS", async () => {
    const project = f.store.getProject()!, target = { object_type: "project", id: project.id };
    const denied = await request("/api/commands", command("CreateTargetVersion", { name: "Workbench S1" }, target, project.revision));
    expect(denied.status).toBe(403); expect(denied.body.code).toBe("FLOW_OWNER_REQUIRED");
    const created = await post(command("CreateTargetVersion", { name: "Workbench S1" }, target, project.revision, "flow_owner"));
    expect(created.command_type).toBe("CreateTargetVersion");
    const refreshed = await request("/api/dashboard");
    expect(refreshed.body.flow.target_versions.some((version: { name: string }) => version.name === "Workbench S1")).toBe(true);
    expect(refreshed.body.project.revision).toBe(project.revision + 1);
  });
  it("records a real request and browser decision, then applies it through the CLI caller", async () => {
    const created = await post(command("CreateChange", { title: "Browser approval", requirement_owner_actor_id: f.actor.id }));
    if (created.command_type !== "CreateChange") throw new Error("Expected change");
    const id = created.data.change.id, target = { object_type: "change", id };
    const send = (type: string, payload: unknown, role: string) => post(command(type, payload, target, f.store.getChange(id)!.revision, role));
    const submitted = await send("SubmitContractProposal", { base_version_ref: null, body: contractBody() }, "change_owner");
    if (submitted.command_type !== "SubmitContractProposal") throw new Error("Expected proposal");
    const proposal_ref = { object_type: "contract_proposal", id: submitted.data.proposal.id, domain_version: submitted.data.proposal.proposal_revision };
    const assessed = await send("RecordRiskAssessment", { proposal_ref, level: "ordinary", rationale: "Actual native technical review" }, "technical_owner");
    if (assessed.command_type !== "RecordRiskAssessment") throw new Error("Expected risk");
    const requested = await send("RequestDecision", { action: "confirm_contract", proposal_ref, risk_ref: { object_type: "risk_assessment", id: assessed.data.risk_assessment.id } }, "change_owner");
    if (requested.command_type !== "RequestDecision") throw new Error("Expected request");
    const actual = await request(`/api/changes/${id}`); expect((actual.body.intent as IntentShowResult).decision_requests[0]!.status).toBe("pending");
    const inbox = await request("/api/decisions"); expect(inbox.body.items.some((item: { change: { id: string } }) => item.change.id === id)).toBe(true);
    const requestFact = requested.data.request;
    const decided = await send("RecordDecision", { request_id: requestFact.id, input_digest: requestFact.input_digest, choice: "approve", reason: "Reviewed the actual proposal", conditions: [] }, "requirement_owner");
    if (decided.command_type !== "RecordDecision") throw new Error("Expected decision");
    const cli = openLocalProject({ projectDir: directory });
    try {
      const confirmed = flowSuccess(cli.kernel.execute({ schema_version: "2.0.0", command_id: createInternalId(), correlation_id: createInternalId(), requested_at: new Date().toISOString(),
        source: { origin: "human_cli", producer: "workbench-continuation-test" }, project_id: f.project.id, actor_id: f.actor.id, acting_role: "requirement_owner", command_type: "ConfirmContract",
        target, expected_revision: f.store.getChange(id)!.revision, payload: { proposal_ref, decision_request_ref: { object_type: "decision_request", id: requestFact.id }, decision_ref: { object_type: "decision", id: decided.data.decision.id }, input_digest: requestFact.input_digest } }));
      expect(confirmed.command_type).toBe("ConfirmContract");
    } finally { cli.store.close(); }
    const refreshed = await request(`/api/changes/${id}`); expect(refreshed.body.intent.decision_requests[0].status).toBe("applied");
    expect(refreshed.body.intent.contract_versions).toHaveLength(1);
  });
  it("saves native workspace and usage in a handoff, visible to another CLI context", async () => {
    f.setTime(new Date().toISOString()); const item = f.authorize(), source = f.capture();
    const prepared = f.prepareContext(item, source), reserved = f.reserve(item, prepared);
    const result = await post(command("SaveHandoff", { source_snapshot_ref: { object_type: "source_snapshot", id: source.id }, run_ref: { object_type: "run", id: reserved.run.id },
      next_actor_ref: { object_type: "actor", id: f.actor.id }, completed: ["Recorded current implementation"], unresolved: ["Independent review remains"], next_action: "Review the fixed source", evidence_refs: [] },
    { object_type: "work_item", id: item.id }, f.store.getExecutionObject("work_item", item.id)!.revision, "executor"));
    expect(result.command_type).toBe("SaveHandoff");
    const refreshed = await request(`/api/changes/${f.change.id}`); expect(refreshed.body.runs.handoffs).toHaveLength(1);
    expect(refreshed.body.runs.handoffs[0].usage_snapshot.attempts_consumed).toBe(1);
    const cli = openLocalProject({ projectDir: directory });
    try { const read = cli.kernel.getRuns(f.change.id); if ("code" in read) throw new Error(read.code); expect(read.handoffs[0]).toEqual(refreshed.body.runs.handoffs[0]); }
    finally { cli.store.close(); }
  }, 60_000);
  it("rejects invalid JSON, content type, oversized bodies and query credentials", async () => {
    const before = f.store.listEvents().length;
    const bad = await fetch(`${workbench.origin}/api/commands`, { method: "POST", headers: { Cookie: cookie, Origin: workbench.origin, "X-CimiLoop-CSRF": csrf, "Content-Type": "application/json" }, body: "{" });
    expect(bad.status).toBe(400);
    expect((await request("/api/commands", command("CreateChange", {}), { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await request("/api/commands", command("CreateChange", { title: "x".repeat(140_000) }))).status).toBe(413);
    expect((await request("/api/dashboard?credential=unused")).status).toBe(400);
    expect(f.store.listEvents()).toHaveLength(before);
  });
  it("checks the instance Project and Human binding instead of accepting Agent identity", async () => {
    const path = join(dirname(f.path), "instance.json"), original = readFileSync(path);
    try {
      writeFileSync(path, JSON.stringify({ schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: createInternalId(), actor_id: f.actor.id, created_at: f.project.created_at }));
      expect(() => openLocalProject({ projectDir: directory })).toThrow("本地入口与项目或 Human 身份不匹配");
      const registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "agent", identity_source: "runtime_binding", display_name: "Metadata Agent", provider_identity_ref: { provider: "workbench-test", resource_type: "actor", locator: "non-executable-metadata" } })));
      if (registered.command_type !== "RegisterActor") throw new Error("Expected Agent");
      writeFileSync(path, JSON.stringify({ schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: registered.data.actor.id, created_at: f.project.created_at }));
      expect(() => openLocalProject({ projectDir: directory })).toThrow("本地入口与项目或 Human 身份不匹配");
    } finally { writeFileSync(path, original); }
  });
  it("invalidates the session on shutdown and preserves native receipts across restart", async () => {
    const input = command("CreateChange", { title: "Restart receipt" }), first = await post(input);
    const oldCookie = cookie, oldCsrf = csrf, port = Number(new URL(workbench.origin).port);
    await workbench.close(); await workbench.close();
    workbench = await startWorkbench({ projectDir: directory, port });
    expect((await request("/api/dashboard", undefined, { Cookie: oldCookie })).status).toBe(401);
    ({ cookie, csrf } = await login(workbench));
    expect((await request("/api/commands", input, { "X-CimiLoop-CSRF": oldCsrf })).status).toBe(403);
    const second = await post(input); expect(second).toEqual(first);
    expect(f.store.listChanges().filter(change => change.title === "Restart receipt")).toHaveLength(1);
  });
});
