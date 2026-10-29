import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CimiLoopKernel, type RunVerifierPort } from '@cimiloop/kernel';
import { SCHEMA_VERSION, type CommandSuccess, type Task, type SourceSnapshot, type WorkItem, type ContextManifest,
  type Run, type RequirementSetRecord, type EvaluationContext, type TaskEvaluation, type GateEvaluation } from '@cimiloop/protocol/v2';
import { LocalEvidenceVerifier } from './evidence-local.js';
import { LocalRunVerifier } from './runs-local.js';
import { liteChecks, liteCompletion, liteCredential, liteProvider, type LiteProvider } from './lite-provider.js';
import { LiteRunner, liteGit, type LiteEvent, type LiteResult } from './lite-runner.js';
import { executeLocalCommand, type LocalCommandInput, type LocalProject } from './project.js';

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const derivedId = (seed: string) => {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export class LiteWorkbenchError extends Error {
  constructor(message: string, readonly code: string, readonly category: 'validation' | 'conflict' | 'not_found') { super(message); }
  toJSON() { return { ok: false, code: this.code, message: this.message }; }
}
const fail = (message: string, code = 'INVALID_COMMAND', category: 'validation' | 'conflict' | 'not_found' = 'validation'): never => { throw new LiteWorkbenchError(message, code, category); };
const object = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('需要 JSON 对象');
  return input as Record<string, unknown>;
};
const text = (input: unknown): string => typeof input === 'string' && input.trim() ? input : fail('需要非空字符串');
const exactKeys = (input: Record<string, unknown>, allowed: string[]) => { if (Object.keys(input).some(key => !allowed.includes(key))) fail('包含不支持的字段'); };
const ref = <T extends string>(object_type: T, id: string) => ({ object_type, id });
interface Journal { actor_id: string; action: string; input: Record<string, unknown>; commands: Record<string, { input: LocalCommandInput; data?: unknown }>; response?: unknown }
interface ClaimInput { result: 'supports' | 'refutes' | 'inconclusive'; observation: string }
const claim = (input: unknown): ClaimInput => {
  const value = object(input);
  if (!['supports', 'refutes', 'inconclusive'].includes(String(value.result))) fail('评价结果无效');
  return { result: value.result as ClaimInput['result'], observation: text(value.observation) };
};

// Lite keeps the established Human command semantics. It installs no Agent
// admission and cannot create a formal Agent binding or bypass its gates.
export class LocalLiteWorkbench {
  readonly provider: LiteProvider | null;
  readonly checks;
  private readonly kernel: CimiLoopKernel;
  private readonly evidence: LocalEvidenceVerifier;
  private activeTask = '';
  private readonly live = new Map<string, { runner: LiteRunner; job: Promise<void> }>();
  private readonly runsDir: string;
  private readonly actionsDir: string;
  constructor(private readonly local: LocalProject) {
    this.provider = liteProvider(); this.checks = liteChecks(local.location.dataDirectory);
    this.runsDir = join(local.location.dataDirectory, 'runs'); this.actionsDir = join(local.location.dataDirectory, 'lite-actions');
    this.evidence = new LocalEvidenceVerifier(local.location.repositoryPath, local.location.dataDirectory);
    const workspace = (taskId: string) => new LocalRunVerifier(this.worktree(taskId), local.location.dataDirectory);
    const mapped = (project: Parameters<RunVerifierPort['sourceDigest']>[0], taskId: string) => ({ ...project, repository_path: this.worktree(taskId) });
    const sourceCurrent: RunVerifierPort['sourceIsCurrent'] = (project, source) => {
      const result = this.results().find(run => run.status === 'Succeeded' && run.head_commit === source.commit_id);
      return !!result && new LocalEvidenceVerifier(this.worktree(result.task_id), local.location.dataDirectory).sourceIsCurrent(mapped(project, result.task_id), source);
    };
    const verifier: RunVerifierPort = {
      sourceDigest: this.evidence.sourceDigest.bind(this.evidence), sourceIsCurrent: sourceCurrent,
      captureWorkspace: (project, resources) => workspace(this.activeTask).captureWorkspace(mapped(project, this.activeTask), resources),
      readWorkspace: (project, snapshot) => workspace(snapshot.task_id).readWorkspace(mapped(project, snapshot.task_id), snapshot),
      workspaceIsCurrent: (project, snapshot) => workspace(snapshot.task_id).workspaceIsCurrent(mapped(project, snapshot.task_id), snapshot),
      readRunResult: (_project, reference) => JSON.parse(this.evidence.readContent(reference).toString('utf8')) as unknown
    };
    this.kernel = new CimiLoopKernel({ store: local.store, caller: { kind: 'local_operator', project_id: local.instance.project_id, actor_id: local.instance.actor_id },
      legacyManualPlanning: true, runVerifier: verifier, evidenceVerifier: { sourceDigest: verifier.sourceDigest, sourceIsCurrent: sourceCurrent, readRawResult: this.evidence.readRawResult.bind(this.evidence) } });
    for (const result of this.results()) if (result.status === 'Running') {
      result.status = 'Unknown'; result.ended_at = new Date().toISOString();
      this.saveResult(result); this.append(result.run_id, { type: 'status', status: 'Unknown', reason: 'Workbench restarted without a live process' });
      this.append(result.run_id, { type: 'done' });
      try { this.observe(result, 'unknown'); }
      catch { /* The persisted Unknown still requires Human reconciliation. */ }
    }
  }
  runtime() {
    const provider = this.provider;
    return { kind: 'lite', provider: provider ? { base_url: provider.base_url, model: provider.model, credential_configured: !!liteCredential() } : null,
      limits: { max_turns: provider?.max_turns ?? 30, max_tokens: provider?.max_tokens ?? 200000 }, checks: this.checks };
  }
  private worktree(taskId: string) { if (!idPattern.test(taskId)) return fail('Task ID 无效'); return join(this.local.location.dataDirectory, 'worktrees', taskId); }
  private directory(runId: string) { if (!idPattern.test(runId)) return fail('Run ID 无效'); return join(this.runsDir, runId); }
  has(runId: string) { return idPattern.test(runId) && existsSync(join(this.directory(runId), 'result.json')); }
  result(runId: string): LiteResult {
    if (!this.has(runId)) return fail('未找到 lite Run', 'RUN_NOT_FOUND', 'not_found');
    return JSON.parse(readFileSync(join(this.directory(runId), 'result.json'), 'utf8')) as LiteResult;
  }
  private saveResult(result: LiteResult) { writeFileSync(join(this.directory(result.run_id), 'result.json'), JSON.stringify(result, null, 2)); }
  private results() { return existsSync(this.runsDir) ? readdirSync(this.runsDir).filter(id => this.has(id)).map(id => this.result(id)) : []; }
  events(runId: string, after = 0): LiteEvent[] {
    this.result(runId);
    const path = join(this.directory(runId), 'events.jsonl');
    return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as LiteEvent).filter(event => event.seq > after) : [];
  }
  subscribe(runId: string, listener: (event: LiteEvent) => void) {
    const entry = this.live.get(runId); entry?.runner.listeners.add(listener);
    return () => entry?.runner.listeners.delete(listener);
  }
  private append(runId: string, event: { type: 'status'; status: 'Unknown'; reason: string } | { type: 'done' }) {
    const seq = (this.events(runId).at(-1)?.seq ?? 0) + 1;
    appendFileSync(join(this.directory(runId), 'events.jsonl'), JSON.stringify({ ...event, seq, at: new Date().toISOString() }) + '\n');
  }
  private task(id: string): Task { return this.local.store.getExecutionObject('task', id) ?? fail('任务不存在', 'TASK_NOT_FOUND', 'not_found'); }
  private change(id: string) { return this.local.store.getChange(id) ?? fail('需求不存在', 'CHANGE_NOT_FOUND', 'not_found'); }
  private journal(action: string, raw: unknown) {
    const input = object(raw), commandId = text(input.command_id);
    if (!idPattern.test(commandId)) return fail('command_id 必须为 UUID v7');
    mkdirSync(this.actionsDir, { recursive: true });
    const path = join(this.actionsDir, `${commandId}.json`);
    const value: Journal = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as Journal : { actor_id: this.local.instance.actor_id, action, input, commands: {} };
    if (value.action !== action || value.actor_id !== this.local.instance.actor_id || !isDeepStrictEqual(value.input, input)) fail('command_id 已用于其他输入', 'IDEMPOTENCY_CONFLICT', 'conflict');
    const save = () => writeFileSync(path, JSON.stringify(value, null, 2)); save();
    return { value, save, finish: (response: unknown) => { value.response = response; save(); return response; } };
  }
  private command<T>(journal: ReturnType<LocalLiteWorkbench['journal']>, step: string, type: LocalCommandInput['command_type'], objectType: 'task' | 'change' | 'work_item' | 'run', id: string,
    role: 'technical_owner' | 'executor', payload: unknown): T {
    const entry = journal.value.commands[step] ??= { input: { command_id: derivedId(`${journal.value.input.command_id}:${step}`), requested_at: new Date().toISOString(),
      command_type: type, acting_role: role, target: ref(objectType, id), expected_revision: objectType === 'task' ? this.task(id).revision : objectType === 'change' ? this.change(id).revision : objectType === 'run' ? this.local.store.getRun(id)!.revision : this.local.store.getExecutionObject('work_item', id)!.revision, payload } };
    journal.save();
    if (entry.data !== undefined) return entry.data as T;
    const result = this.kernel.execute({ ...entry.input, schema_version: SCHEMA_VERSION, correlation_id: entry.input.command_id,
      project_id: this.local.instance.project_id, actor_id: this.local.instance.actor_id,
      source: { origin: 'human_ui', producer: 'cimiloop-workbench-lite', repository_path: this.local.location.repositoryPath } });
    if ('code' in result) throw result;
    entry.data = (result as CommandSuccess).data; journal.save(); return entry.data as T;
  }
  private source(journal: ReturnType<LocalLiteWorkbench['journal']>, changeId: string, commit: string): SourceSnapshot {
    const existing = this.local.store.listVerificationRecords('source_snapshot', changeId).find(source => source.commit_id === commit);
    return existing ?? this.command<{ source_snapshot: SourceSnapshot }>(journal, 'source', 'CaptureSourceSnapshot', 'change', changeId, 'technical_owner', { commit_id: commit }).source_snapshot;
  }
  private workItem(journal: ReturnType<LocalLiteWorkbench['journal']>, taskId: string): WorkItem {
    const task = this.task(taskId);
    if (task.active_work_item_ref) return this.local.store.getExecutionObject('work_item', task.active_work_item_ref.id)!;
    const definition = this.local.store.getExecutionRecord('task_definition', task.definition_ref.id)!;
    const plan = this.local.store.getIntentRecord('plan_version', task.plan_ref.id)!;
    const resources = definition.body.allowed_changes.length ? definition.body.allowed_changes : [...new Set(plan.body.task_definitions.flatMap(value => value.allowed_changes))];
    return this.command<{ work_item: WorkItem }>(journal, 'work_item', 'CreateWorkItem', 'task', task.id, 'technical_owner', {
      definition_ref: task.definition_ref, executor_ref: ref('actor', this.local.instance.actor_id), allowed_actions: definition.body.purpose === 'verification' ? ['read_files', 'run_checks'] : ['read_files', 'edit_files', 'run_checks'],
      allowed_resources: resources, budget: { max_attempts: 30, max_elapsed_ms: 86400000 }, stop_conditions: ['Human cancellation', 'Configured turn or token cap'], reason: 'Human 授权 lite 工具辅助任务运行'
    }).work_item;
  }
  start(taskId: string, raw: unknown) {
    const input = object(raw); exactKeys(input, ['command_id', 'instruction']);
    if (input.instruction !== undefined && typeof input.instruction !== 'string') fail('instruction 必须为字符串');
    const journal = this.journal(`start:${taskId}`, input);
    if (journal.value.response) return journal.value.response;
    const config = this.provider ?? fail('模型未配置', 'MODEL_NOT_CONFIGURED', 'conflict');
    const task = this.task(taskId), definition = this.local.store.getExecutionRecord('task_definition', task.definition_ref.id)!;
    this.activeTask = taskId;
    const item = this.workItem(journal, taskId), path = this.worktree(taskId), branch = `cimiloop/task-${taskId.replace(/-/g, '').slice(-12)}`;
    const prior = this.results().filter(result => result.status === 'Succeeded' && this.task(result.task_id).change_id === task.change_id).sort((a, b) => a.started_at.localeCompare(b.started_at)).at(-1);
    const commit = prior?.head_commit ?? liteGit(this.local.location.repositoryPath, ['rev-parse', 'HEAD']).trim();
    if (!existsSync(path)) {
      mkdirSync(join(this.local.location.dataDirectory, 'worktrees'), { recursive: true });
      liteGit(this.local.location.repositoryPath, ['worktree', 'add', '-b', branch, path, commit]);
    }
    const source = this.source(journal, task.change_id, liteGit(path, ['rev-parse', 'HEAD']).trim());
    const prepared = this.command<{ context: ContextManifest }>(journal, 'context', 'PrepareRunContext', 'work_item', item.id, 'executor', { source_snapshot_ref: ref('source_snapshot', source.id) });
    const reserved = this.command<{ run: Run }>(journal, 'reserve', 'ReserveRun', 'task', taskId, 'executor', { work_item_ref: ref('work_item', item.id), context_ref: ref('context_manifest', prepared.context.id), input_digest: prepared.context.input_digest });
    if (this.has(reserved.run.id)) return journal.finish({ ok: true, run_id: reserved.run.id, task_id: taskId, status: 'Running' });
    const result: LiteResult = { ok: true, run_id: reserved.run.id, task_id: taskId, status: 'Running', started_at: new Date().toISOString(), branch, base_commit: source.commit_id, head_commit: source.commit_id, summary: '', files: [], patch: '', checks: [], usage: { turns: 0, prompt_tokens: 0, completion_tokens: 0 } };
    const runner = new LiteRunner(this.directory(result.run_id), path, result, config, liteCredential(), this.checks, item.allowed_resources, item.allowed_actions.includes('edit_files'));
    this.observe(result, 'running');
    const contract = this.local.store.getIntentRecord('contract_version', task.contract_ref.id)!;
    const instruction = JSON.stringify({ task: definition.body, contract: contract.body, instruction: input.instruction ?? '' });
    const job = Promise.resolve().then(() => runner.execute(instruction, final => this.observe(final, final.status.toLowerCase() as 'succeeded' | 'failed' | 'cancelled'))).finally(() => this.live.delete(result.run_id));
    this.live.set(result.run_id, { runner, job });
    return journal.finish({ ok: true, run_id: result.run_id, task_id: taskId, status: 'Running' });
  }
  private observe(result: LiteResult, status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown') {
    this.activeTask = result.task_id;
    const record = this.local.store.getRuntimeRecord('run_record', this.local.store.getRun(result.run_id)!.record_ref.id)!;
    const journal = this.journal(`observe:${result.run_id}:${status}`, { command_id: derivedId(`${result.run_id}:${status}`) });
    const reconciling = status !== 'running' && status !== 'unknown' && this.local.store.getRun(result.run_id)!.cancel_requested;
    const raw = { format: 'cimiloop/manual-run/1.0.0', run_id: result.run_id, operation_key: record.operation_key,
      producer_actor_id: this.local.instance.actor_id, observed_at: new Date().toISOString(), input_digest: record.input_digest,
      basis: reconciling ? 'reconciliation' : 'direct_observation', status, usage: { cost_known: true, cost_micros: 0 }, method: 'Human-owned lite local model tool execution (no billing settlement)',
      observation: (result.summary || `Lite run ${status}`).slice(0, 4000), resolves_observation_refs: reconciling ? this.local.store.listRuntimeRecords('run_observation', record.change_id).filter(value => value.run_ref.id === result.run_id && (value.report.status === 'unknown' || !value.report.usage.cost_known || value.applicability === 'conflicting')).map(value => ref('run_observation', value.id)) : [] };
    const rawRef = this.evidence.storeContent(Buffer.from(JSON.stringify(raw)), 'manual_run');
    this.command(journal, 'observe', reconciling ? 'ReconcileRun' : 'RecordRunObservation', 'run', result.run_id, reconciling ? 'technical_owner' : 'executor', { raw_result_ref: rawRef });
  }
  private successfulRun(runId: unknown, changeId: string) {
    const run = this.result(text(runId));
    if (run.status !== 'Succeeded' || this.task(run.task_id).change_id !== changeId) return fail('需要当前 Change 的成功 lite Run', 'RUN_STATE_INVALID', 'conflict');
    return run;
  }
  evaluate(taskId: string, raw: unknown) {
    const input = object(raw); exactKeys(input, ['command_id', 'run_id', 'assessment', 'acceptance']);
    const journal = this.journal(`evaluate:${taskId}`, input);
    if (journal.value.response) return journal.value.response;
    const general = claim(input.assessment), acceptance = (Array.isArray(input.acceptance) ? input.acceptance : fail('acceptance 需要数组')).map(value => ({ key: text(object(value).key), ...claim(value) }));
    const task = this.task(taskId), run = this.successfulRun(input.run_id, task.change_id);
    this.workItem(journal, taskId);
    const source = this.source(journal, task.change_id, run.head_commit);
    const prepare = (step: string) => this.command<{ requirement_set: RequirementSetRecord; context?: EvaluationContext; input_digest: ContextManifest['input_digest'] }>(journal, step, 'PrepareTaskEvaluation', 'task', taskId, 'executor', { source_snapshot_ref: ref('source_snapshot', source.id) });
    const prepared = prepare('requirements');
    const definition = this.local.store.getExecutionRecord('task_definition', task.definition_ref.id)!;
    if (acceptance.length !== definition.body.verification.acceptance_keys.length || new Set(acceptance.map(item => item.key)).size !== acceptance.length || definition.body.verification.acceptance_keys.some(key => !acceptance.some(item => item.key === key))) fail('acceptance 必须覆盖本 Task 全部 acceptance key');
    const claims = prepared.requirement_set.requirements.map(requirement => {
      const specific = acceptance.find(item => requirement.key === `acceptance-${item.key}` || requirement.key.startsWith(`acceptance-${item.key}-evidence-`));
      return { ...requirement, ...(specific ? { result: specific.result, observation: specific.observation } : general) };
    });
    const rawRef = this.evidence.storeContent(Buffer.from(JSON.stringify({ format: 'cimiloop/manual-evidence/1.0.0', producer_actor_id: this.local.instance.actor_id,
      observed_at: new Date().toISOString(), source_digest: source.source_digest,
      method: `${definition.body.verification.mode === 'independent' && this.local.store.listActors().filter(actor => actor.project_id === task.project_id && actor.actor_type === 'human').length === 1 ? '单人模式 · 非独立验证；' : ''}Human observation of lite result ${run.run_id}`, claims })), 'manual_evidence');
    this.command(journal, 'evidence', 'RecordEvidence', 'task', taskId, 'executor', { source_snapshot_ref: ref('source_snapshot', source.id), raw_result_ref: rawRef });
    const fixed = prepare('prepare');
    const { evaluation } = this.command<{ evaluation: TaskEvaluation }>(journal, 'evaluate', 'EvaluateTask', 'task', taskId, 'executor', {
      requirement_set_ref: ref('requirement_set_record', fixed.requirement_set.id), ...(fixed.context ? { context_ref: ref('evaluation_context', fixed.context.id) } : {}), input_digest: fixed.input_digest
    });
    return journal.finish({ ok: true, task_id: taskId, source_snapshot_id: source.id, evaluation_id: evaluation.id, outcome: evaluation.outcome, reasons: evaluation.reasons });
  }
  satisfy(taskId: string, raw: unknown) {
    const input = object(raw); exactKeys(input, ['command_id', 'evaluation_id']);
    const journal = this.journal(`satisfy:${taskId}`, input);
    if (journal.value.response) return journal.value.response;
    this.command(journal, 'satisfy', 'SatisfyTask', 'task', taskId, 'technical_owner', { evaluation_ref: ref('evaluation', text(input.evaluation_id)) });
    return journal.finish({ ok: true, task_id: taskId, status: 'Satisfied' });
  }
  ready(changeId: string, raw: unknown) {
    const input = object(raw); exactKeys(input, ['command_id', 'run_id', 'reason', 'deferred_checks']);
    const journal = this.journal(`ready:${changeId}`, input);
    if (journal.value.response) return journal.value.response;
    const run = this.successfulRun(input.run_id, changeId), source = this.source(journal, changeId, run.head_commit);
    const { evaluation } = this.command<{ evaluation: GateEvaluation }>(journal, 'integration', 'EvaluateIntegration', 'change', changeId, 'technical_owner', { source_snapshot_ref: ref('source_snapshot', source.id), deferred_checks: input.deferred_checks ?? [] });
    if (evaluation.outcome === 'ALLOW') this.command(journal, 'ready', 'MarkReadyForIntegration', 'change', changeId, 'technical_owner', { evaluation_ref: ref('evaluation', evaluation.id), input_digest: evaluation.input_digest, reason: text(input.reason) });
    return journal.finish({ ok: true, change_id: changeId, evaluation_id: evaluation.id, outcome: evaluation.outcome, reasons: evaluation.reasons, status: this.change(changeId).lifecycle_state });
  }
  query(runId: string) {
    return { ok: true, run_id: runId, operation: { outcome: 'observed', result: this.result(runId) }, starts_run: false, domain_observation_produced: false };
  }
  stop(runId: string, raw: unknown) {
    const input = object(raw);
    if (input.command_type !== 'CancelRun' || object(input.target).object_type !== 'run' || object(input.target).id !== runId) fail('仅支持当前 Run 的 CancelRun');
    const command_result = executeLocalCommand({ ...this.local, kernel: this.kernel }, input);
    if ('code' in command_result) throw command_result;
    this.live.get(runId)?.runner.controller.abort();
    return { ...this.query(runId), command_result };
  }
  async advice(kind: 'clarify' | 'review', id: string) {
    const config = this.provider ?? fail('模型未配置', 'MODEL_NOT_CONFIGURED', 'conflict');
    const context = kind === 'clarify' ? this.local.kernel.getIntent(id) : this.result(id);
    if ('code' in context) throw context;
    const shape = kind === 'clarify' ? '{"questions":[{"question":"...","why":"..."}]}' : '{"verdict":"looks_good or concerns","summary":"...","findings":[{"file":"optional","line":1,"severity":"info or warn or block","message":"..."}]}';
    const messages = [{ role: 'system', content: `Give advisory suggestions only. Do not claim a Kernel decision. Return JSON only with this shape: ${shape}` }, { role: 'user', content: JSON.stringify(context) }];
    const remaining = config.max_tokens - Buffer.byteLength(JSON.stringify(messages));
    if (remaining <= 0) fail('建议上下文超过 max_tokens', 'INVALID_COMMAND');
    const key = liteCredential();
    const completion = await liteCompletion(config, key, messages, Math.min(4096, remaining), AbortSignal.timeout(120000));
    const rawContent = completion.choices[0]?.message.content ?? '';
    const content = key ? rawContent.split(key).join('[REDACTED]') : rawContent;
    const result = object(JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')));
    if (kind === 'clarify') {
      const questions = (Array.isArray(result.questions) ? result.questions : fail('模型建议格式无效')).map(value => ({ question: text(object(value).question), why: text(object(value).why) }));
      return { ok: true, questions };
    }
    if (!['looks_good', 'concerns'].includes(String(result.verdict)) || !Array.isArray(result.findings)) fail('模型建议格式无效');
    const findings = (result.findings as unknown[]).map(value => {
      const item = object(value);
      if (!['info', 'warn', 'block'].includes(String(item.severity))) fail('模型建议格式无效');
      return { ...(typeof item.file === 'string' ? { file: item.file } : {}), ...(Number.isInteger(item.line) ? { line: item.line } : {}), severity: item.severity, message: text(item.message) };
    });
    return { ok: true, verdict: result.verdict, summary: text(result.summary), findings };
  }
  async close() { for (const entry of this.live.values()) entry.runner.controller.abort(); await Promise.allSettled([...this.live.values()].map(entry => entry.job)); }
}
