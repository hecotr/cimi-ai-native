# CimiLoop 整体架构通俗解读 v0.1

> 状态：讲解基线
>
> 日期：2026-09-19
>
> 读者：第一次接触 CimiLoop 的产品、研发、测试、运维、业务和管理人员
>
> 定位：本文用一个完整例子解释 CimiLoop 已确认架构，便于介绍、培训和形成共同理解；它不是字段级 Schema 或实现说明。发生语义冲突时，以对应专项架构文档和决策账本为准。

## 1. 先用一句话认识 CimiLoop

CimiLoop 是围绕一次软件 Change（变更），管理它从意图澄清、计划、执行、验证、发布、知识更新、恢复到关闭全过程的 Runtime-neutral Harness（运行时中立的智能体治理与交付框架）。

最重要的分工是：

> CimiLoop 管“这次变更如何可信地走完”；Agent Runtime 管“Agent 如何把当前任务执行出来”。

V1 的首个 Agent Runtime 从 OpenCode 或 Claude Code 中选择；企业内部基于 OpenCode 二次开发的 cimicode，后续通过同一个 Runtime Adapter 契约接入。

## 2. 为什么只使用编码 Agent 还不够

假设用户说：

> 给订单系统增加导出功能。

Agent 可以阅读代码、修改文件、写测试并告诉用户“已经完成”。但真实交付还需要回答：

- Agent 是否正确理解了需求；
- 哪些内容明确不做；
- 谁批准开始实施；
- 它依据哪个需求和计划版本执行；
- 修改产生了哪个不可变制品；
- 哪些证据证明功能、权限、性能和安全要求；
- 测试与生产是否使用同一个 Artifact；
- 谁批准了具体生产 Release；
- 部署超时后实际成功还是失败；
- 生产验证失败时怎样恢复；
- 系统变化后，产品、业务、技术和运维文档是否同步更新；
- 几个月后能否解释整个过程。

Claude Code、OpenCode 等 Agent Runtime 擅长执行任务，但不会天然承担完整的 Change 生命周期、责任、证据和恢复治理。这是 CimiLoop 的职责。

## 3. CimiLoop 不是什么

CimiLoop 不试图：

- 取代 OpenCode、Claude Code 或 cimicode；
- 取代 Git；
- 取代 CI/CD、环境平台或 Artifact Registry；
- 变成通用 Issue 系统；
- 变成聊天和社交协作平台；
- 让某个 Skill、OpenSpec 或 CodeGraph 成为状态权威；
- 让 Agent 自己批准需求、计划或生产发布。

CimiLoop 把这些能力接入同一个可信交付闭环，但保持每个系统自己的事实权威。

## 4. 四类产品构件

CimiLoop 可以从产品结构上理解为四类构件：

```text
Operator Surface 操作入口
CLI / Workbench / Change Room
        ↓
CimiLoop Kernel 确定性内核
State / Gate / Policy / Scheduling / Recovery
        ↓
Cimi Change Protocol 核心协议
Change / Contract / Plan / Evidence / Decision / Event
        ↓
Adapter & Capability 扩展层
Runtime / Skill / Git / DevOps / Knowledge
```

- Operator Surface 让人查看、操作和作出决定；
- Kernel 维护确定性状态、规则、调度和恢复；
- Protocol 提供稳定对象、身份、版本和关系；
- Adapter & Capability 接入外部执行、知识和工程系统。

## 5. 六个一级能力域

### 5.1 Interaction & Collaboration（交互与协作）

回答：人现在看什么、做什么？

包括：

- Project Workbench；
- Change Room；
- Attention Queue；
- Decision Inbox；
- 生命周期时间线；
- 结构化批准和反馈。

页面只能提交 Command，不能直接修改状态。

### 5.2 Change Lifecycle Kernel（变更生命周期内核）

回答：Change 在哪里，下一步是否合法？

包括：

- State；
- Transition；
- Gate；
- Work Item；
- Retry；
- Blocker；
- Lease 和 Resource Lock；
- Recovery 和 Reconciliation。

Kernel 是 Change 生命周期的唯一状态权威。

### 5.3 Intelligence & Context（智能与上下文）

回答：谁来思考，使用什么方法，获得哪些信息？

包括：

- Agent Role；
- Model；
- Skill 和 Tool；
- Context Pack；
- Knowledge 和 Memory；
- Capability Requirement、Resolver 和 Binding。

### 5.4 Engineering Execution & Delivery（工程执行与交付）

回答：真实代码、构建、测试和部署在哪里发生？

包括：

- Git Worktree；
- Agent Runtime；
- Source Snapshot；
- Artifact；
- Build 和 Test；
- Environment、Release 和 Deployment；
- Recovery。

### 5.5 Trust & Governance（信任与治理）

回答：凭什么相信，凭什么允许进入下一阶段？

包括：

- Claim；
- Evidence；
- Evaluation；
- Risk 和 Policy；
- Human Decision；
- Exception；
- 职责分离。

### 5.6 Protocol, Data & Integration（协议、数据与集成）

回答：事实如何稳定保存、引用和连接？

包括：

- Cimi Change Protocol；
- Stable ID 和业务版本；
- Command/Event Envelope；
- Event Ledger；
- Store Port 和 Outbox；
- Adapter、API 和 Export/Import。

Trust & Governance 以及 Protocol, Data & Integration 是横切能力，贯穿整个生命周期。

## 6. 三个最上层概念

### 6.1 Project（项目）

Project 是长期治理边界，管理共同的：

- Actor、Role 和 Assignment；
- Change Profile；
- Policy；
- Environment；
- Runtime、Skill、Tool 和 Adapter 配置；
- 并发和 WIP 规则。

Project 不保存单个 Change 的运行状态。同一个 Project 可以同时存在多个处于不同阶段的 Change。

### 6.2 Change（变更）

Change 是最小独立交付、责任、验证和生命周期单元，拥有自己的：

- Change Owner；
- Contract；
- Plan 和 Task DAG；
- Work Item 和 Agent Run；
- Artifact；
- Claim、Evidence 和 Gate Evaluation；
- Release 和 Deployment；
- 生命周期与关闭结论。

Change 不等于 Issue、Git 分支、PR、Agent Session 或 Pipeline Run。一次 Change 可以跨越多个这些工程对象。

### 6.3 Change Room（变更空间）

Change Room 是与 Change 一一对应的交互和查询投影，组合展示 Contract、Plan、Run、Evidence、Decision、Delivery 和 Timeline。

它不是事实聚合，可以从协议事实重建。用户在 Change Room 中操作时，实际过程是：

```text
用户操作
→ 提交 Command
→ Kernel 校验
→ 修改权威聚合
→ 产生 Event
→ 更新 Change Room
```

## 7. 从意图到执行的五层对象

```text
Contract：被批准做什么
    ↓
Plan：被批准怎么做
    ↓
Task：计划中有哪些持久工作节点
    ↓
Work Item：Kernel 这一次授权执行什么
    ↓
Agent Run：Runtime 实际执行的一次尝试
```

### 7.1 Change Contract

Contract 定义目标、范围、Non-goals、约束和验收标准。候选内容只有经 Intent Owner 批准后才形成正式不可变 Contract Version。

需求变化先形成 Contract Amendment；批准后生成新版本，旧版本保留。

### 7.2 Plan

Plan 定义技术方案、Task DAG、验证策略、风险控制和交付方案。每个 Plan Version 精确绑定它所依据的 Contract Version。

技术方案变化通常走 Plan Amendment；目标、范围或验收变化必须回到 Contract Amendment。

### 7.3 Task

Task 是 Plan 中有稳定身份的工作节点。Task DAG 表达依赖关系。Plan 修订时，含义不变的 Task 可以沿用 ID；拆分、合并或目标变化时创建新 ID 并保留谱系。

### 7.4 Work Item

Work Item 是一次有边界执行授权，固定：

- Contract/Plan Version；
- Task 和目标；
- Workspace；
- 权限和能力；
- 预算和停止条件；
- 要求输出的 Artifact/Evidence。

### 7.5 Agent Run

Agent Run 是 Runtime 执行 Work Item 的一次尝试。同一授权边界下重试创建新 Run；版本、目标、范围、权限或验证策略变化时必须创建新 Work Item。

Run success 只表示一次运行结束，不代表 Task 已验证或 Change 已完成。

## 8. Change 的完整生命周期

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

### 8.1 Draft

用户明确创建 Change，系统生成稳定 ID、Human Change Owner 和初始来源。普通对话不会自动创建正式 Change。

Draft 允许澄清、分析和原型，但未授权正式实现。

### 8.2 IntentReady

Contract Candidate 经 Intent Owner 批准，形成正式 Contract Version。request changes 留在 Draft；reject 使 Change 暂停，等待调整或取消。

### 8.3 Planned

Planner 形成 Plan Candidate、Task DAG、验证策略、恢复考虑和知识影响评估。Technical Owner 批准后形成正式 Plan Version。

### 8.4 Executing

Kernel 只为依赖、版本、权限、能力和资源条件满足的 Ready Task 创建 Work Item。Runtime 在隔离 Worktree 中执行。

### 8.5 Evaluating

完整 Artifact Candidate、Claim 和 Delivery Evidence 形成后，由独立 Evaluator 评价。失败时保留 Evidence，返回 Executing 并创建 Repair Work Item。

### 8.6 TestDeploying / TestValidating

通过评价的 Artifact 部署测试环境并验证。测试失败后必须回到源码修复、重新构建新 Artifact，再走评价和测试，不能在环境中热改后直接发布。

### 8.7 ReleaseReady / ProductionDeploying

测试通过后形成具体 Release Package。Release Owner 批准指定 Artifact Digest、Environment、范围、时间窗和 Recovery Strategy。Kernel 基于最新事实重新求值 Gate 后才允许生产部署。

### 8.8 ReleaseVerified / DeliveryClosed

生产部署后核对实际 Digest、健康和核心路径。关闭前还要确认 Decision、Evidence、已知问题、残余风险、知识义务和学习候选完整。

交付关闭不等于业务结果已经验证；Outcome 可以在关闭后继续观察。

## 9. 为什么状态不是一个字段

Change 同时有四个正交维度：

| 维度 | 回答的问题 |
|---|---|
| lifecycle_state | 主流程走到哪里 |
| flow_condition | 当前是否活跃、等待决定、暂停、阻塞或失败 |
| delivery_status | 软件实现、验证、发布和关闭到了什么程度 |
| outcome_status | 业务结果是否已经观察和验证 |

例如：

```text
lifecycle_state = ReleaseReady
flow_condition = AwaitingDecision
delivery_status = TestValidated
outcome_status = NotObserved
```

Pause、Blocked、Failed 和 AwaitingDecision 不覆盖生命周期位置，条件解除后从原位置继续。

## 10. 可信交付链

```text
Artifact
被验证对象
    ↓
Claim
明确待证明命题
    ↓
Evidence
支持、反驳或无法判断的事实
    ↓
Evaluation
对证据的分析
    ↓
Gate Evaluation
一次具体准入判断
    ↓
Human Decision
必要的责任授权
    ↓
Kernel Transition
正式状态迁移
```

### 10.1 Artifact

Artifact 是具有稳定 ID 与 Digest 的不可变候选交付物。Artifact 存在只证明产生了结果，不证明结果正确。

### 10.2 Claim

Claim 是可以被验证或反驳的明确命题，例如：

- 管理员可以导出订单；
- 普通用户不能导出；
- 文件不包含内部备注；
- 十万条订单的性能满足要求。

### 10.3 Evidence

Evidence 明确关联 Claim、对象、Artifact Digest、环境、来源、范围和时间。结果可以是 Supports、Refutes 或 Inconclusive。

没有 Evidence 是证据缺口，不等于反驳；明确反驳也不能靠更多支持证据投票覆盖。

### 10.4 Evaluation 与 Gate

Evaluator 分析 Evidence。Gate 是稳定的准入规则；Gate Evaluation 是基于当时 Requirement Set、版本、Evidence、Policy 和 Decision 的一次不可变判断。

结果可以是 ALLOW、REQUIRE_HUMAN、NEED_MORE_EVIDENCE 或 DENY。

### 10.5 Decision

Decision 记录具体 Actor 以明确 acting role 对精确对象和版本作出的正式决定。自然语言中的“可以”不自动等于正式批准。

Decision 不是状态修改指令。记录后 Kernel 必须基于最新事实重新求值 Gate，仍然 ALLOW 才能迁移。

## 11. 角色与权限

```text
Actor：是谁
Role：以什么责任身份
Assignment：为什么有资格承担该角色
```

### 11.1 Human Responsibility Role

V1 中只能由 Human 承担：

- Project Owner；
- Change Owner；
- Intent Owner；
- Technical Owner；
- Release Owner；
- Policy Owner；
- Incident Commander。

### 11.2 Executable Role

可由 Human 或 Agent 承担：

- Planner；
- Executor；
- Evaluator；
- Operator。

每个 Change 始终有且只有一个当前 Human Change Owner。Change Owner 负责推进和闭环，但不自动拥有全部批准权。

### 11.3 Solo Mode 与 acting role

Solo Mode 允许同一人兼任多个角色，但每次 Decision 都记录其 acting role。这样进入 Team Mode 后可以自然拆分责任，不重写历史。

### 11.4 独立评价与 break-glass

Executor 可以自检，但正式评价至少来自上下文隔离的 Evaluator。高风险场景可以要求不同 Actor；无法满足且必须紧急行动时，只能使用限时、限范围、增强 Evidence 并强制复盘的 break-glass。

### 11.5 权限交集

最终权限来自：

```text
Role Assignment
∩ Work Item Authorization
∩ Project Policy
∩ Change Risk
∩ Environment Policy
∩ Provider Requirements
∩ Runtime 实际边界
```

有代码修改权不等于有部署权；生产凭据不能进入 Prompt、Context、Event 或 Export。

## 12. Context、Knowledge 与 Capability

### 12.1 五类能力实现

- Runtime：承载 Agent Session 和工具调用；
- Model：负责理解、推理和生成；
- Skill：提供可复用方法与工作指令；
- Tool：执行文件、命令、测试或查询；
- Adapter：连接 Runtime、Git、DevOps、Knowledge 等外部系统。

### 12.2 需求与实现分离

流程声明语义化 Capability Requirement，例如 `code.modify`、`test.execute`、`evaluation.independent`，而不是写死某个产品。

Provider Descriptor 描述具体实现；Resolver 按 Policy、权限、兼容性、可信和健康选择；每次 Run 生成不可变 Capability Binding。

同一 Run 内不能静默切换 Runtime、Model、Skill、Tool 或 Adapter。替换实现意味着新的 Run 或 Operation Record。

### 12.3 Context Pack

每个 Run 绑定不可变 Context Pack Manifest，记录所选来源、版本、Digest、权威等级、新鲜度和角色范围。

- Planner 获得 Contract、架构和规划资料；
- Executor 获得 Task、Work Item、相关代码和测试方法；
- Evaluator 获得 Contract、Artifact、Claim 和 Evidence，但不继承 Executor 完整对话；
- Release Operator 获得 Release、Environment 和 Recovery Strategy。

### 12.4 三层 Memory

- Run Memory：单次运行的临时观察；
- Change Memory：当前 Change 的协议事实与摘要；
- Project Knowledge：长期术语、架构、Policy、ADR 和运行手册。

Run Observation 不能自动成为 Project Knowledge。正确路径是：

```text
Observation
→ Learning Candidate
→ Eval
→ Owner Decision
→ 新知识版本
```

## 13. Change 的知识闭环

系统行为变化后，如果知识库仍描述旧世界，Change 就没有真正闭环。

### 13.1 Knowledge Impact Assessment

每个 Change 在 Contract/Plan 阶段检查：

- 产品与业务知识；
- 技术和 API 文档；
- 运维 Runbook 和恢复说明；
- Release Notes、培训和客服材料。

每项结果为 Create、Update、Deprecate、Verify 或 No Impact。

### 13.2 知识 Task 进入同一个 Plan DAG

例如订单导出 Change 可以包含：

```text
T1 修改导出服务
T2 增加测试
T3 更新 Repo API 文档
T4 业务人员更新飞书产品说明
T5 运维更新 Runbook
T6 核对知识 Evidence
```

Work Item 可以分配给 Agent、开发者、业务人员、运维人员或外部系统。Change Owner 确保有人负责，但不自动替代对应知识 Owner 确认内容正确。

### 13.3 Evidence 与 Gate

知识更新 Evidence 记录 External Reference、新 revision/version、受影响章节、更新者、Reviewer 和对应 Contract/Plan。

- 发布前必需的 Runbook、API 兼容说明和支持准备可以阻塞 Production Release Gate；
- 发布后才能完成的正式说明可以不阻塞部署，但阻塞 Closure Gate；
- 长期知识重构可以创建关联 Change，但不能转移当前交付必需义务。

V1 使用 Human Work Item 和 External Reference，不以前置飞书 Adapter 为条件。

## 14. 存储与恢复

CimiLoop Store 同时保存：

- Current State：现在是什么；
- append-only Event Ledger：怎样走到现在；
- Transactional Outbox：需要可靠发送的外部消息；
- Idempotency Result：重复 Command 返回同一结果；
- Read Model：Change Room、Timeline、Queue 和 Board。

CimiLoop 不采用纯 Event Sourcing。Current State 与 Event、Outbox 在一个本地原子事务中提交，外部副作用通过 Outbox 调用并记录实际结果。

结果未知时先 Reconciliation，不能盲重试。

## 15. 各系统的事实权威

| 系统 | 保存的原始事实 |
|---|---|
| CimiLoop | 生命周期、Contract/Plan、Decision、Gate、Work Item、核心 Evidence、Event |
| Git | 源码、commit、tree、diff、分支 |
| Agent Runtime | Session、Transcript、工具调用和命令输出 |
| CI/CD / DevOps | Pipeline、Build、Deployment 和原始日志 |
| Artifact Registry | 制品内容、Digest 和制品元数据 |
| 飞书/知识系统 | 产品、业务、运行或支持文档的原始内容与 revision |

CimiLoop 使用 Stable ID、External Reference、Version 和 Digest 关联它们，不复制所有原始内容。

## 16. Solo Mode 到 Team Mode

### 16.1 Embedded Solo Mode

```text
开发者电脑
├── CimiLoop CLI / Workbench
├── Kernel
├── SQLite / Local Files
├── OpenCode 或 Claude Code
├── Change Worktree
└── Git / DevOps Adapter
```

一名用户可以承担多个责任角色，但所有决定仍保留 acting role、版本和 Evidence。

### 16.2 Shared Team Mode

未来共享 Kernel 和 Team Store，多个 Human 与本地 Runtime 连接同一项目空间。代码、Worktree、凭据和原始执行仍可以留在各自执行机器。

### 16.3 Portable Export/Import

迁移使用协议级 Portable Export，不复制 SQLite 内部格式。它保留 ID、Schema Version、业务版本、Event、Decision、Evidence、Digest 和关系。

Import 先进入 Staging，校验引用、事件连续性、Digest、Schema 和分叉历史；激活 Team 实例后，原 Solo 实例只读封存，避免双写。

## 17. V1 的真实交付目标

V1 选择“窄范围、完整闭环”，必须用真实项目完成：

```text
创建 Feature Change
→ 批准 Contract
→ 批准 Plan
→ Runtime 在隔离 Worktree 实现
→ 构建不可变 Artifact
→ 独立评价
→ 部署和验证测试环境
→ 批准具体生产 Release
→ 同一 Artifact Digest 晋升生产
→ 即时验证
→ 完成知识义务
→ 关闭 Change
```

除正常路径外，还必须验证：评价失败、Artifact 改变、Decision 过期、外部结果未知、生产验证失败、Kernel 重启、权限/Policy 变化、Export/Import 和知识义务未完成。

## 18. M0–M5 实施里程碑

| 里程碑 | 交付重点 |
|---|---|
| M0 | Protocol、ID、Command/Event、SQLite Store、Event/Outbox、幂等与重启恢复 |
| M1 | Draft、Contract、Plan、Task DAG、Role、Decision、Knowledge Impact 和基础 Change Room |
| M2 | Work Item、Runtime Adapter、Worktree、Context/Capability Binding、Run、Artifact |
| M3 | Claim、Evidence、独立 Evaluator、Gate Evaluation、Stale 传播和 Repair 循环 |
| M4 | Environment、Release、Deployment、真实 DevOps、同 Digest 晋升、Recovery/Reconciliation |
| M5 | 完整 Workbench、关闭与异常、知识 Closure、Export/Import、故障注入和发布加固 |

## 19. Build / Adopt / Adapt 最终组合

### Build（自研）

- Cimi Change Protocol；
- Kernel、状态机和调度；
- Gate、Decision 和 Evidence 治理；
- Capability Resolver 和 Binding；
- Store Port；
- Workbench 和 Change Room；
- Portable Export/Import。

### Adopt（采用）

- SQLite；
- Git；
- Agent Skills 包格式。

### Adapt（适配）

- V1 首个 OpenCode 或 Claude Code Runtime；
- 未来企业内部 cimicode；
- Git/Workspace；
- CI/CD、Environment 和 Artifact Registry；
- 可选 OpenSpec Spec Provider；
- 后续飞书/Knowledge Adapter。

### Selective Adapt（选择性适配）

- Matt Pocock Skills：优先访谈、领域建模、诊断、TDD 和双轴评审；
- Superpowers：只评估部分执行 Skill，不启用其全局总流程。

### Defer（延后）

- CodeGraph；
- Multica；
- OPA、Argo Rollouts、OpenTelemetry；
- Spec Kit、ECC、OpenHands 的整体接入；
- Shared Team Mode 和外部协作同步。

## 20. 十条架构不变量

1. Change 状态只能由 Kernel 按规则迁移。
2. 正式实现前必须存在已授权 Contract。
3. 没有有效 Evidence 不能通过 Gate。
4. Agent 可以概率性推理，状态、权限、Gate 和审计必须确定。
5. Artifact、Decision 和 Transition 必须可追溯到 Actor、Role、版本、Context、Capability 和 Run。
6. 系统中断后必须能从持久化状态恢复，不依赖聊天上下文。
7. 关键 Gate 不能只依赖 Executor 自评。
8. 测试与生产使用同一 Artifact Digest。
9. 人工权力必须以 Role、Assignment 和 Decision 明确表达。
10. 外部 Runtime、Skill、Adapter 和知识系统不能反向控制 Kernel；已知必需知识义务未闭环时不能静默关闭 Change。

## 21. 用一句话向别人介绍

可以这样介绍 CimiLoop：

> CimiLoop 不是另一个编码 Agent，而是一套以 Change 为中心的软件研发 Harness。它把人、Agent、Git、CI/CD、环境和知识库组织到同一个确定性生命周期中，用 Contract 控制意图，用 Work Item 控制执行，用 Evidence 和 Gate 控制可信推进，用 Event 和 Store 保证恢复与审计，并确保代码变化和组织知识一起闭环。

## 22. 正式文档导航

- [整体能力架构](./CimiLoop整体能力架构-v0.1.md)
- [核心领域模型](./CimiChangeProtocol核心领域模型-v0.1.md)
- [Change 端到端状态机](./CimiLoopChange端到端状态机-v0.1.md)
- [角色与权限模型](./CimiLoop角色与权限模型-v0.1.md)
- [上下文与知识模型](./CimiLoop上下文与知识模型-v0.1.md)
- [能力装配模型](./CimiLoop能力装配模型-v0.1.md)
- [验证与证据模型](./CimiLoop验证与证据模型-v0.1.md)
- [工程交付与 DevOps 模型](./CimiLoop工程交付与DevOps模型-v0.1.md)
- [工作台与变更空间交互模型](./CimiLoop工作台与变更空间交互模型-v0.1.md)
- [存储与 Solo-Team 演进模型](./CimiLoop存储与Solo-Team演进模型-v0.1.md)
- [V1 产品范围与实施里程碑](../plans/2026-09-19-cimiloop-v1产品范围与实施里程碑-v0.1.md)
- [Build / Adopt / Adapt 选型矩阵](../plans/2026-09-19-cimiloop-build-adopt-adapt选型矩阵-v0.1.md)
- [讨论计划与决策账本](../plans/2026-09-18-cimiloop-capability-architecture-discussion-plan.md)
