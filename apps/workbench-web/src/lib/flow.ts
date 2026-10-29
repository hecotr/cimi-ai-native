import type { Change, ChangeDetail, DecisionRequestItem } from "../api/types";

/** The loop's stations, in the order a Change travels them. */
export const STATIONS = [
  { key: "clarify", name: "澄清", hint: "说清要解决的问题" },
  { key: "contract", name: "约定", hint: "确认目标与验收标准" },
  { key: "plan", name: "计划", hint: "拆成可执行的任务" },
  { key: "execute", name: "实施", hint: "Agent 在隔离分支修改" },
  { key: "verify", name: "验证", hint: "检查与独立评价" },
  { key: "deliver", name: "交付", hint: "可以合入与发布" }
] as const;
export type StationKey = (typeof STATIONS)[number]["key"];

/** Who currently holds the ball: the person at the keyboard, the Agent, or nobody. */
export type Holder = "human" | "agent" | "none";

export function stationIndex(change: Change, detail?: Pick<ChangeDetail, "intent" | "execution" | "verification">): number {
  switch (change.lifecycle_state) {
    case "Terminated": return -1;
    case "ReadyForDelivery": case "Completed": return 5;
    case "Executing": {
      const tasks = detail?.execution.tasks.filter(task => task.status !== "Cancelled") ?? [];
      const verifying = tasks.length > 0 && (tasks.every(task => task.status === "Satisfied") || (detail?.verification.evaluations.length ?? 0) > 0);
      return verifying ? 4 : 3;
    }
    case "IntentReady": return change.plan_ref ? 3 : 2;
    case "Draft": return change.contract_ref ? 2 : (detail?.intent.contract_proposals.length ?? 0) > 0 ? 1 : 0;
  }
}

export interface NextStep { holder: Holder; title: string; hint: string; tab: string }

const openRequests = (detail: ChangeDetail) => detail.intent.decision_requests.filter(item => item.status === "pending" || item.status === "approve");

export function nextStep(detail: ChangeDetail): NextStep {
  const { intent, execution, runs } = detail, change = intent.change;
  if (change.lifecycle_state === "Terminated") return { holder: "none", title: "已终止", hint: "这条需求不再推进。", tab: "overview" };
  if (change.lifecycle_state === "Completed") return { holder: "none", title: "已完成", hint: "交付已关闭。", tab: "overview" };
  if (change.lifecycle_state === "ReadyForDelivery") return { holder: "none", title: "已可交付", hint: "实施与验证均已完成，等待合入与发布。", tab: "verify" };
  if (change.operating_status === "Paused") return { holder: "human", title: "恢复推进", hint: "需求已暂停，恢复后才能继续。", tab: "overview" };

  const running = runs.runs.find(run => run.status === "Running" || run.status === "Reserved");
  if (running) return { holder: "agent", title: "Agent 正在实施", hint: "可在运行控制台实时查看进展，必要时停止。", tab: "execute" };

  const requests = openRequests(detail);
  const pending = requests.find(item => item.status === "pending");
  if (pending) return { holder: "human", title: `记录决定：${pending.request.action === "confirm_plan" ? "确认计划" : "确认约定"}`, hint: "核对候选内容后批准、要求修改或拒绝。", tab: pending.request.action === "confirm_plan" ? "plan" : "contract" };
  const approved = requests.find(item => item.status === "approve");
  if (approved) return { holder: "human", title: `应用已批准的${approved.request.action === "confirm_plan" ? "计划" : "约定"}`, hint: "批准已记录，应用后形成正式版本。", tab: approved.request.action === "confirm_plan" ? "plan" : "contract" };

  if (!change.contract_ref) {
    const proposal = latestUnrequested(detail, "contract");
    if (!proposal) return { holder: "human", title: "澄清需求并提交约定", hint: "写清问题、背景与验收标准，形成约定候选。", tab: "clarify" };
    const risk = intent.risk_assessments.some(item => item.subject_refs.some(ref => ref.id === proposal.id && ref.domain_version === proposal.proposal_revision));
    return risk
      ? { holder: "human", title: "请求确认约定", hint: "风险判断已记录，可以发起确认。", tab: "contract" }
      : { holder: "human", title: "记录风险判断", hint: "技术负责人判断这份约定的风险等级。", tab: "contract" };
  }
  if (!change.plan_ref) {
    return latestUnrequested(detail, "plan")
      ? { holder: "human", title: "请求确认计划", hint: "计划候选已提交，发起确认。", tab: "plan" }
      : { holder: "human", title: "提交实施计划", hint: "把约定拆成实施任务与独立验证任务。", tab: "plan" };
  }
  if (change.lifecycle_state === "IntentReady") return { holder: "human", title: "开始实施", hint: "约定与计划都已确认，可以开工。", tab: "plan" };
  if (execution.tasks.length === 0) return { holder: "human", title: "初始化任务", hint: "按已确认的计划生成任务。", tab: "execute" };

  const open = execution.tasks.filter(task => task.status === "Pending" || task.status === "InProgress");
  if (open.length) {
    const ran = open.find(task => runs.runs.some(run => run.task_id === task.id && run.status === "Succeeded"));
    return ran
      ? { holder: "human", title: "评价任务结果", hint: "查看修改与检查结果，记录评价。", tab: "verify" }
      : { holder: "human", title: "让 Agent 实施任务", hint: "为待执行的任务启动一次 Agent 运行。", tab: "execute" };
  }
  return { holder: "human", title: "完成集成评价", hint: "全部任务已满足，评价是否可以安全集成。", tab: "verify" };
}

function latestUnrequested(detail: ChangeDetail, kind: "contract" | "plan") {
  const proposals = kind === "contract" ? detail.intent.contract_proposals : detail.intent.plan_proposals;
  const requested = (item: DecisionRequestItem, id: string, revision: number) => item.request.target_ref.id === id && item.request.target_ref.domain_version === revision;
  const candidates = proposals.filter(proposal => !detail.intent.decision_requests.some(item => requested(item, proposal.id, proposal.proposal_revision) && item.status !== "stale"));
  return candidates.at(-1);
}

export const holderLabel: Record<Holder, string> = { human: "等你处理", agent: "Agent 处理中", none: "无需操作" };
