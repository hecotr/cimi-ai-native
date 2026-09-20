export interface TaskDagNode {
  key: string;
  dependencies: string[];
}

export type TaskDagFailureCode =
  | "PLAN_TASK_KEY_DUPLICATE"
  | "PLAN_TASK_DEPENDENCY_MISSING"
  | "PLAN_TASK_SELF_DEPENDENCY"
  | "PLAN_TASK_CYCLE";

export type TaskDagResult =
  | { ok: true }
  | { ok: false; code: TaskDagFailureCode; cycle_task_ids?: string[] };

export const validateTaskDag = (tasks: TaskDagNode[]): TaskDagResult => {
  const keys = tasks.map((task) => task.key);
  if (new Set(keys).size !== keys.length) {
    return { ok: false, code: "PLAN_TASK_KEY_DUPLICATE" };
  }
  const known = new Set(keys);
  for (const task of tasks) {
    if (task.dependencies.includes(task.key)) {
      return { ok: false, code: "PLAN_TASK_SELF_DEPENDENCY" };
    }
    if (task.dependencies.some((dependency) => !known.has(dependency))) {
      return { ok: false, code: "PLAN_TASK_DEPENDENCY_MISSING" };
    }
  }

  const incoming = new Map<string, number>(keys.map((key) => [key, 0]));
  const outgoing = new Map<string, string[]>(keys.map((key) => [key, []]));
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      outgoing.get(dependency)?.push(task.key);
      incoming.set(task.key, (incoming.get(task.key) ?? 0) + 1);
    }
  }

  const queue = keys.filter((key) => incoming.get(key) === 0);
  const resolved = new Set<string>();
  while (queue.length > 0) {
    const key = queue.shift();
    if (!key) break;
    resolved.add(key);
    for (const next of outgoing.get(key) ?? []) {
      const remaining = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  if (resolved.size !== keys.length) {
    return {
      ok: false,
      code: "PLAN_TASK_CYCLE",
      cycle_task_ids: keys.filter((key) => !resolved.has(key)).sort()
    };
  }
  return { ok: true };
};
