import { SCHEMA_VERSION, type AnyCommand, type Assignment, type Change, type CommandSuccess, type DomainError, type ExecutionBudget,
  type ExecutionShowResult, type InternalId, type Scope, type StandingAuthorizationVersion, type Task, type TaskDefinitionRecord,
  type WorkItem, type WorkItemAuthorizationRecord } from "@cimiloop/protocol/v2";
import type { ProjectReader, StoreTransaction } from "@cimiloop/store";
import { assignmentIsEffective } from "./authorization.js";
import { admissionFailure, contentDigest, IntentFailure, type IntentContext } from "./intent.js";
import { currentTaskEvaluation } from "./verification-facts.js";
import {verifyPlanningClarification,type PlanningClarificationPort} from './planning-clarification.js';

type ExecutionCommand = Extract<AnyCommand, { command_type: "InitializePlanTasks" | "PublishStandingAuthorization" | "RevokeStandingAuthorization" | "CreateWorkItem" | "RevokeWorkItem" }>;
type Reader = Pick<ProjectReader, "getActor" | "listAssignments" | "getChange" | "getIntentRecord" | "listIntentRecords" | "getExecutionObject" | "listExecutionObjects" | "getExecutionRecord" | "listExecutionRecords" | "getVerificationRecord" | "listVerificationRecords" | "listRuns">;
interface Mutation { aggregate: CommandSuccess["aggregate"]; revision: number; data: CommandSuccess["data"]; event_type: string; payload: Record<string, unknown> }
const equal = (left: unknown, right: unknown) => contentDigest(left ?? null).value === contentDigest(right ?? null).value;
const fail = (command: { correlation_id: string }, code: DomainError["code"], message: string, category: DomainError["category"] = "conflict"): never => {
  throw new IntentFailure({ schema_version: SCHEMA_VERSION, code, message, category, retryable: false, details: {}, correlation_id: command.correlation_id });
};
const sameScope = (left: Scope, right: Scope) => left.kind === right.kind && left.id === right.id;
const recordMeta = (context: IntentContext) => ({ schema_version: SCHEMA_VERSION, id: context.id(), project_id: context.project.id, created_at: context.now, producer_actor_id: context.actorId });
const objectMeta = (context: IntentContext, id = context.id()) => ({ schema_version: SCHEMA_VERSION, id, project_id: context.project.id, revision: 1, created_at: context.now, updated_at: context.now });
const scopedAssignment = (reader: Reader, actorId: string, role: "policy_owner" | "technical_owner", scope: Scope, now: string, assignmentId?: string): Assignment | undefined =>
  reader.getActor(actorId)?.actor_type === "human" ? reader.listAssignments(actorId).find(item => (!assignmentId || item.id === assignmentId) && item.role_key === role && assignmentIsEffective(item, now) &&
    item.project_id === reader.getActor(actorId)!.project_id && (sameScope(item.scope, scope) || (scope.kind === "change" && item.scope.kind === "project" && item.scope.id === item.project_id))) : undefined;
const requireHuman = (reader: Reader, command: ExecutionCommand, role: "policy_owner" | "technical_owner", scope: Scope, context: IntentContext): Assignment => {
  const assignment = command.acting_role === role ? scopedAssignment(reader, context.actorId, role, scope, context.now) : undefined;
  if (!assignment) fail(command, "ROLE_NOT_ASSIGNED", `需要当前Human ${role}独立有效指派`, "forbidden"); return assignment!;
};
export const resourceIsBounded = (value: string): boolean => !!value && !/[\\:%\x00-\x1f]/.test(value) && !value.startsWith("/") && !value.endsWith("/") &&
  value.split("/").every(part => !!part && part !== "." && part !== ".." && part === part.trim() && !part.endsWith(".") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) && ![".git", ".cimiloop"].includes(value.split("/")[0]!.toLowerCase()) &&
  (!value.includes("*") || (value.endsWith("/**") && value.slice(0, -3).length > 0 && !value.slice(0, -3).includes("*"))) && !value.includes("?");
export const resourceContains = (allowed: string, requested: string): boolean => resourceIsBounded(allowed) && resourceIsBounded(requested) &&
  (allowed === requested || (allowed.endsWith("/**") && (requested === allowed.slice(0, -3) || requested.startsWith(allowed.slice(0, -2)))));
export const usageDigest = (reader: Reader, task: Task) => contentDigest({ task_id: task.id, usage: task.usage,
  prior_work_items: reader.listExecutionObjects("work_item", task.change_id).filter(item => item.task_id === task.id).map(item => ({ id: item.id, revision: item.revision, status: item.status, budget: item.budget, definition_ref: item.definition_ref, executor_ref: item.executor_ref })) });
export const budgetRemaining = (task: Task, budget: ExecutionBudget, now: string) => ({
  attempts: Math.max(0, budget.max_attempts - task.usage.attempts_consumed + (task.usage.attempts_released ?? 0) - (task.usage.attempt_releases_reversed ?? 0)),
  elapsed_ms: Math.max(0, budget.max_elapsed_ms - (task.usage.first_started_at ? Math.max(0, Date.parse(now) - Date.parse(task.usage.first_started_at)) : 0)),
  cost_micros: !budget.max_cost || !task.usage.cost_known || (task.usage.cost_currency && task.usage.cost_currency !== budget.max_cost.currency) ? null : Math.max(0, budget.max_cost.amount_micros - (task.usage.cost_consumed_micros ?? 0) - (task.usage.cost_reserved_micros ?? 0))
});
const budgetProblem = (task: Task, budget: ExecutionBudget, now: string): string | undefined => {
  if (task.usage.pending_reconciliation || !task.usage.cost_known) return "用量或在途动作尚未核对";
  const left = budgetRemaining(task, budget, now);
  if (!left.attempts || !left.elapsed_ms || (budget.max_cost && (left.cost_micros === null || left.cost_micros <= 0))) return "累计次数、经过时间或费用预算已耗尽 / 币种不符";
};
const budgetFits = (requested: ExecutionBudget, limit: ExecutionBudget) => requested.max_attempts <= limit.max_attempts && requested.max_elapsed_ms <= limit.max_elapsed_ms &&
  (!limit.max_cost || (!!requested.max_cost && requested.max_cost.currency === limit.max_cost.currency && requested.max_cost.amount_micros <= limit.max_cost.amount_micros));
const activeGrantProblem = (reader: Reader, grant: StandingAuthorizationVersion, now: string): string | undefined => {
  const authorization = reader.getExecutionObject("standing_authorization", grant.authorization_id);
  if (!authorization || authorization.status !== "Active" || !equal(authorization.current_version_ref, { object_type: "standing_authorization_version", id: grant.id, domain_version: grant.version })) return "常规授权已撤销或不是当前版本";
  if (Date.parse(now) < Date.parse(grant.body.valid_from) || Date.parse(now) >= Date.parse(grant.body.expires_at)) return "常规授权未生效或已过期";
  if (!scopedAssignment(reader, grant.grantor_actor_id, "policy_owner", grant.body.scope, now, grant.policy_assignment_ref.id) ||
    !scopedAssignment(reader, grant.grantor_actor_id, "technical_owner", grant.body.scope, now, grant.technical_assignment_ref.id)) return "常规授权授予者的责任指派已失效";
};
const definitionFor = (reader: Reader, task: Task): TaskDefinitionRecord | undefined => {
  const definition = reader.getExecutionRecord("task_definition", task.definition_ref.id), change = reader.getChange(task.change_id);
  const plan = change?.plan_ref ? reader.getIntentRecord("plan_version", change.plan_ref.id) : undefined;
  if (!definition || definition.task_id !== task.id || definition.version !== task.definition_ref.domain_version || definition.change_id !== task.change_id || definition.project_id !== task.project_id ||
    !equal(definition.content_digest, contentDigest(definition.body)) || !equal(task.plan_ref, change?.plan_ref) || !equal(task.contract_ref, change?.contract_ref) ||
    !plan?.body.task_definitions.some(item => equal(item, definition.body))) return undefined;
  return definition;
};
const dependencyProblem = (reader: Reader, definition: TaskDefinitionRecord, change: Change): string | undefined => {
  if (definition.body.dependencies.some(id => { const task = reader.getExecutionObject("task", id); return !task || task.change_id !== change.id || !currentTaskEvaluation(reader, task); })) return "任务依赖尚无真实满足结论";
  const plan = reader.getIntentRecord("plan_version", change.plan_ref!.id)!;
  if (plan.body.dependencies.some(dep => { const other = reader.getChange(dep.change_id); return !other || !equal(other.contract_ref, dep.contract_ref) ||
    !(other.lifecycle_state === "Completed" || (dep.required_state === "ready_for_delivery" && other.lifecycle_state === "ReadyForDelivery" && other.operating_status === "Active")); })) return "需求依赖尚未满足固定条件";
};
const basisProblem = (reader: Reader, item: WorkItem, now: string): string | undefined => {
  const basis = item.authorization_basis_refs[0]!;
  if (basis.object_type === "standing_authorization_version") {
    const grant = reader.getExecutionRecord("standing_authorization_version", basis.id);
    if (!grant || grant.version !== basis.domain_version) return "常规授权依据不存在";
    const inactive = activeGrantProblem(reader, grant, now); if (inactive) return inactive;
    const definition = reader.getExecutionRecord("task_definition", item.definition_ref.id), contract = reader.getIntentRecord("contract_version", item.contract_ref.id);
    const risk = contract ? reader.getIntentRecord("risk_assessment", contract.risk_ref.id) : undefined;
    if (!definition || !risk || risk.level !== "ordinary" || !(sameScope(grant.body.scope, item.scope) || (grant.body.scope.kind === "project" && grant.body.scope.id === item.project_id)) ||
      !grant.body.executor_actor_ids.includes(item.executor_ref.id) || !grant.body.risk_conditions.allowed_purposes.some(purpose => purpose === definition.body.purpose) ||
      item.allowed_actions.some(action => !grant.body.allowed_actions.includes(action)) || item.allowed_resources.some(path => !grant.body.allowed_resources.some(bound => resourceContains(bound, path))) || !budgetFits(item.budget, grant.body.limits)) return "当前常规授权不覆盖执行单";
    return;
  }
  const grant = reader.getExecutionRecord("work_item_authorization_record", basis.id);
  if (!grant || grant.work_item_id !== item.id || grant.task_id !== item.task_id || grant.change_id !== item.change_id ||
    !equal(grant.definition_ref, item.definition_ref) || !equal(grant.contract_ref, item.contract_ref) || !equal(grant.plan_ref, item.plan_ref) ||
    !equal(grant.executor_ref, item.executor_ref) || !equal(grant.allowed_actions, item.allowed_actions) || !equal(grant.allowed_resources, item.allowed_resources) || !equal(grant.budget, item.budget) || !equal(grant.stop_conditions, item.stop_conditions) ||
    !scopedAssignment(reader, grant.grantor_actor_id, "technical_owner", item.scope, now, grant.assignment_ref.id)) return "具体授权与当前指派不符";
};
export const executionReadiness = (reader: Reader, task: Task, now: string, forEvaluation = false): ExecutionShowResult["readiness"][number] => {
  const reasons: string[] = [], definition = definitionFor(reader, task), change = reader.getChange(task.change_id), item = task.active_work_item_ref ? reader.getExecutionObject("work_item", task.active_work_item_ref.id) : undefined;
  if (!["Pending", "InProgress"].includes(task.status)) reasons.push("TASK_STATE_INVALID");
  if (!definition) reasons.push("BASELINE_MISMATCH");
  if (!change || change.operating_status !== "Active" || change.lifecycle_state !== "Executing") reasons.push("CHANGE_NOT_EXECUTING");
  if (definition && change) { const problem = dependencyProblem(reader, definition, change); if (problem) reasons.push(problem); }
  if (!item) reasons.push("WORK_ITEM_REQUIRED");
  else {
    if (item.task_id !== task.id || item.status !== "Ready" || !equal(item.definition_ref, task.definition_ref) || !equal(item.plan_ref, task.plan_ref) || !equal(item.contract_ref, task.contract_ref)) reasons.push("WORK_ITEM_STATE_INVALID");
    const settledRun = forEvaluation && !task.usage.pending_reconciliation && task.usage.cost_known && reader.listRuns(task.change_id).some(run => run.task_id === task.id && run.work_item_ref.id === item.id && ["Succeeded", "Failed", "Cancelled"].includes(run.status) && run.cost_known);
    const grantProblem = basisProblem(reader, item, now), remainingProblem = settledRun ? undefined : budgetProblem(task, item.budget, now); if (grantProblem) reasons.push(grantProblem); if (remainingProblem) reasons.push(remainingProblem);
  }
  return { task_id: task.id, ready: !reasons.length, reasons, usage_digest: usageDigest(reader, task), budget_remaining: item ? budgetRemaining(task, item.budget, now) : null };
};

// The already reserved attempt owns its pending usage. Tool checks must still
// revalidate the same native baseline, dependencies and live authorization.
export const activeToolScopeProblems = (reader: Reader, task: Task, item: WorkItem, now: string): string[] => {
  const reasons: string[] = [], definition = definitionFor(reader, task), change = reader.getChange(task.change_id);
  if (task.status !== "InProgress" || item.status !== "Active" || task.active_work_item_ref?.id !== item.id ||
    item.task_id !== task.id || item.change_id !== task.change_id || item.project_id !== task.project_id ||
    !equal(item.definition_ref, task.definition_ref) || !equal(item.plan_ref, task.plan_ref) || !equal(item.contract_ref, task.contract_ref)) reasons.push("WORK_ITEM_STATE_INVALID");
  if (!definition) reasons.push("BASELINE_MISMATCH");
  if (!change || change.operating_status !== "Active" || change.lifecycle_state !== "Executing") reasons.push("CHANGE_NOT_EXECUTING");
  if (definition && change) { const problem = dependencyProblem(reader, definition, change); if (problem) reasons.push(problem); }
  const problem = basisProblem(reader, item, now); if (problem) reasons.push(problem);
  if (!Number.isFinite(Date.parse(now)) || !task.usage.cost_known || budgetRemaining(task, item.budget, now).elapsed_ms <= 0 ||
    task.usage.attempts_consumed - (task.usage.attempts_released ?? 0) + (task.usage.attempt_releases_reversed ?? 0) > item.budget.max_attempts ||
    (item.budget.max_cost && ((task.usage.cost_currency && task.usage.cost_currency !== item.budget.max_cost.currency) ||
      (task.usage.cost_consumed_micros ?? 0) >= item.budget.max_cost.amount_micros))) reasons.push("BUDGET_UNAVAILABLE");
  return reasons;
};

export const executeExecution = (tx: StoreTransaction, command: ExecutionCommand, context: IntentContext, planning?:PlanningClarificationPort): Mutation => {
  const mutation = (event_type: string, object_type: Mutation["aggregate"]["object_type"], id: string, revision: number, data: Record<string, unknown>, payload = data): Mutation =>
    ({ event_type, aggregate: { object_type, id } as Mutation["aggregate"], revision, data: data as Mutation["data"], payload });
  const checkRevision = (actual: number) => { if (actual !== command.expected_revision) fail(command, "REVISION_CONFLICT", "目标对象已变化"); };
  if (command.command_type === "PublishStandingAuthorization" || command.command_type === "RevokeStandingAuthorization") {
    const current = command.target.object_type === "standing_authorization" ? tx.getExecutionObject("standing_authorization", command.target.id) : undefined;
    if (command.target.object_type === "standing_authorization" && (!current || current.project_id !== context.project.id)) fail(command, "AUTHORIZATION_NOT_FOUND", "未找到当前项目授权");
    if (command.target.object_type === "project" && command.target.id !== context.project.id) fail(command, "SCOPE_INVALID", "不是当前项目");
    checkRevision(current?.revision ?? context.project.revision);
    const scope = command.command_type === "PublishStandingAuthorization" ? command.payload.body.scope : current!.scope;
    if (!((scope.kind === "project" && scope.id === context.project.id) || (scope.kind === "change" && tx.getChange(scope.id)?.project_id === context.project.id))) fail(command, "SCOPE_INVALID", "当前只支持项目或需求范围的本地研发授权");
    const policy = requireHuman(tx, command, "policy_owner", scope, context);
    if (command.command_type === "RevokeStandingAuthorization") {
      if (current!.status === "Revoked") fail(command, "AUTHORIZATION_REVOKED", "授权已经撤销");
      const revocation = { ...recordMeta(context), authorization_ref: current!.current_version_ref, affected_scope: scope, revoked_by: context.actorId, revoked_at: context.now, reason: command.payload.reason, assignment_ref: { object_type: "assignment" as const, id: policy.id } };
      const authorization = { ...current!, status: "Revoked" as const, revision: current!.revision + 1, updated_at: context.now };
      tx.insertExecutionRecord("authorization_revocation_record", revocation); tx.updateExecutionObject("standing_authorization", authorization, current!.revision);
      return mutation("StandingAuthorizationRevoked", "standing_authorization", authorization.id, authorization.revision, { authorization, revocation });
    }
    const body = command.payload.body, technical = scopedAssignment(tx, context.actorId, "technical_owner", scope, context.now);
    if (!technical) fail(command, "ROLE_NOT_ASSIGNED", "发布常规授权另需资源范围的Human技术责任", "forbidden");
    if ((current && !sameScope(current.scope, scope)) || !equal(command.payload.base_version_ref, current?.current_version_ref)) fail(command, "AUTHORIZATION_BASE_CONFLICT", "授权作用域或精确基准不符");
    if (body.allowed_resources.some(path => !resourceIsBounded(path))) fail(command, "RESOURCE_SCOPE_INVALID", "资源须为有界仓库相对路径或目录/**，不允许控制目录、绝对路径或越界");
    if (body.executor_actor_ids.some(id => tx.getActor(id)?.project_id !== context.project.id)) fail(command, "ACTOR_NOT_FOUND", "执行者须登记在当前项目");
    const validUtc = (value: string) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);
    if (!validUtc(body.valid_from) || !validUtc(body.expires_at) || Date.parse(body.valid_from) < Date.parse(context.now) || Date.parse(body.expires_at) <= Date.parse(body.valid_from) || Date.parse(body.expires_at) - Date.parse(context.now) > 30 * 86_400_000) fail(command, "INVALID_COMMAND", "授权不得回溯，需有效UTC期限且距提交不超过30天");
    const id = current?.id ?? context.id(), oldVersion = current ? tx.getExecutionRecord("standing_authorization_version", current.current_version_ref.id) : undefined;
    if (current && (!oldVersion || oldVersion.version !== current.current_version_ref.domain_version)) fail(command, "AUTHORIZATION_NOT_FOUND", "当前授权版本不存在");
    const version: StandingAuthorizationVersion = { ...recordMeta(context), authorization_id: id, version: (oldVersion?.version ?? 0) + 1, source_project_revision: context.project.revision, body, grantor_actor_id: context.actorId,
      policy_assignment_ref: { object_type: "assignment", id: policy.id }, technical_assignment_ref: { object_type: "assignment", id: technical!.id }, ...(current ? { predecessor_ref: current.current_version_ref } : {}) };
    const authorization = { ...(current ?? objectMeta(context, id)), scope, current_version_ref: { object_type: "standing_authorization_version" as const, id: version.id, domain_version: version.version }, status: "Active" as const,
      revision: (current?.revision ?? 0) + 1, updated_at: context.now };
    tx.insertExecutionRecord("standing_authorization_version", version); if (current) tx.updateExecutionObject("standing_authorization", authorization, current.revision); else tx.insertExecutionObject("standing_authorization", authorization);
    return mutation("StandingAuthorizationPublished", "standing_authorization", id, authorization.revision, { authorization, authorization_version: version });
  }
  if (command.command_type === "InitializePlanTasks") {
    const change = tx.getChange(command.target.id);
    if (!change || change.project_id !== context.project.id) fail(command, "CHANGE_NOT_FOUND", "需求不存在");
    checkRevision(change!.revision); requireHuman(tx, command, "technical_owner", { kind: "change", id: change!.id }, context);
    if (change!.operating_status !== "Active" || !["IntentReady", "Executing"].includes(change!.lifecycle_state) || !equal(change!.plan_ref, command.payload.plan_ref)) fail(command, "CHANGE_STATE_INVALID", "只能初始化有效正式计划中的需求任务");
    const problem = admissionFailure(tx, command, change!, false); if (problem) throw new IntentFailure(problem);
    const plan = tx.getIntentRecord("plan_version", change!.plan_ref!.id)!, tasks: Task[] = [], definitions: TaskDefinitionRecord[] = []; let changed = false;
    verifyPlanningClarification(tx,command,context.project,change!,plan.body,planning,tx.getIntentRecord('plan_proposal',plan.proposal_ref.id),plan);
    for (const body of plan.body.task_definitions) {
      const old = tx.getExecutionObject("task", body.task_id);
      if (old && (old.change_id !== change!.id || old.project_id !== change!.project_id)) fail(command, "SCOPE_INVALID", "任务ID不能被另一条需求复用");
      let definition = tx.listExecutionRecords("task_definition").find(item => item.task_id === body.task_id && item.version === body.version);
      if (definition && (!equal(definition.body, body) || definition.change_id !== change!.id)) fail(command, "BASELINE_MISMATCH", "固定任务定义版本内容不符");
      if (!definition) { definition = { ...recordMeta(context), task_id: body.task_id, version: body.version, change_id: change!.id, plan_ref: change!.plan_ref!, content_digest: contentDigest(body), body }; tx.insertExecutionRecord("task_definition", definition); }
      definitions.push(definition);
      const ref = { object_type: "task_definition" as const, id: definition.id, domain_version: definition.version };
      if (old && equal(old.definition_ref, ref) && equal(old.plan_ref, change!.plan_ref) && equal(old.contract_ref, change!.contract_ref)) { tasks.push(old); continue; }
      if (old && (old.status !== "Pending" || tx.listExecutionObjects("work_item", change!.id).some(item => item.task_id === old.id))) fail(command, "RECOVERY_CONDITIONS_UNMET", "已有执行或授权的任务须先受控处置，不能重新初始化");
      const task: Task = { ...(old ?? objectMeta(context, body.task_id)), change_id: change!.id, scope: body.scope, definition_ref: ref, contract_ref: change!.contract_ref!, plan_ref: change!.plan_ref!,
        status: "Pending", usage: old?.usage ?? { attempts_consumed: 0, cost_known: true, cost_consumed_micros: 0, pending_reconciliation: false }, revision: (old?.revision ?? 0) + 1, updated_at: context.now };
      if (old) tx.updateExecutionObject("task", task, old.revision); else tx.insertExecutionObject("task", task); tasks.push(task); changed = true;
    }
    for (const old of tx.listExecutionObjects("task", change!.id).filter(item => item.status !== "Cancelled" && !tasks.some(task => task.id === item.id))) {
      if (old.status !== "Pending" || tx.listExecutionObjects("work_item", change!.id).some(item => item.task_id === old.id)) fail(command, "RECOVERY_CONDITIONS_UNMET", "移除已授权任务须受控处置");
      const task = { ...old, status: "Cancelled" as const, revision: old.revision + 1, updated_at: context.now }; tx.updateExecutionObject("task", task, old.revision); tasks.push(task); changed = true;
    }
    if (!changed) fail(command, "TASKS_UNCHANGED", "当前正式计划的运行任务已经初始化");
    const next = { ...change!, revision: change!.revision + 1, updated_at: context.now }; tx.updateChange(next, change!.revision);
    return mutation("PlanTasksInitialized", "change", next.id, next.revision, { change: next, tasks, definitions }, { tasks, definitions });
  }
  const task = command.command_type === "CreateWorkItem" ? tx.getExecutionObject("task", command.target.id) : undefined;
  const existing = command.command_type === "RevokeWorkItem" ? tx.getExecutionObject("work_item", command.target.id) : undefined;
  if (command.command_type === "RevokeWorkItem") {
    if (!existing || existing.project_id !== context.project.id) fail(command, "WORK_ITEM_NOT_FOUND", "未找到执行授权");
    checkRevision(existing!.revision); requireHuman(tx, command, "technical_owner", existing!.scope, context);
    if (!["Ready", "Active"].includes(existing!.status)) fail(command, "WORK_ITEM_STATE_INVALID", "只撤销尚未关闭的授权");
    const currentTask = tx.getExecutionObject("task", existing!.task_id); if (!currentTask || currentTask.active_work_item_ref?.id !== existing!.id) fail(command, "BASELINE_MISMATCH", "任务与授权关联不符");
    const item: WorkItem = { ...existing!, status: "Revoked", revoked_at: context.now, revocation_reason: command.payload.reason, revision: existing!.revision + 1, updated_at: context.now };
    const { active_work_item_ref: _active, ...fields } = currentTask!;
    const next: Task = { ...fields, revision: currentTask!.revision + 1, updated_at: context.now, usage: { ...currentTask!.usage, pending_reconciliation: currentTask!.usage.pending_reconciliation || existing!.status === "Active" } };
    tx.updateExecutionObject("work_item", item, existing!.revision); tx.updateExecutionObject("task", next, currentTask!.revision);
    return mutation("WorkItemRevoked", "work_item", item.id, item.revision, { task: next, work_item: item });
  }
  if (!task || task.project_id !== context.project.id) fail(command, "TASK_NOT_FOUND", "未找到当前项目任务");
  checkRevision(task!.revision); const current = task!, change = tx.getChange(current.change_id), definition = definitionFor(tx, current);
  if (!change || change.operating_status !== "Active" || change.lifecycle_state !== "Executing") fail(command, "CHANGE_STATE_INVALID", "需求须先正式开工且未暂停");
  if (!definition || !equal(command.payload.definition_ref, current.definition_ref)) fail(command, "BASELINE_MISMATCH", "任务定义或当前正式基准不符");
  if (!["Pending", "InProgress"].includes(current.status)) fail(command, "TASK_STATE_INVALID", "任务不接受新的执行授权");
  if (current.active_work_item_ref || tx.listExecutionObjects("work_item", current.change_id).some(item => item.task_id === current.id && ["Ready", "Active"].includes(item.status))) fail(command, "WORK_ITEM_ALREADY_OPEN", "任务已有未关闭授权");
  const baselineProblem = admissionFailure(tx, command, change!, true); if (baselineProblem) throw new IntentFailure(baselineProblem);
  const dependency = dependencyProblem(tx, definition!, change!); if (dependency) fail(command, "DEPENDENCY_UNSATISFIED", dependency);
  const input = command.payload, executor = tx.getActor(input.executor_ref.id), history = tx.listExecutionObjects("work_item", current.change_id).filter(item => item.task_id === current.id);
  if (!executor || executor.project_id !== context.project.id) fail(command, "ACTOR_NOT_FOUND", "执行者未在当前项目登记");
  if (input.allowed_resources.some(path => !resourceIsBounded(path))) fail(command, "RESOURCE_SCOPE_INVALID", "授权资源不是有界仓库路径");
  if (definition!.body.purpose === "release_operation") fail(command, "CAPABILITY_UNAVAILABLE", "发布任务须等待环境与发布授权接通");
  if (input.allowed_actions.includes("edit_files") && (definition!.body.purpose === "verification" || input.allowed_resources.some(path => !definition!.body.allowed_changes.some(bound => resourceContains(bound, path))))) fail(command, "CAPABILITY_PERMISSION_DENIED", "修改资源超出任务定义或验证任务只读边界", "forbidden");
  const independent = definition!.body.purpose === "verification" && definition!.body.verification.mode === "independent";
  // Solo mode only exempts the sole project Human from the identity conflict.
  const solo = executor!.actor_type === "human" && tx.listActors().filter(actor => actor.project_id === current.project_id && actor.actor_type === "human").length === 1;
  if (!solo && tx.listExecutionObjects("work_item", current.change_id).some(item => item.executor_ref.id === input.executor_ref.id && (independent ? tx.getExecutionRecord("task_definition", item.definition_ref.id)?.body.purpose === "implementation" : definition!.body.purpose === "implementation" && item.independence_required))) fail(command, "INDEPENDENCE_REQUIRED", "实施与独立验证不能授权给同一执行身份", "forbidden");
  const remainingProblem = budgetProblem(current, input.budget, context.now); if (remainingProblem) fail(command, current.usage.pending_reconciliation || !current.usage.cost_known ? "EXTERNAL_RESULT_UNKNOWN" : "BUDGET_EXCEEDED", remainingProblem);
  const digest = usageDigest(tx, current);
  if (input.acknowledged_usage_digest && !equal(input.acknowledged_usage_digest, digest)) fail(command, "INPUT_CHANGED", "累计用量与既有授权已变化");
  let specific: WorkItemAuthorizationRecord | undefined, basis: WorkItem["authorization_basis_refs"][number]; const itemId = context.id();
  if (input.standing_authorization_ref) {
    if (command.acting_role !== "executor" || context.actorId !== executor!.id) fail(command, "EXECUTOR_NOT_ALLOWED", "常规授权由绑定执行者本人使用，不代行Human技术责任", "forbidden");
    const grant = tx.getExecutionRecord("standing_authorization_version", input.standing_authorization_ref.id);
    if (!grant || grant.project_id !== context.project.id || grant.version !== input.standing_authorization_ref.domain_version) fail(command, "AUTHORIZATION_NOT_FOUND", "精确常规授权版本不存在");
    const invalid = activeGrantProblem(tx, grant!, context.now); if (invalid) fail(command, "AUTHORIZATION_REVOKED", invalid, "forbidden");
    const contract = tx.getIntentRecord("contract_version", change!.contract_ref!.id)!, risk = tx.getIntentRecord("risk_assessment", contract.risk_ref.id)!;
    if (!(sameScope(grant!.body.scope, current.scope) || (grant!.body.scope.kind === "project" && grant!.body.scope.id === context.project.id)) || !grant!.body.executor_actor_ids.includes(executor!.id) || risk.level !== "ordinary" ||
      !grant!.body.risk_conditions.allowed_purposes.includes(definition!.body.purpose as StandingAuthorizationVersion["body"]["risk_conditions"]["allowed_purposes"][number]) ||
      input.allowed_actions.some(action => !grant!.body.allowed_actions.includes(action)) || input.allowed_resources.some(path => !grant!.body.allowed_resources.some(bound => resourceContains(bound, path))) || !budgetFits(input.budget, grant!.body.limits)) fail(command, "CAPABILITY_PERMISSION_DENIED", "常规授权不覆盖实际角色、范围、风险、动作或预算", "forbidden");
    if (history.some(item => item.status === "Revoked") || (history.length && !budgetFits(input.budget, history.at(-1)!.budget))) fail(command, "USAGE_ACKNOWLEDGEMENT_REQUIRED", "人工停止或增加既有额度需要新的具体Human授权，不能自动重新建单");
    basis = input.standing_authorization_ref;
  } else {
    const assignment = requireHuman(tx, command, "technical_owner", current.scope, context);
    if (history.length && !input.acknowledged_usage_digest) fail(command, "USAGE_ACKNOWLEDGEMENT_REQUIRED", "修复授权须明确核对累计用量及既有授权摘要");
    specific = { ...recordMeta(context), work_item_id: itemId, task_id: current.id, change_id: current.change_id, grantor_actor_id: context.actorId,
      assignment_ref: { object_type: "assignment", id: assignment.id }, acknowledged_usage_digest: digest, definition_ref: current.definition_ref, contract_ref: current.contract_ref, plan_ref: current.plan_ref,
      executor_ref: input.executor_ref, allowed_actions: input.allowed_actions, allowed_resources: input.allowed_resources, budget: input.budget, stop_conditions: input.stop_conditions, reason: input.reason };
    basis = { object_type: "work_item_authorization_record", id: specific.id };
  }
  const item: WorkItem = { ...objectMeta(context, itemId), task_id: current.id, change_id: current.change_id, scope: current.scope, definition_ref: current.definition_ref,
    contract_ref: current.contract_ref, plan_ref: current.plan_ref, executor_ref: input.executor_ref, authorization_basis_refs: [basis], policy_version: "work-item/1.0.0", allowed_actions: input.allowed_actions,
    allowed_resources: input.allowed_resources, budget: input.budget, inherited_usage: current.usage, stop_conditions: input.stop_conditions, independence_required: independent, status: "Ready" };
  const next: Task = { ...current, active_work_item_ref: { object_type: "work_item", id: item.id }, revision: current.revision + 1, updated_at: context.now };
  if (specific) tx.insertExecutionRecord("work_item_authorization_record", specific); tx.insertExecutionObject("work_item", item); tx.updateExecutionObject("task", next, current.revision);
  return mutation("WorkItemCreated", "task", next.id, next.revision, { task: next, work_item: item }, { task: next, work_item: item, ...(specific ? { authorization: specific } : {}) });
};
