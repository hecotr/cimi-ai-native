# CimiLoop 整体能力架构 v0.1

> 状态：讨论确认稿
> 日期：2026-09-18
> 范围：定义 CimiLoop Harness 的产品边界、一级能力架构、核心运行闭环、权威关系、部署模式和 V1 边界；不包含字段级 Schema、完整状态迁移表、页面设计和具体开源项目适配实现。

## 1. 文档定位

本文回答“CimiLoop 由哪些能力构成，以及这些能力如何共同运行”。

它承接以下上位文档：

- `docs/articles/01-AI-Native软件研发新范式.md`：解释 AI Native 软件研发范式；
- `docs/articles/02-CimiLoop-AI-Native软件研发流程规范-v0.1.md`：定义端到端流程、节点、Gate 和产物；
- `docs/plans/2026-09-17-cimiloop-ai-native研发操作模型-v0.1.md`：定义 Change、角色、自治、证据和生产闭环。

本文是后续 Cimi Change Protocol、Kernel、Workbench、Adapter 和 V1 实现设计的架构约束。

## 2. 产品定义与边界

> **CimiLoop 是一套以 Change（变更）为运行单元、以 Change Contract（变更契约）为基线、以 Evidence（证据）驱动 Gate（关卡）的 AI Native 软件研发 Harness，用于编排人和 Agent 完成从意图澄清到生产闭环的完整研发过程。**

CimiLoop 管理“这次变更如何可信地走完”；cimicode 管理“Agent 如何把当前任务执行出来”。

### 2.1 CimiLoop 负责

- Change 生命周期、状态迁移和恢复；
- Change Contract、Plan、Task、Artifact 和 Evidence 的关联；
- Gate、Policy、人工决策和规则例外；
- Human/Agent Work Item 的编排；
- Agent Run、测试、部署和发布结果的归集；
- Change Room、项目工作台和待决策事项；
- 运行事件、审计、Solo/Team 模式和外部 Adapter 契约。

### 2.2 CimiLoop 不负责

- 取代 cimicode、OpenCode、Claude Code 等 Agent Runtime；
- 自己实现编辑器、Shell、模型调用和通用聊天；
- 重新建设一套 CI/CD、制品库或生产凭据系统；
- 将某个 Skill、Spec 框架或代码图谱绑定为内核事实来源；
- 允许 Agent 直接修改权威状态、批准 Gate 或授予自身权限。

## 3. 产品结构

CimiLoop 由四类产品构件组成：

```text
┌──────────────────────────────────────────────┐
│ Operator Surface 操作入口                    │
│ CLI / Workbench / Future Change Room Channel│
├──────────────────────────────────────────────┤
│ CimiLoop Kernel 确定性运行内核               │
│ State / Gate / Policy / Scheduling / Recovery│
├──────────────────────────────────────────────┤
│ Cimi Change Protocol 核心协议                │
│ Change / Contract / Artifact / Evidence ...  │
├──────────────────────────────────────────────┤
│ Adapter & Capability 扩展层                  │
│ Runtime / Skill / SCM / DevOps / Knowledge   │
└──────────────────────────────────────────────┘
```

这四类构件不是四个独立产品。Protocol 提供共同语言，Kernel 维护确定性状态和规则，Operator Surface 让人和 Agent 参与，Adapter & Capability 将外部执行与知识能力接入闭环。

## 4. 十项架构不变量

1. **唯一状态权威**：Change 状态只能由 Kernel 按规则迁移；
2. **契约先于执行**：正式实现前必须存在获授权的 Change Contract；
3. **证据先于通过**：没有有效 Evidence 不能通过 Gate；
4. **概率性执行、确定性治理**：Agent 可以概率性推理，状态、权限、Gate 和审计必须确定；
5. **行为可追溯**：产物、决策和迁移能够追溯到 Actor、Role、输入、工具、版本和 Run；
6. **流程可恢复**：系统中断后可以从持久化状态恢复，不依赖聊天上下文；
7. **执行与验证适度独立**：关键 Gate 不能只依赖 Executor 的自我评价；
8. **环境逐级晋升**：测试环境验证通过是生产发布的前置条件；
9. **人工权力显式表达**：人工审批点和职责必须由 Policy 和 Role 表达，不能隐藏在 Prompt 中；
10. **外部能力不能反向控制内核**：Adapter 可以提交结果和证据，不能自行修改核心状态语义。

## 5. 一级能力架构

```text
┌────────────────────────────────────────────────────────────┐
│ 1. Interaction & Collaboration 交互与协作                  │
│ Project Workbench / Change Room / Decision Inbox / Actor   │
├────────────────────────────────────────────────────────────┤
│ 2. Change Lifecycle Kernel 变更生命周期内核                │
│ State / Transition / Gate / Work Item / Retry / Recovery   │
├────────────────────────────┬───────────────────────────────┤
│ 3. Intelligence & Context  │ 4. Execution & Delivery       │
│ Agent / Role / Skill       │ Worktree / Runtime / Build    │
│ Context Pack / Knowledge   │ Test / Deploy / Release       │
├────────────────────────────┴───────────────────────────────┤
│ 5. Trust & Governance 信任与治理                           │
│ Claim / Evidence / Evaluation / Risk / Approval / Exception│
├────────────────────────────────────────────────────────────┤
│ 6. Protocol, Data & Integration 协议、数据与集成基础       │
│ Protocol / Store / Event / Outbox / Adapter / API          │
└────────────────────────────────────────────────────────────┘
```

六个能力域是职责划分，不是严格的进程调用栈。Trust & Governance 和 Protocol, Data & Integration 是横切能力，贯穿其他能力域。

## 6. Interaction & Collaboration：交互与协作

### 6.1 目标

让 Human 和 Agent 围绕同一个 Change 看见信息、参与工作、提交反馈和决策，并理解整个过程发生了什么。

### 6.2 核心能力

#### Project Workbench

- Attention Queue：失败、阻塞、风险变化、证据不足等需要关注的事项；
- Decision Inbox：需要正式 Human Decision 的事项；
- Change Lifecycle Board：以 Change 为卡片的生命周期看板；
- Active Agent Runs：正在运行、等待和失败的 Agent Run；
- Environment/Release Overview：测试、生产部署和发布状态。

项目工作台采用 Attention-first，而不是退化为传统 Task Kanban。N1–N5 是价值和责任模型，不直接作为看板列。

#### Change Room

每个 Change 自动拥有唯一逻辑协作空间，组织：

- 当前状态与下一步；
- Contract、Plan 和 Task DAG；
- Human/Agent 参与者；
- Artifact、Evidence 和 Gate；
- Feedback、Decision 和 Exception；
- 生命周期时间线和 Agent Run 技术日志。

Change Room 采用两层时间线：默认展示生命周期关键事件，进入具体 Run 后再展示工具调用、命令、Token、重试和错误等技术日志。

#### Actor 与协作信息

- Human 和 Agent 使用统一 Actor 抽象，并通过 `actor_type` 区分；
- Human Decision 同时记录 `actor_id` 与 `acting_role`；
- Agent 行为关联 Agent Profile、Role 和 Agent Run；
- Agent 不能冒充 Human Actor 或行使人类最终授权权力；
- V1 不建设聊天系统，只保存结构化 Feedback、Decision、Artifact、Evidence 和必要的 Conversation 摘要/引用。

#### 统一交互契约

- Query 读取 Change、Timeline、Run、Evidence、Decision Inbox 和 Attention Queue；
- Command 表达 Actor 希望执行的动作，是否接受由 Kernel 判断；
- CLI、Workbench、cimicode 和未来协作渠道使用相同语义；
- 任何入口都不能直接写 Store 或绕过 Gate；
- Notification 是 Event 的派生投影，已送达或已读不等于正式 Decision。

### 6.3 V1 边界

V1 提供本地 Project Workbench 和 Change Room，不实现通用聊天、实时多人编辑、组织账号体系、Teams/飞书同步。外部协作渠道后续通过 Adapter 接入。

## 7. Change Lifecycle Kernel：变更生命周期内核

### 7.1 目标

确定一个 Change 当前在哪里、下一步允许做什么、由谁做、满足什么条件才能继续，以及失败或中断后如何恢复。

### 7.2 生命周期和状态

- 使用稳定生命周期骨架与 Change Profile 驱动路径；
- 不强制所有 Change 走完全相同的固定流程；
- 不建设任意定义节点和连线的通用工作流平台；
- Profile 可以调整活动、Evidence 和人工 Gate，不能绕过架构不变量。

Change 使用多维状态：

- `lifecycle_state`：精确生命周期位置；
- `flow_condition`：Active、AwaitingDecision、Paused、Blocked、Failed 等运行状况；
- `delivery_status`：NotStarted、InProgress、TestVerified、ProductionVerified、DeliveryClosed 等交付结果；
- `outcome_status`：NotObserved、Observing、Validated、Invalidated、Inconclusive 等业务结果。

Decision、Failure 和 Blocker 使用独立对象表达，不覆盖生命周期位置。

### 7.3 状态迁移和 Gate

- 禁止直接 `setStatus`；
- Actor 提交具有业务含义的 Transition Request；
- Transition Guard 检查当前状态与版本、Profile、权限、Contract、Evidence、Risk、Policy 和并发冲突；
- 统一返回 ALLOW、REQUIRE_HUMAN、NEED_MORE_EVIDENCE 或 DENY；
- Human Decision 是迁移输入，批准后仍需基于最新条件重新求值；
- 状态、Event 和后续 Outbox Task 在同一事务中提交。

Gate Requirement Set 由 Core Requirements、Profile、Risk、Environment Policy、Project Policy 和 Change Contract 组合并版本化。要求变化必须产生新版本，并判断旧 Evidence 是否失效。

### 7.4 Work Item 与变更控制

- Kernel 调度结构化 Work Item，不下发无边界自由 Prompt；
- Work Item 绑定 Change、Task、Contract Version、Plan Version、权限、预算和停止条件；
- Runtime 为 Work Item 创建 Agent Run；
- Run 成功只表示本次工作项结束，不代表 Change 可以迁移。

计划变化采用三级控制：

1. Task 内部执行细节由 Agent 自主调整并记录；
2. 改变 Task DAG、范围、权限、风险或验证策略走 Plan Amendment；
3. 改变意图、Non-goals 或验收标准走 Contract Amendment。

### 7.5 失败、并发与恢复

- 瞬态故障允许有限自动重试；
- 验证失败进入有预算的 Repair Work Item 循环；
- 权限、配置、Contract、Policy 和 Risk 问题暂停并升级；
- 外部结果未知时先 Reconciliation，再决定是否重试；
- 每次尝试产生独立 Run 和 Event。

并发使用：

- Change Version：防止旧状态覆盖；
- Work Item Lease：防止重复领取；
- Resource Lock：控制 Worktree、代码范围、环境和发布目标。

生命周期历史只追加。Pause、Cancel、Supersede、Rollback 和 Compensation 都使用新动作与 Event 表达，不改写已经发生的历史。

### 7.6 持久化与调度

Kernel 使用 Event-backed State：

- Current State 保存当前状态与版本；
- append-only Event Ledger 保存生命周期历史；
- Transactional Outbox 保存事务后需要执行的外部动作；
- Read Model 为 Workbench 提供可重建查询视图。

Change 业务优先级由 Human Flow/Portfolio Owner 决定。Kernel 在 Priority、WIP Limit、Task DAG、Risk、Resource Lock 和 Runtime 可用性约束内进行确定性调度。V1 只提供人工排序、Ready Queue 和最大并发限制。

## 8. Intelligence & Context：智能与上下文

### 8.1 Agent 运行模型

- 使用 Orchestrator + 临时角色 Session；
- 按 Work Item 创建 Intent、Planner、Executor、Evaluator、Deployment 等角色运行；
- 不要求建设长期在线的固定 Agent 团队；
- Evaluator 使用独立 Session，不继承 Executor 的完整推理上下文。

### 8.2 Context Pack

每个 Agent Run 使用版本化、不可变 Context Pack，绑定：

- Change 与 Work Item；
- Contract/Plan Version；
- 角色与权限；
- 领域上下文、Spec、架构决策、相关代码、Policy、依赖 Artifact 和历史 Evidence。

Context Pack 按角色提供最小必要上下文。源知识变化时生成新版本，并按关键性决定旧 Run 继续、标记 Stale 或取消。

### 8.3 知识与 Memory

知识标记：

- Canonical：Contract、Policy、批准 ADR 等权威事实；
- Derived：CodeGraph 分析、LLM 摘要等派生知识；
- Reference：外部文章、历史方案等参考信息；
- Runtime Observation：测试、部署和执行观察。

每项知识记录来源、版本/Digest、新鲜度、适用范围和权威级别。权威来源冲突时必须生成 Conflict 或 Decision Request。

Memory 分为：

- Run Memory：一次执行的对话、工具调用和临时推理；
- Change Memory：Contract、Decision、Feedback、Artifact、Evidence 和生命周期历史；
- Project Knowledge：领域知识、架构规则、Policy、ADR 和参考实现。

Run Observation 只能先成为 Learning Candidate，经 Owner 审查和 Eval 后才能晋升 Project Knowledge。

### 8.4 能力装配

Kernel 和流程声明 `required_capabilities`，不写死具体 Skill。Capability Resolver 根据项目 Policy 选择并固定可信的 Skill、Tool、Model 或 Adapter。

V1 使用 Change 记录、仓库文档、代码/Git、Project Policy、cimicode Run 和测试结果。飞书、CodeGraph、向量库等后续通过 Adapter 接入。

## 9. Engineering Execution & Delivery：工程执行与交付

### 9.1 Workspace 与 Runtime

- 默认每个 Change 一个隔离 Worktree；
- 顺序 Task 共享 Change Worktree；
- 只有依赖和文件范围明确时才创建并行子 Worktree；
- Agent 不直接修改主工作区；
- Kernel 下发 Work Item，Runtime Adapter 转换为 cimicode Session/Command；
- 权限由 Work Item 声明，凭据留在 Runtime 或 DevOps，不进入 Prompt、Event 或 Artifact。

### 9.2 Artifact 与环境晋升

每次有效代码变化产生不可变 Artifact Candidate：

```text
代码版本
→ Artifact Candidate
→ 测试环境部署与验证
→ 同一 Digest 晋升生产
```

测试失败并修改代码后，必须生成新 Artifact 并重新验证。生产发布前不能重新构建未经测试的制品。

### 9.3 DevOps 与交付闭环

Environment/DevOps Adapter 提供：

- build；
- deploy；
- get status；
- verify；
- rollback/recover；
- reconcile。

V1 复用现有 DevOps。测试环境自动执行“部署—验证—失败 Evidence—修复—重部署”循环；测试通过后生成 Production Release Package，由 Release Owner 明确批准，再将同一 Artifact 晋升生产并完成即时验证。

V1 不承诺长期生产日志、Trace、SLO 和业务结果观察。

## 10. Trust & Governance：信任与治理

### 10.1 Claim–Evidence

Evidence 必须说明：

- 要证明的 Claim；
- Evidence 类型与结果；
- 来源与产生者；
- Contract Version 与 Artifact Digest；
- 新鲜度和适用范围。

原始日志、Agent 声称完成和文件存在不能自动等于有效 Evidence。

### 10.2 分层独立评价

可信判断组合：

1. 确定性工具：测试、Lint、类型检查、安全扫描和部署状态；
2. 独立 Evaluator Agent：从 Contract 推导边界、反例和覆盖缺口；
3. Human Review：意图、体验、风险、规则例外和不可逆判断。

Evaluator 不直接修复生产代码。风险越高，要求的评价独立性越强。

### 10.3 风险、Policy 与授权

风险画像至少包含 Blast Radius、Reversibility、Data Impact、Security/Compliance、External Side Effect 和 Novelty/Uncertainty。

Agent 可以建议风险，不能自行降级。V1 使用确定性 Project Policy 决定 Evidence、审批、权限、并发和恢复要求。

Human Approval：

- 使用结构化 Decision；
- 不允许沉默同意；
- 绑定 Change、Contract/Plan Version、Artifact 和环境；
- 高风险或不可逆操作要求执行与批准职责分离。

Exception 必须记录规则、原因、范围、有效期、Owner、风险和补偿措施。重复 Exception 只能形成 Policy Change Candidate，不能自动修改长期 Policy。

## 11. Protocol, Data & Integration：协议、数据与集成基础

### 11.1 Cimi Change Protocol

Protocol 定义以下稳定语义：

- Project、Change、Change Profile；
- Change Contract、Amendment；
- Plan、Task DAG；
- Work Item、Agent Run；
- Artifact、Evidence、Claim；
- Gate、Transition、Decision、Exception；
- Actor、Role、Assignment；
- Environment、Deployment、Release；
- Event、Policy。

协议不绑定特定数据库、文件目录或传输格式。JSON/YAML、API、Event 和 Repo Artifact 都是协议载体。

关键对象使用稳定内部 ID、对象版本、Schema Version、来源和 Digest。Issue ID、CI Run ID 和 Deployment ID 等外部标识只作为 External Reference。

### 11.2 数据权威

| 数据来源 | 权威事实 |
|---|---|
| CimiLoop Store | Change 状态、Event、Decision、Feedback、Gate、Manifest |
| Git Repo | Contract、Spec、Plan 快照、Policy、代码、测试和最终归档 |
| cimicode Runtime | 原始 Session、Transcript、工具调用和命令输出 |
| CI/CD、DevOps、Artifact Registry | 原始构建、测试、部署和制品事实 |

CimiLoop 使用内部 ID、External Reference、版本和 Digest 聚合这些事实，不复制所有原始大对象。

### 11.3 Store 与 Adapter

Kernel 依赖 ChangeStore、EventStore、WorkItemStore、RunStore、ArtifactManifestStore、EvidenceStore、DecisionStore、IdentityStore 和 OutboxStore 等逻辑 Port。

- Solo Mode：SQLite + Local Files；
- Team Mode：PostgreSQL + Shared Object Store。

外部能力通过 Runtime、SCM、Workspace、Knowledge、DevOps、Environment、Notification 和 Spec Adapter 接入。Adapter 声明能力、版本、权限、健康、输入输出 Schema、幂等与状态核对能力，只能使用 Command、Query 和 Event，不能直接修改 Kernel Store。

## 12. 核心运行闭环

```text
Human / External Source
        ↓
创建或导入 Change
        ↓
Interaction Layer 提交 Command
        ↓
Lifecycle Kernel 判断当前位置与下一步
        ↓
Intelligence & Context 组装能力和上下文
        ↓
Kernel 下发 Work Item
        ↓
Execution & Delivery 执行真实工程动作
        ↓
产生 Artifact、Claim 和 Evidence
        ↓
Trust & Governance 独立评价与 Gate 求值
        ↓
Kernel 执行 Transition 并记录 Event
        ↓
Workbench 更新 Change Room
        ↓
继续下一循环，直到生产交付和复盘关闭
```

## 13. 权威关系

```text
Human / Contract Owner
→ 对意图和高风险决定负责

CimiLoop Kernel
→ 对生命周期状态和迁移负责

Agent / Skill
→ 对建议、执行和候选结果负责

Deterministic Tool / Evaluator
→ 对验证事实和评价负责

Git / Runtime / DevOps
→ 对各自原始工程事实负责
```

任何参与方都不能越权成为其他领域的事实权威。

## 14. 部署模式

### 14.1 Embedded Solo Mode

```text
开发者电脑
├── cimi-loop CLI / Local Workbench
├── CimiLoop Kernel
├── SQLite / Local Files
├── cimicode Runtime
├── Change Worktree
└── Git / DevOps Adapter
```

适合个人先跑通完整研发闭环，不需要服务器、组织账号或实时多人协作。

### 14.2 Shared Team Mode

```text
多个 Human / Local cimicode Runtime
                ↓
CimiLoop Shared Service
├── Kernel
├── PostgreSQL
├── Shared Object Store
└── Team Workbench / Change Room
```

代码、Worktree、原始 Transcript 和凭据仍保留在执行机器；项目级 Change、Event、Decision、Evidence Manifest 和 Run 摘要进入共享 Store。

两种模式共享 Protocol、Kernel 和 Change 模型。V1 使用稳定 ID、Store Port、Event Protocol 和 Export/Import，为 Solo 项目迁移到 Team Mode 保留路径。

## 15. V1 产品边界

V1 交付 Embedded Solo Mode，至少包含：

- `cimi-loop` CLI 与本地 Workbench；
- Project Workbench、Change Room、Attention Queue 和 Decision Inbox；
- Change 生命周期、Gate、Decision、Event Ledger、Outbox 和恢复；
- Orchestrator、角色 Session、Work Item、Agent Run 和 Context Pack；
- 独立 Evaluator、Claim–Evidence 和多维风险 Policy；
- Change Worktree、cimicode Runtime Adapter；
- Git/Local Workspace、File Knowledge Adapter；
- 现有 DevOps/Environment Adapter；
- 测试环境自动修复循环、生产 Release Package、明确授权和即时验证；
- Solo 项目 Export/Import 以及 Team Mode 所需的稳定协议边界。

V1 不包含：

- 实时多人协作、组织账号和复杂权限后台；
- 通用聊天和多人在线编辑；
- Teams/飞书双向同步；
- 自建 CI/CD、制品库或生产凭据平台；
- 自动采集完整生产日志、Trace、SLO 和业务 KPI；
- Agent 自动修改全局 Policy、Skill 或 Project Knowledge；
- 完全自由的通用工作流设计器；
- 复杂智能调度和组织级资源优化。

## 16. 后续设计顺序

整体能力架构确认后，按以下顺序继续：

1. 核心领域模型与 Cimi Change Protocol；
2. Change 端到端流程和完整状态迁移表；
3. Human/Agent 角色与权限矩阵；
4. Context、Evidence、Workbench 等横切专题；
5. OpenSpec、Matt Skills、Superpowers、CodeGraph、Multica 等开源能力映射；
6. V1 实现架构、目录、技术栈、里程碑和验收计划。

开源项目只能填充已经定义的能力插槽，不能反向改变 CimiLoop 的核心状态、权威关系和架构不变量。
