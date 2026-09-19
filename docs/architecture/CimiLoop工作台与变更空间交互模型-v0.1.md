# CimiLoop 工作台与变更空间交互模型 v0.1

> 状态：讨论确认稿
> 日期：2026-09-19
> 范围：定义 Project Workbench、Change Room、Decision Inbox、Attention Queue、双层时间线与 V1 交互闭环；不定义最终视觉规范、前端框架或 Teams/飞书界面。

## 1. 文档定位

本文回答“用户打开 CimiLoop 后看见什么、如何知道 Change 为什么停在这里、现在需要谁做什么，以及怎样从创建走到闭环”。

本文承接：

- `docs/architecture/CimiLoop整体能力架构-v0.1.md`；
- `docs/architecture/CimiLoopChange端到端状态机-v0.1.md`；
- `docs/architecture/CimiLoop角色与权限模型-v0.1.md`；
- `docs/architecture/CimiLoop验证与证据模型-v0.1.md`；
- `docs/architecture/CimiLoop工程交付与DevOps模型-v0.1.md`。

Workbench 与 Change Room 是 Operator Surface（操作界面）和 Derived Read Model（派生查询模型），不是新的事实聚合，也不能绕过 Kernel 写入状态。

## 2. 用户必须随时得到的七个答案

每个主界面优先回答：

1. 这是什么 Change，为什么创建；
2. 当前处于什么生命周期状态；
3. 为什么停在这里，阻塞条件是什么；
4. 现在需要哪个 Human Role 作出什么决定；
5. Agent、Tool 或外部系统正在做什么；
6. 当前结论由哪些 Contract、Artifact、Evidence 和 Decision 支撑；
7. 下一步可能进入哪里，失败时如何修复或恢复。

界面不以“展示所有数据库对象”为目标，而以降低理解和决策成本为目标。

## 3. 交互架构

```text
Project Workbench
├── Attention Queue
├── Decision Inbox
├── Change Lifecycle Board / List
└── Project-level status
        ↓ 选择一个 Change
Change Room
├── Current Focus / Next Action
├── Lifecycle
├── Contract & Risk
├── Plan & Work
├── Artifact & Evidence
├── Release & Deployment
└── Lifecycle Timeline → Run Detail
```

Project Workbench 负责跨 Change 汇总；Change Room 负责单个 Change 的完整闭环。二者不复制两套事实，只使用不同 Read Model 组织相同协议对象。

## 4. Project Workbench

### 4.1 Attention-first

Workbench 默认不是传统 Task Kanban，而是 Attention-first（关注优先）：

- 第一优先：需要当前用户作出的正式 Decision；
- 第二优先：Failure、Blocker、Evidence 缺口、风险变化、权限过期和未知外部状态；
- 第三优先：正在运行或等待外部结果的 Change；
- 第四优先：可以正常自动推进的 Change；
- 已关闭或归档 Change 默认不占据关注区域。

### 4.2 核心视图

| 视图 | 回答的问题 | 数据性质 |
|---|---|---|
| Attention Queue（关注队列） | 哪些事项需要处理，为什么，谁负责 | 从 Failure、Blocker、Evidence 缺口等派生 |
| Decision Inbox（决策箱） | 当前有哪些正式决策请求 | 从未决 Decision Request 派生 |
| Change Lifecycle（变更列表/看板） | 所有 Change 当前在哪里 | 从 Change Current State 派生 |
| Active Runs（活动运行） | Agent 和外部操作当前在做什么 | 从 Work Item、Run、Outbox、Deployment 派生 |
| Environments（环境概览） | 哪些 Change 占用或影响测试/生产目标 | 从 Environment、Lock、Release、Deployment 派生 |

V1 可以先以列表实现，后续再增加 Board。无论哪种形式，卡片单位是 Change，不把 N1–N5 当作看板列，也不把每个 Task 提升为项目级噪声。

### 4.3 Attention Item

Attention Item 只是一条可重建查询项，至少向用户说明：

- 发生了什么；
- 影响哪个 Change、对象和环境；
- 严重程度与当前责任角色；
- 需要执行的下一动作；
- 依据的 Failure、Blocker、Evidence 或 Decision Request；
- 是否已过期或被新事实取代。

“已读”只改变用户视图，不解除 Blocker、不等于 Decision，也不关闭 Failure。

## 5. 创建 Change

### 5.1 显式创建边界

普通对话、Agent 建议或浏览需求不会自动创建 Change。入口包括：

- 用户主动选择“创建 Change”；
- Agent 提出创建建议，用户明确确认；
- 导入外部 Issue/Incident 后由用户确认创建。

### 5.2 最小创建信息

创建时只要求足以建立责任边界的信息：

- 简短标题和原始诉求；
- 来源或 External Reference；
- 唯一 Human Change Owner；
- Provisional Profile（临时类型）建议；
- 初始范围、紧急度和已知影响。

提交后立即生成 Draft Change 和唯一 Change Room。Contract、Risk 与正式 Profile 在 Change Room 中继续澄清，不要求创建表单一次填完所有内容。

### 5.3 创建后的第一屏

用户应立即看到：

- 稳定 Change ID 与当前 Draft 状态；
- Change Owner；
- 原始诉求与来源；
- Agent 建议的下一步澄清问题；
- 尚缺少哪些 Contract 信息；
- “开始澄清”而不是“立即实现”的主动作。

## 6. Change Room 信息架构

每个 Change 自动拥有唯一逻辑 Change Room。推荐信息层次如下：

### 6.1 顶部身份区

持续展示：

- Change Display Key 与标题；
- Profile、Change Owner 和关键责任角色；
- lifecycle state、flow condition、delivery status 与 outcome status；
- 当前 Contract/Plan Version 和 Artifact Digest；
- 风险摘要与最后更新时间。

宏观生命周期状态与局部 Task/Run 状态分开展示，避免一次测试失败让用户误以为整个 Change 状态反复跳动。

### 6.2 Current Focus（当前焦点）

首屏最重要区域回答：

- 当前目标是什么；
- 为什么正在等待或执行；
- Kernel 已检查哪些条件；
- 还缺少哪些条件；
- 下一状态是什么；
- 当前用户是否有可执行主动作。

每个状态最多突出一个主动作。例如“批准 Contract v2”“查看失败证据”“核对未知部署结果”，其他动作降为次要入口。

### 6.3 详情分区

| 分区 | 主要内容 |
|---|---|
| Overview（概览） | 当前焦点、状态、责任、风险、依赖和下一步 |
| Contract（契约） | Intent、Outcome、Non-goals、Acceptance Criteria、版本与 Amendment |
| Plan & Work（计划与工作） | Plan Version、Task DAG、Ready/Blocked Task、Work Item 与 Run |
| Evidence（证据） | Claim 覆盖、Supports/Refutes/Inconclusive、失效和 Evidence Package |
| Delivery（交付） | Artifact、Environment、Release、Deployment、Recovery 与 Reconciliation |
| Activity（活动） | 生命周期时间线和 Run 技术明细入口 |

分区只负责查询与发起 Command，不各自发明状态或写入方式。

## 7. 生命周期导航

界面可以把完整状态机压缩为用户可理解的六个阶段：

1. 创建 Change；
2. 契约与意图授权；
3. 计划、执行与独立评价；
4. 测试环境验证；
5. 生产发布与即时验证；
6. 关闭与学习。

阶段导航用于解释和定位，不是新的状态字段。实际状态仍使用 Kernel lifecycle state 与 flow condition。

每个阶段展开后显示：权威对象、完成条件、当前证据、决策历史、失败/修复循环和下一迁移。

## 8. 决策交互

### 8.1 Decision Inbox 与 Change Room

- Workbench Decision Inbox 汇总当前用户具备 acting role 的全部待决事项；
- Change Room 只显示当前 Change 的 Decision Request；
- 二者指向同一个 Decision Request ID；
- 外部通知只提供入口，不成为另一套批准系统。

### 8.2 决策面板

正式决策必须展示：

- 系统正在询问什么；
- 所需 acting role；
- 被决定对象及精确版本/Digest/Environment；
- 推荐动作和理由，但明确标注为建议；
- 支持与反驳 Evidence；
- 风险、Policy、Exception 与残余问题；
- approve（批准）、request changes（请求修改）和 reject（拒绝）的后果。

Decision 必须结构化提交。聊天回复、评论、“已读”或关闭弹窗都不等于授权。

### 8.3 防止过期批准

提交 Decision 前，界面和 Kernel 重新校验目标版本。若 Contract、Plan、Artifact、Environment、范围或风险已变化：

- 不允许继续提交旧 Decision；
- 展示变更差异；
- 关闭或过期原 Decision Request；
- 创建新的 Decision Request 或要求重新审阅。

## 9. Agent 与 Work Item 呈现

Change Room 把 Agent 作为一等参与者显示，但不把每次 Token 或 Tool Call 都放入主时间线。

### 9.1 Change 级摘要

默认显示：

- 当前 Role、Work Item 目标与授权范围；
- Run 状态、开始时间、重试和预算；
- 使用的 Context Pack 与 Capability Binding；
- 当前产出、Failure、Blocker 和待升级事项；
- 是否正在安全停止、恢复或核对。

### 9.2 Run Detail

用户进入具体 Run 后才查看：

- Agent 输出与关键消息；
- 工具调用、命令、耗时、错误与重试；
- Context Pack、Model、Skill、Tool、Adapter 版本；
- 原始日志 External Reference；
- 权限、Lease、Lock 和终止原因。

推理私有轨迹不是产品审计要求；系统记录可验证输入、动作、输出和理由摘要。

## 10. Evidence 呈现

Evidence 视图围绕 Claim，而不是围绕文件列表组织：

- 每个 Acceptance Criterion 对应哪些 required Claim；
- 每个 Claim 当前为 Satisfied、Refuted、Insufficient、Conflicted 或 NotApplicable；
- 哪些 Evidence 支持、反驳或无法判定；
- Evidence 适用的 Contract、Artifact、Environment 与时间；
- 哪些 Evidence 已 Stale、Superseded 或 Invalid；
- Gate 仍缺少什么以及如何补齐。

反驳、冲突和证据缺口必须显眼，不能埋在大量通过项之中。原始日志通过 External Reference 下钻查看。

## 11. Delivery 呈现

Delivery 分区按“授权”和“实际尝试”分开：

- Artifact：来源、Digest、构建与评价状态；
- Release：目标 Environment、范围、窗口、Recovery Strategy 和批准状态；
- Deployment：每次实际尝试、外部状态、即时验证和失败；
- Reconciliation：未知外部结果的核对进度；
- Recovery：回滚、前滚、流量切换、数据恢复或补偿。

同一 Digest 从测试晋升生产应形成清晰链路。Digest 不一致、Decision 过期或外部状态未知时，界面直接说明为何不能继续。

## 12. 双层时间线

### 12.1 生命周期时间线

Change Room 默认显示对业务闭环有意义的事件：

- Change 创建和 Owner 移交；
- Contract/Plan 批准与 Amendment；
- Gate 结果和状态迁移；
- 关键 Artifact 与评价结论；
- Release Decision、Deployment 与 Recovery；
- Blocker 打开/解除；
- 关闭、取消、取代和学习候选。

### 12.2 技术运行时间线

进入具体 Run 后显示消息、工具调用、命令、Token/成本、Lease、重试和错误。关键 Failure 或结论提升到生命周期时间线，普通技术噪声不提升。

两个时间线通过稳定 Run/Event ID 关联，而不是复制内容。

## 13. Command 与 Query 交互

- 页面读取 Change、Timeline、Evidence、Decision Inbox、Attention Queue 等 Read Model；
- 所有写入动作提交 Command Envelope；
- UI 不直接修改数据库对象或 Current State；
- Command 接受后显示已提交事实和新 Event；
- Command 被拒绝时展示状态、版本、权限、Policy 或幂等原因；
- Read Model 尚未追上 Event 时显示“已提交，视图更新中”，不重复发送 Command；
- 高风险动作提交前展示对象、版本、环境、范围和后果，不使用模糊确认。

CLI、Workbench、Agent Runtime 与未来外部渠道使用同一 Command/Query 语义。

## 14. 通知

通知是 Event 与 Attention/Decision Read Model 的派生投影：

- Decision Request、严重 Failure、Blocker、风险升级、生产未知状态和人工接管需要通知；
- 普通成功事件只进入时间线；
- 已读、静音或投递失败不改变原 Decision、Blocker 或 Event；
- V1 提供 Workbench 内通知和可选桌面通知；
- Teams、飞书、邮件等后续通过 Notification Adapter 接入。

## 15. Embedded Solo Mode

V1 Workbench 是本地单用户产品，但仍完整显示 Actor、acting role、Decision 与职责分离：

- 不建设组织登录、实时多人在线和复杂权限后台；
- 不实现通用聊天或自由评论系统；
- 实时对话继续发生在所选 Agent Runtime；
- Change Room 只保留结构化 Feedback、Decision、Artifact、Evidence 与必要 Conversation Summary；
- Project 创建者作为 Project Owner，可以显式承担多个角色；
- 高风险缺少第二责任人时显示 break-glass，而不是伪造多人复核。

## 16. Team Mode 演进

Team Mode 复用相同界面语义并增加：

- 多用户身份、Assignment 和交接；
- 共享 Decision Inbox 与 Attention Queue；
- 实时更新、通知路由和冲突提示；
- 团队级 WIP、容量与环境占用；
- 外部协作渠道入口。

Team Mode 不改变 Change Room 的一一对应关系、Command 权威、Decision 结构和双层时间线。

## 17. V1 页面范围

V1 至少包含：

1. Project Workbench；
2. 创建 Change；
3. Change Room Overview；
4. Contract 与 Plan 查看/修订入口；
5. Decision Inbox 与结构化决策面板；
6. Task/Work Item/Run 状态与 Run Detail；
7. Claim/Evidence 覆盖视图；
8. Artifact/Release/Deployment/Recovery 视图；
9. 生命周期时间线；
10. Project/Role/Environment 最小配置入口。

V1 不包含通用聊天、社交动态、实时协作文档、复杂可定制 Dashboard 或传统 Issue Tracker 全量能力。

## 18. 交互不变量

1. Change Room 是查询与操作投影，不拥有或复制事实对象。
2. 页面上的状态只能来自 Kernel Current State 和 Event，不由前端推断写回。
3. 每个正式写入都通过 Command；通知、评论和已读不能代替 Decision。
4. 当前焦点必须说明为什么停留、缺少什么和下一步由谁负责。
5. 宏观 Change 状态与 Task/Run 局部状态分开展示。
6. Decision 必须绑定精确版本、Artifact、Environment 和 acting role。
7. Evidence 以 Claim 覆盖组织，反驳和缺口不能被通过项淹没。
8. 生命周期时间线与技术 Run 日志分层展示。
9. Read Model 延迟不能导致重复 Command 或虚假状态。
10. Solo 与 Team 使用同一 Protocol、Kernel 和交互语义。

## 19. 阶段结论

本模型采用“Project Workbench 跨 Change 关注优先、Change Room 单 Change 闭环、Current Focus 驱动下一动作、Decision 结构化、Evidence 按 Claim 呈现、生命周期与 Run 双层时间线”的交互架构。

上述语义及交互原型已经确认。后续视觉样式、前端框架和外部协作渠道可以独立演进，但不得把 Change Room 变成新的事实聚合、把通知或评论当作 Decision，或把技术日志重新淹没生命周期主线。
