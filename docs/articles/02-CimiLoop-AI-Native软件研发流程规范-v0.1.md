# CimiLoop AI Native 软件研发流程规范 v0.1

> 状态：流程规范初稿  
> 日期：2026-09-17  
> 适用范围：CimiLoop V1，面向单人或小团队、本地 cimicode Runtime，并复用现有 CI/CD 与 DevOps 平台完成测试和生产部署。

## 1. 文档目的

本文把《AI Native 软件研发新范式》中提出的理念，转化为一套可以执行、检查和持续改进的研发流程规范。

它回答以下问题：

- 一次软件变化从哪里开始，到哪里结束；
- 每个节点需要什么输入，执行哪些活动，产生什么输出；
- 哪些产物是事实证据，哪些产物用于作出决策；
- Change 在什么条件下可以流转到下一状态；
- Agent 可以自主完成什么，什么情况下必须暂停并请求人类判断；
- Feature、Bugfix、Incident、Migration 等不同 Change 如何走不同路径；
- 测试环境验证、生产发布和复盘学习如何形成完整闭环。

本文是 CimiLoop Harness 技术设计的上位流程规范，但不定义字段级 Schema、命令、目录结构、Policy DSL 或具体 Skill 实现。

## 2. 规范用语与阅读方式

本文使用以下约束用语：

- **必须**：缺少该条件时不得继续流转；
- **应该**：默认需要满足，只有记录明确例外后才能偏离；
- **可以**：根据 Change Profile、风险和团队环境选择；
- **不得**：任何 Agent 或角色都不能绕过。

文中的“产物”是逻辑工件，不等于必须创建一个独立文件。它可以由 Repo 中的文档和代码、cimicode 中的运行状态，以及 CI/CD 或环境中的原始记录共同组成。

文中的 **Gate** 统一译为 **状态流转检查**：Change 进入下一状态之前，对授权、风险和证据执行的准入判断。

## 3. 流程核心对象

### 3.1 Change：最小交付和责任单元

Change（变更）是 CimiLoop 中最小的独立交付、验证、发布和责任单元。

```text
产品或项目
└── 多个 Change
    └── 每个 Change 包含多个 Task
```

同一项目中的不同 Change 可以并行处于不同状态，不需要等待整个项目统一进入某一阶段。

### 3.2 Change Profile：流程路由类型

每个 Change 必须选择一个 Profile，用于决定契约重量、验证方式、风险检查和允许路径。

V1 支持：

- Feature：新增或改变产品能力；
- Bugfix：修复偏离期望的行为；
- Incident：处置生产事故；
- Security Fix：修复安全问题；
- Migration：数据、接口、架构或依赖迁移；
- Experiment：验证产品或技术假设；
- Tech Debt：在保持行为稳定的前提下改善结构；
- Ops Change：调整配置、部署或运行策略。

Agent 可以建议 Profile，但在 V1 的 A1 监督模式下，必须由人类在意图决策时确认。Agent 不得自行把高风险 Change 归类为低风险类型。

### 3.3 Change Contract：变更契约

变更契约是人、Agent 与系统对一次变化达成的可执行、可验证约定，至少覆盖：

```text
Change ID
Change Profile
Intent
Expected Outcome
Non-goals
Acceptance Criteria
Constraints
Risk & Reversibility
Required Evidence
Owners
Contract Version
```

不同 Profile 可以扩展不同字段，但不得绕过统一核心。

### 3.4 Task DAG：持久任务图

Task 不是孤立待办，而是从契约和技术计划派生的执行节点。所有 Task 共同构成可追踪、可暂停和可恢复的有向无环图（Task DAG）。

每个 Task 至少记录来源、依赖、输入、预期输出、允许修改范围、所需权限、验证方式、预算、停止条件和当前状态。

### 3.5 Decision 与 Evidence

- **Decision（决策）** 回答“是否允许继续”；
- **Evidence（证据）** 回答“实际发生了什么”。

Agent 的判断、文件存在、PR 创建或口头确认，都不能单独代替有效证据和正式决策。

## 4. 流程总览

### 4.1 端到端主流程

```text
问题、需求或机会
        ↓
N1 意图契约
        ↓
N2 计划—执行—评价
        ↓
N4 测试环境部署与验证
        ↓
生产发布决策
        ↓
N4 生产部署与即时验证
        ↓
N5 复盘与学习
        ↓
Change 关闭或形成新的 Change
```

N3 风险授权不位于这条链路中的某一个固定位置。它作为横向能力，参与每一次关键状态流转。

### 4.2 N1–N5 能力域

| 能力域 | 名称 | 解决的问题 | 主要责任方 |
|---|---|---|---|
| N1 | 意图契约 | 为什么改变，怎样算正确 | Intent Owner、Change Owner、意图 Agent |
| N2 | 计划—执行—评价 | 如何可靠地产生并证明实现 | Technical Owner、Executor、Evaluator |
| N3 | 风险授权 | 当前证据和风险是否允许继续 | Policy/Exception/Release Owner、确定性规则 |
| N4 | 环境验证与生产交付 | 如何把同一制品安全送达生产 | Deployment Agent、Evaluator、Release Owner |
| N5 | 复盘与学习 | 本次执行如何改善下一次 | Change Owner、Learning Agent、各类 Owner |

### 4.3 底层生命周期状态

N1–N5 用于组织理解和责任划分，实际运行使用更细的生命周期状态：

```text
Draft
→ IntentReady
→ Planned
→ Executing
→ Evaluating
→ TestDeploying
→ TestValidating
→ ReleaseReady
→ ProductionDeploying
→ ReleaseVerified
→ DeliveryClosed
```

异常和等待状态包括：

```text
AwaitingDecision
Blocked
Failed
RolledBack
Superseded
Cancelled
```

进入异常或等待状态时，系统必须保留来源状态、原因、责任角色和恢复条件，确保问题处理后可以从明确断点继续。

### 4.4 关键状态语义

| 状态 | 含义 | 进入该状态所需的最低事实 |
|---|---|---|
| Draft | Change 已创建，契约尚未授权 | Change ID、初始描述、Change Owner |
| IntentReady | 当前契约版本允许进入技术规划 | Intent Decision 已批准 |
| Planned | 任务图、影响分析和验证策略已授权 | Execution Plan Decision 已批准 |
| Executing | Executor 正在实施或修复 | 有效执行授权与 Task DAG |
| Evaluating | 独立 Evaluator 正在检查实现和证据 | Executor 已提交本轮 Claims 与 Evidence |
| TestDeploying | 制品正在部署到测试环境 | N2 证据通过，制品已生成 |
| TestValidating | 正在执行环境级验收 | 测试部署成功并可验证 |
| ReleaseReady | 满足提交生产发布决策的条件 | Test Evidence Package 完整 |
| ProductionDeploying | 正在向生产部署已批准制品 | Release Owner 明确批准 |
| ReleaseVerified | 生产部署及即时验证完成 | Release Evidence Package 完整 |
| DeliveryClosed | 本次交付记录关闭 | 决策证据完整，N5 分类完成 |

## 5. 角色与决策权

角色按照决策权定义，不等于传统岗位。一个人可以兼任多个角色，但作出决定时必须记录所代表的角色。

| 角色 | 核心责任 | 不可让渡的主要决定 |
|---|---|---|
| Intent Owner | 维护意图、成功标准、非目标和结果 | 是否值得做、契约意图版本是否正确 |
| Change Owner | 推动单个 Change 从创建到关闭 | 是否继续、暂停、取消或拆分 Change |
| Technical Owner / Outcome Engineer | 对技术结果、异常诊断和 Evaluator 可信度负责 | 技术计划与重大 Plan Amendment |
| Policy Owner | 维护架构、安全、合规和权限规则 | 长期 Policy 是否创建或改变 |
| Exception Owner | 裁决规则冲突与高风险例外 | 是否允许具体 Policy Exception |
| Release Owner | 对生产发布风险负责 | 是否允许部署到生产环境 |
| Flow / Portfolio Owner | 管理 Change 组合、WIP 和跨 Change 依赖 | 优先级、容量和组合调整 |
| Domain Policy/Eval Owner | 把 QA、安全、设计等判断编码为规则和评估 | 专业规则、Eval 与红线是否有效 |

每个 Change 必须有且只有一个人类 Change Owner。Agent 可以拥有规划权、执行权和受限操作权，但不得成为最终责任主体。

在数据破坏、权限、安全、合规和不可逆迁移等高风险 Change 中，Change Owner 与相应批准人必须职责分离。

## 6. 通用决策包与证据包

### 6.1 决策包

| 决策包 | 决策对象 | 默认决策角色 | 典型发生位置 |
|---|---|---|---|
| Intent Decision Package | 是否批准当前变更契约版本 | Intent Owner | N1 结束 |
| Execution Plan Decision Package | 是否批准任务图与验证策略 | Technical Owner | N2 规划结束 |
| Production Release Decision Package | 是否允许指定制品进入生产 | Release Owner | N4 生产部署前 |
| Exception Decision | 是否允许在限定范围内突破规则 | Exception Owner | 任意状态流转前 |

人类决策必须结构化记录：

```yaml
decision: approve | reject | request_changes
reason: ...
required_changes: []
risk_observation: []
```

正常情况下，人类应该返回结构化反馈，由 Agent 修改后重新提交，而不是直接替 Agent 修改产物。紧急情况下允许直接干预，但恢复流程前必须补录原因和差异。

### 6.2 证据包

| 证据包 | 证明对象 | 典型内容 |
|---|---|---|
| Delivery Evidence Package | 实现是否满足契约并具备测试条件 | 代码变更、测试、扫描、可追踪性、Evaluator 结论 |
| Test Evidence Package | 制品在测试环境是否通过验收 | Deployment ID、环境配置、验收结果、失败与修复历史 |
| Release Evidence Package | 生产部署及即时验证是否成功 | 制品摘要、生产 Deployment ID、健康检查、恢复动作 |
| Learning Package | 本次执行产生了哪些可复用经验 | 人工纠正、失败模式、例外、学习候选和遗留问题 |

证据必须满足：

- 可关联到 Change ID 和 Contract Version；
- 可识别生成时间、执行者和工具版本；
- 能够定位原始记录，而不是只保存模型总结；
- 在契约、计划、代码或环境变化后重新判断是否失效；
- 对关键结论提供独立或确定性验证。

## 7. 状态流转检查（Gate）

### 7.1 Gate 的输入

每次关键状态流转至少检查：

- Change Profile；
- 当前状态与目标状态；
- 当前 Contract Version 与 Plan Version；
- 多维风险画像；
- 自治等级；
- 必需证据的完整性、新鲜度和适用范围；
- 目标环境；
- 未解决的规则例外；
- 已有人工决策；
- 时间、成本、重试与权限边界。

风险画像至少包含：影响范围、可逆性、数据影响、安全与合规、外部副作用、新颖性与不确定性。不得使用一个单一 Trust Score 替代这些维度。

### 7.2 Gate 的结果

| 结果 | 中文含义 | 系统动作 |
|---|---|---|
| ALLOW | 自动允许 | 记录依据并进入目标状态 |
| REQUIRE_HUMAN | 请求人工决策 | 进入 AwaitingDecision，生成指定决策包 |
| DENY | 当前禁止 | 保持或进入 Blocked，并说明违反的规则 |
| NEED_MORE_EVIDENCE | 需要更多证据 | 返回相应执行或验证环节 |

LLM Agent 可以整理材料、解释风险并提出建议，但不得自行覆盖确定性 Policy 或伪造人类批准。

### 7.3 V1 的三项基础人工决策

在默认 A1 监督模式下，以下决策必须由人类明确作出：

1. Intent Owner 批准当前变更契约版本；
2. Technical Owner 批准执行计划和验证策略；
3. Release Owner 批准指定制品部署到生产环境。

Change Profile 可以增加体验验收、规则例外、数据迁移或不可逆操作确认。测试环境部署在 N2 证据通过后默认自动触发，不增加重复人工 Gate。

### 7.4 规则例外

Policy Exception 必须包含：被突破的规则、原因、风险、补偿措施、批准人、适用 Change、Contract Version、有效范围和失效时间。

例外默认只对当前 Change 和版本有效。重复出现的例外必须由 Policy Owner 决定是否升级为长期规则，不能由 Agent 自动固化。

## 8. N1：意图契约

### 8.1 目标

把一段需求、问题、事故或技术诉求转化为可授权、可验证的变更契约，并明确责任、风险和所需证据。

### 8.2 入口与触发

V1 支持以下入口：

- 用户在 cimicode 中描述一个需求、Bug 或技术变更；
- 用户提供已有 Issue、需求文档或事故信息；
- N5 学习结果建议创建新的 Change；
- 已有 Change 需要拆分出独立 Change。

V1 暂不自动监听告警、工单或生产信号创建 Change。

### 8.3 输入

| 输入 | 必需性 | 说明 |
|---|---|---|
| 初始诉求或问题证据 | 必须 | 描述为什么需要变化 |
| 初始 Change Owner | 必须 | 对 Change 推进负责的人 |
| 相关业务或技术上下文 | 应该 | Issue、文档、代码位置、事故记录等 |
| 机会或故障证据 | 按 Profile | Feature、Experiment、Bugfix、Incident 的事实基础 |
| 组织 Policy | 必须 | 架构、安全、合规和权限约束 |

### 8.4 核心活动

1. 创建 Change ID 与 Draft Change；
2. Agent 建议 Change Profile、路径和理由；
3. 人类确认或修正 Profile；
4. 按 Profile 动态澄清 Intent、Outcome、Non-goals 和 Acceptance Criteria；
5. 识别约束、依赖、边界、错误、超时和并发语义；
6. 形成多维风险与可逆性画像；
7. 确定 Owners、所需证据和人工决策点；
8. 对关键可行性未知创建 Spike Task 或独立 Spike Change；
9. 生成 Intent Decision Package；
10. Intent Owner 审批当前 Contract Version。

N1 应尽量保持方案中立。UI 或交互型 Change 可以使用 Prototype 澄清体验，但正式技术设计在 N2 结合代码库上下文产生。

### 8.5 输出与产物

| 输出 | 类型 | 最低内容 |
|---|---|---|
| Change Contract | 核心工件 | 意图、结果、非目标、验收、约束、风险、证据、Owner、版本 |
| Change Profile | 路由工件 | 类型、选择理由、建议路径 |
| Risk Profile | 风险工件 | 多维风险、可逆性和人工要求 |
| Spike 列表 | 条件工件 | 未知假设、验证目标和停止条件 |
| Intent Decision | 决策 | approve、reject 或 request_changes |

### 8.6 N1 状态流转检查

`Draft → IntentReady` 必须确认：

- Intent、Expected Outcome 与 Non-goals 清楚；
- Acceptance Criteria 可验证；
- Change Owner、Intent Owner 和必要 Policy Owner 已明确；
- 风险、影响范围和可逆性已分类；
- 契约不存在明显内部矛盾；
- Profile 所需的特殊字段已满足；
- 必要 Spike 已完成或已被明确纳入计划；
- Intent Owner 已批准当前 Contract Version。

缺少信息时返回 `NEED_MORE_EVIDENCE`；需要业务取舍时返回 `REQUIRE_HUMAN`；违反不可突破的 Policy 时返回 `DENY`。

### 8.7 异常与回退

- 意图无法在合理轮次内收敛：进入 Blocked，由 Change Owner 决定继续、拆分或取消；
- 新事实改变意图或验收：提交 Contract Amendment，形成新版本；
- Profile 发生变化：重新计算路径、风险、证据和决策要求；
- 关键可行性未知：不得用假设代替事实，必须先执行 Spike。

### 8.8 退出状态

- 批准：进入 `IntentReady`；
- 请求修改：保持 `Draft`；
- 等待决策：进入 `AwaitingDecision`；
- 无法继续：进入 `Blocked` 或 `Cancelled`。

## 9. N2：计划—执行—评价

### 9.1 目标

把已授权的变更契约转化为持久 Task DAG，在受控环境中完成实现，并通过独立评价和确定性工具形成 Delivery Evidence Package。

N2 不是一次性“写代码”阶段，而是持续运行的计划—执行—评价循环。

### 9.2 输入

| 输入 | 必需性 | 说明 |
|---|---|---|
| 已批准的 Change Contract | 必须 | 当前授权版本 |
| Change Profile 与 Risk Profile | 必须 | 决定验证和权限强度 |
| Repo 与代码库上下文 | 必须 | 当前实现、约束与参考模式 |
| 组织 Policy | 必须 | 架构、安全、合规和工具权限 |
| Spike 结果 | 按需 | 已验证的关键技术事实 |
| 历史 Evidence / Eval | 应该 | 相似 Change 的已知失败模式 |

### 9.3 规划活动

1. Planner 读取 Contract、Repo、Policy 和相关证据；
2. 形成影响分析、技术方案和验证策略；
3. 把实现拆解为具有依赖关系的 Task DAG；
4. 为每个 Task 定义允许修改范围、Skills、权限、预算、停止条件和验证方式；
5. 明确顺序任务、可并行任务和文件所有权；
6. Evaluator 独立检查计划覆盖、风险与可验证性；
7. 生成 Execution Plan Decision Package；
8. Technical Owner 批准、拒绝或要求修改计划。

在 A1 模式下，未获得计划批准前，只允许只读分析和明确授权的 Spike，不得把探索性代码直接混入正式实现。

### 9.4 计划输出

| 输出 | 最低内容 |
|---|---|
| Technical Plan | 方案、影响、取舍、兼容与恢复考虑 |
| Task DAG | Task 来源、依赖、输入输出、范围、权限、验证和状态 |
| Validation Strategy | 每类 Claim 由什么测试、Evaluator 或环境证据证明 |
| Worktree Plan | Change Worktree、并行边界和冲突处理 |
| Execution Plan Decision | Technical Owner 的正式决定 |

### 9.5 Worktree 与 Session 规则

- 默认一个 Change 使用一个 Worktree；
- 顺序 Task 共享 Change Worktree；
- 只有依赖独立、文件边界清晰的 Task 才创建并行子 Worktree；
- 并行任务必须声明文件所有权和合并顺序；
- Evaluator 必须使用独立 Session，不共享 Executor 的完整对话上下文；
- Change 关闭后清理临时 Worktree 和运行资源。

### 9.6 执行活动

Executor 按 Task DAG 获取当前可执行任务，并在授权范围内循环：

```text
读取任务与契约来源
→ 执行实现或修复
→ 运行任务级验证
→ 提交 Claims 与 Evidence
→ 更新 Task 状态
→ 获取下一个可执行任务
```

Task 状态统一为：

```text
Pending
Running
Passed
PassedWithConcerns
NeedsDecision
Blocked
Failed
```

每个 Task 必须配置最大修复次数、时间或成本、允许修改范围、权限和升级条件。达到上限后必须暂停，不能无限自主重试。

### 9.7 验证策略

所有 Task 都必须先声明“如何证明正确”，但不强制机械采用同一种开发方法：

| Change 或工作类型 | 默认验证方式 |
|---|---|
| 业务逻辑、Bugfix | 优先 TDD、回归测试、边界与反例 |
| API | 契约测试、集成测试、兼容性检查 |
| UI | 交互验收、E2E、视觉证据和必要人工体验判断 |
| Migration | dry-run、兼容窗口、数据校验、恢复演练 |
| 配置与部署 | 静态校验、测试环境执行、健康检查 |
| Security Fix | 安全重现、攻击路径关闭、回归与专业 Policy 检查 |
| Spike | 假设验证与结论，不要求完整生产级测试 |

### 9.8 独立评价

Evaluator 负责：

- 从 Contract 独立推导验收场景、边界和反例；
- 检查 Contract—Task—代码—测试之间的可追踪性；
- 检查确定性测试、扫描和工具输出；
- 识别未覆盖、未授权或违反约束的变化；
- 形成通过、关注、失败或证据不足的结论。

Evaluator 不直接修复生产代码。失败报告返回 Executor，修复后必须重新评价。

### 9.9 N2 循环

```text
Executing
→ Executor 提交本轮实现和证据
→ Evaluating
→ Evaluator 通过：检查是否可进入测试部署
→ Evaluator 失败：返回 Executing
→ 证据不足：补充测试或环境事实
→ 风险或契约变化：暂停并请求相应 Owner
```

### 9.10 Plan Amendment 与 Contract Amendment

- 不改变范围、风险和验证策略的实现细节：Executor 可以调整并记录；
- 改变 Task 边界、权限、主要方案、风险或验证策略：必须提交 Plan Amendment，由 Technical Owner 批准；
- 改变 Intent、Expected Outcome、Non-goals 或 Acceptance Criteria：必须升级为 Contract Amendment，由对应 Owner 批准。

修改后，系统必须识别并失效受影响的 Task 与 Evidence，不得要求无关任务全部重做，也不得继续使用已失效证据。

### 9.11 输出与产物

| 输出 | 类型 | 最低内容 |
|---|---|---|
| 实现变更 | 执行产物 | 代码、配置、迁移、文档等 |
| Task Execution Record | 运行记录 | 状态、重试、成本、模型、Skill、失败和恢复点 |
| Test / Scan Results | 确定性证据 | 测试、类型、lint、安全、契约等结果 |
| Evaluator Report | 独立证据 | 覆盖、反例、风险、结论和关注项 |
| Delivery Evidence Package | 汇总证据 | Contract 追踪、实现、测试、扫描和评价 |
| Immutable Artifact | 发布对象 | 唯一摘要、源码版本、构建与配置版本 |

### 9.12 N2 状态流转检查

`IntentReady → Planned` 必须具备已批准的 Execution Plan Decision。

`Evaluating → TestDeploying` 必须确认：

- Contract 与 Plan 版本仍然有效；
- 所有阻塞 Task 已完成；
- 必需的确定性测试和扫描通过；
- 独立 Evaluator 认为 Acceptance Criteria 已被充分覆盖；
- 不存在未授权变化；
- 风险画像未发生未决升级；
- Delivery Evidence Package 完整；
- 已生成可追踪的不可变制品。

满足条件后，系统自动进入测试部署，不增加人工批准。如果出现新增风险、Policy Exception 或契约变化，则由 Gate 返回 `REQUIRE_HUMAN`。

### 9.13 异常与退出状态

- 验证失败且仍在预算内：返回 `Executing`；
- 达到最大重试或无法收敛：进入 `Blocked` 或 `NeedsDecision`；
- 等待计划、契约或例外决策：进入 `AwaitingDecision`；
- 评价通过且证据完整：进入 `TestDeploying`；
- Change 被取代或取消：进入 `Superseded` 或 `Cancelled`。

## 10. N3：风险授权

### 10.1 定位

N3 不是 Change 必须停留的独立阶段，而是贯穿 N1、N2、N4 和 N5 关键状态流转的授权能力。第 7 章定义了通用 Gate，本章明确 N3 如何把风险、证据、Policy 和人类决策组合成授权结果。

### 10.2 输入

| 输入 | 说明 |
|---|---|
| Transition Request | 当前状态、目标状态、请求的动作或能力 |
| Change Context | Profile、Contract、Plan、Owners 和自治等级 |
| Risk Profile | 影响范围、可逆性、数据、安全、外部副作用和不确定性 |
| Evidence Index | 必需证据、原始记录位置、新鲜度和适用版本 |
| Policy Set | 架构、安全、合规、权限、发布和组织规则 |
| Decision History | 已有批准、拒绝、修改请求和例外 |
| Runtime Limits | 权限、预算、重试、时间和目标环境 |

### 10.3 核心活动

1. 校验 Transition Request 是否属于当前状态允许的迁移；
2. 解析 Profile 和目标环境需要的证据；
3. 校验 Contract、Plan、Artifact 和 Evidence 的版本一致性；
4. 评估风险是否变化、是否超出当前授权；
5. 执行确定性 Policy；
6. 检查是否存在有效且范围匹配的人工决定或例外；
7. 返回 ALLOW、REQUIRE_HUMAN、DENY 或 NEED_MORE_EVIDENCE；
8. 记录规则依据、证据引用和最终状态迁移。

### 10.4 权限授予原则

授权对象必须是具体能力，而不是对 Agent 的笼统“信任”。例如：

- 可以修改哪些目录；
- 可以运行哪些命令或访问哪些网络；
- 可以创建 PR 还是可以合并；
- 可以部署测试环境还是生产环境；
- 可以对多少流量或哪些租户生效；
- 授权持续到什么时间、完成什么动作后失效。

同一个 Agent 在低风险依赖升级中可能拥有较高自治，在数据迁移中仍然只能执行受限步骤。

### 10.5 等待人工决策

Gate 返回 `REQUIRE_HUMAN` 时：

- Change 进入 `AwaitingDecision`；
- 系统必须明确需要哪个 Owner；
- 系统呈现对应 Decision Package，而不是要求人重新翻查全部上下文；
- 无回应时保持等待，不采用“沉默视为同意”；
- 决策完成后，从进入等待前的状态和断点继续。

### 10.6 输出

N3 输出包括 Transition Decision、规则命中记录、证据引用、能力授权或拒绝原因。授权必须记录范围、目标环境、有效期和使用结果。

## 11. N4：环境验证与生产交付

### 11.1 目标

把 N2 生成的不可变制品先部署到测试环境完成环境级验证，在证据充分且 Release Owner 明确批准后，将同一制品提升到生产环境，并执行即时发布验证。

### 11.2 核心原则

1. **Build once, promote many：构建一次，逐环境提升。**
2. 测试和生产必须引用同一个 Artifact ID 与摘要；
3. 测试失败必须形成证据并返回执行循环；
4. 生产部署必须有明确的人类发布决定；
5. 发布成功不等于长期稳定或业务结果验证；
6. 恢复策略必须按 Change 定义，不能统一假设为版本回滚；
7. cimicode 不保存和输出生产密钥，只触发被授权的部署能力。

### 11.3 输入

| 输入 | 必需性 | 说明 |
|---|---|---|
| Immutable Artifact | 必须 | 来自 N2，通过摘要唯一识别 |
| Delivery Evidence Package | 必须 | 实现和独立评价证据 |
| Change Contract / Risk Profile | 必须 | 当前有效版本 |
| Deployment Configuration | 必须 | 环境、配置版本与适配器参数 |
| Test Strategy | 必须 | 测试环境验收与停止条件 |
| Recovery Strategy | 生产前必须 | 回退、前向修复、开关、流量或数据恢复方案 |

### 11.4 测试环境部署

在 N2 Gate 返回 ALLOW 后，Change 自动进入 `TestDeploying`：

1. 通过 DevOps Adapter 触发现有测试环境 Pipeline；
2. 记录 Change ID、Contract Version、Artifact ID、环境和触发者；
3. 部署前查询环境与历史 Deployment 状态，确保操作幂等；
4. 等待并采集部署事实；
5. 部署成功后进入 `TestValidating`；
6. 部署失败时记录失败证据，并依据失败类型重试、修复或升级。

### 11.5 测试环境验证

验证内容根据 Profile 选择，可以包括：

- 核心路径冒烟；
- Acceptance Criteria 验收；
- 集成、契约和 E2E 测试；
- UI 交互和视觉验证；
- 性能或兼容性检查；
- 数据迁移 dry-run 与数据校验；
- 安全验证；
- 必要的人工体验测试。

测试失败后的默认循环为：

```text
TestValidating
→ 形成失败证据
→ Executing
→ Evaluating
→ 生成新的不可变制品
→ TestDeploying
→ TestValidating
```

达到最大循环次数、风险发生变化、出现契约冲突或需要扩大权限时，必须暂停并请求 Technical Owner 或相应 Owner。

### 11.6 Test Evidence Package

测试环境通过后，必须形成 Test Evidence Package，至少包含：

- Change ID 与 Contract Version；
- Artifact ID、源码版本和配置版本；
- 测试环境 Deployment ID；
- 已执行的验证项目与结果；
- 失败、修复、重新构建和重新部署历史；
- 已知问题、关注项和剩余风险；
- Evaluator 的环境验证结论；
- 原始 CI/CD 与测试记录引用。

### 11.7 `TestValidating → ReleaseReady` Gate

进入 `ReleaseReady` 必须确认：

- 测试环境运行的是拟发布的同一制品；
- 所有必需验收与环境验证通过；
- 失败循环已经关闭或转化为明确的已知风险；
- 没有未批准的 Contract 或 Plan 变化；
- Test Evidence Package 完整；
- 生产恢复策略、上线 Checklist 和即时验证步骤已准备；
- 不存在阻断生产发布的 Policy。

### 11.8 生产发布决策包

Production Release Decision Package 至少包含：

- 当前 Contract Version；
- Test Evidence Package 摘要与原始记录入口；
- Artifact ID 与制品摘要；
- 已知问题和残余风险；
- 数据迁移、兼容和不可逆影响说明；
- 生产上线 Checklist；
- Recovery Strategy；
- 发布时间、目标环境和影响范围；
- 发布后即时验证步骤；
- Evaluator 建议；
- Release Owner 决策区。

V1 中，Release Owner 必须显式返回 approve、reject 或 request_changes。批准必须绑定指定 Artifact、Contract Version、目标环境与有效时间，不能成为后续任意生产操作的通用授权。

### 11.9 生产部署

批准后，Change 进入 `ProductionDeploying`：

1. Deployment Agent 获得一次性、范围化的生产部署能力；
2. 通过现有 DevOps 平台触发指定 Pipeline；
3. 生产凭据继续由 DevOps 平台保管；
4. 重试前查询环境和 Pipeline 状态，避免重复副作用；
5. 记录 Deployment ID、Change ID、Artifact ID、Contract Version、环境、触发者、批准、时间和结果；
6. 部署失败时执行已授权的恢复策略，超出范围则暂停并请求 Release Owner。

### 11.10 恢复策略

Recovery Strategy 应根据 Change 选择一种或多种方式：

- Rollback：版本回退；
- Roll-forward：向前修复；
- Feature Disable：关闭功能；
- Traffic Shift：切回旧实例或调整流量；
- Data Restore：恢复数据；
- Manual Recovery：进入明确的人工恢复流程。

不可逆数据变更必须提前验证备份、兼容窗口、双写、补偿或人工恢复方案。不存在可信恢复策略时，Gate 应返回 DENY 或 REQUIRE_HUMAN。

### 11.11 即时发布验证

生产部署完成后必须执行：

- 目标版本与 Artifact 摘要确认；
- 基础健康检查；
- 核心路径冒烟；
- 配置和关键依赖检查；
- Profile 要求的人工 Checklist；
- 异常、恢复动作与最终结果记录。

验证失败时，执行预先授权的 Recovery Strategy；超出授权范围时立即暂停并升级。

### 11.12 输出与退出状态

| 结果 | 输出 | 状态 |
|---|---|---|
| 测试失败，可修复 | Failure Evidence | 返回 `Executing` |
| 测试通过，待发布决策 | Test Evidence Package | `ReleaseReady` |
| 发布被拒绝或要求修改 | Release Decision | `AwaitingDecision` 或返回相应环节 |
| 生产部署及即时验证成功 | Release Evidence Package | `ReleaseVerified` |
| 恢复成功 | Recovery Evidence | `RolledBack`，由 Change Owner 决定后续 |
| 恢复失败或超范围 | Incident / Escalation | `Failed` 或 `Blocked` |

进入 `ReleaseVerified` 只表示生产发布即时验证通过，不得宣称长期稳定或业务价值已经实现。

## 12. N5：复盘与学习

### 12.1 目标

把 Change 执行中的失败、人工纠正、规则例外和环境结果整理为可审核的学习候选，使下一次执行更可靠，同时保持本次交付与未来改进解耦。

### 12.2 输入

| 输入 | 必需性 | 说明 |
|---|---|---|
| N1–N4 Decision 与 Evidence | 必须 | 本次 Change 的完整事实链 |
| Agent 执行记录 | 必须 | 失败、重试、阻塞、成本和恢复 |
| 人工干预记录 | 必须 | 原始建议、最终决定、差异与原因 |
| 测试环境问题 | 必须 | 环境失败和修复历史 |
| 生产发布与即时验证 | 必须 | Release Evidence 与恢复动作 |
| 人工补充的线上反馈 | 按需 | 事故、用户反馈或业务信息 |
| 遗留问题 | 应该 | 未阻塞交付但需要后续处理的事项 |

V1 暂不自动采集生产全量日志、Trace、SLO、业务指标和用户行为。缺少这些能力时，N5 必须明确标记观察边界，不得虚构生产结论。

### 12.3 核心活动

1. 汇总 Change 全生命周期的决策、证据、失败和人工干预；
2. 识别哪些问题属于偶发执行失败，哪些属于系统性缺口；
3. 把学习候选分类为 Contract、Policy、Eval、Skill、Harness、Codebase 或 New Change；
4. 记录候选影响范围、收益、风险、Owner 和验证方法；
5. 将需要独立交付的事项创建为 Backlog 或新 Change；
6. 生成 Learning Package；
7. 检查本次 Change 是否满足关闭条件。

### 12.4 人工干预记录

系统必须尽可能记录：

- Agent 的原始建议或产物；
- 人类作出的决定或直接修改；
- 修改前后差异；
- 人类给出的原因；
- 修改后的验证结果。

对于人类直接修改代码或文件的情况，可以通过 Git Diff 识别差异，并在恢复 Agent 流程时要求补充原因。Learning Agent 不得推断“人类修改必然正确”，只能把差异作为待验证的学习信号。

### 12.5 学习候选分类

| 类型 | 典型改进 |
|---|---|
| Contract | 补充契约模板、验收条件或 Profile 字段 |
| Policy | 新增或修正规则、权限和风险边界 |
| Eval | 增加测试、反例、评估集或判定方式 |
| Skill | 改善某项执行方法、输入输出或停止条件 |
| Harness | 改善调度、状态、权限、恢复和记录机制 |
| Codebase | 修复技术债、参考实现或代码库可理解性 |
| New Change | 创建新的产品、修复、迁移或治理 Change |

### 12.6 学习晋升流程

Learning Agent 只能提出候选，不得自动修改全局 Policy、Eval、Skill 或 Harness 并立即生效。

```text
学习候选
→ 对应 Owner 审核
→ 历史 Change 或 Eval 回放
→ 回归检查
→ 版本发布
→ 新 Change 显式引用新版本
```

### 12.7 输出与产物

| 输出 | 说明 |
|---|---|
| Learning Package | 决策、失败、干预、例外、分类和候选汇总 |
| Improvement Candidates | 带 Owner、验证方式和优先级的候选 |
| New Change / Backlog Items | 需要独立交付的后续事项 |
| Closure Record | 本次 Change 的交付结论与观察边界 |

### 12.8 交付终止状态 → `DeliveryClosed` Gate

常规生产 Change 从 `ReleaseVerified` 进入关闭；Experiment 等明确不进入生产的 Profile，可以从其被契约授权的终止状态进入关闭，例如完成假设验证后的 `TestValidating`。

关闭 Change 必须确认：

- 生产部署和即时验证已完成，或 Profile 明确允许不进入生产；
- 所有必需 Decision 与 Evidence 完整；
- 已知问题和残余风险已记录；
- 人工干预和规则例外可追踪；
- Learning Package 已完成分类；
- 未完成改进已进入 Backlog 或新的 Change；
- Change Owner 未要求继续观察或重新打开。

学习候选未实施不阻塞当前 Change 关闭，也不得阻塞其他 Change。

## 13. Change Profile 的差异化路径

所有 Profile 遵守同一 Change Protocol，但契约重量、验证重点和终点不同。

| Profile | 契约重点 | 主要验证 | 特殊 Gate | 典型终点 |
|---|---|---|---|---|
| Feature | 用户、价值、行为、非目标、结果 | 业务验收、集成、UI/E2E | 体验或业务判断按需增加 | 生产发布后关闭 |
| Bugfix | 复现、期望行为、影响、回归 | 失败复现、回归、边界 | 高影响 Bug 不得因标签而降级 | 生产发布后关闭 |
| Incident | 影响、恢复目标、最小安全边界 | 服务恢复、健康与事故证据 | 可先恢复后补契约，但必须审计 | 恢复后形成复盘或新 Change |
| Security Fix | 威胁、攻击面、敏感数据、披露 | 安全重现、攻击路径关闭、回归 | 安全 Owner 与职责分离 | 安全部署与验证后关闭 |
| Migration | 兼容、数据、切换、恢复 | dry-run、数据校验、兼容与恢复演练 | 不可逆操作必须显式批准 | 迁移验证完成后关闭 |
| Experiment | 假设、样本、指标、停止条件 | 实验结果与学习有效性 | 可以不进入生产发布路径 | 验证证据完成后进入 N5 并关闭 |
| Tech Debt | 行为不变、结构目标、边界 | 回归、架构规则、性能或可维护性 | 行为变化必须升级契约 | 验证并发布后关闭 |
| Ops Change | 配置、影响范围、运行目标、恢复 | 静态校验、测试环境、健康检查 | 外部副作用与生产权限检查 | 生产即时验证后关闭 |

### 13.1 Profile 路由原则

- Profile 决定默认路径，不覆盖实际风险；
- 风险升高时必须提高证据和决策强度；
- 低风险不等于无需契约，只代表契约可以更轻；
- Incident 的事后补录是受控例外，不是常规捷径；
- Experiment 可以在验证假设后结束，但必须保留结果证据；
- Change 中出现另一种独立意图时，应该拆分新 Change，而不是无限扩大原契约。

## 14. 契约、计划与证据的变更规则

### 14.1 Contract Amendment

以下变化必须修改变更契约：

- Intent、Expected Outcome 或 Non-goals 改变；
- Acceptance Criteria 改变；
- 风险、影响范围或可逆性发生实质变化；
- 新增业务、安全、合规或外部约束；
- Change Profile 改变。

Intent 相关变化由 Intent Owner 批准；技术、安全或合规约束由相应 Policy Owner 批准；不改变行为的说明补充可以由 Change Owner 批准。

### 14.2 Plan Amendment

以下变化只需修改 Plan：

- Task 边界或依赖改变；
- 主要实现方案改变，但契约行为不变；
- 验证策略、权限、预算或停止条件改变；
- Worktree 或并行策略改变。

重大 Plan Amendment 由 Technical Owner 批准。

### 14.3 Evidence 失效

契约、计划、代码、配置、环境或 Artifact 变化后，系统必须根据关联关系判断哪些 Evidence 失效。证据失效应该精确到受影响范围：既不能继续使用不适用的旧证据，也不应无理由要求所有证据全部重建。

## 15. 异常、等待与恢复

### 15.1 异常状态

| 状态 | 适用场景 | 必须记录 | 允许的后续动作 |
|---|---|---|---|
| AwaitingDecision | 需要指定 Owner 判断 | 来源状态、决策包、Owner、等待原因 | 批准后恢复、修改、拒绝或取消 |
| Blocked | 缺少外部条件或无法继续 | 阻塞原因、责任人、解除条件 | 条件满足后恢复、拆分或取消 |
| Failed | 执行已失败且当前授权内无法恢复 | 失败证据、已尝试动作、影响 | 新计划、恢复、创建 Incident 或取消 |
| RolledBack | 已执行恢复并回到安全状态 | 原部署、恢复动作、验证结果 | 修复后重试、创建新 Change 或关闭 |
| Superseded | 被另一个 Change 或版本取代 | 替代关系与未完成事项 | 迁移证据或关闭 |
| Cancelled | 经 Change Owner 决定不再继续 | 原因、已产生副作用和清理结果 | 只允许重新创建新的 Change |

### 15.2 Agent 必须暂停的情况

Agent 遇到以下情况必须停止自主推进：

- 意图、验收或责任人不完整；
- Contract、Plan、Policy 或环境事实冲突；
- 实现出现未授权行为变化；
- 验证在预算内无法收敛；
- 操作不可逆或超出权限；
- 超出时间、成本或重试限制；
- 关键证据缺失、过期或不适用于当前版本；
- 规则明确要求人类判断；
- 外部系统状态不确定，重复操作可能产生副作用。

暂停时必须说明：当前状态、已完成工作、阻塞事实、所需角色、可选方案和恢复条件。

## 16. 自治等级与人工介入

| 等级 | 名称 | Agent 权限 | 人类位置 |
|---|---|---|---|
| A0 | 影子模式 | 只分析、建议和生成证据 | 人执行所有实际修改 |
| A1 | 监督模式 | 执行 Change，关键决策需确认 | 批准意图、计划和生产发布 |
| A2 | 受控自治 | 低风险流转自动，高风险或异常转人 | 设定 Policy、抽查和处理例外 |
| A3 | 范围自治 | 授权范围内持续运行 | 关注结果、异常和策略调整 |

CimiLoop V1 默认 A1。自治升级必须针对“特定 Profile × 特定 Repo/服务 × 特定能力 × 特定 Harness 版本”，基于真实样本和回放结果逐项进行，不能给整个 Agent 一个永久通用等级。

## 17. 标准状态流转矩阵

下表描述 Feature/Bugfix 等常规生产 Change 在 A1 模式下的默认流转。Profile 可以增加或缩短路径，但不得绕过对应风险和证据要求。

| 当前状态 | 请求动作 | 默认 Gate | 成功状态 | 失败或不足 |
|---|---|---|---|---|
| Draft | 批准契约 | Intent Owner 决策 | IntentReady | Draft / AwaitingDecision |
| IntentReady | 批准计划 | Technical Owner 决策 | Planned | IntentReady / AwaitingDecision |
| Planned | 开始执行 | 确定性检查 | Executing | Blocked |
| Executing | 提交评价 | Task 与证据检查 | Evaluating | Executing / Blocked |
| Evaluating | 部署测试 | Eval、风险、证据检查 | TestDeploying | Executing / AwaitingDecision |
| TestDeploying | 开始环境验证 | 部署事实检查 | TestValidating | Executing / Failed |
| TestValidating | 提交生产发布 | 测试证据检查 | ReleaseReady | Executing / AwaitingDecision |
| ReleaseReady | 部署生产 | Release Owner 决策 | ProductionDeploying | ReleaseReady / AwaitingDecision |
| ProductionDeploying | 确认发布 | 部署与即时验证 | ReleaseVerified | RolledBack / Failed |
| ReleaseVerified 或 Profile 终止状态 | 关闭 Change | 完整性与学习检查 | DeliveryClosed | 保持原状态 / Blocked |

典型测试失败回路：

```text
TestValidating
→ Failure Evidence
→ Executing
→ Evaluating
→ TestDeploying
→ TestValidating
```

典型契约变化回路：

```text
任意执行状态
→ 发现意图或验收变化
→ Contract Amendment
→ Intent Owner / Policy Owner 决策
→ 失效受影响 Task 与 Evidence
→ 从受影响范围重新规划或执行
```

## 18. 交付状态与结果状态

Change 必须分别记录 Delivery Status 和 Outcome Status。

### 18.1 Delivery Status

描述软件是否已经实现、验证和发布。V1 可以达到：

```text
ProductionVerified
DeliveryClosed
```

### 18.2 Outcome Status

描述预期业务或用户结果是否得到验证：

```text
NotObserved
Observing
Validated
Invalidated
Inconclusive
```

V1 尚未接入持续生产观察时，生产发布后的典型记录是：

```yaml
delivery_status: ProductionVerified
outcome_status: NotObserved
observation_capability: manual_only
```

以后补充结果证据时可以更新 Outcome Status。结果不符合预期时，应创建新 Change，不得篡改原 Change 的交付历史。

## 19. 事实来源与关联标识

### 19.1 Repo：持久工件

Repo 保存变更契约、规格、Policy、Task DAG 声明、代码、测试定义、决策和最终证据摘要，是团队协作和版本追踪的持久载体。

### 19.2 cimicode：运行时状态

cimicode 保存 Session、任务实时状态、临时锁、暂停恢复、模型和 Skill 调用、预算与执行日志。它是 Agent Runtime，不替代 Repo 中的持久协议。

### 19.3 CI/CD 与环境：运行事实

CI/CD、DevOps 平台和目标环境保存构建、测试、部署和环境执行结果。Repo 中只保存必要摘要、版本、查询条件和原始记录引用。

### 19.4 关联标识

三类事实至少通过以下标识关联：

- Change ID；
- Contract Version；
- Plan Version；
- Artifact ID；
- Deployment ID；
- Evidence ID；
- Decision ID。

任何关键决策都必须能够追溯到所依据的契约、风险和证据；任何生产部署都必须能够追溯到批准人、制品和测试环境结果。

## 20. V1 能力边界

CimiLoop V1 明确采用以下边界：

### 20.1 已纳入

- 单人或小团队、本地 cimicode Runtime；
- 人工创建 Change 或提供已有 Issue/需求；
- Change Contract、Profile、Task DAG、Decision 和 Evidence；
- Orchestrator 与按需创建的 Executor、Evaluator Session；
- 测试环境自动部署、验证失败修复和重新部署；
- 测试通过后形成生产发布包；
- Release Owner 明确授权生产部署；
- 复用现有 DevOps 平台完成测试和生产部署；
- 生产部署后的即时健康和核心路径验证；
- 人工干预、失败、例外和学习候选记录。

### 20.2 暂不纳入

- 中央数据库和组织级 Agent 调度平台；
- 复杂 Web 控制台；
- 自动监听工单、告警和生产信号创建 Change；
- 持续采集生产全量日志、Trace、SLO、业务 KPI 和用户行为；
- 自动判断长期稳定或业务价值实现；
- Agent 自动修改全局 Policy、Skill、Eval 或 Harness 并立即生效；
- 完全脱离现有 DevOps 平台的直接生产凭据管理；
- 全组织统一升级到 A2 或 A3 自治。

边界之外的能力可以通过统一 ID、Schema、事件和 Skill Contract 为未来预留，但不得在 V1 文档和报告中声称已经具备。

## 21. 流程完成标准

一条 CimiLoop Change 流程被认为有效完成，必须同时满足：

1. 有明确且唯一的人类 Change Owner；
2. 当前 Contract Version 已被正确角色授权；
3. 实现和测试能够追溯到契约与 Task；
4. 关键 Claim 有确定性或独立 Evidence；
5. 所有状态迁移都有 Gate 结果和依据；
6. 测试与生产使用可追踪的制品；
7. 生产部署有明确的 Release Decision；
8. 生产即时验证和必要恢复动作已记录；
9. 人工干预、规则例外和已知问题可追踪；
10. 学习候选已分类，未完成事项已进入 Backlog 或新 Change；
11. Delivery Status 与 Outcome Status 没有被混为一谈；
12. Change 历史没有因为后续结果而被覆盖或改写。

## 22. 与后续 CimiLoop Harness 设计的边界

本文确定的是流程事实、责任和准入规则。下一阶段的 Harness 设计需要在不改变本文语义的前提下，继续定义：

- Change Contract 与各 Profile 的字段级 Schema；
- 精确状态迁移表和 Policy 求值方式；
- Event、Decision、Evidence 的数据结构；
- Skills 的输入输出、权限、预算、Evidence 和 Eval Contract；
- Orchestrator、Executor、Evaluator 与 Deployment Session 的实现；
- cimicode 暂停、恢复、锁、Worktree 和人工干预记录机制；
- OpenSpec、Matt Skills、Superpowers 等外部能力的适配边界；
- DevOps Adapter、幂等、凭据和部署记录接口；
- Harness 自身的回放、评估、版本和升级机制。

CimiLoop Harness 的职责不是重新发明流程，而是让这套流程可以被 Agent 可靠执行、被人类有效治理，并让每个 Change 的状态、证据和责任都可验证、可恢复、可审计。

---

## 相关文档

- [AI Native 软件研发新范式：从人执行流程到人治理 Agent 研发闭环](./01-AI-Native软件研发新范式.md)
- [CimiLoop AI Native 软件研发操作模型 v0.1](../plans/2026-09-17-cimiloop-ai-native研发操作模型-v0.1.md)
