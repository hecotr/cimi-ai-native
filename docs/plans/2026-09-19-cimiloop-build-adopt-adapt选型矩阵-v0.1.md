# CimiLoop Build / Adopt / Adapt 选型矩阵 v0.1

> 状态：选型基线
>
> 日期：2026-09-19
>
> 目标：以 CimiLoop V1 范围、M0–M5 里程碑和能力装配模型为基线，判断哪些能力应自研（Build）、直接采用（Adopt）、通过适配层采用（Adapt）或延后（Defer）。

## 1. 结论先行

CimiLoop V1 不采用“选择一个现成 Harness 作为总平台”的路线，而采用：

> **自研最小权威内核，采用成熟基础设施，通过协议适配 Runtime、Skills、Spec 与 DevOps；任何外部项目都不能成为 Change 状态、Gate、Decision、身份或权限的第二权威。**

推荐组合如下：

| 能力 | 推荐判断 | V1 位置 | 核心理由 |
|---|---|---|---|
| Cimi Change Protocol、Kernel、Gate、Decision、Evidence、Store Port | **Build（自研）** | P0，M0–M5 | 这是产品差异与权威边界，外部项目无法直接满足已确认语义 |
| SQLite | **Adopt（采用）** | P0，M0 | Embedded Solo Mode 的本地事实存储实现 |
| Git | **Adopt + Adapt（采用并适配）** | P0，M2 | 直接采用 Git；通过 Workspace/SCM Adapter 绑定 Change、Worktree、Snapshot 与 Digest |
| Claude Code / OpenCode | **Adapt（适配）** | P0，M2 | V1 首个 Runtime 从二者中选择一个落地；只能消费 Work Item 并回传 Run 事实 |
| cimicode | **Defer → Adapt（延后后适配）** | 企业内部后续接入 | 企业内部基于 OpenCode 二次开发的 Runtime，通过同一 Runtime Adapter 契约接入，不作为 V1 前置 |
| 现有 CI/CD、环境与制品库 | **Adapt（适配）** | P0，M4 | 复用真实交付能力，不自建 CI/CD 平台或 Registry |
| Agent Skills 开放格式 | **Adopt + Extend（采用并扩展）** | P0 基础，M2 | 采用 `SKILL.md` 包格式；用 CimiLoop Provider Descriptor 补足版本、权限、证据与副作用契约 |
| Matt Pocock Skills | **Selective Adapt（选择性适配）** | V1 试点，M1–M3 | 提供优秀的访谈、领域建模、诊断与评审方法，但不能接管状态机、任务权威或 Gate |
| Superpowers | **Selective Adapt / Defer（选择性适配或延后）** | M2–M3 小范围对照 | 执行纪律强，但全量 bootstrap 会与 Capability Resolver 和既有流程争夺编排权 |
| OpenSpec | **Adapt / Optional（适配、可选）** | M1 后试点，非 P0 前置 | 可作为 Spec Artifact Provider，不再作为 Change Contract 或状态底座 |
| CodeGraph 类能力 | **Defer → Adapt（延后后适配）** | V1 不做 | 只可提供 Derived Knowledge（派生知识）；V1 精确文件/Git 上下文已足够 |
| Multica | **Defer → Adapt（延后后适配）** | Team Mode 再评估 | 它更像协作控制面，有自己的任务与数据库权威，V1 引入会扩大范围并产生双状态源 |
| OpenAI Symphony | **Reference / Pattern Adapt（参考模式）** | 非运行依赖 | 借鉴工作区、重试、并发与核对模式，不采用其 Issue 驱动权威模型 |
| Spec Kit、ECC、OpenHands | **Reference Only（仅参考）** | V1 不引入 | 分别与规格入口、Harness 能力或 Runtime 重叠 |
| OPA、Argo Rollouts、OpenTelemetry | **Defer（延后）** | V2+ 候选 | 在策略、渐进发布和生产观察复杂度真实出现后再接入 |

## 2. 判断术语

### 2.1 Build（自研）

能力的语义本身就是 CimiLoop 产品核心，外部替代会改变 Cimi Change Protocol、权威关系或用户体验，因此由 CimiLoop 实现并维护。

### 2.2 Adopt（采用）

能力具有稳定、通用且不争夺领域权威的接口，可以直接作为基础设施使用。采用不等于把其内部对象提升为 CimiLoop 领域事实。

### 2.3 Adapt（适配）

能力有价值，但其身份、状态、权限、输入输出或失败语义与 CimiLoop 不一致，必须通过 Adapter 或 Provider Wrapper 转译后使用。

### 2.4 Defer（延后）

能力有长期价值，但不服务于 V1 P0 验收，或当前引入成本、双重权威风险大于收益。延后不是否定，而是保留接口、不引入运行依赖。

## 3. 不可外包的 CimiLoop 核心

以下能力统一选择 Build（自研）：

- Project、Change、Change Room、Contract、Plan、Task DAG、Work Item、Agent Run 等领域对象及其关系；
- Kernel 维护的 Change 多维状态、合法迁移和生命周期不变量；
- Gate Requirement、Claim、Evidence、Evaluation 与 Evidence Package；
- Actor、Role、Assignment、Decision、Policy Snapshot 与人工批准语义；
- Capability Requirement、Provider Descriptor、Resolver、Binding 与 Invocation Record；
- Store Port、Event Ledger、Transactional Outbox、幂等 Command、Lease 和 Resource Lock；
- Workbench、Change Room、Attention Queue、Decision Inbox 与解释性时间线；
- Portable Export/Import、重建 Read Model 与 Solo→Team 迁移契约。

原因不是“外部项目不好”，而是这些能力共同定义了 CimiLoop 是什么。若把其中任意一项交给 OpenSpec、Superpowers、Multica、Claude Code、OpenCode、cimicode 或某个 Skill，它们就会成为第二状态权威，直接破坏已确认的 Kernel 不变量。

## 4. V1 基础设施与 Runtime 映射

### 4.1 SQLite：Adopt

SQLite 作为 Embedded Solo Mode 的本地 Store 实现，承载 Current State、Event Ledger、Outbox、幂等记录、Lease 和 Read Model。

约束：

- 领域 Schema 不泄露 SQLite 专有语义；
- 所有持久化通过 Store Port；
- Portable Export 不等于复制 SQLite 文件；
- PostgreSQL 或 Team Store 必须能通过相同契约测试替换。

### 4.2 Git 与 Worktree：Adopt + Adapt

Git 本身直接采用，CimiLoop 自建 Workspace/SCM Adapter 负责：

- 为 Change 创建、发现、核对和回收隔离 Worktree；
- 固定 Source Snapshot，并记录 commit/tree/diff 等可核对身份；
- 将 Work Item 授权范围绑定到指定 Workspace；
- 检测脏工作区、分支漂移、冲突和外部修改；
- 在未知结果或进程重启后执行 reconcile（核对），而不是盲目重建。

Git 分支、commit 或 worktree 都不是 Change 状态；它们是被 Change 引用的外部工程事实。

### 4.3 Claude Code / OpenCode：Adapt，V1 首个 Runtime

V1 首个 Agent Runtime 从 Claude Code 与 OpenCode 中选择一个，通过 Runtime Adapter 接入。二者在 CimiLoop 中承担相同职责：

- 接收 Kernel 已授权的 Work Item；
- 创建独立 Planner、Executor、Evaluator Session/Run；
- 加载不可变 Context Pack 和 Capability Binding；
- 在指定 Workspace 与权限范围内调用 Model、Skill 和 Tool；
- 回传 Run 生命周期、调用摘要、输出、失败和取消事实；
- 支持查询、终止与重启后核对。

任何 Runtime 都不能：

- 创建或批准正式 Decision；
- 直接迁移 Change State 或判定 Gate 通过；
- 静默修改 Contract、Plan、Policy 或 Capability Binding；
- 用其会话状态替代 CimiLoop Event/Current State；
- 把 Runtime 的 `success` 直接提升为“交付完成”。

#### 首选验证顺序

优先对 OpenCode 做 Runtime Adapter spike（技术探针），再以 Claude Code 验证 Adapter 的 Runtime-neutral（运行时中立）程度。原因是企业内部 cimicode 基于 OpenCode 二次开发，先验证 OpenCode 可以降低后续企业内部接入成本；这只是实施优先级，不把 OpenCode 写入领域协议。

进入 M2 前必须至少对最终选择的首个 Runtime 确认：

- 实际源码或发行物位置与版本策略；
- Session/Run API 与事件流；
- Workspace、取消、恢复和健康检查能力；
- Tool/Skill/Model 的精确版本和权限暴露方式；
- Runtime 断连后对运行状态的核对方式。

若 OpenCode 无法满足取消、恢复、事件流、权限或核对要求，则选择 Claude Code 作为 V1 首个 Runtime。最终选择由 spike 和 Runtime Adapter 契约测试决定，不再通过领域语义访谈决定。

### 4.4 cimicode：企业内部后续 Runtime

cimicode 是企业内部基于 OpenCode 二次开发的 Agent Runtime。V1 不以企业内部 Runtime 作为开源产品前置依赖；待 OpenCode/Claude Code Adapter 稳定后，cimicode 通过相同 Runtime Adapter 和契约测试接入。

cimicode 可以拥有企业内部模型、工具、认证和治理扩展，但不能把这些私有语义写入 Cimi Change Protocol，也不能获得比其他 Runtime 更高的状态或批准权。

### 4.5 CI/CD、Environment 与 Registry：Adapt

V1 只选择一个真实交付路径打通 DevOps/Environment Adapter：

- build（构建）；
- deploy（部署）；
- status（查询状态）；
- verify（验证）；
- recover（恢复）；
- reconcile（核对未知结果）。

Adapter 必须将外部 job、run、artifact、deployment 和 environment 标识保留为 External Reference，并把关键结果提升为 Artifact、Deployment、Evidence、Failure 或 Event。CimiLoop 不复制外部系统全部日志，也不自建 Artifact Registry。

具体 CI/CD 产品在目标验收项目确定后再选，不进入领域模型。

## 5. Agent Skills 格式：Adopt + Extend

Agent Skills 定义了 `SKILL.md`、`scripts/`、`references/`、`assets/` 和渐进加载方式，适合作为 CimiLoop Skill Provider 的包格式，建议直接兼容而不 Fork 标准。

但 Agent Skills 主要解决“如何包装和发现技能”，不能单独表达 CimiLoop 所需的完整运行契约。CimiLoop 必须在包外维护 Provider Descriptor，补充：

- 实现的 Capability ID 与兼容语义版本；
- 精确来源、版本、commit 和内容 Digest；
- 依赖的 Runtime、Model、Tool、脚本和外部服务；
- 权限、网络、数据边界、秘密与副作用；
- 输入输出 Schema、失败、取消、超时和幂等语义；
- 可用于哪些 Role、Profile、阶段和独立性要求；
- 输出如何提升为 Artifact、Claim、Evidence 或 Run Fact；
- 信任状态、行为 Eval 和升级策略。

Agent Skills 的 `allowed-tools` 目前属于实验字段，不能替代 CimiLoop 的确定性权限交集，也不能被视为安全边界。

## 6. Matt Pocock Skills：选择性适配

Matt Pocock Skills 的价值是“方法与工程判断”，不是工作流状态。当前本地 `hector-skills` 已镜像上游，可从固定 commit 和 Digest 开始试点，避免运行中自动漂移。

### 6.1 V1 推荐技能组合

| Skill（技能） | 中文用途 | 映射 Capability | 建议阶段 | 判断 |
|---|---|---|---|---|
| `grill-me` + `grilling` | 结构化追问与决策树访谈 | `intent.elicitation` | M1 | **Adapt，默认候选** |
| `domain-modeling` | 统一语言、边界场景与领域模型澄清 | `contract.analysis` | M1 | **Adapt，默认候选** |
| `prototype` | 用一次性原型回答设计问题 | `design.prototype` | M1/M2 | **Adapt，可选** |
| `diagnosing-bugs` | 复现、最小化、假设、插桩、修复、回归 | `diagnosis.systematic` | M2/M3 | **Adapt，Bugfix 默认候选** |
| `tdd` | 红—绿—重构的实现反馈环 | `implementation.tdd` | M2 | **Adapt，按 Profile 选择** |
| `code-review` | 规格符合性与代码质量双轴评审 | `evaluation.code_review` | M3 | **Adapt，Evaluator 候选** |
| `codebase-design` | 模块边界与接口质量分析 | `design.codebase` | M1/M3 | **Adapt，可选** |
| `handoff` | 会话交接摘要 | `context.handoff` | M2 | **Adapt，仅作为 Context 输入** |

### 6.2 V1 暂不启用的技能

| Skill（技能） | 暂不启用原因 |
|---|---|
| `to-spec` | 容易形成与 Contract Version 并行的规格权威 |
| `to-tickets` | 容易形成与 Plan/Task DAG/Work Item 并行的任务权威 |
| `implement` / `implement-spec` | 内含自己的端到端实施编排，可能绕开 Kernel 下发的 Work Item |
| `triage` | V1 不自动从外部 Issue/告警创建 Change |
| `wayfinder` / `loop-me` | 长周期自主编排与 CimiLoop 生命周期职责重叠 |
| `setup-matt-pocock-skills` | 其仓库配置和 Issue Tracker 假设不应直接修改 CimiLoop 项目策略 |

### 6.3 适配要求

- `grill-me` 本身会调用 `grilling`；`grill-with-docs` 还依赖 `domain-modeling`，Composite Provider 必须展开依赖，不能只记录入口 Skill；
- 用户偏好的“一次一个问题”和中文优先属于 Project/User Policy，而不是改写上游技能后失去来源可追溯性；
- Skill 可以生成 Contract Candidate、术语候选、Claim 或 Review Finding，但正式 Contract/Plan/Decision 仍由 CimiLoop 对象承载；
- Skill 的行为需要用代表性场景做 Eval，不能仅因文件存在就标记为可信；
- 升级产生新 Provider Version/Digest，只影响新 Run，不改写历史 Binding。

## 7. Superpowers：不全量接管，只做受控能力候选

Superpowers 的优势是 TDD、系统调试、验证后再声明完成、Worktree 与代码评审纪律。它的默认模式则要求在 Session 启动时注入 `using-superpowers` bootstrap，并把 Skills 视为必须遵循的总方法。

这与 CimiLoop 有三个冲突：

1. **编排权冲突**：CimiLoop Resolver 应决定本 Run 使用哪些 Skill，不能由全局 bootstrap 自行接管；
2. **计划权威冲突**：`brainstorming`、`writing-plans`、`executing-plans` 可能产生第二套 Contract/Plan/Task；
3. **证据语义不足**：`verification-before-completion` 强调新鲜验证，但其输出仍需补充来源、适用对象、Digest 和独立性，才能成为 CimiLoop Evidence。

### 7.1 V1 建议

- 不安装或启用 Superpowers 全量 session bootstrap；
- 只把 `systematic-debugging`、`verification-before-completion`、`test-driven-development`、`requesting-code-review` 等登记为独立 Skill Provider 候选；
- 与 Matt Skills 功能重叠的能力做 A/B Eval，每个 Capability 在一个 Project Policy 中只设一个默认 Provider；
- `using-git-worktrees` 只作为方法参考，Worktree 生命周期仍由 Workspace Adapter 控制；
- `subagent-driven-development` 和并行 Agent 编排延后到 CimiLoop 多 Run/Team 能力成熟后；
- M3 前若无清晰增益，可整体延后，不影响 V1 闭环。

因此 Superpowers 的判断是 **Selective Adapt（选择性适配）**，不是整套 Adopt（直接采用）。

## 8. OpenSpec：从“契约底座”降为可选 Spec Provider

OpenSpec 的 `specs`、`changes`、proposal/design/tasks、工件依赖和机器可读 CLI 对“人和 Agent 对齐规格”很有价值，但它的核心假设是：

- `specs` 表示当前系统行为真相；
- 一个 change 文件夹代表一个工作单元；
- 工件倾向于作为 enabler（促成协作的材料），而不是强制 Gate；
- propose/apply/archive 形成其自己的工作流。

这些概念不能直接替代 CimiLoop 的 Change、Contract Version、Plan Version、Task DAG、Decision、Gate 或 Event。

### 8.1 正确接入位置

OpenSpec 可通过 Spec Adapter 提供：

- 产品行为规格的读取与生成；
- Contract/Plan 的附件或 Artifact 表达；
- 变更前后 spec delta（规格增量）与一致性检查；
- 归档后更新长期产品行为规格；
- OpenSpec CLI 输出到 Invocation Record/Evidence 的转译。

### 8.2 明确禁止

- 不用 OpenSpec Change ID 取代 CimiLoop Change ID；
- 不从文件存在或 OpenSpec `ready/all_done` 直接推导 Gate 通过；
- 不让 `apply` 绕过 Work Item、Capability Binding 或权限；
- 不让 `archive` 直接关闭 CimiLoop Change；
- 不在 OpenSpec 与 CimiLoop 中各维护一份互相竞争的 Task 完成度。

### 8.3 V1 时机

OpenSpec 不是 M0/M1 P0 前置。先证明原生 Contract/Plan 能完成北极星闭环；若 M1 后确认用户确实需要 repo-native behavior spec（仓库内行为规格），再做单向或受控双向 Spec Adapter 试点。没有明确收益时延后到 V1.1。

这修正了旧调研中“以 OpenSpec 为 Change Contract 底座”的结论。

## 9. CodeGraph：V1 延后，未来作为 Derived Knowledge Provider

“CodeGraph”目前在文档中是能力类别，不是已经确认的具体仓库。公开项目存在多个同名实现；`codegraph-ai/CodeGraph` 是可调研候选之一，但在未确认目标项目与实测前不能写入正式依赖。

未来接入必须满足：

- 输出被标记为 Derived Knowledge（派生知识），不能覆盖 Source/Record 权威；
- 每次查询绑定 repository、worktree、source snapshot、index version 和 freshness；
- 影响分析、调用链或摘要只能形成 Context 引用、Claim 或 Evidence Candidate；
- 持久 Memory 不能自动晋升为 Project Policy、Contract 或事实；
- 索引必须隔离不同 Change Worktree，避免把未合并代码污染主线知识；
- 结果必须可回溯到文件、符号和源码位置。

V1 已明确使用精确 File/Git/Protocol 引用，不需要语义图谱才能完成验收，因此选择 **Defer（延后）**。

## 10. Multica：Team Mode 候选，不进入 V1

Multica 已具备 Web/Desktop/Mobile、Go backend、PostgreSQL、Agent daemon 和多 Runtime 调度，适合作为未来多人、多机器 Agent 协作控制面的产品与架构参考。

但它与 CimiLoop 当前有明显重叠：

- Multica 的 task/database/daemon 有自己的任务与运行权威；
- CimiLoop 的 Change/Work Item/Run/Decision/Event 已定义另一套更强的交付语义；
- V1 是本地 Embedded Solo Mode，引入服务端、账号、PostgreSQL 和协作 UI 会直接扩大范围；
- Multica 当前不提供 CimiLoop 所需的 Contract、Evidence Gate、同 Digest 晋升和 Release Decision 语义。

未来可评估两种接法：

1. **Collaboration Projection Adapter（协作投影视图适配器）**：把 CimiLoop Change/Attention/Decision 投影到 Multica，不转移权威；
2. **Runtime Control Adapter（运行控制适配器）**：让 Multica daemon 承载远程 Run，但 Work Item、Binding 和最终状态仍由 CimiLoop Kernel 管理。

Team Mode 设计前不承诺哪一种，V1 仅借鉴其 UX、daemon 与多 Runtime 运营经验。

## 11. 其他项目的定位

| 项目 | 可借鉴能力 | V1 判断 | 不采用为核心的原因 |
|---|---|---|---|
| OpenAI Symphony | Issue 轮询、隔离 workspace、并发限制、重试、reconcile、结构化日志 | Reference | Issue/`WORKFLOW.md` 不是 CimiLoop Change Contract；其 Draft v1 不规定统一审批与 Gate 策略 |
| GitHub Spec Kit | Spec-driven development、clarify、analyze、converge | Reference | 与 OpenSpec、Matt Skills 和 CimiLoop Contract/Plan 入口重叠 |
| ECC | Hooks、安全、记忆信任、自改进、能力目录 | Reference | 能力面过大，容易形成第二 Harness 与规则体系 |
| OpenHands | 沙箱、事件化 Agent 执行、远程运行边界 | Reference | V1 已选择 Claude Code/OpenCode 路线，不再引入另一套 Runtime |
| OPA | 通用策略即代码 | Defer | V1 Policy 数量有限，先用确定性内置规则；复杂跨团队策略出现后再适配 |
| Argo Rollouts | 蓝绿、金丝雀、分析与自动回退 | Defer | V1 只需一个真实部署闭环，不能绑定 Kubernetes |
| OpenTelemetry | Trace/Metric/Log 标准与 Collector | Defer | V1 不建设长期生产可观测平台，只保留 change/artifact/deployment 关联字段 |

## 12. 按里程碑的落地顺序

| 里程碑 | 必做 Build | Adopt / Adapt | 明确不引入 |
|---|---|---|---|
| M0 | Protocol、Kernel、Store Port、Event/Outbox、状态机 | SQLite | OpenSpec、Skills、CodeGraph、Multica |
| M1 | Contract/Plan/Decision/Role/Policy、Change Room 基础 | Matt `grill-me`/`grilling`/`domain-modeling` 作为受控试点；OpenSpec 仅做可行性验证 | 第二套 Contract/Task 权威 |
| M2 | Work Item、Context Pack、Resolver/Binding、Run、Artifact | 首个 Claude Code/OpenCode Runtime Adapter、Git/Workspace Adapter、Agent Skills 包格式；Matt 执行类 Skill | cimicode 企业扩展、Superpowers 全局 bootstrap、远程多 Runtime 控制面 |
| M3 | Claim/Evidence/Evaluation/Gate、Stale 传播 | Matt 或 Superpowers 的诊断/TDD/评审能力经 Eval 后择优；确定性测试结果提升 | Skill 自证直接通过 Gate |
| M4 | Release/Deployment/Recovery/Reconciliation | 一个真实 CI/CD/Environment/Registry 路径 | Argo/多集群/通用发布平台 |
| M5 | Workbench 完整闭环、Export/Import、加固 | 现有 Provider 的版本锁定、Eval、故障注入 | CodeGraph、Multica、Team Mode 扩张 |

## 13. V1 依赖等级

### 13.1 Hard Dependency（硬依赖）

- SQLite；
- Git；
- Claude Code 或 OpenCode 中一个可核对的版本或发行物；
- 一个真实构建与部署路径；
- CimiLoop 自研 Kernel/Store/Workbench。

### 13.2 Default Provider（默认提供者，可替换）

- Agent Skills 兼容的 Skill 包；
- Matt `grill-me`/`grilling` + `domain-modeling`；
- Bugfix 的系统诊断 Skill；
- Feature/Bugfix 的 TDD 或等价验证方法；
- 独立代码评审 Skill。

Default Provider 不是 Protocol 依赖。缺少某个 Skill 时，系统应创建 capability unavailable Blocker，或由 Policy 选择已批准替代 Provider，而不是破坏 Change 数据。

### 13.3 Optional Pilot（可选试点）

- OpenSpec Spec Adapter；
- Superpowers 部分 Skill；
- Matt `prototype`、`codebase-design`、`handoff`。

### 13.4 Deferred（延后）

- CodeGraph；
- Multica；
- Spec Kit/ECC/OpenHands 整体接入；
- OPA、Argo Rollouts、OpenTelemetry；
- 外部协作同步与 Shared Team Mode。

## 14. 候选能力进入 V1 的准入检查

任何外部 Provider 进入 V1 前必须通过以下检查：

1. 服务于哪个 V1 Acceptance（验收项）或 M0–M5 退出条件；
2. 是否引入第二套 Change、Contract、Plan、Task、Run、Gate 或 Decision 权威；
3. 是否能固定来源、版本、commit/package 和内容 Digest；
4. 是否能声明权限、网络、秘密、数据边界与外部副作用；
5. 是否支持取消、超时、失败分类、幂等与必要的 reconcile；
6. 输出能否结构化提升为 CimiLoop Artifact/Evidence/Run/Deployment/Event；
7. 是否有代表性行为 Eval，而不只是安装成功或 README 声明；
8. 替换或移除它是否无需迁移 Cimi Change Protocol；
9. 许可证、供应链、维护活跃度和平台兼容性是否可接受；
10. 它带来的价值是否大于上下文、路由、权限和升级治理成本。

任一项目在第 2、3、4 或 8 项不满足时，不得成为 V1 默认 Provider。

## 15. 与旧调研结论的差异

仓库根目录的 `AI-Native-Harness开源项目深度调研与选型建议-2026.md` 提供了扎实的项目能力分析，但形成于 CimiLoop 核心领域模型和权威关系冻结之前。本矩阵对其做三项修正：

1. **OpenSpec 从“Change Contract 底座”调整为“可选 Spec Artifact Provider”**；
2. **Runtime 内的薄状态机调整为独立 CimiLoop Kernel，Claude Code、OpenCode 与未来 cimicode 均仅作为 Runtime Adapter**；
3. **Repo 不是完整交付状态的唯一真相源**；CimiLoop Store/Kernel 记录权威生命周期事实，Repo、Git、CI/CD 和环境是被引用与核对的外部事实来源。

旧调研对 Matt Skills、Superpowers、ECC、Multica、Symphony 等项目的能力与风险分析仍可作为背景材料，但不能覆盖本矩阵的最新权威边界。

## 16. 待实施阶段闭合的四个具体选择

本矩阵确认后仍有四项属于实施选择，不需要继续做领域语义访谈：

1. 通过 spike 和契约测试在 OpenCode 与 Claude Code 中确定 V1 首个 Runtime；
2. V1 北极星验收项目使用的 CI/CD、测试环境和受控生产环境；
3. Matt 与 Superpowers 重叠 Skill 的小规模行为 Eval 结果；
4. 若未来启动 CodeGraph 试点，确认具体目标仓库与 worktree 索引策略。

这些选择应通过 spike（技术探针）、契约测试或 Eval 给出证据，再写入实现计划和 Provider Registry，而不是反向修改已经确认的领域模型。

## 17. 推荐决策

建议整体确认以下路线：

- CimiLoop 核心领域、Kernel、证据治理和产品交互全部 Build；
- SQLite、Git、Agent Skills 格式等通用基础直接 Adopt；
- V1 首个 Runtime 从 Claude Code/OpenCode 中选择并通过稳定 Adapter 接入，cimicode 后续复用同一契约；
- Matt Pocock Skills 作为 V1 首批受控 Skill Provider，优先支持意图澄清、领域建模、诊断、TDD 和双轴评审；
- Superpowers 只选择性做能力对照与适配，不启用全局总流程；
- OpenSpec 只作为可选规格工件能力，不拥有 Change Contract 或状态；
- CodeGraph 和 Multica 延后，分别保留 Knowledge Adapter 与 Team/Runtime Adapter 接口；
- Symphony、Spec Kit、ECC、OpenHands、OPA、Argo Rollouts、OpenTelemetry 仅作为阶段性参考或后续候选。

## 18. 主要事实来源

- [CimiLoop V1 产品范围与实施里程碑](./2026-09-19-cimiloop-v1产品范围与实施里程碑-v0.1.md)
- [CimiLoop 能力装配模型](../architecture/CimiLoop能力装配模型-v0.1.md)
- [Matt Pocock Skills](https://github.com/mattpocock/skills)
- [Superpowers](https://github.com/obra/superpowers)
- [Superpowers Porting Guide](https://github.com/obra/superpowers/blob/main/docs/porting-to-a-new-harness.md)
- [OpenSpec Overview](https://github.com/Fission-AI/OpenSpec/blob/main/docs/overview.md)
- [Agent Skills Specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx)
- [Multica](https://github.com/multica-ai/multica)
- [OpenAI Symphony Specification](https://github.com/openai/symphony/blob/main/SPEC.md)
- [GitHub Spec Kit](https://github.com/github/spec-kit)
- [CodeGraph 候选实现](https://github.com/codegraph-ai/CodeGraph)
- 仓库根目录：`AI-Native-Harness开源项目深度调研与选型建议-2026.md`
