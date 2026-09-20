import { describe, expect, it } from "vitest";
import { evaluateTaskReady } from "../src/ready-rules.js";

const task = (key: string, dependencies: string[] = []) => ({
  key,
  kind: "implementation" as const,
  dependencies
});

describe("M2 ready rules", () => {
  it("requires Planned or Executing, satisfied dependencies, clear authorization and no blocker", () => {
    expect(
      evaluateTaskReady({
        lifecycle_state: "Planned",
        task: task("implement"),
        completed_task_keys: [],
        has_open_blocker: false,
        has_contract: true,
        has_plan: true,
        has_policy_snapshot: true,
        permission_scope: ["workspace.write"],
        budget: { max_duration_ms: 60_000, max_retries: 1 },
        stop_conditions: ["timeout"]
      })
    ).toEqual({ ready: true });

    expect(
      evaluateTaskReady({
        lifecycle_state: "Draft",
        task: task("implement"),
        completed_task_keys: [],
        has_open_blocker: false,
        has_contract: true,
        has_plan: true,
        has_policy_snapshot: true,
        permission_scope: ["workspace.write"],
        budget: { max_duration_ms: 60_000, max_retries: 1 },
        stop_conditions: ["timeout"]
      }).ready
    ).toBe(false);

    expect(
      evaluateTaskReady({
        lifecycle_state: "Planned",
        task: task("verify", ["implement"]),
        completed_task_keys: [],
        has_open_blocker: false,
        has_contract: true,
        has_plan: true,
        has_policy_snapshot: true,
        permission_scope: ["workspace.write"],
        budget: { max_duration_ms: 60_000, max_retries: 1 },
        stop_conditions: ["timeout"]
      }).ready
    ).toBe(false);

    expect(
      evaluateTaskReady({
        lifecycle_state: "Planned",
        task: task("implement"),
        completed_task_keys: [],
        has_open_blocker: true,
        has_contract: true,
        has_plan: true,
        has_policy_snapshot: true,
        permission_scope: ["workspace.write"],
        budget: { max_duration_ms: 60_000, max_retries: 1 },
        stop_conditions: ["timeout"]
      }).ready
    ).toBe(false);

    expect(
      evaluateTaskReady({
        lifecycle_state: "Planned",
        task: task("implement"),
        completed_task_keys: [],
        has_open_blocker: false,
        has_contract: true,
        has_plan: true,
        has_policy_snapshot: true,
        permission_scope: [],
        budget: { max_duration_ms: 60_000, max_retries: 1 },
        stop_conditions: ["timeout"]
      }).ready
    ).toBe(false);
  });
});
