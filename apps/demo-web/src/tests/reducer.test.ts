import { describe, expect, it } from "vitest";
import {
  approveContract,
  approveRelease,
  completeAgentRun,
  completeDeployment,
  completeRepair,
  createDraftChange,
  jumpToScene,
  resetDemo,
  startClarification,
  startCreate,
  startRepair,
  submitRelease
} from "../demo/commands";
import { reduce, reduceMany } from "../demo/reducer";
import {
  ARTIFACT_DIGEST,
  ARTIFACT_ID,
  createInitialState,
  DEFAULT_CHANGE_INPUT,
  MAIN_CHANGE_ID,
  PROD_ENV,
  REPAIR_EVIDENCE_ID
} from "../demo/scenario";

describe("demo reducer", () => {
  it("accepts the legal create-to-close command path", () => {
    const result = reduceMany(createInitialState(), [
      startCreate(),
      createDraftChange(DEFAULT_CHANGE_INPUT),
      startClarification(),
      approveContract(),
      completeAgentRun(),
      startRepair(),
      completeRepair(),
      submitRelease(),
      approveRelease(),
      completeDeployment()
    ]);

    expect(result.rejection).toBeNull();
    expect(result.state.scene).toBe("delivery_closed");
    expect(result.state.mainChange.lifecycleState).toBe("DeliveryClosed");
    expect(result.state.mainChange.flowCondition).toBe("Completed");
  });

  it("moves through each expected scene", () => {
    let state = createInitialState();
    expect(state.scene).toBe("workbench");
    expect(state.changes.some((item) => item.id === MAIN_CHANGE_ID)).toBe(false);

    state = reduce(state, startCreate()).state;
    expect(state.scene).toBe("create_change");

    state = reduce(state, createDraftChange(DEFAULT_CHANGE_INPUT)).state;
    expect(state.scene).toBe("draft_clarify");
    expect(state.mainChange.lifecycleState).toBe("Draft");
    expect(state.contract.status).toBe("None");

    state = reduce(state, startClarification()).state;
    expect(state.scene).toBe("contract_decision");
    expect(state.mainChange.lifecycleState).toBe("IntentReady");

    const approved = reduce(state, approveContract());
    expect(approved.event?.headline).toContain("DEC-1042");
    expect(approved.event?.lines.join(" ")).toContain("ALLOW");
    expect(approved.state.scene).toBe("agent_running");

    state = reduce(approved.state, completeAgentRun()).state;
    expect(state.scene).toBe("evaluation_failed");
    expect(state.gateVerdict).toBe("NEED_MORE_EVIDENCE");

    state = reduce(state, startRepair()).state;
    expect(state.repairStarted).toBe(true);
    expect(state.scene).toBe("evaluation_failed");

    state = reduce(state, completeRepair()).state;
    expect(state.scene).toBe("repair_verified");

    state = reduce(state, submitRelease()).state;
    expect(state.scene).toBe("release_decision");

    state = reduce(state, approveRelease()).state;
    expect(state.releaseApproved).toBe(true);

    state = reduce(state, completeDeployment()).state;
    expect(state.scene).toBe("delivery_closed");
  });

  it("rejects illegal commands with a visible reason", () => {
    const initial = createInitialState();
    expect(reduce(initial, approveContract()).rejection).toMatch(/Contract Decision/);
    expect(reduce(initial, completeAgentRun()).rejection).toMatch(/Agent Run/);
    expect(reduce(initial, startRepair()).rejection).toMatch(/评价失败/);
    expect(reduce(initial, completeRepair()).rejection).toMatch(/Repair Work Item/);
    expect(reduce(initial, completeDeployment()).rejection).toMatch(/批准绑定指定 Artifact/);
  });

  it("rejects a release approval when the artifact digest does not match", () => {
    const state = reduceMany(createInitialState(), [
      jumpToScene("release_decision")
    ]).state;
    const rejected = reduce(state, approveRelease({ artifactDigest: "sha256:dead…beef" }));
    expect(rejected.rejection).toBe("当前 Artifact Digest 与 Decision Request 不一致");
    expect(rejected.state.scene).toBe("release_decision");
    expect(rejected.state.releaseApproved).toBe(false);
  });

  it("binds the release decision to the exact artifact, digest and environment", () => {
    const state = reduce(createInitialState(), jumpToScene("release_decision")).state;
    expect(state.decisionRequest?.artifactId).toBe(ARTIFACT_ID);
    expect(state.decisionRequest?.artifactDigest).toBe(ARTIFACT_DIGEST);
    expect(state.decisionRequest?.environment).toBe(PROD_ENV);
    const approved = reduce(state, approveRelease());
    expect(approved.rejection).toBeNull();
    expect(approved.state.release.artifactId).toBe(ARTIFACT_ID);
    expect(approved.state.release.artifactDigest).toBe(ARTIFACT_DIGEST);
    expect(approved.state.release.environment).toBe(PROD_ENV);
  });

  it("keeps CLM-02 insufficient until repair evidence is added", () => {
    const failed = reduce(createInitialState(), jumpToScene("evaluation_failed")).state;
    const claim = failed.claims.find((item) => item.id === "CLM-02");
    expect(claim?.status).toBe("Insufficient");
    expect(failed.evidence.some((item) => item.id === REPAIR_EVIDENCE_ID)).toBe(false);

    const repaired = reduceMany(failed, [startRepair(), completeRepair()]).state;
    const repairedClaim = repaired.claims.find((item) => item.id === "CLM-02");
    expect(repairedClaim?.status).toBe("Satisfied");
    expect(repaired.evidence.some((item) => item.id === REPAIR_EVIDENCE_ID)).toBe(true);
  });

  it("records release verification and closure events after deployment", () => {
    const closed = reduce(createInitialState(), jumpToScene("delivery_closed")).state;
    const titles = closed.timeline.map((item) => item.title);
    expect(titles).toContain("发布验证");
    expect(titles).toContain("关闭");
  });

  it("resets back to the fixed workbench snapshot", () => {
    const mid = reduceMany(createInitialState(), [
      startCreate(),
      createDraftChange(DEFAULT_CHANGE_INPUT),
      startClarification(),
      approveContract()
    ]).state;
    const reset = reduce(mid, resetDemo()).state;
    const initial = createInitialState();
    expect(reset.scene).toBe("workbench");
    expect(reset.mainChange).toEqual(initial.mainChange);
    expect(reset.claims).toEqual(initial.claims);
    expect(reset.timeline).toEqual(initial.timeline);
    expect(reset.draftChange).toBeNull();
  });

  it("can jump to any of the nine scenes", () => {
    const scenes = [
      "workbench",
      "create_change",
      "draft_clarify",
      "contract_decision",
      "agent_running",
      "evaluation_failed",
      "repair_verified",
      "release_decision",
      "delivery_closed"
    ] as const;
    for (const scene of scenes) {
      const state = reduce(createInitialState(), jumpToScene(scene)).state;
      expect(state.scene).toBe(scene);
    }
  });
});
