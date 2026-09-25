import type {
  AcceptanceCriterion,
  ActingRole,
  ActiveEnvironment,
  AgentRunRecord,
  ArtifactRecord,
  AttentionItem,
  ChangeRoomTab,
  ChangeSummary,
  ClaimRecord,
  ContractSummary,
  CurrentFocus,
  DecisionRequest,
  DemoScene,
  DemoState,
  DeploymentRecord,
  DraftChangeInput,
  EvidenceRecord,
  PlanSummary,
  ProjectInfo,
  ReleaseRecord,
  SceneMeta,
  TimelineEvent,
  WorkItemRecord
} from "./types";

export const MAIN_CHANGE_ID = "CHG-0242";
export const ARTIFACT_ID = "order-service:2026.09.21.3";
export const ARTIFACT_DIGEST = "sha256:8f2a…d91c";
export const TEST_ENV = "staging-cn";
export const PROD_ENV = "prod-cn";
export const CONTRACT_VERSION = "contract-v1";
export const PLAN_VERSION = "plan-v1";
export const CONTRACT_DECISION_ID = "DEC-1042";
export const RELEASE_DECISION_ID = "DEC-1108";
export const REPAIR_EVIDENCE_ID = "EVD-2207";

export const DEFAULT_CHANGE_INPUT: DraftChangeInput = {
  title: "订单导出能力",
  request: "管理员需要异步导出十万条订单。普通用户既不能看到入口，也不能调用接口。导出文件不得包含内部备注，失败后可重试且不产生重复文件。",
  source: "产品诉求 · 林晓",
  owner: "陈晨",
  profile: "Feature",
  urgency: "High",
  impact: "权限与敏感字段风险，影响订单导出路径，不改变资金与库存"
};

export const PROJECT: ProjectInfo = {
  name: "Commerce Platform",
  mode: "Embedded Solo Demo",
  currentUser: "周航",
  actingRoles: ["Technical Owner", "Release Owner"],
  environments: [TEST_ENV, PROD_ENV]
};

export const MAIN_ROLES = {
  changeOwner: "陈晨",
  intentOwner: "林晓",
  technicalOwner: "周航",
  releaseOwner: "贺敏"
};

export const ACCEPTANCE_CRITERIA: AcceptanceCriterion[] = [
  { id: "AC-01", text: "管理员可以创建导出任务" },
  { id: "AC-02", text: "普通用户不能看到入口，也不能调用接口" },
  { id: "AC-03", text: "文件不包含内部备注字段" },
  { id: "AC-04", text: "十万条订单异步导出在规定时间内完成" },
  { id: "AC-05", text: "导出失败可重试且不产生重复文件" }
];

export const CONTRACT: ContractSummary = {
  id: CONTRACT_VERSION,
  version: CONTRACT_VERSION,
  goal: "管理员可以异步导出十万条订单",
  scope: ["订单筛选", "异步任务", "下载链接", "审计记录"],
  nonGoals: ["自定义导出模板", "跨租户导出", "实时同步导出"],
  acceptanceCriteria: ACCEPTANCE_CRITERIA,
  status: "Candidate"
};

export const PLAN: PlanSummary = {
  id: PLAN_VERSION,
  version: PLAN_VERSION,
  status: "Candidate",
  tasks: [
    { id: "T1", title: "固化导出权限与审计边界", status: "Pending", dependsOn: [] },
    { id: "T2", title: "实现异步导出任务与下载链接", status: "Pending", dependsOn: ["T1"] },
    { id: "T3", title: "过滤内部备注字段", status: "Pending", dependsOn: ["T2"] },
    { id: "T4", title: "补齐验收、权限反例与幂等测试", status: "Pending", dependsOn: ["T3"] },
    { id: "T5", title: "在 staging-cn 准备验证包", status: "Pending", dependsOn: ["T4"] }
  ]
};

const BASE_CLAIMS: ClaimRecord[] = [
  {
    id: "CLM-01",
    title: "管理员可以导出",
    acceptanceCriterionId: "AC-01",
    status: "Pending",
    required: true,
    evidenceIds: []
  },
  {
    id: "CLM-02",
    title: "普通用户不能导出",
    acceptanceCriterionId: "AC-02",
    status: "Pending",
    required: true,
    evidenceIds: []
  },
  {
    id: "CLM-03",
    title: "不包含内部备注",
    acceptanceCriterionId: "AC-03",
    status: "Pending",
    required: true,
    evidenceIds: []
  },
  {
    id: "CLM-04",
    title: "十万条异步性能达标",
    acceptanceCriterionId: "AC-04",
    status: "Pending",
    required: true,
    evidenceIds: []
  },
  {
    id: "CLM-05",
    title: "失败重试无重复文件",
    acceptanceCriterionId: "AC-05",
    status: "Pending",
    required: true,
    evidenceIds: []
  }
];

const IMPLEMENTATION_EVIDENCE: EvidenceRecord[] = [
  {
    id: "EVD-2201",
    title: "API 集成测试通过",
    polarity: "Supports",
    claimId: "CLM-01",
    contractVersion: CONTRACT_VERSION,
    artifactId: ARTIFACT_ID,
    artifactDigest: ARTIFACT_DIGEST,
    environment: TEST_ENV,
    observedAt: "2026-09-21 09:38"
  },
  {
    id: "EVD-2202",
    title: "UI E2E：管理员可创建导出任务",
    polarity: "Supports",
    claimId: "CLM-01",
    contractVersion: CONTRACT_VERSION,
    artifactId: ARTIFACT_ID,
    artifactDigest: ARTIFACT_DIGEST,
    environment: TEST_ENV,
    observedAt: "2026-09-21 09:39"
  },
  {
    id: "EVD-2203",
    title: "Schema 断言：内部备注字段已排除",
    polarity: "Supports",
    claimId: "CLM-03",
    contractVersion: CONTRACT_VERSION,
    artifactId: ARTIFACT_ID,
    artifactDigest: ARTIFACT_DIGEST,
    environment: TEST_ENV,
    observedAt: "2026-09-21 09:39"
  },
  {
    id: "EVD-2204",
    title: "样本文件检查：无 internal_note",
    polarity: "Supports",
    claimId: "CLM-03",
    contractVersion: CONTRACT_VERSION,
    artifactId: ARTIFACT_ID,
    artifactDigest: ARTIFACT_DIGEST,
    environment: TEST_ENV,
    observedAt: "2026-09-21 09:40"
  },
  {
    id: "EVD-2205",
    title: "staging-cn 十万条异步导出性能结果",
    polarity: "Supports",
    claimId: "CLM-04",
    contractVersion: CONTRACT_VERSION,
    artifactId: ARTIFACT_ID,
    artifactDigest: ARTIFACT_DIGEST,
    environment: TEST_ENV,
    observedAt: "2026-09-21 09:40"
  },
  {
    id: "EVD-2206",
    title: "失败重试幂等测试通过",
    polarity: "Supports",
    claimId: "CLM-05",
    contractVersion: CONTRACT_VERSION,
    artifactId: ARTIFACT_ID,
    artifactDigest: ARTIFACT_DIGEST,
    environment: TEST_ENV,
    observedAt: "2026-09-21 09:41"
  }
];

export const REPAIR_EVIDENCE: EvidenceRecord = {
  id: REPAIR_EVIDENCE_ID,
  title: "权限反例测试通过",
  polarity: "Supports",
  claimId: "CLM-02",
  contractVersion: CONTRACT_VERSION,
  artifactId: ARTIFACT_ID,
  artifactDigest: ARTIFACT_DIGEST,
  environment: TEST_ENV,
  observedAt: "2026-09-21 10:04"
};

export const SATELLITE_CHANGES: ChangeSummary[] = [
  {
    id: "CHG-0235",
    displayKey: "CHG-0235",
    title: "支付回调幂等加固",
    profile: "Reliability",
    owner: "孙悦",
    risk: "High",
    riskDetail: "重复入账风险",
    lifecycleState: "ReleaseReady",
    flowCondition: "AwaitingDecision",
    nextAction: "审批指定 Artifact 进入 prod-cn",
    environment: PROD_ENV
  },
  {
    id: "CHG-0229",
    displayKey: "CHG-0229",
    title: "发票抬头同步失败",
    profile: "Bugfix",
    owner: "吴岚",
    risk: "Medium",
    riskDetail: "财务对账偏差",
    lifecycleState: "Evaluating",
    flowCondition: "Blocked",
    nextAction: "补齐冲突 Evidence",
    environment: TEST_ENV
  },
  {
    id: "CHG-0238",
    displayKey: "CHG-0238",
    title: "促销规则灰度实验",
    profile: "Experiment",
    owner: "赵起",
    risk: "Low",
    riskDetail: "仅影响实验流量",
    lifecycleState: "Executing",
    flowCondition: "Active",
    nextAction: "等待 Executor 完成当前 Work Item",
    environment: TEST_ENV
  },
  {
    id: "CHG-0218",
    displayKey: "CHG-0218",
    title: "会员积分展示修正",
    profile: "Bugfix",
    owner: "陈晨",
    risk: "Low",
    riskDetail: "展示层差异",
    lifecycleState: "DeliveryClosed",
    flowCondition: "Completed",
    nextAction: "已关闭",
    environment: PROD_ENV
  }
];

export const SATELLITE_DECISION: DecisionRequest = {
  id: "DEC-1091",
  changeId: "CHG-0235",
  changeDisplayKey: "CHG-0235",
  title: "批准支付回调加固进入生产",
  question: "是否批准 CHG-0235 的指定 Artifact 进入 prod-cn？",
  actingRole: "Release Owner",
  objectType: "Release",
  objectVersion: "release-v1",
  artifactId: "pay-service:2026.09.20.8",
  artifactDigest: "sha256:11ab…c03e",
  environment: PROD_ENV,
  recommendation: "在支付高峰窗口外发布，并准备回滚到上一 Digest。",
  recommendationLabel: "建议",
  supporting: ["幂等测试通过", "staging-cn 对账回放通过"],
  opposing: [],
  gaps: [],
  risk: "High，重复入账",
  policy: "生产发布必须绑定 Digest 与 Recovery Strategy",
  residualIssues: ["需要值班窗口确认"],
  recoveryStrategy: ["Rollback 到 pay-service:2026.09.18.2", "关闭新回调开关"],
  expiresAt: "2026-09-21 18:00",
  expired: false,
  consequences: {
    approve: "进入 ProductionDeploying",
    requestChanges: "保持 ReleaseReady，更新发布包后重审",
    reject: "保持 ReleaseReady 并进入 Paused"
  }
};

export const ENVIRONMENTS: ActiveEnvironment[] = [
  {
    id: TEST_ENV,
    purpose: "测试验证",
    occupancy: "CHG-0242、CHG-0229、CHG-0238",
    status: "Available"
  },
  {
    id: PROD_ENV,
    purpose: "生产发布",
    occupancy: "无锁定",
    status: "Idle"
  }
];

export const SCENE_ORDER: DemoScene[] = [
  "workbench",
  "create_change",
  "draft_clarify",
  "contract_decision",
  "agent_running",
  "evaluation_failed",
  "repair_verified",
  "release_decision",
  "delivery_closed"
];

export const SCENE_COUNT = SCENE_ORDER.length;

export const SCENE_META: Record<DemoScene, SceneMeta> = {
  workbench: {
    id: "workbench",
    index: 1,
    name: "Workbench",
    nameZh: "工作台",
    path: "/",
    tab: "overview",
    openDecision: false,
    narration: "从一次尚未成立的诉求开始，而不是从一张已经排好的任务看板开始。"
  },
  create_change: {
    id: "create_change",
    index: 2,
    name: "Create Change",
    nameZh: "创建变更",
    path: "/changes/new",
    tab: "overview",
    openDecision: false,
    narration: "创建 Change 是在建立责任边界，而不是立刻写完整份契约。"
  },
  draft_clarify: {
    id: "draft_clarify",
    index: 3,
    name: "Draft Clarify",
    nameZh: "澄清意图",
    path: `/changes/${MAIN_CHANGE_ID}`,
    tab: "overview",
    openDecision: false,
    narration: "下一步是澄清目标、非目标和验收标准，而不是立即实现。"
  },
  contract_decision: {
    id: "contract_decision",
    index: 4,
    name: "Contract Decision",
    nameZh: "契约决策",
    path: `/changes/${MAIN_CHANGE_ID}`,
    tab: "contract",
    openDecision: true,
    narration: "人对意图和边界负责：批准的是 Contract v1，不是一句自然语言。"
  },
  agent_running: {
    id: "agent_running",
    index: 5,
    name: "Agent Running",
    nameZh: "Agent 执行",
    path: `/changes/${MAIN_CHANGE_ID}`,
    tab: "plan",
    openDecision: false,
    narration: "Agent 承担主要执行；人看到的是授权范围、预算和检查点，而不是 token 流。"
  },
  evaluation_failed: {
    id: "evaluation_failed",
    index: 6,
    name: "Evaluation Failed",
    nameZh: "评价失败",
    path: `/changes/${MAIN_CHANGE_ID}`,
    tab: "evidence",
    openDecision: false,
    narration: "Run success 不等于 Change 完成：CLM-02 缺少权限反例 Evidence。"
  },
  repair_verified: {
    id: "repair_verified",
    index: 7,
    name: "Repair Verified",
    nameZh: "修复已验证",
    path: `/changes/${MAIN_CHANGE_ID}`,
    tab: "evidence",
    openDecision: false,
    narration: "失败 Evidence 驱动修复，而不是再开一个聊天让 Agent 继续写代码。"
  },
  release_decision: {
    id: "release_decision",
    index: 8,
    name: "Release Decision",
    nameZh: "发布决策",
    path: `/changes/${MAIN_CHANGE_ID}`,
    tab: "delivery",
    openDecision: true,
    narration: "批准的是具体制品、环境和恢复策略，不是笼统的生产权限。"
  },
  delivery_closed: {
    id: "delivery_closed",
    index: 9,
    name: "Delivery Closed",
    nameZh: "交付关闭",
    path: `/changes/${MAIN_CHANGE_ID}`,
    tab: "activity",
    openDecision: false,
    narration: "完整事实链和学习候选都留在 Change Room，而不是散落在聊天记录里。"
  }
};

const TIMESTAMPS: Record<DemoScene, string> = {
  workbench: "2026-09-21 08:32",
  create_change: "2026-09-21 08:36",
  draft_clarify: "2026-09-21 08:40",
  contract_decision: "2026-09-21 09:12",
  agent_running: "2026-09-21 09:28",
  evaluation_failed: "2026-09-21 09:41",
  repair_verified: "2026-09-21 10:06",
  release_decision: "2026-09-21 10:18",
  delivery_closed: "2026-09-21 10:31"
};

export function isMainChangeCreated(scene: DemoScene): boolean {
  return scene !== "workbench" && scene !== "create_change";
}

export function isPreContract(scene: DemoScene): boolean {
  return scene === "workbench" || scene === "create_change" || scene === "draft_clarify";
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mainChange(overrides: Partial<ChangeSummary>): ChangeSummary {
  return {
    id: MAIN_CHANGE_ID,
    displayKey: MAIN_CHANGE_ID,
    title: "订单导出能力",
    profile: "Feature",
    owner: MAIN_ROLES.changeOwner,
    risk: "Medium",
    riskDetail: "权限与敏感字段风险",
    lifecycleState: "IntentReady",
    flowCondition: "AwaitingDecision",
    nextAction: "审阅并批准 Contract v1",
    environment: TEST_ENV,
    ...overrides
  };
}

function contractDecision(): DecisionRequest {
  return {
    id: CONTRACT_DECISION_ID,
    changeId: MAIN_CHANGE_ID,
    changeDisplayKey: MAIN_CHANGE_ID,
    title: "批准 Contract v1",
    question: "是否将 Contract v1 固化为订单导出能力的正式意图授权？",
    actingRole: "Technical Owner",
    objectType: "Contract",
    objectVersion: CONTRACT_VERSION,
    recommendation: "范围、非目标和五项验收标准已经足够支撑一次受控实现，建议批准。",
    recommendationLabel: "建议",
    supporting: ["目标可验证", "非目标已排除自定义模板与跨租户导出", "风险画像完整"],
    opposing: [],
    gaps: ["实现阶段仍需补齐普通用户权限反例"],
    risk: "Medium，权限与敏感字段风险",
    policy: "Contract 未批准前不得进入正式实现",
    residualIssues: ["生产恢复策略将在 Release Package 中确认"],
    recoveryStrategy: ["保持 Draft/IntentReady，允许修订同一 Contract Candidate"],
    expiresAt: "2026-09-21 12:00",
    expired: false,
    consequences: {
      approve: "Gate 重新求值 ALLOW，Change 进入 Executing，Agent 获得实现授权",
      requestChanges: "保持 IntentReady，生成 Feedback，继续修改同一 Contract Candidate",
      reject: "保持 IntentReady 并进入 Paused，由 Change Owner 决定恢复或取消"
    }
  };
}

function releaseDecision(): DecisionRequest {
  return {
    id: RELEASE_DECISION_ID,
    changeId: MAIN_CHANGE_ID,
    changeDisplayKey: MAIN_CHANGE_ID,
    title: "批准生产发布",
    question: `是否批准 ${ARTIFACT_ID}（${ARTIFACT_DIGEST}）进入 ${PROD_ENV}？`,
    actingRole: "Release Owner",
    objectType: "Release",
    objectVersion: "release-v1",
    artifactId: ARTIFACT_ID,
    artifactDigest: ARTIFACT_DIGEST,
    environment: PROD_ENV,
    recommendation: "测试证据已覆盖五项 Claim，建议在当前窗口发布，并启用功能关闭作为快速恢复。",
    recommendationLabel: "建议",
    supporting: ["CLM-01 到 CLM-05 均为 Satisfied", "staging-cn 即时验证通过", "Digest 与测试包一致"],
    opposing: [],
    gaps: [],
    risk: "Medium，权限与敏感字段风险",
    policy: "生产发布必须绑定 Artifact Digest、目标环境和 Recovery Strategy",
    residualIssues: ["长期业务结果仍待观察"],
    recoveryStrategy: [
      "Rollback 到上一稳定 Digest",
      "Feature Disable：关闭导出入口",
      "Roll-forward：仅在新 Artifact 通过评价后允许"
    ],
    expiresAt: "2026-09-21 16:00",
    expired: false,
    consequences: {
      approve: "Gate ALLOW 后进入 ProductionDeploying，对 prod-cn 发起一次性部署",
      requestChanges: "保持 ReleaseReady，更新发布窗口或恢复策略后重审",
      reject: "保持 ReleaseReady 并进入 Paused"
    }
  };
}

function artifact(evaluationStatus: string): ArtifactRecord {
  return {
    id: ARTIFACT_ID,
    digest: ARTIFACT_DIGEST,
    source: "order-service @ main + export-worktree",
    buildStatus: "Succeeded",
    evaluationStatus
  };
}

function release(approvalStatus: ReleaseRecord["approvalStatus"]): ReleaseRecord {
  return {
    id: "REL-0242-1",
    artifactId: ARTIFACT_ID,
    artifactDigest: ARTIFACT_DIGEST,
    environment: PROD_ENV,
    scope: "订单导出 API、管理后台入口、异步任务",
    window: "2026-09-21 10:20–11:00 CST",
    recoveryStrategy: ["Rollback 到上一稳定 Digest", "Feature Disable：关闭导出入口", "Roll-forward 仅允许新 Artifact"],
    approvalStatus
  };
}

function implementationWorkItem(status: WorkItemRecord["status"]): WorkItemRecord {
  return {
    id: "WI-8814",
    title: "实现订单导出能力",
    kind: "Implementation",
    goal: "按 Contract v1 实现管理员异步导出，并提交 Artifact Candidate 与 Delivery Evidence",
    authorization: "允许修改 order-service 导出模块与对应测试；禁止跨租户接口",
    contextPack: "CP-order-export-v3",
    capabilityBinding: "executor.coding + test.runner",
    status
  };
}

function repairWorkItem(status: WorkItemRecord["status"]): WorkItemRecord {
  return {
    id: "WI-8820",
    title: "补齐普通用户权限反例",
    kind: "Repair",
    goal: "为 CLM-02 增加独立权限反例测试，证明普通用户不能看到入口或调用接口",
    authorization: "允许新增测试与最小权限断言；禁止扩大导出范围",
    contextPack: "CP-order-export-v3 + eval-gap-CLM-02",
    capabilityBinding: "executor.coding + evaluator.independent",
    status
  };
}

function implementationRun(status: AgentRunRecord["status"]): AgentRunRecord {
  return {
    id: "RUN-7741",
    workItemId: "WI-8814",
    status,
    duration: status === "Running" ? "04:12" : "12:48",
    budget: "45 min / 1 repair cycle",
    retries: 0,
    logSummary: [
      "读取 Contract v1 与订单域上下文",
      "实现异步导出任务与下载链接",
      "提交管理员路径测试与样本文件检查"
    ],
    commands: ["pnpm test order-export", "pnpm build order-service"],
    tools: ["repo.read", "repo.edit", "test.runner"],
    contextPack: "CP-order-export-v3"
  };
}

function repairRun(status: AgentRunRecord["status"]): AgentRunRecord {
  return {
    id: "RUN-7749",
    workItemId: "WI-8820",
    status,
    duration: status === "Running" ? "01:06" : "06:20",
    budget: "20 min / 0 extra repair",
    retries: 0,
    logSummary: [
      "从 Evaluation Failure 读取 CLM-02 缺口",
      "新增普通用户入口与 API 反例测试",
      "独立 Evaluator 复评 Claim 覆盖"
    ],
    commands: ["pnpm test order-export-authz"],
    tools: ["repo.edit", "test.runner", "evaluator.claim"],
    contextPack: "CP-order-export-v3 + eval-gap-CLM-02"
  };
}

function claimsAfterEvaluation(repaired: boolean): { claims: ClaimRecord[]; evidence: EvidenceRecord[] } {
  const evidence = clone(IMPLEMENTATION_EVIDENCE);
  const claims = clone(BASE_CLAIMS).map((claim) => {
    if (claim.id === "CLM-01") {
      return { ...claim, status: "Satisfied" as const, evidenceIds: ["EVD-2201", "EVD-2202"] };
    }
    if (claim.id === "CLM-02") {
      if (repaired) {
        return {
          ...claim,
          status: "Satisfied" as const,
          evidenceIds: [REPAIR_EVIDENCE_ID],
          gap: undefined,
          consequence: undefined
        };
      }
      return {
        ...claim,
        status: "Insufficient" as const,
        evidenceIds: [],
        gap: "没有独立的权限反例测试",
        consequence: "Evaluation Gate = NEED_MORE_EVIDENCE"
      };
    }
    if (claim.id === "CLM-03") {
      return { ...claim, status: "Satisfied" as const, evidenceIds: ["EVD-2203", "EVD-2204"] };
    }
    if (claim.id === "CLM-04") {
      return { ...claim, status: "Satisfied" as const, evidenceIds: ["EVD-2205"] };
    }
    return { ...claim, status: "Satisfied" as const, evidenceIds: ["EVD-2206"] };
  });
  if (repaired) {
    evidence.push(clone(REPAIR_EVIDENCE));
  }
  return { claims, evidence };
}

const EVENT_LIBRARY = {
  intentReceived: {
    id: "EVT-00",
    at: "2026-09-21 08:32",
    title: "收到诉求",
    detail: "林晓提出：管理员需要异步导出十万条订单，且普通用户不能导出。",
    category: "change"
  },
  created: {
    id: "EVT-01",
    at: "2026-09-21 08:40",
    title: "Change 创建",
    detail: "CHG-0242 建立为 Draft。陈晨成为 Change Owner，下一步是澄清而不是实现。",
    category: "change"
  },
  contractReady: {
    id: "EVT-02",
    at: "2026-09-21 09:10",
    title: "Contract Candidate 已提交",
    detail: "Contract v1 等待 Technical Owner 周航批准。",
    category: "contract"
  },
  contractApproved: {
    id: "EVT-03",
    at: "2026-09-21 09:16",
    title: "Contract Approval",
    detail: "DEC-1042 记录为 Technical Owner。Gate 重新求值 ALLOW。",
    category: "contract"
  },
  planApproved: {
    id: "EVT-04",
    at: "2026-09-21 09:18",
    title: "Plan Approval",
    detail: "Plan v1 与五节点 Task DAG 已批准。",
    category: "plan"
  },
  runStarted: {
    id: "EVT-05",
    at: "2026-09-21 09:20",
    title: "Run",
    detail: "WI-8814 / RUN-7741 开始执行订单导出实现。",
    category: "run",
    runId: "RUN-7741"
  },
  runSucceeded: {
    id: "EVT-06",
    at: "2026-09-21 09:37",
    title: "Run 成功",
    detail: "Executor 提交 Artifact Candidate。Run success 不等于 Change 完成。",
    category: "run",
    runId: "RUN-7741"
  },
  evaluationFailure: {
    id: "EVT-07",
    at: "2026-09-21 09:41",
    title: "Evaluation Failure",
    detail: "CLM-02 缺少权限反例 Evidence。Gate = NEED_MORE_EVIDENCE。",
    category: "evaluation"
  },
  repairStarted: {
    id: "EVT-08",
    at: "2026-09-21 09:52",
    title: "Repair",
    detail: "创建 Repair Work Item WI-8820，补齐 CLM-02。",
    category: "repair",
    runId: "RUN-7749"
  },
  evidenceAdded: {
    id: "EVT-09",
    at: "2026-09-21 10:04",
    title: "Evidence Added",
    detail: "EVD-2207 权限反例测试通过。CLM-02 转为 Satisfied。",
    category: "evidence"
  },
  testValidated: {
    id: "EVT-10",
    at: "2026-09-21 10:06",
    title: "测试验证通过",
    detail: "staging-cn 使用同一 Artifact Digest 完成验证。",
    category: "evaluation"
  },
  releasePrepared: {
    id: "EVT-11",
    at: "2026-09-21 10:18",
    title: "Release Package 已准备",
    detail: `绑定 ${ARTIFACT_ID} / ${ARTIFACT_DIGEST} / ${PROD_ENV}。`,
    category: "release"
  },
  releaseDecision: {
    id: "EVT-12",
    at: "2026-09-21 10:22",
    title: "Release Decision",
    detail: "DEC-1108 记录为 Release Owner。Gate 重新求值 ALLOW。",
    category: "release"
  },
  deploymentVerified: {
    id: "EVT-13",
    at: "2026-09-21 10:28",
    title: "发布验证",
    detail: "Digest matched、Health check passed、Core path passed。",
    category: "deployment"
  },
  closed: {
    id: "EVT-14",
    at: "2026-09-21 10:31",
    title: "关闭",
    detail: "Delivery Closed。学习候选：权限反例应成为导出类 Change 的默认 Gate。",
    category: "closure"
  }
} satisfies Record<string, TimelineEvent>;

function focusFor(scene: DemoScene, repairStarted = false, releaseApproved = false): CurrentFocus {
  switch (scene) {
    case "workbench":
      return {
        happening: "林晓提出了订单导出诉求，但还没有一次可追踪的 Change。",
        whyHere: "没有 Change，就没有责任边界、后续契约和证据链。",
        satisfiedGates: ["原始诉求已记录"],
        missing: ["一次正式的 Draft Change"],
        nextState: "Draft（创建后进入澄清）",
        primaryAction: "创建 Change",
        primaryCommand: "START_CREATE"
      };
    case "create_change":
      return {
        happening: "正在为订单导出能力建立 Draft Change。",
        whyHere: "先指定 Change Owner 和已知边界，而不是一次填完整份契约。",
        satisfiedGates: ["诉求来源已明确"],
        missing: ["Change Owner 与 Draft Change"],
        nextState: "Draft / 开始澄清",
        primaryAction: "创建 Draft Change",
        primaryCommand: "CREATE_DRAFT_CHANGE"
      };
    case "draft_clarify":
      return {
        happening: "CHG-0242 已创建为 Draft，正在等待澄清。",
        whyHere: "没有目标、非目标和验收标准，就不能形成可批准的 Contract。",
        satisfiedGates: ["Change Owner 已指定", "原始诉求已挂到 Change"],
        missing: ["Contract Candidate"],
        nextState: "IntentReady / 审阅 Contract v1",
        primaryAction: "开始澄清",
        primaryCommand: "START_CLARIFICATION"
      };
    case "contract_decision":
      return {
        happening: "系统正在请求 Technical Owner 审阅 Contract v1。",
        whyHere: "没有意图授权，Agent 不能开始正式实现。",
        satisfiedGates: ["目标、范围、非目标和五项验收标准已完整"],
        missing: ["DEC-1042 的批准结果"],
        nextState: "Executing",
        primaryAction: "批准 Contract",
        primaryCommand: "APPROVE_CONTRACT"
      };
    case "agent_running":
      return {
        happening: "Executor 正在执行 WI-8814，实现订单导出能力。",
        whyHere: "Contract 与 Plan 已授权，当前处于受控执行。",
        satisfiedGates: ["Contract v1 已批准", "Plan v1 已批准", "Work Item 授权范围明确"],
        missing: ["完整 Artifact Candidate 与独立评价"],
        nextState: "Evaluating",
        primaryAction: "运行到下一检查点",
        primaryCommand: "COMPLETE_AGENT_RUN"
      };
    case "evaluation_failed":
      return repairStarted
        ? {
            happening: "Repair Work Item WI-8820 已创建，正在补齐 CLM-02 的权限反例。",
            whyHere: "独立评价发现实现完成，但普通用户不可导出仍缺少 Evidence。",
            satisfiedGates: ["CLM-01 / CLM-03 / CLM-04 / CLM-05 已满足", "Artifact Digest 已固定"],
            missing: ["CLM-02 的独立权限反例测试"],
            nextState: "TestValidating",
            primaryAction: "完成修复",
            primaryCommand: "COMPLETE_REPAIR"
          }
        : {
            happening: "独立评价阻塞：CLM-02 普通用户不能导出缺少反例 Evidence。",
            whyHere: "Agent Run 已成功，但 Gate 不能把实现完成当作契约已被证明。",
            satisfiedGates: ["CLM-01 / CLM-03 / CLM-04 / CLM-05 已满足", "Artifact 已构建"],
            missing: ["没有独立的权限反例测试"],
            nextState: "创建 Repair Work Item 后回到受控执行",
            primaryAction: "创建修复 Work Item",
            primaryCommand: "START_REPAIR"
          };
    case "repair_verified":
      return {
        happening: "修复已验证，CLM-02 转为 Satisfied，测试环境验证通过。",
        whyHere: "评价缺口已经用新的 Evidence 补齐，可以准备生产发布包。",
        satisfiedGates: ["五项 Claim 均为 Satisfied", "staging-cn 使用同一 Digest"],
        missing: ["生产发布 Decision"],
        nextState: "ReleaseReady",
        primaryAction: "提交生产发布",
        primaryCommand: "SUBMIT_RELEASE"
      };
    case "release_decision":
      return releaseApproved
        ? {
            happening: "生产发布已批准，正在对 prod-cn 发起一次性部署。",
            whyHere: "Release Owner 已绑定指定 Artifact、Digest 与恢复策略。",
            satisfiedGates: ["DEC-1108 已记录", "Gate ALLOW"],
            missing: ["生产即时验证结果"],
            nextState: "DeliveryClosed",
            primaryAction: "完成部署",
            primaryCommand: "COMPLETE_DEPLOYMENT"
          }
        : {
            happening: "系统正在请求 Release Owner 审批指定 Artifact 进入 prod-cn。",
            whyHere: "测试已通过，但生产发布必须绑定精确版本、环境和恢复策略。",
            satisfiedGates: ["Test Evidence Package 完整", "Recovery Strategy 已准备"],
            missing: ["Release Owner 对 DEC-1108 的批准"],
            nextState: "ProductionDeploying",
            primaryAction: "批准发布",
            primaryCommand: "APPROVE_RELEASE"
          };
    case "delivery_closed":
      return {
        happening: "发布即时验证完成，Change 已关闭。",
        whyHere: "Digest matched、健康检查与核心路径均已通过，证据和学习候选已归档。",
        satisfiedGates: ["生产部署成功", "即时验证通过", "关闭清单完成"],
        missing: [],
        nextState: "无。本次 Change 已关闭。",
        primaryAction: "查看完整时间线",
        primaryCommand: "VIEW_TIMELINE"
      };
  }
}

function attentionFor(scene: DemoScene, repairStarted: boolean): AttentionItem[] {
  const main = (kind: AttentionItem["kind"], reason: string, nextAction: string, role: string, priority: number): AttentionItem => ({
    id: `ATT-${MAIN_CHANGE_ID}`,
    kind,
    changeId: MAIN_CHANGE_ID,
    displayKey: MAIN_CHANGE_ID,
    title: "订单导出能力",
    reason,
    role,
    nextAction,
    priority
  });

  const extras: AttentionItem[] = [
    {
      id: "ATT-CHG-0235",
      kind: "decision",
      changeId: "CHG-0235",
      displayKey: "CHG-0235",
      title: "支付回调幂等加固",
      reason: "Release Decision 等待 Release Owner。",
      role: "Release Owner · 周航 / 贺敏",
      nextAction: "审阅生产发布包",
      priority: 2
    },
    {
      id: "ATT-CHG-0229",
      kind: "blocker",
      changeId: "CHG-0229",
      displayKey: "CHG-0229",
      title: "发票抬头同步失败",
      reason: "评价出现冲突 Evidence，Change 被 Blocked。",
      role: "Technical Owner · 周航",
      nextAction: "查看冲突证据",
      priority: 3
    },
    {
      id: "ATT-CHG-0238",
      kind: "run",
      changeId: "CHG-0238",
      displayKey: "CHG-0238",
      title: "促销规则灰度实验",
      reason: "Executor 正在运行实验配置 Work Item。",
      role: "Executor",
      nextAction: "监视 Active Run",
      priority: 4
    }
  ];

  let primary: AttentionItem;
  switch (scene) {
    case "workbench":
    case "create_change":
      primary = {
        id: "ATT-CREATE-0242",
        kind: "create",
        changeId: MAIN_CHANGE_ID,
        displayKey: MAIN_CHANGE_ID,
        title: "订单导出能力",
        reason: "林晓提出诉求，尚未形成可追踪的 Change。",
        role: "Change Owner · 陈晨",
        nextAction: scene === "create_change" ? "创建 Draft Change" : "创建 Change",
        priority: 1
      };
      break;
    case "draft_clarify":
      primary = main("other", "Draft 已建立，下一步是澄清意图而不是实现。", "开始澄清", "Change Owner · 陈晨 / Intent Owner · 林晓", 1);
      break;
    case "contract_decision":
      primary = main("decision", "Contract v1 等待 Technical Owner 批准。", "打开并批准 Contract", "Technical Owner · 周航", 1);
      break;
    case "agent_running":
      primary = main("run", "Executor 正在执行 WI-8814。", "运行到下一检查点", "Executor", 1);
      extras[0] = { ...extras[0], priority: 1 };
      break;
    case "evaluation_failed":
      primary = main(
        "blocker",
        repairStarted ? "Repair 正在补齐 CLM-02 权限反例。" : "CLM-02 缺少权限反例，Evaluation Gate 阻塞。",
        repairStarted ? "完成修复" : "创建修复 Work Item",
        "Technical Owner · 周航",
        1
      );
      break;
    case "repair_verified":
      primary = main("other", "修复已验证，发布包可提交。", "提交生产发布", "Release Owner · 贺敏", 1);
      break;
    case "release_decision":
      primary = main("decision", "指定 Artifact 等待进入 prod-cn。", "批准生产发布", "Release Owner · 周航 / 贺敏", 1);
      break;
    case "delivery_closed":
      return extras;
  }

  return sortAttention([primary, ...extras]);
}

export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  const rank: Record<AttentionItem["kind"], number> = {
    create: 0,
    decision: 1,
    blocker: 2,
    run: 3,
    other: 4
  };
  return [...items].sort((left, right) => {
    const kindDelta = rank[left.kind] - rank[right.kind];
    if (kindDelta !== 0) {
      return kindDelta;
    }
    return left.priority - right.priority;
  });
}

function inboxFor(scene: DemoScene): DecisionRequest[] {
  const extras = [clone(SATELLITE_DECISION)];
  if (scene === "contract_decision") {
    return [contractDecision(), ...extras];
  }
  if (scene === "release_decision") {
    return [releaseDecision(), ...extras];
  }
  return extras;
}

function preferredTab(scene: DemoScene): ChangeRoomTab {
  return SCENE_META[scene].tab;
}

function actingRole(scene: DemoScene): ActingRole {
  return scene === "release_decision" || scene === "delivery_closed" ? "Release Owner" : "Technical Owner";
}

function stageFor(scene: DemoScene): number {
  switch (scene) {
    case "workbench":
    case "create_change":
    case "draft_clarify":
      return 1;
    case "contract_decision":
      return 2;
    case "agent_running":
    case "evaluation_failed":
      return 3;
    case "repair_verified":
      return 4;
    case "release_decision":
      return 5;
    case "delivery_closed":
      return 6;
  }
}

export function buildSceneState(scene: DemoScene): DemoState {
  const repaired = scene === "repair_verified" || scene === "release_decision" || scene === "delivery_closed";
  const evaluated = scene === "evaluation_failed" || repaired;
  const { claims, evidence } = evaluated
    ? claimsAfterEvaluation(repaired)
    : { claims: clone(BASE_CLAIMS), evidence: [] };

  const change = mainChange(changeOverrides(scene));
  const workItems = workItemsFor(scene);
  const runs = runsFor(scene);
  const artifactRecord = artifactFor(scene);
  const releaseRecord = releaseFor(scene);
  const deployment = deploymentFor(scene);

  return {
    scene,
    revision: 1,
    lastUpdatedAt: TIMESTAMPS[scene],
    actingRole: actingRole(scene),
    project: clone(PROJECT),
    mainChange: change,
    roles: clone(MAIN_ROLES),
    contract: {
      ...clone(CONTRACT),
      status: isPreContract(scene) ? "None" : scene === "contract_decision" ? "Candidate" : "Approved"
    },
    plan: {
      ...clone(PLAN),
      status: isPreContract(scene) ? "None" : scene === "contract_decision" ? "Candidate" : "Approved",
      tasks: planTasksFor(scene)
    },
    claims,
    evidence,
    workItems,
    runs,
    artifact: artifactRecord,
    release: releaseRecord,
    deployment,
    decisionRequest: decisionFor(scene),
    inbox: inboxFor(scene),
    attention: attentionFor(scene, false),
    changes: isMainChangeCreated(scene) ? [change, ...clone(SATELLITE_CHANGES)] : clone(SATELLITE_CHANGES),
    draftChange: scene === "draft_clarify"
      ? {
          ...DEFAULT_CHANGE_INPUT,
          id: MAIN_CHANGE_ID,
          displayKey: MAIN_CHANGE_ID,
          createdAt: TIMESTAMPS.draft_clarify
        }
      : null,
    timeline: timelineFor(scene),
    currentFocus: focusFor(scene),
    gateVerdict: gateFor(scene),
    lifecycleStage: stageFor(scene),
    preferredTab: preferredTab(scene),
    openDecision: SCENE_META[scene].openDecision,
    repairStarted: false,
    releaseApproved: scene === "delivery_closed",
    lastEvent: null,
    lastRejection: null
  };
}

function changeOverrides(scene: DemoScene): Partial<ChangeSummary> {
  switch (scene) {
    case "workbench":
    case "create_change":
      return {
        lifecycleState: "Draft",
        flowCondition: "Active",
        nextAction: "创建 Change"
      };
    case "draft_clarify":
      return {
        lifecycleState: "Draft",
        flowCondition: "Active",
        nextAction: "开始澄清"
      };
    case "contract_decision":
      return {
        lifecycleState: "IntentReady",
        flowCondition: "AwaitingDecision",
        nextAction: "批准 Contract v1"
      };
    case "agent_running":
      return {
        lifecycleState: "Executing",
        flowCondition: "Active",
        nextAction: "运行到下一检查点"
      };
    case "evaluation_failed":
      return {
        lifecycleState: "Evaluating",
        flowCondition: "Blocked",
        nextAction: "创建修复 Work Item"
      };
    case "repair_verified":
      return {
        lifecycleState: "TestValidating",
        flowCondition: "Active",
        nextAction: "提交生产发布"
      };
    case "release_decision":
      return {
        lifecycleState: "ReleaseReady",
        flowCondition: "AwaitingDecision",
        nextAction: "批准发布",
        environment: PROD_ENV
      };
    case "delivery_closed":
      return {
        lifecycleState: "DeliveryClosed",
        flowCondition: "Completed",
        nextAction: "查看完整时间线",
        environment: PROD_ENV
      };
  }
}

function planTasksFor(scene: DemoScene): PlanSummary["tasks"] {
  const tasks = clone(PLAN.tasks);
  const mark = (ids: string[], status: PlanSummary["tasks"][number]["status"]) => {
    for (const task of tasks) {
      if (ids.includes(task.id)) {
        task.status = status;
      }
    }
  };
  if (scene === "agent_running") {
    mark(["T1", "T2"], "Done");
    mark(["T3"], "Running");
    mark(["T4"], "Ready");
  } else if (scene === "evaluation_failed") {
    mark(["T1", "T2", "T3", "T4"], "Done");
    mark(["T5"], "Blocked");
  } else if (scene === "repair_verified" || scene === "release_decision" || scene === "delivery_closed") {
    mark(["T1", "T2", "T3", "T4", "T5"], "Done");
  }
  return tasks;
}

function workItemsFor(scene: DemoScene): WorkItemRecord[] {
  if (isPreContract(scene) || scene === "contract_decision") {
    return [];
  }
  if (scene === "agent_running") {
    return [implementationWorkItem("Running")];
  }
  if (scene === "evaluation_failed") {
    return [implementationWorkItem("Succeeded")];
  }
  return [implementationWorkItem("Succeeded"), repairWorkItem("Succeeded")];
}

function runsFor(scene: DemoScene): AgentRunRecord[] {
  if (isPreContract(scene) || scene === "contract_decision") {
    return [];
  }
  if (scene === "agent_running") {
    return [implementationRun("Running")];
  }
  if (scene === "evaluation_failed") {
    return [implementationRun("Succeeded")];
  }
  return [implementationRun("Succeeded"), repairRun("Succeeded")];
}

function artifactFor(scene: DemoScene): ArtifactRecord | null {
  if (isPreContract(scene) || scene === "contract_decision" || scene === "agent_running") {
    return null;
  }
  if (scene === "evaluation_failed") {
    return artifact("NEED_MORE_EVIDENCE");
  }
  if (scene === "repair_verified") {
    return artifact("ALLOW");
  }
  return artifact("ALLOW · Release candidate");
}

function releaseFor(scene: DemoScene): ReleaseRecord {
  if (scene === "release_decision") {
    return release("Pending");
  }
  if (scene === "delivery_closed") {
    return release("Approved");
  }
  return release("NotRequested");
}

function deploymentFor(scene: DemoScene): DeploymentRecord | null {
  if (scene !== "delivery_closed") {
    return null;
  }
  return {
    id: "DEP-3301",
    environment: PROD_ENV,
    externalStatus: "Succeeded",
    digestMatched: true,
    healthCheckPassed: true,
    corePathPassed: true,
    completed: true
  };
}

function decisionFor(scene: DemoScene): DecisionRequest | null {
  if (scene === "contract_decision") {
    return contractDecision();
  }
  if (scene === "release_decision") {
    return releaseDecision();
  }
  return null;
}

function gateFor(scene: DemoScene): DemoState["gateVerdict"] {
  switch (scene) {
    case "workbench":
    case "create_change":
    case "draft_clarify":
      return "PENDING";
    case "contract_decision":
      return "REQUIRE_HUMAN";
    case "agent_running":
      return "ALLOW";
    case "evaluation_failed":
      return "NEED_MORE_EVIDENCE";
    case "repair_verified":
      return "ALLOW";
    case "release_decision":
      return "REQUIRE_HUMAN";
    case "delivery_closed":
      return "ALLOW";
  }
}

function timelineFor(scene: DemoScene): TimelineEvent[] {
  if (scene === "workbench" || scene === "create_change") {
    return [EVENT_LIBRARY.intentReceived];
  }
  if (scene === "draft_clarify") {
    return [EVENT_LIBRARY.intentReceived, EVENT_LIBRARY.created];
  }
  const events: TimelineEvent[] = [EVENT_LIBRARY.intentReceived, EVENT_LIBRARY.created, EVENT_LIBRARY.contractReady];
  if (scene === "contract_decision") {
    return events;
  }
  events.push(EVENT_LIBRARY.contractApproved, EVENT_LIBRARY.planApproved, EVENT_LIBRARY.runStarted);
  if (scene === "agent_running") {
    return events;
  }
  events.push(EVENT_LIBRARY.runSucceeded, EVENT_LIBRARY.evaluationFailure);
  if (scene === "evaluation_failed") {
    return events;
  }
  events.push(EVENT_LIBRARY.repairStarted, EVENT_LIBRARY.evidenceAdded, EVENT_LIBRARY.testValidated);
  if (scene === "repair_verified") {
    return events;
  }
  events.push(EVENT_LIBRARY.releasePrepared);
  if (scene === "release_decision") {
    return events;
  }
  events.push(EVENT_LIBRARY.releaseDecision, EVENT_LIBRARY.deploymentVerified, EVENT_LIBRARY.closed);
  return events;
}

export function createInitialState(): DemoState {
  return buildSceneState("workbench");
}

export function applyRepairStarted(state: DemoState): DemoState {
  return {
    ...state,
    repairStarted: true,
    workItems: [implementationWorkItem("Succeeded"), repairWorkItem("Running")],
    runs: [implementationRun("Succeeded"), repairRun("Running")],
    attention: attentionFor("evaluation_failed", true),
    currentFocus: focusFor("evaluation_failed", true),
    mainChange: {
      ...state.mainChange,
      nextAction: "完成修复"
    },
    lastUpdatedAt: "2026-09-21 09:52"
  };
}

export function applyReleaseApproved(state: DemoState): DemoState {
  return {
    ...state,
    releaseApproved: true,
    decisionRequest: null,
    actingRole: "Release Owner",
    mainChange: {
      ...state.mainChange,
      lifecycleState: "ProductionDeploying",
      flowCondition: "Active",
      nextAction: "完成部署"
    },
    release: release("Approved"),
    deployment: {
      id: "DEP-3301",
      environment: PROD_ENV,
      externalStatus: "InProgress",
      digestMatched: false,
      healthCheckPassed: false,
      corePathPassed: false,
      completed: false
    },
    currentFocus: focusFor("release_decision", false, true),
    gateVerdict: "ALLOW",
    lastUpdatedAt: "2026-09-21 10:22"
  };
}

export function sceneIndex(scene: DemoScene): number {
  return SCENE_META[scene].index;
}

export function adjacentScene(scene: DemoScene, delta: number): DemoScene {
  const index = SCENE_ORDER.indexOf(scene);
  const next = Math.min(SCENE_ORDER.length - 1, Math.max(0, index + delta));
  return SCENE_ORDER[next];
}

export function findChange(state: DemoState, changeId: string): ChangeSummary | undefined {
  return state.changes.find((change) => change.id === changeId);
}
