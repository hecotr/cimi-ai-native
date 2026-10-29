export const LIFECYCLE: Record<string, string> = {
  Draft: "澄清中", IntentReady: "约定已确认", Executing: "实施中", ReadyForDelivery: "待交付", Completed: "已完成", Terminated: "已终止"
};
export const TASK_STATUS: Record<string, string> = { Pending: "待执行", InProgress: "执行中", Satisfied: "已满足", Cancelled: "已取消" };
export const RUN_STATUS: Record<string, string> = {
  Reserved: "已预约", Running: "运行中", Succeeded: "已完成", Failed: "失败", Cancelled: "已停止", Unknown: "待核对", NotStarted: "未启动"
};
export const DECISION_STATUS: Record<string, string> = {
  pending: "待决定", approve: "已批准 · 待应用", applied: "已应用", stale: "依据已变化", request_changes: "要求修改", reject: "已拒绝"
};
export const DECISION_ACTION: Record<string, string> = {
  confirm_contract: "确认约定", confirm_plan: "确认计划", confirm_integration: "集成复核",
  verify_decision_conditions: "核对决定条件", invalidate_evidence: "处置失效证据"
};
export const ROLE: Record<string, string> = {
  project_owner: "项目负责人", change_owner: "推进负责人", requirement_owner: "需求负责人", technical_owner: "技术负责人",
  quality_owner: "质量负责人", release_owner: "发布负责人", flow_owner: "流程协调人", policy_owner: "策略负责人",
  exception_owner: "例外负责人", executor: "执行者"
};
export const PURPOSE: Record<string, string> = {
  implementation: "实施", verification: "独立验证", knowledge: "知识", synchronization: "同步", release_operation: "发布操作", learning: "复盘"
};
export const KIND: Record<string, string> = { requirement: "需求", bug: "缺陷" };
export const GATE: Record<string, string> = { ALLOW: "通过", NEED_MORE_EVIDENCE: "证据不足", REQUIRE_HUMAN: "需人工判断", DENY: "不通过" };

export const label = (map: Record<string, string>, value: string | undefined | null) => (value ? map[value] ?? value : "—");
