# CimiLoop 工作台与需求 / 缺陷详情交互模型 v0.1

> 状态：讨论确认稿
> 日期：2026-09-19
> 修订：2026-09-28，熟悉的业务入口、统一需求池与共享发布记录；保留原文件名。
> 范围：定义 Project Workbench、Change Room、Decision Inbox、Attention Queue、双层时间线与 V1 交互闭环；不定义最终视觉规范、前端框架或 Teams/飞书界面。

## 1. 文档定位

本文回答“用户如何录入并澄清需求 / 缺陷、规划可选目标版本、拆任务，以及理解多个需求共同测试和发布的进度”。

依据 `docs/plans/2026-09-28-cimiloop-requirement-bug-unified-model-design.md` 同步交互语义；当前演示原型尚未更新。业务入口使用项目、版本、需求、缺陷和任务，不要求用户额外创建或维护 Change、Delivery Item 或 Work Item。

本文承接：

- `docs/architecture/CimiLoop整体能力架构-v0.1.md`；
- `docs/architecture/CimiLoopChange端到端状态机-v0.1.md`；
- `docs/architecture/CimiLoop角色与权限模型-v0.1.md`；
- `docs/architecture/CimiLoop验证与证据模型-v0.1.md`；
- `docs/architecture/CimiLoop工程交付与DevOps模型-v0.1.md`。

Workbench 与 Change Room 是 Operator Surface（操作界面）和 Derived Read Model（派生查询模型），不是新的事实聚合，也不能绕过 Kernel 写入状态。

## 2. 用户必须随时得到的七个答案

每个主界面优先回答：

1. 这是什么需求或缺陷，原始诉求及澄清来源是什么；
2. 当前处于什么生命周期状态；
3. 为什么停在这里，阻塞条件是什么；
4. 现在需要哪个 Human Role 作出什么决定；
5. Agent、Tool 或外部系统正在做什么；
6. 当前结论由哪些 Contract、Artifact、Evidence 和 Decision 支撑；
7. 下一步可能进入哪里，失败时如何修复或恢复。

涉及测试或发布时，还必须显示目标版本与实际发布版本的区别、当前环境实际制品以及本需求是否真的纳入；同批发布成功不等于本需求已完成。

界面不以“展示所有数据库对象”为目标，而以降低理解和决策成本为目标。

## 3. 交互架构

```text
Project Workbench
├── 需求池：全部需求 / 缺陷，按类型、状态、目标版本筛选
├── 目标版本：规划清单，与实际发布记录分开
├── 任务：实施计划中的工作
├── 待决定 / 需关注事项
└── 发布记录与环境概览：共享构建、测试、release 占用及生产结果
        ↓ 选择一条需求 / 缺陷
需求 / 缺陷详情（内部 Change Room）
├── 原始诉求、当前焦点与下一步
├── 澄清 / 验收约定 / 拆分来源
├── 实施计划、任务与执行记录
├── 验收结果与依据
└── 关联发布记录与业务时间线
```

项目工作台负责跨需求汇总，详情跟踪单条需求，项目级发布记录跟踪共同集成与部署。需求池、类型入口和目标版本视图组织相同 Change 事实，不制造两份对象；共享发布也不在每条详情复制一套部署。

## 4. Project Workbench

### 4.1 熟悉的业务入口与关注提示

工作台支持团队熟悉的录入和跟踪，需求池是统一台账；需求、缺陷入口是类型筛选而不是两个独立池。Attention 与 Decision 作为突出的待办提示，不替代项目、版本和需求跟踪。在需关注区域按以下顺序组织：

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
| 需求池 / 需求与缺陷列表 | 全部记录当前在哪里，有无目标版本 | 同一 Change 事实按类型、状态、目标版本筛选 |
| 目标版本 | 计划纳入哪些需求，与实际交付有何差异 | 规划归属及历史，不代表已合入或已上线 |
| 发布记录 | 每次集成 / 发布快照实际纳入什么、验收与部署如何 | 共享发布、实际清单、Artifact、Release 和 Deployment |
| Active Runs（活动运行） | Agent 和外部操作当前在做什么 | 从 Work Item、Run、Outbox、Deployment 派生 |
| Environments（环境概览） | 当前实际制品及 feature / release 的环境占用 | 从 Environment、占用 / 核对、Release、Deployment 派生 |

V1 可以先以列表实现，后续再增加 Board。业务卡片单位是需求或缺陷（内部 Change）；未指定版本不是处理状态，需求池也不等于待规划列表。不把 N1–N5 当作看板列；任务可有独立列表，但不把运行尝试冒充任务。

### 4.3 Attention Item

Attention Item 只是一条可重建查询项，至少向用户说明：

- 发生了什么；
- 影响哪个 Change、对象和环境；
- 严重程度与当前责任角色；
- 需要执行的下一动作；
- 依据的 Failure、Blocker、Evidence 或 Decision Request；
- 是否已过期或被新事实取代。

“已读”只改变用户视图，不解除 Blocker、不等于 Decision，也不关闭 Failure。

## 5. 录入需求 / 缺陷与澄清

### 5.1 显式创建边界

普通对话和未确认的 Agent 建议不会自动录入正式记录。入口包括：

- 用户主动选择“录入需求 / 缺陷”，选择需求或缺陷类型；
- Agent 提出创建建议，用户明确确认；
- 导入外部 Issue/Incident 后由用户确认创建。

### 5.2 最小创建信息

创建时只要求足以建立责任边界的信息：

- 项目与业务类型（需求 / 缺陷）；
- 简短标题或一句话原始诉求，不要求先写完整需求规格；
- 责任归属可由有效项目配置解析并展示，缺失时明确提示；
- 来源、紧急度、影响和目标版本可补充，目标版本不强制；
- 不要求用户选择内部 Profile，它由澄清与 Policy 提出建议，后续确认。

提交即创建同一需求 / 缺陷身份（内部 Draft Change）和详情页，默认待澄清；不在决定要做时再建第二份 Change。Contract、Risk 与正式 Profile 后续形成，创建不授权正式实现。

### 5.3 创建后的第一屏

用户应立即看到：

- 稳定需求 / 缺陷编号及待澄清状态，不同时展示两个业务身份；
- 当前负责人和业务类型；
- 原始诉求与来源；
- Agent 建议的下一步澄清问题；
- 尚缺少哪些 Contract 信息；
- “开始澄清”而不是“立即实现”的主动作。

### 5.4 澄清与平级拆分

澄清允许细化原记录、经人确认拆成多个独立需求 / 缺陷，或暂缓 / 不采纳。拆分界面展示原文、每条建议的独立业务结果、验收标准和来源；技术分工进入任务，不生成子需求树。

确认拆分后原记录显示已拆分及新记录链接，新记录显示拆分自哪个来源；不级联关闭。已拆分不能出现在已交付统计中；延期则保留身份、已有进度及规划变更历史，不重录需求。

## 6. 需求 / 缺陷详情信息架构（内部 Change Room）

每个 Change 自动拥有唯一逻辑 Change Room。推荐信息层次如下：

### 6.1 顶部身份区

持续展示：

- 需求 / 缺陷编号、类型、标题与负责人；
- 业务阶段、阻塞 / 等待原因和关键责任角色；
- 可选目标版本，未指定时直接显示未指定，不冒充待澄清状态；
- 需求基线 / 计划修订及本需求关联的实际发布版本；技术 Digest 可下钻查看；
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
| 目标与验收 | 原始诉求、澄清、范围、非目标、验收标准、基线修订和拆分来源 |
| 实施计划与任务 | 计划修订、Task DAG、阻塞与执行记录；内部授权和 Run 可下钻 |
| 验收结果 | 验收项覆盖、通过 / 反驳 / 不足、适用发布快照和原始依据 |
| 交付记录 | 关联共享发布、实际纳入与延期、环境、部署 / 恢复和状态核对 |
| Activity（活动） | 生命周期时间线和 Run 技术明细入口 |

分区只负责查询与发起 Command，不各自发明状态或写入方式。

## 7. 生命周期导航

界面可以把完整状态机压缩为用户可理解的六个阶段：

1. 录入需求 / 缺陷并澄清，必要时平级拆分；
2. 明确验收约定并批准需求基线；
3. 计划、执行与独立评价；
4. 纳入共享集成并在实际测试快照上验证；
5. 关联 release 的共同生产发布与即时验证；
6. 关闭与学习。

阶段导航用于解释和定位，不是新的状态字段。实际状态仍使用 Kernel lifecycle state 与 flow condition。

测试 / 生产部署进度来自共享发布记录，需求详情仅显示关联，不因展开阶段创建本需求独占的部署流程。业务状态与协议枚举的完整映射仍待设计。

每个阶段展开后显示：权威对象、完成条件、当前证据、决策历史、失败/修复循环和下一迁移。

## 8. 决策交互

### 8.1 Decision Inbox 与 Change Room

- Workbench Decision Inbox 汇总当前用户具备 acting role 的全部待决事项；
- 需求详情显示本需求的决定，以及实际关联的共享发布请求；共享请求明确展开本批全部纳入范围，不只显示当前需求；
- 二者指向同一个 Decision Request ID；
- 同一共享发布请求在工作台、发布页和多条需求详情都指向同一 ID，批准一次，不逐条复制审批；
- 外部通知只提供入口，不成为另一套批准系统。

### 8.2 决策面板

正式决策必须展示：

- 系统正在询问什么；
- 所需 acting role；
- 被决定对象及精确版本/Digest/Environment；
- 发布批准包含完整实际纳入清单、延期 / 剔除差异及共同风险，目标版本规划清单不能替代实际内容；
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

需求详情把 Agent 作为参与者显示，日常用任务、执行记录和验收结果解释工作；Work Item / Run 仅在执行明细中说明，不成为用户必须先学习的主入口，也不把每次 Token 或 Tool Call 放入主时间线。

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

### 11.1 项目级发布记录

一个发布页统一展示：精确 feature / release 来源、不可变发布快照与制品、实际纳入需求及各自验收、原规划与实际交付差异、测试环境占用、生产授权和实际部署。目标版本页展示规划归属，发布页展示实际内容，允许发布包含尚未指定目标版本的需求。

冻结后突出显示测试环境由 release 占用、feature 环境部署暂停；仍可继续开发合入。若有旧 feature 在途部署，明确显示核对 / 阻塞，不能显示环境已安全切换。

问题处理入口先提供修复与影响分析；赶不上窗口时提交延期 / 剔除建议，展示依赖、实际代码移除、新制品、必要回归及重新核验授权的条件。不是取消勾选后立即发布；未确认责任与授权时不得自动执行剔除。

### 11.2 需求详情中的关联交付

同一需求可关联多次测试快照，同一发布可被多条需求引用；共同部署只显示同一条记录。显示本需求是否实际纳入、在哪个制品通过验收、是否达到交付终点，延期及已拆分不能显示已完成。

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
- 澄清、平级拆分来源、目标版本归属变化和延期；
- Contract/Plan 批准与 Amendment；
- Gate 结果和状态迁移；
- 关键 Artifact 与评价结论；
- 关联的共享发布 Decision、Deployment 与 Recovery，以及本需求实际交付核验；
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
2. 统一需求池与需求 / 缺陷录入、澄清及平级拆分入口；
3. 需求 / 缺陷详情（内部 Change Room）；
4. Contract 与 Plan 查看/修订入口；
5. Decision Inbox 与结构化决策面板；
6. Task/Work Item/Run 状态与 Run Detail；
7. Claim/Evidence 覆盖视图；
8. Artifact/Release/Deployment/Recovery 视图；
9. 生命周期时间线；
10. Project/Role/Environment 最小配置入口。
11. 目标版本规划视图与归属变更历史；
12. 项目级发布页、实际纳入清单及 feature / release 环境占用提示。

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
11. 需求池组织同一批需求 / 缺陷；录入和实施均不强制目标版本，不创建第二份 Change 身份。
12. 需求阶段与共享部署阶段分开，部署成功不批量完成未纳入或延期记录。
13. 原始记录已拆分只保留溯源，不产生子需求级联或虚假交付统计。

## 19. 阶段结论

本模型采用熟悉的项目、版本、需求、缺陷和任务入口，以统一需求池组织记录，以需求详情跟踪同一身份，以项目级发布页表达共同测试与部署；保留关注提示、结构化决定、验收依据与分层时间线。

本次确认并同步的是交互语义，旧交互原型尚未同步。状态映射、发布物理对象和环境占用释放仍待设计；不得把查询页面变成新的事实聚合、把通知或评论当作 Decision，或把技术日志淹没业务主线。
