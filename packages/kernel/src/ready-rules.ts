export interface TaskReadyInput {
  lifecycle_state: "Draft" | "IntentReady" | "Planned" | "Executing";
  task: { key: string; dependencies: readonly string[] };
  completed_task_keys: readonly string[];
  has_open_blocker: boolean;
  has_contract: boolean;
  has_plan: boolean;
  has_policy_snapshot: boolean;
  permission_scope: readonly string[];
  budget?: { max_duration_ms: number; max_retries: number };
  stop_conditions: readonly string[];
}

export const evaluateTaskReady = (input: TaskReadyInput): { ready: boolean; reason?: string } => {
  if (input.lifecycle_state !== "Planned" && input.lifecycle_state !== "Executing") {
    return { ready: false, reason: "change_not_planned" };
  }
  if (!input.has_contract || !input.has_plan || !input.has_policy_snapshot) {
    return { ready: false, reason: "authorization_incomplete" };
  }
  if (input.has_open_blocker) return { ready: false, reason: "blocker_open" };
  if (input.permission_scope.length === 0) return { ready: false, reason: "permission_scope_empty" };
  if (!input.budget || input.budget.max_duration_ms < 1) return { ready: false, reason: "budget_missing" };
  if (input.stop_conditions.length === 0) return { ready: false, reason: "stop_conditions_missing" };
  if (!input.task.dependencies.every((dependency) => input.completed_task_keys.includes(dependency))) {
    return { ready: false, reason: "dependencies_unsatisfied" };
  }
  return { ready: true };
};
