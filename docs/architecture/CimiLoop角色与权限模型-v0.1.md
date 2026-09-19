# CimiLoop 角色与权限模型 v0.1

> 状态：讨论确认稿
> 日期：2026-09-19
> 范围：定义 Actor、Role、Assignment、Delegation、Decision Authority 与职责分离；不定义登录系统、组织目录、具体 RBAC/ABAC 产品或存储 Schema。

## 1. 文档定位

本文回答“谁可以在什么范围内，以什么角色，执行什么动作或作出什么决定”。它承接：

- `docs/architecture/CimiLoop整体能力架构-v0.1.md`；
- `docs/architecture/CimiChangeProtocol核心领域模型-v0.1.md`；
- `docs/architecture/CimiLoopChange端到端状态机-v0.1.md`。

角色不是传统岗位，也不是界面分组。角色是 Actor 在明确作用域和有效期内获得的一组责任、能力与决策权。Kernel 是权限与状态迁移的唯一执行权威。

## 2. 核心原则

1. **责任不匿名**：每个正式动作都关联 Actor、acting role、作用域和授权依据。
2. **唯一闭环责任**：每个 Change 始终有且只有一名当前 Human Change Owner。
3. **责任不等于全权**：Change Owner 对推进和闭环负责，但不自动拥有意图、技术、规则或发布批准权。
4. **无隐式代行**：所需角色缺失或不可用时进入等待决策（AwaitingDecision），不得自动向 Change Owner 或 Agent 扩权。
5. **最小权限**：Assignment、Delegation、Work Item 和生产权限均限定作用域、动作与有效期。
6. **角色可重叠，权力仍分开**：同一人可以承担多个角色，但每次 Decision 必须记录唯一 acting role。
7. **可自检，不可自证**：Executor 可以提交自检证据，正式 Evaluation 必须来自独立评价边界。
8. **人类承担最终责任**：V1 的责任角色和最终批准保留给 Human Actor；Agent 承担规划、执行、评价与受限操作。
9. **Kernel 最终裁决**：Actor、Agent、Skill 和 Adapter 只能提交 Command、Proposal、Evidence 或 Decision，不能直接修改权威状态。
10. **紧急越权显式化**：break-glass 是有限范围的异常授权，不是假装完成职责分离。

## 3. 权限语义对象

| 对象 | 中文解释 | 权威语义 |
|---|---|---|
| Actor | 参与者 | 发起行为的稳定身份，可以是 Human、Agent 或 System |
| Role | 角色定义 | 一组职责、允许能力、禁止能力和资格约束 |
| Assignment | 角色指派 | 将 Actor 与 Role 绑定到指定作用域和有效期 |
| Delegation | 委托 | 责任角色把部分可委托权限临时授予另一合格 Actor |
| Decision Request | 决策请求 | Kernel 生成的待决定事项，声明所需角色与有效输入 |
| Decision | 决策 | Actor 以 acting role 对指定对象和版本作出的结构化选择 |
| Policy Exception | 规则例外 | 在有限范围与时限内突破特定 Policy 的正式记录 |
| Work Item | 工作项 | Kernel 对一次有边界执行的具体授权 |
| Gate Evaluation | 关卡评价 | Kernel 基于 Policy、Evidence、Decision 与当前状态得出的结果 |

权限链为：

```text
Actor
→ 有效 Assignment / Delegation
→ acting role
→ Command 或 Decision
→ Kernel 校验作用域、版本、Policy 与职责分离
→ Gate Evaluation
→ 允许或拒绝状态迁移 / Work Item / 外部操作
```

Assignment 表明“谁在什么范围内具有什么角色”；Decision 表明“该 Actor 在某一时刻以该角色决定了什么”。两者不可互相替代。

## 4. 角色分类

### 4.1 人类责任角色

V1 中以下角色只能由 Human Actor 承担：

| 角色 | 主要责任 | 核心决定 |
|---|---|---|
| Project Owner（项目负责人） | 维护项目级责任归属与角色治理 | 指派、变更或撤销项目级责任角色，不代替这些角色作业务决定 |
| Change Owner（变更负责人） | 推动单个 Change 从 Draft 到关闭，处理阻塞并确保闭环 | 继续、暂停、取消、拆分、结束未交付或负责人移交提案 |
| Intent Owner（意图负责人） | 维护为什么做、成功标准、非目标和预期结果 | 批准或修订 Contract Version 与正式 Change Profile |
| Technical Owner（技术负责人） | 对技术方案、Task DAG、验证策略和重大技术调整负责 | 批准 Plan Version 与重大 Plan Amendment |
| Release Owner（发布负责人） | 对指定制品进入指定生产环境的风险负责 | 批准、拒绝或要求修改具体 Release |
| Policy Owner（策略负责人） | 维护长期架构、安全、合规和权限规则 | 创建、修改、停用长期 Policy |
| Exception Owner（例外负责人） | 裁决具体规则冲突与有限例外 | 批准或拒绝 Policy Exception |
| Incident Commander（事故指挥者） | 在事故期间统一应急目标、顺序和停止条件 | 批准应急范围内的指挥选择，不自动获得其他 Owner 权力 |
| Flow / Portfolio Owner（流动/组合负责人） | 管理 WIP、优先级、容量和跨 Change 依赖 | 调整组合优先级与容量，不直接改写单个 Change Contract |
| Domain Policy/Eval Owner（领域规则/评价负责人） | 维护 QA、安全、设计等专业规则、评估集和红线 | 批准专业规则与评价资产的长期变化 |

### 4.2 可执行角色

以下角色可由 Human 或 Agent 承担，但具体能力仍受 Work Item、Policy 与 Adapter 限制：

| 角色 | 主要产出 | 明确限制 |
|---|---|---|
| Intent Analyst（意图分析者） | 澄清问题、Contract Candidate、风险提示 | 不能批准 Contract |
| Planner（规划者） | Plan Candidate、Task DAG、验证策略建议 | 不能批准自己的 Plan |
| Executor（执行者） | 实现、Artifact、Claim、自检 Evidence | 不能把自检声明为正式评价通过 |
| Evaluator（评价者） | 独立测试、反例、覆盖分析、Evaluation | 不直接修复被评价的生产代码 |
| Operator / Deployment Actor（操作/部署执行者） | 部署、恢复、核对等外部操作结果 | 只能执行 Release 或 Work Item 明确授权的动作 |
| Reconciler（核对者） | 外部状态核对与事实回传 | 不能猜测未知外部结果或改写历史 |
| Learning Curator（学习整理者） | Learning Candidate 和复盘材料 | 不能自行晋升 Project Knowledge 或修改 Policy |
| Knowledge Maintainer（知识维护者） | 更新、废弃或核对产品、业务、技术、运维及支持知识 | 只能处理 Work Item 指定的知识范围；不能以“已更新”声明替代 Evidence，也不能自动批准内容正确性 |

System Actor（系统参与者）可以执行计时、规则求值、派生投影和确定性自动化，但不能冒充 Human 或 Agent。

## 5. 作用域模型

Role Assignment 必须绑定作用域。作用域从宽到窄包括：

```text
Project
├── Change
│   ├── Contract / Plan
│   ├── Task / Work Item / Run
│   ├── Artifact / Release / Deployment
│   └── Decision / Exception
└── Environment
```

规则如下：

- Project 级 Assignment 可以成为 Change 的候选默认值，但不自动绕过 Change Profile 或 Policy 限制；
- Change 级责任角色只对该 Change 生效；
- Work Item 是执行授权的最小常用边界，不因 Actor 具有 Executor 角色就获得任意仓库或工具权限；
- Environment 权限独立于 Change 权限；有 Change 权限不等于有生产权限；
- Release 授权必须绑定 Artifact Digest、Environment、范围、时间窗和恢复策略；
- 更窄作用域的授权不能扩大上层 Policy 允许的能力。

## 6. 指派、移交与委托

### 6.1 指派（Assignment）

有效 Assignment 至少需要表达：Actor、Role、Scope、有效期、来源和状态。它授予角色资格，不等于提前批准未来 Decision。

同一 Actor 可以拥有多个角色；同一角色可以在不同 Scope 内由不同 Actor 承担。每个 Change 的当前 Change Owner 是唯一例外：任一时刻只能有一名。

角色指派采用两级治理：

- Project Owner 创建、变更或撤销 Project 级责任角色 Assignment，包括 Intent Owner、Technical Owner、Release Owner、Policy Owner、Exception Owner 等；
- Change 创建时，责任角色从有效的 Project 级 Assignment 和 Change Profile 解析，缺失时进入 AwaitingDecision；
- Change Owner 可以在 Project Policy 与自身授权范围内，为当前 Change 安排 Intent Analyst、Planner、Executor、Evaluator、Reconciler、Learning Curator 等可执行角色；
- Change Owner 不得授予责任角色、扩大环境权限或给自己增加原本没有的批准权；
- Operator / Deployment Actor 的安排还必须满足 Environment 与 DevOps 权限，Change 内指派不能替代外部系统授权；
- 所有指派、变更和撤销都通过 Command 进入 Kernel，形成可审计 Event，不允许静默修改权限配置。

Embedded Solo Mode 在 Project 创建时，由 Kernel 将创建者显式初始化为 Project Owner。创建者可以再把其他角色显式指派给自己，但每个 Assignment 独立记录并继续受职责分离与 break-glass 规则约束。

### 6.2 Change Owner 移交

Change Owner 可以移交，但必须：

1. 指定原负责人和新负责人；
2. 核对当前状态、Blocker、待决策事项和外部副作用；
3. 记录生效时间与原因；
4. 原 Assignment 结束与新 Assignment 生效保持连续，不产生责任真空；
5. 形成不可变 Event 与审计记录。

Incident Commander 不会因进入事故模式自动成为 Change Owner，除非完成上述正式移交。

### 6.3 委托（Delegation）

委托是临时、可撤销且不可再隐式转授的权限：

- 只能委托 Role 定义允许委托的动作；
- 必须限定 Scope、允许动作、起止时间和委托原因；
- 委托者仍保留责任，受托者对实际动作负责；
- 不得通过委托绕过职责分离、资格要求或 Policy 禁止项；
- 责任角色本身、长期 Policy 所有权和历史 Decision 不能被追溯性转移。

所需角色缺失时，系统不得推断委托。它必须进入 AwaitingDecision，等待显式 Assignment、Delegation 或 break-glass。

## 7. 决策权矩阵

| 决策对象 | 默认最终角色 | Agent 可做什么 | Kernel 校验重点 |
|---|---|---|---|
| Project 级责任角色指派 | Project Owner | 提供候选人与冲突分析 | Actor 资格、作用域、职责分离、有效期与禁止自扩权规则 |
| Contract Version 与正式 Profile | Intent Owner | 整理候选、差异、风险和建议 | 当前版本、角色资格、风险与必要 Policy |
| Plan Version 与重大 Plan Amendment | Technical Owner | 形成 Task DAG、评价计划覆盖 | Contract 对齐、权限、依赖、风险、验证策略 |
| Change 继续、暂停、取消或结束未交付 | Change Owner | 提供状态摘要、影响和选项 | 未完成运行、副作用、清理、补偿与后续责任 |
| 具体 Policy Exception | Exception Owner | 说明冲突、风险与补偿建议 | 规则、范围、时限、责任人、补偿和职责分离 |
| 长期 Policy 变化 | Policy Owner | 提交 Policy Change Candidate | 影响范围、兼容性、评估结果和治理要求 |
| 指定 Artifact 的生产 Release | Release Owner | 组装 Release Package 和建议 | Artifact Digest、环境、Evidence、新鲜度、窗口与恢复策略 |
| 事故应急动作顺序与停止条件 | Incident Commander | 汇总现状、建议恢复动作 | 最小应急授权、范围、时限、生产权限与停止条件 |
| 组合优先级、WIP 与容量 | Flow / Portfolio Owner | 提供依赖和吞吐分析 | 不改写单个 Change 的 Contract 或状态权威 |

Decision 只记录决定，不直接迁移状态。Kernel 在 Decision 写入后重新执行 Gate Evaluation，成功后才创建 Transition Record 与 Event。

## 8. 执行权限矩阵

| 动作 | Change Owner | Intent Owner | Technical Owner | Release Owner | Executor | Evaluator | Operator | Kernel |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 提交 Contract Candidate | 建议 | 建议 | 建议 | — | — | — | — | 校验记录 |
| 批准 Contract Version | — | 决定 | — | — | — | — | — | 校验并迁移 |
| 提交 Plan Candidate | 建议 | — | 建议 | — | 可参与 | 可评价 | — | 校验记录 |
| 批准 Plan Version | — | — | 决定 | — | — | — | — | 校验并迁移 |
| 创建 Work Item | 请求 | — | 授权依据 | — | — | — | — | 唯一创建者 |
| 执行 Work Item | — | — | — | — | 执行 | — | 按类型执行 | 校验边界 |
| 提交自检 Evidence | — | — | — | — | 可以 | 可以 | 可以 | 校验来源 |
| 提交正式 Evaluation | — | — | — | — | 不可自证 | 可以 | — | 校验独立性 |
| 批准生产 Release | — | — | — | 决定 | — | 建议 | — | 校验并授权 |
| 执行生产 Deployment | — | — | — | — | — | — | 执行 | 核验一次性权限 |
| 直接修改 Change State | 禁止 | 禁止 | 禁止 | 禁止 | 禁止 | 禁止 | 禁止 | 唯一权威 |

“建议”表示可以提交 Proposal 或 Feedback；“决定”表示可以提交相应 Decision；两者都不能绕过 Kernel。

Project Owner 不在上表的 Change 内执行链中。其权限仅用于项目级责任角色治理；它不会因为完成角色指派而自动取得被指派角色的业务决定权。

## 9. 独立评价与职责分离

### 9.1 可自检，不可自证

Executor 可以运行测试、静态检查和安全扫描，并把结果作为来源明确的 Evidence 提交，但不能把自己的结论当作正式 Evaluation。

V1 的最低独立边界是：

- Evaluator 使用不同 Agent Run；
- 不继承 Executor 的完整对话或私有推理上下文；
- 从 Contract、Artifact 与可验证 Evidence 独立推导检查重点；
- Evaluation 失败后由 Executor 修复，Evaluator 不直接修改被评价的生产代码；
- Artifact Digest 变化后必须重新评价。

风险提高时，Policy 可以进一步要求不同 Agent Profile、不同模型或工具、不同 Human Actor、确定性 CI/安全工具或多方评价。

### 9.2 决策职责分离

普通风险允许同一 Human Actor 显式承担多个责任角色。以下场景默认要求不同 Actor 执行和批准：

- 数据破坏或不可逆迁移；
- 身份、权限、密钥或安全边界变化；
- 合规或重大隐私影响；
- 高 Blast Radius 的生产操作；
- Project Policy 明确要求的其他高风险动作。

独立 Evaluation 不等于 Release Approval；Release Owner 仍需针对具体 Artifact、Environment 与时间窗作出 Decision。

## 10. 紧急越权（break-glass）

Embedded Solo Mode 无法取得第二责任人时，可以在 Policy 允许的边界内使用 break-glass。它必须：

1. 明确触发原因和无法满足的职责分离规则；
2. 绑定具体 Change、动作、Environment、范围和有效期；
3. 使用最小权限与一次性凭据或授权；
4. 要求更强的确定性 Evidence、日志和即时核对；
5. 预定义停止条件、恢复或补偿策略；
6. 到期自动失效；
7. 强制生成事后复核与复盘事项。

break-glass 不产生虚假的第二审批者，不允许 Agent 自授予权限，也不把临时例外升级为长期 Policy。

## 11. Solo Mode 与 Team Mode

| 语义 | Embedded Solo Mode | Team Mode |
|---|---|---|
| Actor | 至少一个本地 Human Actor，加 Agent/System Actor | 组织身份与 Agent/System Actor |
| 角色重叠 | 常见，但 acting role 必须明确 | 可重叠，通常由 Policy 加强分离 |
| 指派 | 本地配置和 Change 创建流程 | 组织目录、项目治理与 Change 流程 |
| 独立评价 | 至少独立 Agent Run/确定性工具 | 可增加不同人员、团队或服务 |
| 高风险复核 | 第二 Actor；缺失时受控 break-glass | 默认由另一合格 Actor 复核 |
| 权限记录 | 与 Team Mode 使用同一 Protocol 对象 | 共享 Store 与组织级 Policy |

两种模式共享稳定 Actor ID、Role、Assignment、Decision、Event 与 Export/Import 语义。Solo Mode 不是绕过治理的特殊内核。

## 12. Kernel 强制不变量

1. Change 在非终结状态下始终存在唯一当前 Human Change Owner。
2. 每个正式 Decision 都能解析到有效 Actor、acting role、Assignment/Delegation 和 Scope。
3. Agent 不能提交被 Policy 保留给 Human 的最终 Decision。
4. 角色资格不自动产生 Work Item、环境权限或生产权限。
5. Assignment、Delegation、Decision 和 Exception 不能追溯性改写。
6. 失效或撤销权限不影响历史事实，但禁止新的 Command。
7. Executor 的 Evidence 不能单独满足要求独立 Evaluation 的 Gate。
8. Decision 不能直接修改 Current State；状态迁移只能由 Kernel 完成。
9. 未满足职责分离时，Gate 必须拒绝、等待其他 Actor 或要求显式 break-glass。
10. Adapter 与 Runtime 不能自行扩大 Actor 获得的权限。
11. Project Owner 可以治理责任角色 Assignment，但不能凭该角色代替 Intent、Technical、Policy、Exception 或 Release Decision。
12. Change Owner 只能安排 Policy 允许的 Change 内可执行角色，不能授予责任角色或扩大 Environment 权限。

## 13. 阶段结论

角色与权限治理骨架已经确认：Project Owner 管理项目级责任角色 Assignment；Change Owner 对单个 Change 的推进和闭环负责，并可在 Policy 范围内安排可执行角色；具体业务 Decision 仍由对应责任角色作出；Kernel 统一校验身份、作用域、版本、职责分离和授权边界。

后续 Schema 设计只需忠实表达这些语义，不再重新定义权力关系。
