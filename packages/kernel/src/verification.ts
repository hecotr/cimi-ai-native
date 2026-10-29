import { SCHEMA_VERSION, compileValidator, RawEvidenceResultSchema, type AnyCommand, type Assignment, type Change, type CommandSuccess,
  type Digest, type DomainError, type Evidence, type EvaluationContext, type GateEvaluation, type PolicySnapshot, type Project, type RawEvidenceResult,
  type RequirementSetRecord, type SourceSnapshot, type Task, type TaskEvaluation, type WorkItem, type Decision } from "@cimiloop/protocol/v2";
import type { ProjectReader, StoreTransaction } from "@cimiloop/store";
import { assignmentIsEffective } from "./authorization.js";
import { admissionFailure, contentDigest, IntentFailure, type IntentContext } from "./intent.js";
import { executionReadiness } from "./execution.js";
import { currentTaskEvaluation } from "./verification-facts.js";
import { applicableInvalidations, effectiveClaims, integrationInput, integrationDecision } from "./review-facts.js";
import { verifyReviewRaw } from "./review.js";

// Trusted host boundary. Serialized commands cannot install a verifier or claim
// that an external file / commit was verified. Kernel never executes Git or IO.
export interface EvidenceVerifierPort {
  sourceDigest(project: Project, commitId: string): Digest;
  readRawResult(project: Project, ref: Evidence["raw_result_ref"] | NonNullable<Decision["review"]>["raw_result_ref"]): unknown;
  sourceIsCurrent(project: Project, snapshot: SourceSnapshot): boolean;
}
type Command = Extract<AnyCommand, { command_type: "CaptureSourceSnapshot" | "RecordEvidence" | "PrepareTaskEvaluation" | "EvaluateTask" | "SatisfyTask" | "EvaluateIntegration" | "MarkReadyForIntegration" }>;
type Reader = Pick<ProjectReader, "getActor" | "listActors" | "listAssignments" | "getChange" | "listChanges" | "getIntentRecord" | "listIntentRecords" | "getExecutionObject" | "listExecutionObjects" | "getExecutionRecord" | "listExecutionRecords" | "getVerificationRecord" | "listVerificationRecords">;
interface Mutation { event_type: string; aggregate: CommandSuccess["aggregate"]; revision: number; data: CommandSuccess["data"]; payload: Record<string, unknown> }
const equal = (a: unknown, b: unknown) => contentDigest(a ?? null).value === contentDigest(b ?? null).value;
const validInstant = (value: string) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);
const ref = <T extends "source_snapshot" | "evidence" | "evaluation" | "policy_snapshot" | "requirement_set_record" | "evaluation_context" | "work_item" | "assignment" | "decision">(object_type: T, id: string) => ({ object_type, id });
const fail = (command: { correlation_id: string }, code: DomainError["code"], message: string): never => {
  throw new IntentFailure({ schema_version: SCHEMA_VERSION, code, message, category: "conflict", retryable: false, details: {}, correlation_id: command.correlation_id });
};
const meta = (change: Change, context: IntentContext) => ({ schema_version: SCHEMA_VERSION, id: context.id(), project_id: change.project_id, change_id: change.id, created_at: context.now, producer_actor_id: context.actorId });
const baseline = (change: Change, source: SourceSnapshot) => ({ change_id: change.id, contract_ref: change.contract_ref!, plan_ref: change.plan_ref!, source_snapshot_ref: ref("source_snapshot", source.id) });
const humanAssignment = (reader: Reader, command: Command, change: Change, context: IntentContext): Assignment => {
  const assignment = command.acting_role === "technical_owner" && reader.getActor(context.actorId)?.actor_type === "human" ? reader.listAssignments(context.actorId).find(item => item.project_id === change.project_id && item.role_key === "technical_owner" && assignmentIsEffective(item, context.now) &&
    ((item.scope.kind === "project" && item.scope.id === change.project_id) || (item.scope.kind === "change" && item.scope.id === change.id))) : undefined;
  if (!assignment) fail(command, "ROLE_NOT_ASSIGNED", "需要当前 Human 技术责任及有效指派"); return assignment!;
};
const verifierFor = (port: EvidenceVerifierPort | undefined, command: Command): EvidenceVerifierPort => {
  if (!port) fail(command, "CAPABILITY_UNAVAILABLE", "宿主尚未接通可信源码与原始结果核验器"); return port!;
};
const sourceFor = (reader: Reader, command: Command, change: Change, id: string, context: IntentContext, port: EvidenceVerifierPort): SourceSnapshot => {
  const snapshot = reader.getVerificationRecord("source_snapshot", id);
  if (!snapshot || snapshot.change_id !== change.id || snapshot.project_id !== change.project_id || snapshot.repository_ref.id !== change.project_id) fail(command, "BASELINE_MISMATCH", "源码快照不属于当前需求与仓库");
  try { if (!equal(port.sourceDigest(context.project, snapshot!.commit_id), snapshot!.source_digest)) fail(command, "BASELINE_MISMATCH", "源码内容摘要已变化"); }
  catch (error) { if (error instanceof IntentFailure) throw error; fail(command, "EVIDENCE_MISSING", "无法核对固定源码对象"); }
  return snapshot!;
};
const rawFor = (command: Command, evidence: Evidence, source: SourceSnapshot, project: Project, port: EvidenceVerifierPort): RawEvidenceResult => {
  let raw: RawEvidenceResult;
  try { raw = compileValidator<RawEvidenceResult>(RawEvidenceResultSchema)(port.readRawResult(project, evidence.raw_result_ref)); }
  catch { fail(command, "EVIDENCE_MISSING", "原始证据缺失、摘要不符或结构无效"); }
  if (!equal(raw!.source_digest, source.source_digest) || raw!.producer_actor_id !== evidence.producer_actor_id || raw!.observed_at !== evidence.observed_at || !equal(raw!.claims, evidence.claims)) fail(command, "BASELINE_MISMATCH", "原始证据与已记录摘要、来源或断言不符");
  return raw!;
};
const definitionFor = (reader: Reader, command: Command, change: Change, task: Task) => {
  const definition = reader.getExecutionRecord("task_definition", task.definition_ref.id), plan = reader.getIntentRecord("plan_version", change.plan_ref!.id);
  if (!definition || definition.task_id !== task.id || definition.version !== task.definition_ref.domain_version || definition.body.task_id !== task.id || definition.body.version !== definition.version || definition.project_id !== change.project_id || definition.change_id !== change.id ||
    !equal(task.contract_ref, change.contract_ref) || !equal(task.plan_ref, change.plan_ref) || !equal(definition.content_digest, contentDigest(definition.body)) || !plan?.body.task_definitions.some(item => equal(item, definition.body))) fail(command, "BASELINE_MISMATCH", "任务定义不适用于当前正式约定与计划");
  return definition!;
};
const applicableEvidence = (reader: Reader, task: Task, source: SourceSnapshot) => reader.listVerificationRecords("evidence", task.change_id).filter(evidence => evidence.task_id === task.id && equal(evidence.definition_ref, task.definition_ref) && equal(evidence.contract_ref, task.contract_ref) && equal(evidence.plan_ref, task.plan_ref) && evidence.source_snapshot_ref.id === source.id);
const taskInput = (reader: Reader, task: Task, source: SourceSnapshot, requirements: RequirementSetRecord, item: WorkItem) => contentDigest({
  rule_version: "verification/1.0.0", task, work_item: item, source_digest: source.source_digest, requirement_set: requirements,
  evidence: applicableEvidence(reader, task, source).map(value => { const dispositions = applicableInvalidations(reader, task.change_id, value);
    return { id: value.id, digest: contentDigest(value), ...(dispositions.length ? { dispositions } : {}) }; }) });
const policyFor = (reader: Reader, change: Change, source: SourceSnapshot, context: IntentContext): PolicySnapshot => ({ ...meta(change, context), ...baseline(change, source), rule_version: "verification/1.0.0",
  profile: change.kind === "bug" ? "Bugfix" : "Feature", risk_ref: reader.getIntentRecord("contract_version", change.contract_ref!.id)!.risk_ref });
const requirementsFor = (reader: Reader, command: Command, change: Change, task: Task) => {
  const definition = definitionFor(reader, command, change, task), contract = reader.getIntentRecord("contract_version", change.contract_ref!.id)!;
  return [{ key: "goal", description: definition.body.goal }, ...definition.body.outputs.map((description, i) => ({ key: `output-${i}`, description })),
    ...contract.body.constraints.map((description, i) => ({ key: `constraint-${i}`, description })),
    ...definition.body.verification.evidence_requirements.map((description, i) => ({ key: `evidence-${i}`, description })),
    ...definition.body.verification.acceptance_keys.flatMap(key => { const criterion = contract.body.acceptance_criteria.find(item => item.key === key)!; return [
      { key: `acceptance-${key}`, description: `${criterion.scenario}；${criterion.expected}` }, ...criterion.evidence_requirements.map((description, i) => ({ key: `acceptance-${key}-evidence-${i}`, description })) ]; }),
    ...(definition.body.purpose === "verification" ? [{ key: "safe_integration", description: "固定源码可安全集成；兼容性与约定约束已经核对" },
      ...(change.kind === "bug" ? [{ key: "bug_reproduction", description: "缺陷原始复现条件与预期行为已记录" }, { key: "bug_regression", description: "固定源码上的缺陷回归与相关兼容场景已核对" }] : [])] : [])];
};
const independentProblem = (reader: Reader, task: Task, item: WorkItem): boolean => !item.independence_required || item.allowed_actions.includes("edit_files") ||
  reader.getActor(item.executor_ref.id)?.actor_type !== "human" ||
  (reader.listActors().filter(actor => actor.project_id === task.project_id && actor.actor_type === "human").length !== 1 &&
    reader.listExecutionObjects("work_item", task.change_id).some(other => other.executor_ref.id === item.executor_ref.id && reader.getExecutionRecord("task_definition", other.definition_ref.id)?.body.purpose === "implementation"));
const computeTaskEvaluation = (reader: Reader, command: Command, change: Change, task: Task, item: WorkItem, source: SourceSnapshot,
  requirements: RequirementSetRecord, context: IntentContext, port: EvidenceVerifierPort, contextRecord?: EvaluationContext): TaskEvaluation => {
  const definition = definitionFor(reader, command, change, task), independent = definition.body.verification.mode === "independent";
  const policy = reader.getVerificationRecord("policy_snapshot", requirements.policy_snapshot_ref.id);
  if (requirements.task_id !== task.id || !equal(requirements.definition_ref, task.definition_ref) || !equal(requirements.contract_ref, change.contract_ref) || !equal(requirements.plan_ref, change.plan_ref) || requirements.source_snapshot_ref.id !== source.id ||
    !equal(requirements.requirements, requirementsFor(reader, command, change, task)) || !policy || policy.rule_version !== "verification/1.0.0" || policy.profile !== (change.kind === "bug" ? "Bugfix" : "Feature") || policy.source_snapshot_ref.id !== source.id ||
    !equal(policy.contract_ref, change.contract_ref) || !equal(policy.plan_ref, change.plan_ref) || policy.risk_ref.id !== reader.getIntentRecord("contract_version", change.contract_ref!.id)!.risk_ref.id) fail(command, "BASELINE_MISMATCH", "评价需求集与策略快照不适用");
  const digest = taskInput(reader, task, source, requirements, item);
  if (independent && (independentProblem(reader, task, item) || !contextRecord || contextRecord.evaluator_actor_id !== item.executor_ref.id || contextRecord.work_item_ref.id !== item.id || contextRecord.task_id !== task.id || contextRecord.requirement_set_ref.id !== requirements.id ||
    contextRecord.project_id !== change.project_id || contextRecord.change_id !== change.id || contextRecord.source_snapshot_ref.id !== source.id || !equal(contextRecord.definition_ref, task.definition_ref) ||
    !equal(contextRecord.contract_ref, change.contract_ref) || !equal(contextRecord.plan_ref, change.plan_ref) || !equal(contextRecord.input_digest, digest) || !equal(contextRecord.allowed_resources, item.allowed_resources))) fail(command, "INDEPENDENCE_REQUIRED", "需要独立 Human 身份、只读授权与固定最小评价上下文");
  const evidence = applicableEvidence(reader, task, source); evidence.forEach(value => rawFor(command, value, source, context.project, port));
  const dispositions = evidence.flatMap(value => applicableInvalidations(reader, change.id, value)).filter((value, i, all) => all.findIndex(other => other.id === value.id) === i);
  dispositions.forEach(decision => verifyReviewRaw(command, decision, context.project, port));
  const assessments = requirements.requirements.map(requirement => {
    const claims = evidence.flatMap(value => effectiveClaims(reader, value).filter(claim => claim.key === requirement.key && claim.description === requirement.description).map(claim => ({ evidence: value, claim })));
    const refutes = claims.filter(value => value.claim.result === "refutes"), supports = claims.filter(value => value.claim.result === "supports" && value.evidence.producer_actor_id === item.executor_ref.id);
    return { key: requirement.key, result: refutes.length ? "refutes" as const : claims.some(value => value.claim.result === "inconclusive") ? "inconclusive" as const : supports.length ? "supports" as const : "inconclusive" as const,
      evidence_refs: claims.map(value => ref("evidence", value.evidence.id)).filter((value, i, all) => all.findIndex(other => other.id === value.id) === i), conflict: !!refutes.length && !!supports.length };
  });
  const conflict = assessments.some(item => item.conflict), refuted = assessments.some(item => item.result === "refutes"), missing = assessments.some(item => item.result === "inconclusive");
  return { ...meta(change, context), ...baseline(change, source), task_id: task.id, definition_ref: task.definition_ref, work_item_ref: ref("work_item", item.id),
    purpose: independent ? "independent" : "self_check", requirement_set_ref: ref("requirement_set_record", requirements.id), ...(contextRecord ? { context_ref: ref("evaluation_context", contextRecord.id) } : {}),
    input_digest: digest, evidence_refs: evidence.map(item => ref("evidence", item.id)), ...(dispositions.length ? { disposition_refs: dispositions.map(item => ref("decision", item.id)) } : {}), outcome: conflict ? "REQUIRE_HUMAN" : refuted ? "DENY" : missing ? "NEED_MORE_EVIDENCE" : "ALLOW",
    reasons: conflict ? ["适用证据存在正反冲突，不能多数表决或覆盖反证"] : refuted ? ["至少一项必需结论被适用证据否定"] : missing ? ["必需断言仍缺少适用支持证据"] : [],
    assessments: assessments.map(({ conflict: _conflict, ...item }) => item) };
};
type Deferrals = GateEvaluation["deferred_checks"];
const gateInput = integrationInput;
const computeGate = (reader: Reader, command: Command, change: Change, source: SourceSnapshot, deferred: Deferrals, policy: PolicySnapshot, context: IntentContext, port: EvidenceVerifierPort): GateEvaluation => {
  const plan = reader.getIntentRecord("plan_version", change.plan_ref!.id)!, contract = reader.getIntentRecord("contract_version", change.contract_ref!.id)!;
  const reasons: string[] = [], taskEvaluations: TaskEvaluation[] = []; let hard = false;
  const required = plan.body.task_definitions.filter(item => ["implementation", "verification"].includes(item.purpose));
  for (const definition of required) {
    const task = reader.getExecutionObject("task", definition.task_id), evaluation = task ? currentTaskEvaluation(reader, task) : undefined;
    if (!task || !evaluation || evaluation.source_snapshot_ref.id !== source.id || task.definition_ref.domain_version !== definition.version) { reasons.push(`任务 ${definition.task_id} 缺少适用于当前源码的满足结论`); continue; }
    if (definition.verification.mode === "independent") {
      const item = reader.getExecutionObject("work_item", evaluation.work_item_ref.id), boundary = evaluation.context_ref ? reader.getVerificationRecord("evaluation_context", evaluation.context_ref.id) : undefined;
      if (!item || independentProblem(reader, task, item) || evaluation.purpose !== "independent" || !boundary || boundary.evaluator_actor_id !== evaluation.producer_actor_id || boundary.work_item_ref.id !== item.id || !equal(boundary.input_digest, evaluation.input_digest)) { reasons.push("独立评价身份或上下文边界不成立"); hard = true; }
    }
    taskEvaluations.push(evaluation);
  }
  const evidence = reader.listVerificationRecords("evidence", change.id).filter(item => item.source_snapshot_ref.id === source.id && equal(item.contract_ref, change.contract_ref) && equal(item.plan_ref, change.plan_ref));
  for (const value of evidence) rawFor(command, value, source, context.project, port);
  evidence.flatMap(value => applicableInvalidations(reader, change.id, value)).forEach(decision => verifyReviewRaw(command, decision, context.project, port));
  // Every applicable later observation is considered, including observations
  // arriving after task satisfaction. An old ALLOW cannot conceal new refutes.
  const refutes = evidence.some(item => effectiveClaims(reader, item).some(claim => claim.result === "refutes")), inconclusive = evidence.some(item => effectiveClaims(reader, item).some(claim => claim.result === "inconclusive"));
  if (refutes) { reasons.push("当前源码存在未处置反证"); hard = true; }
  if (inconclusive) reasons.push("当前源码仍存在未知检查结果");
  const safe = taskEvaluations.some(item => item.purpose === "independent" && item.assessments.some(check => check.key === "safe_integration" && check.result === "supports"));
  if (!safe) reasons.push("缺少独立 safe_integration 证据，不能延期替代");
  if (new Set(deferred.map(item => item.acceptance_key)).size !== deferred.length || deferred.length !== plan.body.verification_strategy.deferred_checks.length) { reasons.push("延期检查必须与已确认计划一一对应"); hard = true; }
  for (const check of deferred) {
    const original = plan.body.verification_strategy.deferred_checks.find(item => item.acceptance_key === check.acceptance_key);
    if (!original || original.required_before !== check.required_before || original.reason !== check.reason || reader.getActor(check.responsible_actor_id)?.actor_type !== "human" || reader.getActor(check.responsible_actor_id)?.project_id !== change.project_id || !validInstant(check.next_check_at) || Date.parse(check.next_check_at) <= Date.parse(context.now)) { reasons.push("延期检查缺少有效责任人、完成时点或当前计划依据"); hard = true; }
  }
  if (reader.listExecutionObjects("work_item", change.id).some(item => ["Ready", "Active"].includes(item.status)) || reader.listExecutionObjects("task", change.id).some(task => task.usage.pending_reconciliation || !task.usage.cost_known)) reasons.push("仍有未关闭授权或未知在途用量");
  const risk = reader.getIntentRecord("risk_assessment", contract.risk_ref.id)!;
  const decision = risk.level === "high" && !hard && !reasons.length ? integrationDecision(reader, change, source, deferred, context.now) : undefined;
  if (decision) verifyReviewRaw(command, decision, context.project, port);
  const human = risk.level === "high" && !hard && !reasons.length && !decision;
  if (human) reasons.push("高风险集成需要独立 Human 质量责任人的专业决定");
  const digest = gateInput(reader, change, source, deferred);
  return { ...meta(change, context), ...baseline(change, source), purpose: "safe_integration", policy_snapshot_ref: ref("policy_snapshot", policy.id),
    input_digest: decision ? contentDigest({ input: digest, professional_decision_ref: ref("decision", decision.id) }) : digest,
    ...(decision ? { professional_decision_ref: { object_type: "decision" as const, id: decision.id } } : {}),
    task_evaluation_refs: taskEvaluations.map(item => ref("evaluation", item.id)), evidence_refs: evidence.map(item => ref("evidence", item.id)), deferred_checks: deferred,
    outcome: hard ? "DENY" : human ? "REQUIRE_HUMAN" : reasons.length ? "NEED_MORE_EVIDENCE" : "ALLOW", reasons };
};

export const executeVerification = (tx: StoreTransaction, command: Command, context: IntentContext, optionalPort?: EvidenceVerifierPort): Mutation => {
  const taskTarget = command.target.object_type === "task", task = taskTarget ? tx.getExecutionObject("task", command.target.id) : undefined;
  const change = tx.getChange(taskTarget ? task?.change_id ?? "" : command.target.id);
  if (!change || change.project_id !== context.project.id || (taskTarget && !task)) fail(command, taskTarget ? "TASK_NOT_FOUND" : "CHANGE_NOT_FOUND", "未找到当前项目目标");
  if ((taskTarget ? task!.revision : change!.revision) !== command.expected_revision) fail(command, "REVISION_CONFLICT", "目标版本已变化");
  const current = change!;
  const sourceInspection = command.command_type === "CaptureSourceSnapshot" && ["IntentReady", "Executing"].includes(current.lifecycle_state) && ["Active", "Paused"].includes(current.operating_status);
  if (!sourceInspection && (current.lifecycle_state !== "Executing" || current.operating_status !== "Active")) fail(command, "CHANGE_STATE_INVALID", "只接受已开工且未暂停需求的证据与评价；源码核对允许已确认计划或暂停期间");
  const admission = admissionFailure(tx, command, current, command.command_type !== "CaptureSourceSnapshot"); if (admission) throw new IntentFailure(admission);
  const port = verifierFor(optionalPort, command);
  const mutation = (event_type: string, data: Record<string, unknown>, payload = data, revision = task?.revision ?? current.revision): Mutation => ({ event_type,
    aggregate: { object_type: taskTarget ? "task" : "change", id: taskTarget ? task!.id : current.id }, revision, data: data as Mutation["data"], payload });
  if (command.command_type === "CaptureSourceSnapshot") {
    humanAssignment(tx, command, current, context); let digest: Digest;
    try { digest = port.sourceDigest(context.project, command.payload.commit_id); } catch { fail(command, "EVIDENCE_MISSING", "无法解析当前仓库的真实固定 Git commit"); }
    const source: SourceSnapshot = { ...meta(current, context), repository_ref: { object_type: "project", id: current.project_id }, commit_id: command.payload.commit_id, source_digest: digest! };
    tx.insertVerificationRecord("source_snapshot", source); return mutation("SourceSnapshotCaptured", { source_snapshot: source });
  }
  if (command.command_type === "EvaluateIntegration" || command.command_type === "MarkReadyForIntegration") {
    const assignment = humanAssignment(tx, command, current, context);
    const previous = command.command_type === "MarkReadyForIntegration" ? tx.getVerificationRecord("evaluation", command.payload.evaluation_ref.id) : undefined;
    if (command.command_type === "MarkReadyForIntegration" && (!previous || previous.purpose !== "safe_integration" || previous.change_id !== current.id || previous.project_id !== current.project_id || previous.outcome !== "ALLOW" || !equal(previous.input_digest, command.payload.input_digest))) fail(command, "EVIDENCE_MISSING", "需要当前需求真实 ALLOW 集成评价与精确摘要");
    const prior = previous as GateEvaluation | undefined;
    const source = sourceFor(tx, command, current, command.command_type === "EvaluateIntegration" ? command.payload.source_snapshot_ref.id : prior!.source_snapshot_ref.id, context, port);
    const deferred = command.command_type === "EvaluateIntegration" ? command.payload.deferred_checks : prior!.deferred_checks;
    const policy = policyFor(tx, current, source, context), evaluation = computeGate(tx, command, current, source, deferred, policy, context, port);
    if (command.command_type === "EvaluateIntegration") { tx.insertVerificationRecord("policy_snapshot", policy); tx.insertVerificationRecord("evaluation", evaluation); return mutation("IntegrationEvaluated", { policy_snapshot: policy, evaluation }); }
    if (!equal(prior!.input_digest, evaluation.input_digest) || (command.expected_input_digest && !equal(command.expected_input_digest, evaluation.input_digest))) fail(command, "INPUT_CHANGED", "集成评价输入已变化，须重新评价");
    if (evaluation.outcome !== "ALLOW") fail(command, "EVIDENCE_MISSING", "当前集成门禁不允许推进");
    let currentSource = false; try { currentSource = port.sourceIsCurrent(context.project, source); } catch { /* fail closed */ }
    if (!currentSource) fail(command, "BASELINE_MISMATCH", "当前 HEAD 或工作区与评价源码不符，须固定新源码并重新验证");
    const readiness = { ...meta(current, context), ...baseline(current, source), evaluation_ref: ref("evaluation", prior!.id), input_digest: evaluation.input_digest,
      assignment_ref: ref("assignment", assignment.id), deferred_checks: deferred, change_revision: current.revision + 1 };
    const transition = { ...meta(current, context), command_id: command.command_id, from_state: "Executing" as const, to_state: "ReadyForDelivery" as const,
      actor_id: context.actorId, acting_role: "technical_owner" as const, reason: command.payload.reason, basis_refs: [ref("evaluation", prior!.id), { object_type: "integration_readiness_record" as const, id: readiness.id }] };
    const next = { ...current, lifecycle_state: "ReadyForDelivery" as const, revision: current.revision + 1, updated_at: context.now };
    tx.insertVerificationRecord("integration_readiness_record", readiness); tx.insertIntentRecord("lifecycle_transition_record", transition); tx.updateChange(next, current.revision);
    return mutation("ChangeReadyForDelivery", { change: next, readiness }, { readiness, lifecycle_transition: transition }, next.revision);
  }
  const target = task!, definition = definitionFor(tx, command, current, target), item = target.active_work_item_ref ? tx.getExecutionObject("work_item", target.active_work_item_ref.id) : undefined;
  if (!item || !executionReadiness(tx, target, context.now, true).ready) fail(command, "WORK_ITEM_STATE_INVALID", "需要当前有效、无未知用量的 Ready 执行授权");
  if (command.command_type === "SatisfyTask") humanAssignment(tx, command, current, context);
  else if (tx.getActor(context.actorId)?.actor_type !== "human" || item!.executor_ref.id !== context.actorId || command.acting_role !== "executor") fail(command, "EXECUTOR_NOT_ALLOWED", "人工证据与评价由绑定 Human 执行者本人提交；Agent 需等待真实 Run 上下文");
  if (command.command_type === "RecordEvidence") {
    const source = sourceFor(tx, command, current, command.payload.source_snapshot_ref.id, context, port);
    let raw: RawEvidenceResult;
    try { raw = compileValidator<RawEvidenceResult>(RawEvidenceResultSchema)(port.readRawResult(context.project, command.payload.raw_result_ref)); }
    catch { fail(command, "EVIDENCE_MISSING", "原始证据缺失、摘要不符或结构无效"); }
    if (raw!.producer_actor_id !== context.actorId || !equal(raw!.source_digest, source.source_digest) || !validInstant(raw!.observed_at) || Date.parse(raw!.observed_at) > Date.parse(context.now) || Date.parse(raw!.observed_at) < Date.parse(item!.created_at) || new Set(raw!.claims.map(item => item.key)).size !== raw!.claims.length) fail(command, "BASELINE_MISMATCH", "证据来源、源码、观察时间或断言 key 不符");
    const evidence: Evidence = { ...meta(current, context), ...baseline(current, source), task_id: target.id, definition_ref: target.definition_ref, work_item_ref: ref("work_item", item!.id),
      origin: "manual_observation", raw_result_ref: command.payload.raw_result_ref, observed_at: raw!.observed_at, claims: raw!.claims };
    tx.insertVerificationRecord("evidence", evidence); return mutation("EvidenceRecorded", { evidence });
  }
  if (command.command_type === "PrepareTaskEvaluation") {
    const source = sourceFor(tx, command, current, command.payload.source_snapshot_ref.id, context, port), policy = policyFor(tx, current, source, context);
    const requirements: RequirementSetRecord = { ...meta(current, context), ...baseline(current, source), task_id: target.id, definition_ref: target.definition_ref, policy_snapshot_ref: ref("policy_snapshot", policy.id), requirements: requirementsFor(tx, command, current, target) };
    const digest = taskInput(tx, target, source, requirements, item!);
    const boundary: EvaluationContext | undefined = definition.body.verification.mode === "independent" ? { ...meta(current, context), ...baseline(current, source), task_id: target.id, definition_ref: target.definition_ref,
      work_item_ref: ref("work_item", item!.id), evaluator_actor_id: context.actorId, boundary: "manual_independent_read_only", allowed_resources: item!.allowed_resources, requirement_set_ref: ref("requirement_set_record", requirements.id), input_digest: digest } : undefined;
    if (boundary && independentProblem(tx, target, item!)) fail(command, "INDEPENDENCE_REQUIRED", "独立评价不能使用实施身份或可写授权");
    tx.insertVerificationRecord("policy_snapshot", policy); tx.insertVerificationRecord("requirement_set_record", requirements); if (boundary) tx.insertVerificationRecord("evaluation_context", boundary);
    return mutation("TaskEvaluationPrepared", { policy_snapshot: policy, requirement_set: requirements, ...(boundary ? { context: boundary } : {}), input_digest: digest });
  }
  const previous = command.command_type === "SatisfyTask" ? tx.getVerificationRecord("evaluation", command.payload.evaluation_ref.id) : undefined;
  if (command.command_type === "SatisfyTask" && (!previous || previous.purpose === "safe_integration" || previous.task_id !== target.id || previous.producer_actor_id !== item!.executor_ref.id || previous.outcome !== "ALLOW")) fail(command, "EVIDENCE_MISSING", "任务需要由其执行者产生的真实适用 ALLOW 评价");
  const prior = previous as TaskEvaluation | undefined, requirementId = command.command_type === "EvaluateTask" ? command.payload.requirement_set_ref.id : prior!.requirement_set_ref.id;
  const requirements = tx.getVerificationRecord("requirement_set_record", requirementId); if (!requirements) fail(command, "EVIDENCE_MISSING", "真实固定需求集不存在");
  const source = sourceFor(tx, command, current, requirements!.source_snapshot_ref.id, context, port);
  const contextId = command.command_type === "EvaluateTask" ? command.payload.context_ref?.id : prior!.context_ref?.id;
  const boundary = contextId ? tx.getVerificationRecord("evaluation_context", contextId) : undefined;
  const evaluation = computeTaskEvaluation(tx, command, current, target, item!, source, requirements!, { ...context, actorId: item!.executor_ref.id }, port, boundary);
  const expected = command.command_type === "EvaluateTask" ? command.payload.input_digest : prior!.input_digest;
  if (!equal(expected, evaluation.input_digest) || (command.expected_input_digest && !equal(command.expected_input_digest, evaluation.input_digest))) fail(command, "INPUT_CHANGED", "评价输入已变化，须重新准备需求集与上下文");
  if (command.command_type === "EvaluateTask") { tx.insertVerificationRecord("evaluation", evaluation); return mutation("TaskEvaluated", { evaluation }); }
  if (evaluation.outcome !== "ALLOW") fail(command, "EVIDENCE_MISSING", "当前任务评价不允许满足");
  const assignment = humanAssignment(tx, command, current, context), { active_work_item_ref: _active, ...fields } = target;
  const next: Task = { ...fields, status: "Satisfied", result_evaluation_ref: ref("evaluation", prior!.id), revision: target.revision + 1, updated_at: context.now };
  const closed: WorkItem = { ...item!, status: "Closed", revision: item!.revision + 1, updated_at: context.now };
  const satisfaction = { ...meta(current, context), ...baseline(current, source), task_id: target.id, definition_ref: target.definition_ref, work_item_ref: ref("work_item", item!.id),
    evaluation_ref: ref("evaluation", prior!.id), assignment_ref: ref("assignment", assignment.id), task_revision: next.revision };
  tx.insertVerificationRecord("task_satisfaction_record", satisfaction); tx.updateExecutionObject("task", next, target.revision); tx.updateExecutionObject("work_item", closed, item!.revision);
  return mutation("TaskSatisfied", { task: next, work_item: closed, satisfaction }, undefined, next.revision);
};
