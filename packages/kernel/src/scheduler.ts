import type { Task, WorkItem } from "@cimiloop/protocol";
import { evaluateTaskReady, type TaskReadyInput } from "./ready-rules.js";
import { defaultExecutionAuthorization } from "./work-item.js";

export const completedTaskKeys = (tasks: readonly Task[], workItems: readonly WorkItem[]): string[] => {
  const completedTaskIds = new Set(
    workItems
      .filter((item) => item.kind === "execution" && item.status === "completed" && item.task_id)
      .map((item) => item.task_id as string)
  );
  return tasks.filter((task) => completedTaskIds.has(task.id)).map((task) => task.key);
};

export const hasOpenExecutionWorkItem = (workItems: readonly WorkItem[], taskId: string): boolean =>
  workItems.some(
    (item) =>
      (item.kind === "execution" || item.kind === "repair") &&
      item.task_id === taskId &&
      (item.status === "created" || item.status === "ready" || item.status === "claimed" || item.status === "running")
  );

export const selectReadyTasks = (
  lifecycleState: TaskReadyInput["lifecycle_state"],
  tasks: readonly Task[],
  workItems: readonly WorkItem[],
  facts: {
    has_open_blocker: boolean;
    has_contract: boolean;
    has_plan: boolean;
    has_policy_snapshot: boolean;
  }
): Task[] => {
  const completed = completedTaskKeys(tasks, workItems);
  const authorization = defaultExecutionAuthorization();
  return tasks.filter((task) => {
    if (hasOpenExecutionWorkItem(workItems, task.id)) return false;
    return evaluateTaskReady({
      lifecycle_state: lifecycleState,
      task,
      completed_task_keys: completed,
      ...facts,
      ...authorization
    }).ready;
  });
};
