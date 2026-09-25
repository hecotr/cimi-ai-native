import {
  applyReleaseApproved,
  applyRepairStarted,
  ARTIFACT_DIGEST,
  ARTIFACT_ID,
  buildSceneState,
  createInitialState,
  MAIN_CHANGE_ID,
  PROD_ENV
} from "./scenario";
import type { DemoCommand, DemoState, ReduceResult, StructuredEvent } from "./types";

function succeed(state: DemoState, event: StructuredEvent | null): ReduceResult {
  return {
    state: {
      ...state,
      revision: state.revision + 1,
      lastEvent: event,
      lastRejection: null
    },
    rejection: null,
    event
  };
}

function reject(state: DemoState, reason: string): ReduceResult {
  return {
    state: {
      ...state,
      lastRejection: reason
    },
    rejection: reason,
    event: null
  };
}

function jump(sceneState: DemoState, event: StructuredEvent | null, revision: number): ReduceResult {
  return {
    state: {
      ...sceneState,
      revision: revision + 1,
      lastEvent: event,
      lastRejection: null
    },
    rejection: null,
    event
  };
}

export function reduce(state: DemoState, command: DemoCommand): ReduceResult {
  switch (command.type) {
    case "RESET_DEMO":
      return jump(createInitialState(), { headline: "Demo reset", lines: ["已恢复固定初始状态。"] }, state.revision);

    case "JUMP_TO_SCENE":
      return jump(buildSceneState(command.scene), null, state.revision);

    case "START_CREATE":
    case "OPEN_CHANGE":
      if (state.scene !== "workbench") {
        return reject(state, "只有在工作台才能开始创建订单导出 Change。");
      }
      return jump(
        buildSceneState("create_change"),
        {
          headline: "Start creating CHG-0242",
          lines: ["先建立责任边界。", "不要一次填完整份契约。"]
        },
        state.revision
      );

    case "START_CLARIFICATION":
      if (state.scene !== "draft_clarify") {
        return reject(state, "只有在 Draft Change 上才能开始澄清。");
      }
      return jump(
        buildSceneState("contract_decision"),
        {
          headline: "Contract v1 submitted for review.",
          lines: ["目标、范围、非目标和五项验收标准已整理。", "Current Focus：审阅 Contract v1。"]
        },
        state.revision
      );

    case "APPROVE_CONTRACT":
      if (state.scene !== "contract_decision") {
        return reject(state, "当前没有待批准的 Contract Decision。");
      }
      return jump(
        buildSceneState("agent_running"),
        {
          headline: "Decision DEC-1042 recorded as Technical Owner.",
          lines: ["Gate re-evaluated: ALLOW.", "Change transitioned to Executing."]
        },
        state.revision
      );

    case "REQUEST_CONTRACT_CHANGES":
      if (state.scene !== "contract_decision") {
        return reject(state, "当前没有待处理的 Contract Decision。");
      }
      return succeed(state, {
        headline: "Decision DEC-1042 recorded as request_changes.",
        lines: ["Change remains IntentReady.", "同一 Contract Candidate 可继续修订。"]
      });

    case "REJECT_CONTRACT":
      if (state.scene !== "contract_decision") {
        return reject(state, "当前没有待处理的 Contract Decision。");
      }
      return succeed(state, {
        headline: "Decision DEC-1042 recorded as reject.",
        lines: ["Change remains IntentReady and is now Paused.", "演示主路径未展开拒绝后的分支。"]
      });

    case "COMPLETE_AGENT_RUN":
      if (state.scene !== "agent_running") {
        return reject(state, "当前没有正在执行的 Agent Run。");
      }
      return jump(
        buildSceneState("evaluation_failed"),
        {
          headline: "RUN-7741 succeeded.",
          lines: ["Artifact candidate published.", "Independent evaluation blocked on CLM-02.", "Gate: NEED_MORE_EVIDENCE."]
        },
        state.revision
      );

    case "START_REPAIR":
      if (state.scene !== "evaluation_failed") {
        return reject(state, "只有在评价失败后才能创建 Repair Work Item。");
      }
      if (state.repairStarted) {
        return reject(state, "Repair Work Item 已经存在。");
      }
      return succeed(
        {
          ...applyRepairStarted(state),
          timeline: [
            ...state.timeline,
            {
              id: "EVT-08",
              at: "2026-09-21 09:52",
              title: "Repair",
              detail: "创建 Repair Work Item WI-8820，补齐 CLM-02。",
              category: "repair",
              runId: "RUN-7749"
            }
          ]
        },
        {
          headline: "Repair Work Item WI-8820 created.",
          lines: ["目标：补齐 CLM-02 权限反例测试。", "Change 仍停留在 Evaluating / Blocked。"]
        }
      );

    case "COMPLETE_REPAIR":
      if (state.scene !== "evaluation_failed" || !state.repairStarted) {
        return reject(state, "需要先创建 Repair Work Item，才能完成修复验证。");
      }
      return jump(
        buildSceneState("repair_verified"),
        {
          headline: "CLM-02 is now Satisfied.",
          lines: ["Evidence EVD-2207 权限反例测试通过。", "Gate re-evaluated: ALLOW.", "Change transitioned to TestValidating."]
        },
        state.revision
      );

    case "SUBMIT_RELEASE":
      if (state.scene !== "repair_verified") {
        return reject(state, "当前尚未准备好生产发布包。");
      }
      return jump(
        buildSceneState("release_decision"),
        {
          headline: "Release package submitted.",
          lines: [`Artifact ${ARTIFACT_ID}`, `Digest ${ARTIFACT_DIGEST}`, `Environment ${PROD_ENV}`]
        },
        state.revision
      );

    case "APPROVE_RELEASE": {
      if (state.scene !== "release_decision") {
        return reject(state, "当前没有待批准的 Release Decision。");
      }
      if (state.releaseApproved) {
        return reject(state, "该 Release Decision 已经批准。");
      }
      const digest = command.artifactDigest ?? ARTIFACT_DIGEST;
      const artifactId = command.artifactId ?? ARTIFACT_ID;
      const environment = command.environment ?? PROD_ENV;
      if (digest !== ARTIFACT_DIGEST) {
        return reject(state, "当前 Artifact Digest 与 Decision Request 不一致");
      }
      if (artifactId !== ARTIFACT_ID) {
        return reject(state, "当前 Artifact 与 Decision Request 不一致");
      }
      if (environment !== PROD_ENV) {
        return reject(state, "当前 Environment 与 Decision Request 不一致");
      }
      return succeed(
        {
          ...applyReleaseApproved(state),
          openDecision: false,
          timeline: [
            ...state.timeline,
            {
              id: "EVT-12",
              at: "2026-09-21 10:22",
              title: "Release Decision",
              detail: "DEC-1108 记录为 Release Owner。Gate 重新求值 ALLOW。",
              category: "release"
            }
          ]
        },
        {
          headline: "Decision DEC-1108 recorded as Release Owner.",
          lines: ["Gate re-evaluated: ALLOW.", "Change transitioned to ProductionDeploying."]
        }
      );
    }

    case "REQUEST_RELEASE_CHANGES":
      if (state.scene !== "release_decision" || state.releaseApproved) {
        return reject(state, "当前没有待处理的 Release Decision。");
      }
      return succeed(state, {
        headline: "Decision DEC-1108 recorded as request_changes.",
        lines: ["Change remains ReleaseReady.", "演示主路径未展开修订后的分支。"]
      });

    case "REJECT_RELEASE":
      if (state.scene !== "release_decision" || state.releaseApproved) {
        return reject(state, "当前没有待处理的 Release Decision。");
      }
      return succeed(state, {
        headline: "Decision DEC-1108 recorded as reject.",
        lines: ["Change remains ReleaseReady and is now Paused.", "演示主路径未展开拒绝后的分支。"]
      });

    case "COMPLETE_DEPLOYMENT":
      if (state.scene !== "release_decision" || !state.releaseApproved) {
        return reject(state, "需要先批准绑定指定 Artifact 的生产发布，才能完成部署。");
      }
      return jump(
        buildSceneState("delivery_closed"),
        {
          headline: "Deployment DEP-3301 verified.",
          lines: ["Digest matched.", "Health check passed.", "Core path passed.", "Change transitioned to DeliveryClosed."]
        },
        state.revision
      );

    case "CREATE_DRAFT_CHANGE": {
      if (state.scene !== "workbench" && state.scene !== "create_change") {
        return reject(state, "订单导出 Change 已经创建，当前不在创建步骤。");
      }
      const title = command.input.title.trim();
      if (!title) {
        return reject(state, "创建 Change 需要一个简短标题。");
      }
      const next = buildSceneState("draft_clarify");
      return jump(
        {
          ...next,
          mainChange: {
            ...next.mainChange,
            title
          },
          draftChange: {
            ...command.input,
            title,
            id: MAIN_CHANGE_ID,
            displayKey: MAIN_CHANGE_ID,
            createdAt: next.lastUpdatedAt
          }
        },
        {
          headline: `${MAIN_CHANGE_ID} created as Draft.`,
          lines: ["Change Owner 已指定。", "下一步是开始澄清，而不是立即实现。"]
        },
        state.revision
      );
    }
  }
}

export function reduceMany(state: DemoState, commands: DemoCommand[]): ReduceResult {
  let current = state;
  let last: ReduceResult = { state, rejection: null, event: null };
  for (const command of commands) {
    last = reduce(current, command);
    current = last.state;
    if (last.rejection) {
      return last;
    }
  }
  return last;
}
