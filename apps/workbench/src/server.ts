import {LocalHumanRuntimeContract,LocalHumanSkillMethodProbe,LocalHumanNamedSkillCapture,LocalHumanSkillInvocationControl,type HumanSkillRuntimeFactory,LocalHumanSkillInvocationReconciliation,type HumanSkillReconciliationFactory} from '@cimiloop/local-app';
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { executeLocalCommand, LocalPrePlanClarification, LocalHumanAgentRunFamilyControl, LocalAgentRuntimeControl, LocalAgentRuntimeObservation, LocalHumanAgentRunCostObservation, LocalHumanAgentRuntimeStart, LocalHumanAgentAccountBilling, type HumanAgentRuntimeFactory, type HumanAgentAccountFactory, LocalProjectError, openLocalProject, type LocalProject,type LocalPlanningClarificationOptions,type LocalAgentParentSkillResultPort } from "@cimiloop/local-app";
import type { DomainError } from "@cimiloop/protocol/v2";
import { productionAgentRuntime, productionAgentAccount, productionAgentCosts, hasReadableProductionAgentCosts, hasProductionAgentBillAccount, openInstalledCodexMatt, inspectCodexAgentRuntimeInstallation, LocalAgentRuntimeAdmission, type InstalledCodexMatt, type MattClarificationHost } from "@cimiloop/local-app";
import {hasInstalledDedicatedAgentRuntime,inspectDedicatedAgentRuntimeInstallation,inspectDedicatedRuntimeStorage} from '@cimiloop/local-app';
import { LocalLiteWorkbench, type LiteEvent } from '@cimiloop/local-app';

const MAX_BODY_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const SESSION_MS = 8 * 60 * 60 * 1000;
const token = () => randomBytes(32).toString("base64url");
const equal = (actual: string | undefined, expected: string | undefined) => Boolean(actual && expected &&
  Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected)));
class HttpFailure extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
// A delayed rejection still belongs to the current Human request. Check its
// session on both outcomes without swallowing the first active-session error.
const awaitCurrentSession = async<P extends Promise<unknown>>(operation:()=>P,guard:()=>void):Promise<Awaited<P>> => {
  let result:Awaited<P>;try{result=await operation();}catch(error){guard();throw error;}
  guard();return result;
};
const header = (request: IncomingMessage, name: string) => {
  const entries = request.rawHeaders.filter((_value, index) => index % 2 === 0 && request.rawHeaders[index]!.toLowerCase() === name);
  if (entries.length > 1) throw new HttpFailure(400, "AMBIGUOUS_HEADER");
  const value = request.headers[name]; return typeof value === "string" ? value : undefined;
};
const readBody = async (request: IncomingMessage): Promise<unknown> => {
  if (header(request, "content-type")?.toLowerCase() !== "application/json") throw new HttpFailure(415, "JSON_REQUIRED");
  const length = header(request, "content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new HttpFailure(413, "BODY_TOO_LARGE");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new HttpFailure(413, "BODY_TOO_LARGE");
    chunks.push(bytes);
  }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new HttpFailure(400, "INVALID_JSON"); }
};
const statusFor = (error: DomainError | LocalProjectError) => ({ validation: 400, forbidden: 403, not_found: 404,
  conflict: 409, storage: 503, internal: 500 }[error.category] ?? 422);
const checked = <T>(value: T | DomainError): T => {
  if (value && typeof value === "object" && "code" in value) throw value;
  return value as T;
};

export interface WorkbenchOptions { projectDir: string; port?: number; prePlanMatt?:MattClarificationHost; agentRuntimeForRun?: HumanAgentRuntimeFactory; agentAccountForRun?: HumanAgentAccountFactory;planningClarification?:LocalPlanningClarificationOptions;skillReconciliationForInvocation?:HumanSkillReconciliationFactory;skillRuntimeForInvocation?:HumanSkillRuntimeFactory;agentParentSkillResults?:LocalAgentParentSkillResultPort;runtimeAdmission?:(local:LocalProject)=>Promise<LocalAgentRuntimeAdmission>;skillProbeServices?:ConstructorParameters<typeof LocalHumanSkillMethodProbe>[1];runtimeContractServices?:ConstructorParameters<typeof LocalHumanRuntimeContract>[1] }
export interface WorkbenchServer { origin: string; bootstrapUrl: string; close(): Promise<void> }

export const startWorkbench = async (options: WorkbenchOptions): Promise<WorkbenchServer> => {
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535)) throw new Error("Invalid loopback port");
  const context = openLocalProject({ projectDir: options.projectDir,...(options.prePlanMatt?{prePlanMatt:options.prePlanMatt}:{}),...(options.planningClarification?{planningClarification:options.planningClarification}:{legacyManualPlanning:true}),...(options.agentParentSkillResults?{agentParentSkillResults:options.agentParentSkillResults}:{}) });
  let installedMatt: InstalledCodexMatt | undefined, matt = options.prePlanMatt;
  let admission:LocalAgentRuntimeAdmission|undefined;
  let cleaned=false;
  const cleanup=()=>{if(cleaned)return;cleaned=true;try{installedMatt?.release();}finally{try{admission?.release();}finally{context.store.close();}}};
  try {
  const lite = new LocalLiteWorkbench(context);
  try{if(options.runtimeAdmission){admission=await options.runtimeAdmission(context);if(!(admission instanceof LocalAgentRuntimeAdmission)||LocalAgentRuntimeAdmission.current(context)!==admission)throw new LocalProjectError('工作台未取得同一项目的完整准入租约','CAPABILITY_UNAVAILABLE','conflict');admission.guard();}}catch(error){cleanup();throw error;}
  let mattState: "installed" | "missing" | "unavailable" = matt ? "installed" : "missing";
  if (!matt && !lite.provider) {
    try { installedMatt = await openInstalledCodexMatt(context); matt = installedMatt?.host; if (matt) mattState = "installed"; }
    catch (error) { if (!(error instanceof LocalProjectError)) { cleanup(); throw error; } mattState = "unavailable"; }
  }
  const clarification = new LocalPrePlanClarification(context, matt);
  const skillReconciliation=new LocalHumanSkillInvocationReconciliation(context,options.skillReconciliationForInvocation);
  const skillRuntime=new LocalHumanSkillInvocationControl(context,options.skillRuntimeForInvocation);
  const skillCapture=new LocalHumanNamedSkillCapture(context,options.skillRuntimeForInvocation);
  const agentRuntime = new LocalHumanAgentRunFamilyControl(context,new LocalAgentRuntimeControl(context),skillRuntime);
  const agentObservation = new LocalAgentRuntimeObservation(context);
  const runtimeForRun=options.agentRuntimeForRun??productionAgentRuntime;
  const agentStart = new LocalHumanAgentRuntimeStart(context,runtimeForRun);
  const accountForRun = options.agentAccountForRun ?? productionAgentAccount;
  const agentBilling = new LocalHumanAgentAccountBilling(context,options.agentAccountForRun??productionAgentCosts);
  const agentCostObservation = new LocalHumanAgentRunCostObservation(context,accountForRun);
  let assets: Map<string, { type: string; body: Buffer }>;
  try { assets = loadWebAssets(); } catch (error) { cleanup(); throw error; }
  const shell = assets.get("/")!;
  let origin = "", bootstrap: string | undefined = token(), session: string | undefined, csrf: string | undefined, expires = 0;
  let closing = false, failedLogins = 0, cookieName = "";
  const pending = new Set<Promise<void>>();
  const send = (response: ServerResponse, status: number, value: unknown) => {
    if (response.destroyed || response.writableEnded) return;
    let body = Buffer.from(JSON.stringify(value));
    if (body.length > MAX_RESPONSE_BYTES) { status = 413; body = Buffer.from('{"ok":false,"code":"RESPONSE_TOO_LARGE"}'); }
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length }); response.end(body);
  };
  const requireSource = (request: IncomingMessage, write: boolean) => {
    if (header(request, "host") !== origin.slice(7)) throw new HttpFailure(403, "HOST_REJECTED");
    const source = header(request, "origin"), site = header(request, "sec-fetch-site");
    if ((source !== undefined && source !== origin) || (write && source !== origin) ||
      (site !== undefined && !["same-origin", "none"].includes(site))) throw new HttpFailure(403, "ORIGIN_REJECTED");
    if (request.socket.remoteAddress !== "127.0.0.1" && request.socket.remoteAddress !== "::ffff:127.0.0.1") throw new HttpFailure(403, "LOOPBACK_REQUIRED");
  };
  const requireSession = (request: IncomingMessage, write: boolean) => {
    const cookies = (header(request, "cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
    if (cookies.length !== 1 || Date.now() >= expires || !equal(cookies[0]!.slice(cookieName.length + 1), session)) throw new HttpFailure(401, "SESSION_REQUIRED");
    if (write && !equal(header(request, "x-cimiloop-csrf"), csrf)) throw new HttpFailure(403, "CSRF_REJECTED");
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    // The React shell's component library injects runtime styles, so styles may be inline; scripts stay same-origin only.
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      if (closing) throw new HttpFailure(503, "WORKBENCH_CLOSING");
      requireSource(request, request.method !== "GET");
      if (!request.url?.startsWith("/") || request.url.startsWith("//")) throw new HttpFailure(400, "INVALID_ROUTE");
      const url = new URL(request.url, origin);
      if (url.search || url.hash) throw new HttpFailure(400, "INVALID_ROUTE");
      // Client-side routes resolve to the SPA shell; unknown /api paths still fall through to ROUTE_NOT_FOUND.
      const asset = assets.get(url.pathname) ?? (url.pathname.startsWith("/api/") || /\.[a-z0-9]+$/i.test(url.pathname) ? undefined : shell);
      if (asset && request.method === "GET") {
        response.writeHead(200, { "Content-Type": asset.type, "Content-Length": asset.body.length }); response.end(asset.body); return;
      }
      if (url.pathname === "/api/session" && request.method === "POST") {
        const body = await readBody(request);
        if (closing) throw new HttpFailure(503, "WORKBENCH_CLOSING");
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join() !== "bootstrap" ||
          !equal(typeof (body as { bootstrap: unknown }).bootstrap === "string" ? (body as { bootstrap: string }).bootstrap : undefined, bootstrap)) {
          if (++failedLogins >= 6) bootstrap = undefined;
          throw new HttpFailure(401, "BOOTSTRAP_REJECTED");
        }
        bootstrap = undefined; session = token(); csrf = token(); expires = Date.now() + SESSION_MS;
        response.setHeader("Set-Cookie", `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`);
        send(response, 200, { ok: true, csrf }); return;
      }
      requireSession(request, request.method !== "GET");
      if (url.pathname === "/api/context" && request.method === "GET") {
        if (lite.provider) {
          send(response, 200, { ok: true, project_id: context.instance.project_id, actor_id: context.instance.actor_id,
            matt_host_available: !!options.prePlanMatt, matt_installation_state: mattState, selected_runtime: 'lite',
            agent_start_available: true, agent_costs_available: false, agent_cost_settlement_available: false,
            runtime: lite.runtime(), csrf, expires_at: new Date(expires).toISOString() }); return;
        }
        const dedicatedInstallation=await inspectDedicatedAgentRuntimeInstallation(context);
        const dedicatedStorage=dedicatedInstallation.state==='installed'?await inspectDedicatedRuntimeStorage(context):undefined;
        const codexInstallation=await inspectCodexAgentRuntimeInstallation(context);
        if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,false);
        send(response, 200, { ok: true, project_id: context.instance.project_id, actor_id: context.instance.actor_id, matt_host_available: !!matt&&(!!options.prePlanMatt||!hasInstalledDedicatedAgentRuntime(context)), matt_installation_state: mattState, codex_runtime_installation:codexInstallation,local_provider_runtime_installation:dedicatedInstallation,local_provider_runtime_storage:dedicatedStorage,selected_runtime:hasInstalledDedicatedAgentRuntime(context)?'local OpenAI-compatible':'Codex login', agent_start_available: typeof runtimeForRun === "function", agent_costs_available: typeof options.agentAccountForRun === "function" || hasReadableProductionAgentCosts(context), agent_cost_settlement_available:typeof options.agentAccountForRun==='function'||hasProductionAgentBillAccount(context), runtime: lite.runtime(), csrf, expires_at: new Date(expires).toISOString() }); return;
      }
      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        send(response, 200, dashboard(context)); return;
      }
      if (url.pathname === "/api/decisions" && request.method === "GET") {
        const changes = checked(context.kernel.getChangeList());
        send(response, 200, { ok: true, changes_as_of_event_sequence: changes.as_of_event_sequence,
          items: changes.changes.map(change => ({ change, intent: checked(context.kernel.getIntent(change.id)) })) }); return;
      }
      const changeMatch = /^\/api\/changes\/([^/]{1,200})$/.exec(url.pathname);
      if (changeMatch && request.method === "GET") {
        const id = decodeURIComponent(changeMatch[1]!);
        const intent = checked(context.kernel.getIntent(id));
        const own = [intent.change.owner_actor_id, intent.change.requirement_owner_actor_id].includes(context.instance.actor_id);
        let conversations: ReturnType<LocalPrePlanClarification["list"]> = { ok: true, sessions: [] };
        let clarification_error: { code: string; message: string } | undefined;
        try { if (own) conversations = clarification.list(id); }
        catch (error) {
          if (!(error instanceof LocalProjectError)) throw error;
          clarification_error = { code: error.code, message: error.message };
        }
        const runs=checked(context.kernel.getRuns(id));
        const agent_cost_bill_runs=runs.runs.filter(run=>typeof options.agentAccountForRun==='function'||hasProductionAgentBillAccount(context,run.id)).map(run=>run.id);
        send(response, 200, { ok: true, intent, ...(clarification_error ? { clarification_error } : {}), clarification_history: conversations.sessions, agent_cost_bill_runs,
          clarifications: "latest_session" in conversations && conversations.latest_session ? [conversations.latest_session] : [], execution: checked(context.kernel.getExecution(id)),
          runs, verification: checked(context.kernel.getVerification(id)) }); return;
      }
      const objectMatch = /^\/api\/objects\/([^/]{1,80})\/([^/]{1,200})$/.exec(url.pathname);
      if (objectMatch && request.method === "GET") {
        const result = context.kernel.getObject(decodeURIComponent(objectMatch[1]!), decodeURIComponent(objectMatch[2]!));
        send(response, "code" in result ? statusFor(result) : 200, result); return;
      }
      const clarificationMatch = /^\/api\/changes\/([^/]{1,200})\/clarifications(?:\/([^/]{1,200}))?$/.exec(url.pathname);
      if (clarificationMatch && request.method === "GET") {
        const changeId = decodeURIComponent(clarificationMatch[1]!);
        send(response, 200, clarificationMatch[2] ? clarification.show(changeId, decodeURIComponent(clarificationMatch[2])) : clarification.list(changeId)); return;
      }
      if (clarificationMatch && request.method === "POST") {
        const body = await readBody(request);
        if (closing) throw new HttpFailure(503, "WORKBENCH_CLOSING");
        requireSession(request, true);
        const changeId = decodeURIComponent(clarificationMatch[1]!);
        const guard = () => { if (closing) throw new HttpFailure(503, "WORKBENCH_CLOSING"); requireSession(request, true); };
        const result = await awaitCurrentSession(async () => clarificationMatch[2] ? clarification.advanceAsync(changeId, decodeURIComponent(clarificationMatch[2]), body, guard) : clarification.begin(changeId, body), guard);
        const commandResult = "command_result" in result ? result.command_result as ReturnType<typeof executeLocalCommand> | undefined : undefined;
        send(response, commandResult && "code" in commandResult ? statusFor(commandResult) : 200, result); return;
      }
      const liteTaskMatch = /^\/api\/tasks\/([^/]{1,200})\/(agent-runs|evaluations|satisfy)$/.exec(url.pathname);
      const liteReadyMatch = /^\/api\/changes\/([^/]{1,200})\/ready-for-delivery$/.exec(url.pathname);
      const liteAdviceMatch = /^\/api\/(changes|agent-runs)\/([^/]{1,200})\/ai\/(clarify|review)$/.exec(url.pathname);
      if ((liteTaskMatch || liteReadyMatch || liteAdviceMatch) && request.method === 'POST') {
        const body = await readBody(request);
        const guard = () => { if (closing) throw new HttpFailure(503, 'WORKBENCH_CLOSING'); requireSession(request, true); };
        guard();
        let result: unknown;
        if (liteTaskMatch) {
          const taskId = decodeURIComponent(liteTaskMatch[1]!);
          result = liteTaskMatch[2] === 'agent-runs' ? lite.start(taskId, body) : liteTaskMatch[2] === 'evaluations' ? lite.evaluate(taskId, body) : lite.satisfy(taskId, body);
        } else if (liteReadyMatch) result = lite.ready(decodeURIComponent(liteReadyMatch[1]!), body);
        else {
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length ||
            (liteAdviceMatch![1] === 'changes') !== (liteAdviceMatch![3] === 'clarify')) throw new HttpFailure(400, 'INVALID_COMMAND');
          result = await awaitCurrentSession(() => lite.advice(liteAdviceMatch![3] as 'clarify' | 'review', decodeURIComponent(liteAdviceMatch![2]!)), guard);
        }
        guard(); send(response, 200, result); return;
      }
      const liteReadMatch = /^\/api\/agent-runs\/([^/]{1,200})\/(events|result)$/.exec(url.pathname);
      if (liteReadMatch && request.method === 'GET') {
        if (header(request, 'transfer-encoding') || header(request, 'content-length') && header(request, 'content-length') !== '0') throw new HttpFailure(400, 'BODY_NOT_ALLOWED');
        const runId = decodeURIComponent(liteReadMatch[1]!);
        if (liteReadMatch[2] === 'result') { send(response, 200, lite.result(runId)); return; }
        const last = header(request, 'last-event-id');
        if (last !== undefined && !/^\d+$/.test(last)) throw new HttpFailure(400, 'INVALID_EVENT_ID');
        const events = lite.events(runId, Number(last ?? 0));
        // requestTimeout limits receipt of the request body, not response time.
        // GET is fully received here; also disable the socket response timeout.
        request.setTimeout(0); response.setTimeout(0);
        response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' }); response.flushHeaders();
        const write = (event: LiteEvent) => {
          if (response.destroyed || response.writableEnded) return;
          response.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
          if (event.type === 'done') response.end();
        };
        for (const event of events) write(event);
        if (response.writableEnded) return;
        if (lite.result(runId).status !== 'Running') { response.end(); return; }
        const unsubscribe = lite.subscribe(runId, write);
        response.once('close', unsubscribe); return;
      }
      const runtimeContractMatch=/^\/api\/runtime-contracts(?:\/([^/]{1,200})(?:\/(start|continue|cancel|recover|capture|usage))?)?$/.exec(url.pathname);
      if(runtimeContractMatch){
        const write=request.method!=='GET',guard=()=>{if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,write);},service=new LocalHumanRuntimeContract(context,{...options.runtimeContractServices,beforeEffect:guard}),id=runtimeContractMatch[1]&&decodeURIComponent(runtimeContractMatch[1]),action=runtimeContractMatch[2];guard();
        if(request.method==='GET'&&(!action||action==='usage')){if(header(request,'transfer-encoding')||header(request,'content-length')&&header(request,'content-length')!=='0')throw new HttpFailure(400,'BODY_NOT_ALLOWED');send(response,200,await awaitCurrentSession(()=>id?action==='usage'?service.usage(id):service.query(id):service.list(),guard));return;}
        if(request.method==='POST'){
          const body=await readBody(request);guard();if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpFailure(400,'INVALID_COMMAND');let result:unknown;
          if(id&&action==='start'){if(!('request_id'in body)||body.request_id!==id)throw new HttpFailure(400,'INVALID_COMMAND');result=await awaitCurrentSession(()=>service.start(body),guard);}
          else if(id&&action&&['continue','cancel','recover','capture'].includes(action)){if(Object.keys(body).length)throw new HttpFailure(400,'INVALID_COMMAND');const selected=action as 'continue'|'cancel'|'recover'|'capture';result=await awaitCurrentSession(()=>service[selected](id),guard);}
          else throw new HttpFailure(400,'INVALID_COMMAND');guard();send(response,200,result);return;
        }
      }
      const skillProbeMatch=/^\/api\/skill-probes(?:\/([^/]{1,200})(?:\/(start|collect|cancel|recover))?)?$/.exec(url.pathname);
      if(skillProbeMatch){
        const write=request.method!=='GET',guard=()=>{if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,write);},service=new LocalHumanSkillMethodProbe(context,{...options.skillProbeServices,beforeEffect:guard}),id=skillProbeMatch[1]&&decodeURIComponent(skillProbeMatch[1]),action=skillProbeMatch[2];guard();
        if(request.method==='GET'&&!action){
          if(header(request,'transfer-encoding')||header(request,'content-length')&&header(request,'content-length')!=='0')throw new HttpFailure(400,'BODY_NOT_ALLOWED');
          send(response,200,await awaitCurrentSession(()=>id?service.query(id):service.list(),guard));return;
        }
        if(request.method==='POST'){
          const body=await readBody(request);guard();if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpFailure(400,'INVALID_COMMAND');
          let result:unknown;
          if(id==='capture'&&!action){if(Object.keys(body).join(',')!=='request_ids'||!('request_ids'in body)||!Array.isArray(body.request_ids)||body.request_ids.some(value=>typeof value!=='string'))throw new HttpFailure(400,'INVALID_COMMAND');result=await awaitCurrentSession(()=>service.capture(body.request_ids as string[]),guard);}
          else if(id&&action==='start'){if(!('request_id'in body)||body.request_id!==id)throw new HttpFailure(400,'INVALID_COMMAND');result=await awaitCurrentSession(()=>service.startFromInput(body as Parameters<typeof service.startFromInput>[0]),guard);}
          else if(id&&action&&['collect','cancel','recover'].includes(action)){if(Object.keys(body).length)throw new HttpFailure(400,'INVALID_COMMAND');const selected=action as 'collect'|'cancel'|'recover';result=await awaitCurrentSession(()=>service[selected](id),guard);}
          else throw new HttpFailure(400,'INVALID_COMMAND');guard();send(response,200,result);return;
        }
      }
      const skillCaptureMatch=/^\/api\/skill-invocations\/([^/]{1,200})\/capture-original$/.exec(url.pathname);
      if(skillCaptureMatch&&request.method==='POST'){
        const guard=()=>{if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,true);};
        guard();const body=await readBody(request);guard();
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)throw new HttpFailure(400,'INVALID_COMMAND');
        const result=await awaitCurrentSession(()=>skillCapture.capture([decodeURIComponent(skillCaptureMatch[1]!)],guard),guard);send(response,200,result);return;
      }
      const skillControlMatch=/^\/api\/skill-invocations\/([^/]{1,200})(?:\/(stop|cancel|recover|collect))?$/.exec(url.pathname);
      if(skillControlMatch){
        const id=decodeURIComponent(skillControlMatch[1]!),action=skillControlMatch[2];
        const guard=()=>{if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,true);};
        if(!action&&request.method==='GET'){
          requireSession(request,false);if(header(request,'transfer-encoding')||header(request,'content-length')&&header(request,'content-length')!=='0')throw new HttpFailure(400,'BODY_NOT_ALLOWED');
          const result=await skillRuntime.query(id,()=>{if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,false);});if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,false);send(response,200,result);return;
        }
        if(action&&request.method==='POST'){
          guard();const body=await readBody(request);guard();
          if(action!=='stop'&&(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length))throw new HttpFailure(400,'INVALID_COMMAND');
          const result=action==='stop'?await skillRuntime.stop(id,body,guard):action==='cancel'?await skillRuntime.retryCancellation(id,guard):action==='collect'?await skillRuntime.collect(id,guard):await skillRuntime.recover(id,guard);
          guard();send(response,'code'in result?statusFor(result):200,result);return;
        }
      }
      const skillReconciliationMatch=/^\/api\/skill-invocations\/([^/]{1,200})\/reconcile-original$/.exec(url.pathname);
      if(skillReconciliationMatch&&request.method==='POST'){
        const body=await readBody(request);if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,true);
        if(!body||typeof body!=='object'||!('payload'in body)||!body.payload||typeof body.payload!=='object'||!('invocation_ref'in body.payload)||!body.payload.invocation_ref||typeof body.payload.invocation_ref!=='object'||!('id'in body.payload.invocation_ref)||body.payload.invocation_ref.id!==decodeURIComponent(skillReconciliationMatch[1]!))throw new HttpFailure(400,'INVALID_COMMAND');
        const result=await skillReconciliation.reconcile(body,()=>{if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,true);});if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,true);send(response,'code'in result?statusFor(result):200,result);return;
      }
      const costsMatch = /^\/api\/agent-runs\/([^/]{1,200})\/costs$/.exec(url.pathname);
      if(costsMatch && request.method==='GET'){
        if(header(request,'transfer-encoding')!==undefined || (header(request,'content-length')!==undefined && header(request,'content-length')!=='0'))throw new HttpFailure(400,'INVALID_COMMAND');
        const guard=()=>{if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,false);};
        const result=await awaitCurrentSession(()=>agentBilling.query(decodeURIComponent(costsMatch[1]!)),guard);
        send(response,200,result);return;
      }
      const costObservationMatch = /^\/api\/agent-runs\/([^/]{1,200})\/(cost-observation|reconcile-original)$/.exec(url.pathname);
      if(costObservationMatch && request.method==='POST'){
        const body=await readBody(request);
        if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');
        requireSession(request,true);
        if(!body||typeof body!=='object'||Array.isArray(body)||!('target' in body)||!body.target||typeof body.target!=='object'||!('id' in body.target)||body.target.id!==decodeURIComponent(costObservationMatch[1]!))throw new HttpFailure(400,'INVALID_COMMAND');
        const guard=()=>{if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,true);};
        const result=await awaitCurrentSession(()=>costObservationMatch[2]==='reconcile-original'?agentCostObservation.reconcile(body,guard):agentCostObservation.record(body,guard),guard);
        send(response,'code' in result?statusFor(result):200,result);return;
      }
      const agentMatch = /^\/api\/agent-runs\/([^/]{1,200})(?:\/(collect|stop|cancel|recover|observe|start))?$/.exec(url.pathname);
      if (agentMatch && request.method === "GET" && !agentMatch[2]) {
        const runId = decodeURIComponent(agentMatch[1]!);
        if (lite.has(runId)) { send(response, 200, lite.query(runId)); return; }
        const guard=()=>{if(closing)throw new HttpFailure(503,"WORKBENCH_CLOSING");requireSession(request,false);};
        const result=await awaitCurrentSession(()=>agentRuntime.query(decodeURIComponent(agentMatch[1]!),guard),guard);
        send(response,200,result);return;
      }
      if (agentMatch && request.method === "POST" && agentMatch[2]) {
        const body = await readBody(request);
        if (closing) throw new HttpFailure(503, "WORKBENCH_CLOSING");
        requireSession(request, true);
        const runId = decodeURIComponent(agentMatch[1]!), action = agentMatch[2];
        if (action === "stop" || action === "observe") {
          if (!body || typeof body !== "object" || Array.isArray(body) || !("target" in body) || !body.target || typeof body.target !== "object" ||
            !("id" in body.target) || body.target.id !== runId) throw new HttpFailure(400, "INVALID_COMMAND");
          if (action === 'stop' && lite.has(runId)) { send(response, 200, lite.stop(runId, body)); return; }
          const guard=()=>{if(closing)throw new HttpFailure(503,"WORKBENCH_CLOSING");requireSession(request,true);};
          const result=await awaitCurrentSession(()=>action === "observe" ? agentObservation.record(body,guard) : agentRuntime.stop(body,guard),guard);
          send(response, "code" in result ? statusFor(result) : 200, result); return;
        }
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw new HttpFailure(400, "INVALID_COMMAND");
        const guard=()=>{if(closing)throw new HttpFailure(503,"WORKBENCH_CLOSING");requireSession(request,true);};
        const result=await awaitCurrentSession(()=>action === "start" ? agentStart.start(runId,guard) : action === "collect" ? agentRuntime.collect(runId,guard) : action === "cancel" ? agentRuntime.retryCancellation(runId,guard) : agentRuntime.recover(runId,guard),guard);
        send(response, 200, result); return;
      }
      if (url.pathname === "/api/commands" && request.method === "POST") {
        const body = await readBody(request);
        if (closing) throw new HttpFailure(503, "WORKBENCH_CLOSING");
        // A slow upload cannot carry an expired session into a later write.
        requireSession(request, true);
        const result = await executeLocalCommandAsync(context,body,()=>{if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,true);});
        if(closing)throw new HttpFailure(503,'WORKBENCH_CLOSING');requireSession(request,true);
        send(response, "code" in result ? statusFor(result) : 200, result); return;
      }
      throw new HttpFailure(404, "ROUTE_NOT_FOUND");
    } catch (error) {
      if (error instanceof HttpFailure) send(response, error.status, { ok: false, code: error.code });
      else if (error instanceof LocalProjectError) send(response, statusFor(error), { ok: false, code: error.code, message: error.message });
      else if (error && typeof error === "object" && "category" in error && "code" in error) send(response, statusFor(error as DomainError), error);
      else send(response, 500, { ok: false, code: "WORKBENCH_FAILURE" });
    }
  };
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000, maxHeaderSize: 16 * 1024 }, (request, response) => {
    const work = handle(request, response); pending.add(work); void work.finally(() => pending.delete(work));
  });
  server.maxConnections = 64; server.maxHeadersCount = 50; server.on("clientError", (_error, socket) => socket.destroy());
  try {
    await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(options.port ?? 0, "127.0.0.1", () => { server.off("error", reject); done(); }); });
  } catch (error) { cleanup(); throw error; }
  const address = server.address(); if (!address || typeof address === "string") { server.close(); cleanup(); throw new Error("Loopback address unavailable"); }
  origin = `http://127.0.0.1:${address.port}`; cookieName = `cimiloop_workbench_${address.port}`;
  let closePromise: Promise<void> | undefined;
  return { origin, bootstrapUrl: `${origin}/#${bootstrap}`, close() {
    return closePromise ??= (async () => {
      closing = true; bootstrap = session = csrf = undefined;
      const closed = new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      server.closeAllConnections(); await closed; await Promise.allSettled([...pending]); await lite.close(); cleanup();
    })();
  } };
  }catch(error){cleanup();throw error;}
};

const WEB_TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json; charset=utf-8" };
// The workbench-web build (apps/workbench-web) is emitted into dist/web and preloaded once at startup.
// Resolved from both src (tests) and dist (runtime). Without a build the API still serves behind a placeholder page.
const loadWebAssets = () => {
  const root = fileURLToPath(new URL("../dist/web/", import.meta.url));
  const assets = new Map<string, { type: string; body: Buffer }>();
  if (!existsSync(join(root, "index.html"))) {
    assets.set("/", { type: WEB_TYPES[".html"]!, body: Buffer.from('<!doctype html><meta charset="utf-8"><title>CimiLoop</title><p>工作台前端尚未构建：pnpm --filter @cimiloop/workbench-web build</p>') });
    return assets;
  }
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      const type = WEB_TYPES[extname(entry.name).toLowerCase()];
      if (type) assets.set(`/${relative(root, path).split(sep).join("/")}`, { type, body: readFileSync(path) });
    }
  };
  walk(root);
  assets.set("/", assets.get("/index.html")!);
  return assets;
};

const dashboard = (context: LocalProject) => ({ ok: true, project: checked(context.kernel.getProject()),
  flow: checked(context.kernel.getFlowStatus()), governance: checked(context.kernel.getGovernance()),
  execution: checked(context.kernel.getExecution()), providers: checked(context.kernel.getProviderCatalog()) });
import{executeLocalCommandAsync}from'@cimiloop/local-app';
