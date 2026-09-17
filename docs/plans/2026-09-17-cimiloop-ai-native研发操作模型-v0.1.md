# CimiLoop AI Native 软件研发操作模型 v0.1

> 状态：讨论确认稿  
> 日期：2026-09-17  
> 范围：定义 AI Native 软件研发范式、生命周期、角色和决策机制；不包含 CimiLoop Harness 的技术实现设计。

## 1. 文档目的

本文定义 CimiLoop 所承载的 AI Native 软件研发操作模型。

它不是在传统需求、设计、开发、测试和部署节点上分别增加 AI 工具，而是重新定义：

- 研发工作的基本单元；
- 人、Agent 与规则各自拥有的权力；
- 意图、计划、代码、证据和生产发布之间的关系；
- Change 如何被授权、执行、验证、发布和学习；
- 自动化如何从人工监督逐步演进为有边界的自治。

本文是后续 CimiLoop Harness、Change Protocol、Skills 和部署适配器设计的上位约束。技术方案不得改变本文确定的权责和事实关系。

---

## 2. 一句话定义

> **CimiLoop 是以变更契约为授权边界、以 Agent 为主要执行者、以独立证据为状态流转依据、以人类承担意图和风险责任，并贯通开发、测试、生产发布与组织学习的 AI Native 软件研发闭环。**

其目标闭环为：

```text
问题或机会
→ 变更契约
→ 计划—执行—评价
→ 测试环境验证
→ 生产发布授权
→ 生产部署与即时验证
→ 学习与改进
→ 新的变更
```

---

## 3. 核心原则

### 3.1 Change 是最小交付单元

研发工作不以项目阶段或人员任务作为核心对象，而以 **Change（变更）** 作为独立交付、验证和追踪的最小单元。

```text
产品或项目
└── 多个 Change
    └── 每个 Change 包含多个 Task
```

Change 可以是：

- Feature：新增产品能力；
- Bugfix：缺陷修复；
- Incident：生产事故处置；
- Security Fix：安全修复；
- Migration：数据、架构或依赖迁移；
- Experiment：产品或技术实验；
- Tech Debt：重构和技术债治理；
- Ops Change：配置或运行策略调整。

同一项目可以同时存在处于不同生命周期状态的多个 Change，彼此不因阶段不同而相互阻塞。

### 3.2 不允许裸 Task 修改系统

所有进入代码库或环境的修改都必须属于一个 Change。每个 Change 都必须拥有变更契约，但契约重量可以由 Change Profile 决定。

- Feature 使用完整意图、结果和行为规格；
- Bugfix 使用复现证据、期望行为和回归标准；
- Incident 使用最小应急契约，恢复后补齐证据；
- Migration 强化兼容、数据和恢复约束；
- Tech Debt 强调行为不变与结构目标。

### 3.3 状态流转由证据驱动

文件存在、Agent 声称完成、PR 已创建，都不能单独证明 Change 可以继续。

每次关键状态流转必须检查：

- 当前变更契约版本；
- 当前风险画像；
- 必要证据是否充分且有效；
- 是否存在规则例外；
- 是否需要指定人类角色决策。

### 3.4 Agent 执行，人类负责

Agent 可以拥有规划权、执行权、测试权和受限操作权，但不能成为最终责任主体。

人类负责：

- 意图和成功标准；
- 不可逆和高风险判断；
- 规则例外；
- 生产发布授权；
- Agent 不能收敛时的诊断；
- 最终结果责任。

### 3.5 默认连续执行，异常才暂停

目标模式是有边界的持续自治：Change 被授权后，Agent 默认推进到权限允许的最远状态。

以下情况必须暂停：

- 意图或验收标准不完整；
- 契约、计划或规则发生冲突；
- 出现未授权变化；
- 验证无法收敛；
- 操作不可逆或超出权限；
- 超出预算、时间或重试限制；
- 证据不足；
- 规则明确要求人工判断。

---

## 4. 变更契约

### 4.1 定义

**变更契约（Change Contract）** 是人、Agent 与系统对一次变化达成的、可执行且可验证的共同约定。

它回答：

- 为什么改变；
- 期望改变成什么；
- 哪些内容不在范围内；
- 什么叫实现正确；
- 受哪些业务、技术、安全和合规约束；
- 存在哪些风险，是否可逆；
- 需要什么证据；
- 谁拥有相应决策权。

Spec 是变更契约的一部分，Task DAG 是契约授权后的执行计划，测试和部署结果是履约证据。

### 4.2 统一核心 + Profile

所有 Change 使用统一核心契约，再加载不同 Profile 的扩展字段和规则。

统一核心至少包含：

```text
Change ID
Change Profile
Intent
Evidence
Expected Outcome
Non-goals
Acceptance Criteria
Constraints
Risk & Reversibility
Required Evidence
Owners
Contract Version
```

### 4.3 契约是逻辑聚合

变更契约不是必须塞进单一 YAML 的大文件，而是由机器可读元数据、人类可读意图、行为规格、决策和证据共同组成的逻辑聚合。

### 4.4 意图版本授权

N1 不永久锁死需求，而是授权当前变更契约版本进入执行。

```text
Contract v1 被批准
→ 进入执行
→ 出现新事实
→ 提交 Contract Amendment
→ 对应 Owner 批准
→ 形成 Contract v2
→ 仅失效并重新执行受影响任务和证据
```

未经契约修改就改变系统行为，属于未授权变化；经过批准的契约演化不属于意图漂移。

### 4.5 契约修改权限

- Intent、Outcome、Non-goals：Intent Owner 批准；
- 技术、安全或合规约束：对应 Policy Owner 批准；
- 不改变行为的说明补充：Change Owner 可批准；
- 变更必须说明原因、新证据、影响范围和需要失效的已有证据。

---

## 5. 双层流程模型

### 5.1 上层价值模型：N1–N5

N1–N5 用于组织沟通和责任划分，不直接等同于底层状态机。

| 能力域 | 中文名称 | 核心问题 |
|---|---|---|
| N1 | 意图契约 | 为什么改变，怎样算正确 |
| N2 | 计划—执行—评价 | 如何可靠地产生并验证实现 |
| N3 | 风险授权 | 当前证据是否允许继续 |
| N4 | 环境验证与生产交付 | 如何把同一制品安全送达生产 |
| N5 | 复盘与学习 | 本次执行应如何改善下一次 |

N3 不是所有 Change 必须停留的独立阶段，而是贯穿关键状态流转的授权能力。

### 5.2 底层生命周期状态

底层使用适合机器执行的精细状态：

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

异常与等待状态包括：

```text
Blocked
AwaitingDecision
Failed
RolledBack
Superseded
Cancelled
```

测试失败的主要回路为：

```text
TestValidating
→ 失败证据
→ Executing
→ Evaluating
→ TestDeploying
→ TestValidating
```

### 5.3 动态路径

所有 Change 遵循统一协议，但不强制走完全相同的路径。

- Feature：完整意图契约、执行和生产发布；
- Bugfix：极简意图契约，可快速进入执行；
- Incident：应急恢复优先，事后补齐证据；
- Migration：强化风险、兼容和恢复决策；
- Prototype/Experiment：可以在验证假设后结束，不进入生产。

路径由 Profile、风险、可逆性、证据充分度和自治策略共同决定。

---

## 6. 自治模型

### 6.1 自治等级

| 等级 | 模式 | 行为 |
|---|---|---|
| A0 | 影子模式 | Agent 只生成建议和证据，不执行修改 |
| A1 | 监督模式 | Agent 执行，关键决策由人确认 |
| A2 | 受控自治 | 低风险自动推进，高风险或低置信情况转人工 |
| A3 | 范围自治 | 授权范围内持续推进，仅异常时通知人 |

### 6.2 V1 默认策略

V1 默认使用 A1 监督模式，以真实人机差异建立可靠性基线，不在缺少数据时直接追求无人干预。

V1 的主要人工决策包括：

1. **意图决策**：Intent Owner 批准当前变更契约版本；
2. **执行计划决策**：Technical Owner 批准 Task DAG、风险和验证策略；
3. **生产发布决策**：Release Owner 基于测试证据和上线清单明确批准生产部署。

Change Profile 可以增加人工体验验证、Policy 例外和不可逆操作确认。

未来只有在同类 Change 的真实数据证明 Agent 建议长期可靠后，才能把指定 Profile 的指定决策逐步升级到 A2/A3。

---

## 7. 决策与证据

### 7.1 决策包与证据包分离

决策包用于回答“是否允许继续”，证据包用于回答“事实是什么”。

主要决策包：

- Intent Decision Package：批准变更契约；
- Execution Plan Decision Package：批准任务图和验证策略；
- Production Release Decision Package：批准生产发布；
- Exception Decision：批准特定规则例外。

主要证据包：

- Delivery Evidence Package：实现、测试、扫描和独立评价；
- Test Evidence Package：测试环境部署和验证历史；
- Release Evidence Package：生产部署与即时验证；
- Learning Package：人工纠正、失败模式和改进建议。

### 7.2 决策结构

人类决策统一返回：

```yaml
decision: approve | reject | request_changes
reason: ...
required_changes: []
risk_observation: []
```

正常情况下，人不直接替 Agent 修改产物，而是返回结构化反馈，由 Agent 修改后重新提交。生产事故等紧急情况允许直接干预，但必须事后补录决策和差异。

### 7.3 状态流转检查

状态流转检查是 Change 进入下一个状态前执行的准入判断。

统一结果为：

```text
ALLOW                 自动允许
REQUIRE_HUMAN         请求指定 Owner 决策
DENY                  当前条件下禁止
NEED_MORE_EVIDENCE    补充证据后重新判断
```

LLM Agent 可以解释和提出建议，但最终结果由确定性规则和人工决策产生。

### 7.4 规则例外

规则例外必须记录：

- 被突破的规则；
- 原因；
- 风险和补偿措施；
- 批准人；
- 有效范围和失效时间；
- 适用的 Change 与 Contract Version。

例外默认只对当前 Change 和版本有效。重复例外只能由 Policy Owner 决定是否升级为长期规则。

---

## 8. 角色与决策权

角色按决策权和责任定义，不等同于传统岗位。小团队允许同一人承担多个角色，但必须以明确角色身份作出决策。

### 8.1 人类角色

| 角色 | 核心责任 |
|---|---|
| Intent Owner | 决定为什么做、成功标准、非目标、优先级和契约版本 |
| Change Owner | 对单个 Change 从创建到关闭的完整推进负责 |
| Technical Owner / Outcome Engineer | 负责领域模型、技术结果、异常诊断、Evaluator 可信度和技术责任 |
| Policy Owner | 定义长期架构、安全、合规和 Agent 权限规则 |
| Exception Owner | 裁决规则冲突、不可逆决策和高风险例外 |
| Release Owner | 根据生产发布包批准或拒绝生产部署 |
| Flow / Portfolio Owner | 管理 Change 优先级、WIP、跨 Change 依赖和组织吞吐 |
| Domain Policy/Eval Owner | 将 QA、安全、设计等专业判断编码为规则、评估集和红线 |

### 8.2 唯一 Change Owner

每个 Change 必须有且只有一个人类 Change Owner。

默认映射：

- Feature/Experiment：Intent Owner 或产品负责人；
- Bugfix：服务或模块 Technical Owner；
- Migration/Tech Debt：技术负责人；
- Security Fix：安全责任人或服务 Owner；
- Incident：Incident Commander 或服务 Owner。

### 8.3 决策矩阵

| 决策 | 最终决策角色 |
|---|---|
| 是否值得做、意图版本是否正确 | Intent Owner |
| 技术计划是否合理 | Technical Owner |
| 是否允许规则例外 | Exception Owner |
| Change 是否继续、暂停或取消 | Change Owner |
| 是否允许生产发布 | Release Owner |
| 是否实现预期价值 | Intent Owner（具备观察能力后） |

### 8.4 职责分离

- V1 允许一个人兼任多个角色；
- 数据破坏、权限、安全、合规和不可逆迁移等高风险 Change，Change Owner 与批准人必须分离；
- Policy Owner、Exception Owner 和 Release Owner 是三种逻辑权力，即使由同一人兼任也要分别记录；
- QA、安全和设计不再默认逐 Change 排队审批，而是成为规则和评价体系 Owner，只在例外和高风险时人工介入。

---

## 9. Agent 模型

### 9.1 Orchestrator + 临时角色 Session

V1 不建设固定的多 Agent 团队，而采用一个 Orchestrator 加按需创建的临时角色 Session。

```text
Orchestrator
├── 意图模式：调用澄清和规格 Skills
├── 规划模式：形成 Task DAG
├── Executor Session：实现和内部验证
├── Evaluator Session：独立评价
└── Deployment Mode：调用部署能力
```

Change Profile 决定工作流，工作流选择角色，角色加载 Skills，只有需要隔离、独立评价或并行执行时才创建独立 Session。

### 9.2 Executor 与 Evaluator 分离

Executor 负责：

- 规划实现细节；
- 修改代码；
- 编写实现相关测试；
- 修复失败；
- 提交 Claims 和 Evidence。

Evaluator 负责：

- 从变更契约独立推导验证重点；
- 生成黑盒验收场景、边界条件和反例；
- 检查实现与契约的可追踪性；
- 运行或检查确定性工具结果；
- 提交独立评价结论。

Evaluator 不直接修复生产代码。失败报告返回 Executor，修复后重新评价。

V1 至少要求 Evaluator 使用独立 Session，不共享 Executor 的完整对话上下文。

---

## 10. N1：意图契约

### 10.1 入口

V1 由用户在 cimicode 中描述需求、Bug 或技术变更，或提供已有 Issue/需求文本，主动创建 Draft Change。暂不自动监听工单、告警和生产信号。

### 10.2 Profile 识别

Agent 建议 Change Profile，并解释判断依据和建议路径；人类在 Intent Review 中确认或修改。Agent 不得自行把高风险 Change 归类为低风险类型。

### 10.3 动态意图澄清

澄清方式按 Profile 变化：

- Feature：用户、价值、边界、非目标和结果；
- Bugfix：复现、期望行为、影响和回归；
- Migration：兼容、数据、切换和恢复；
- Incident：完成恢复所需的最小澄清；
- Tech Debt：行为不变和结构目标。

当对应 Profile 的契约信息已经完整且可验证时停止，不追求固定问题数量。

### 10.4 N1 的设计边界

- N1 尽量保持方案中立；
- UI/交互型 Change 可以生成 Prototype 澄清体验意图；
- 正式技术设计在 N2 结合代码库上下文产生；
- 关键可行性未知时创建 Spike Task 或独立 Spike Change，结果回写契约。

### 10.5 风险画像

风险不使用单一 Trust Score，至少包含：

- Blast Radius：影响范围；
- Reversibility：可逆性；
- Data Impact：数据影响；
- Security/Compliance：安全与合规；
- External Side Effect：外部副作用；
- Novelty/Uncertainty：新颖性和不确定性。

Agent 提议风险画像，人类在 N1 确认。风险画像用于决定证据、权限和人工决策强度。

### 10.6 N1 完成条件

在 Intent Review 前必须验证：

- Intent 与 Non-goals 清楚；
- Acceptance Criteria 可验证；
- Owner 完整；
- 风险和可逆性已分类；
- 契约内部无明显矛盾；
- 边界、错误、超时和并发语义充分；
- 必要的 Spike 已识别。

Intent Owner 批准后，当前 Contract Version 进入 `IntentReady`。

---

## 11. N2：计划—执行—评价

### 11.1 持久 Task DAG

Plan 不是一次性 Markdown 清单，而是可追踪 Task DAG。每个 Task 至少记录：

- Task ID；
- Contract/Spec 来源；
- 依赖关系；
- 输入与预期输出；
- 允许修改范围；
- 所需 Skills 和权限；
- 验证方式；
- 风险、预算和停止条件；
- 当前状态。

### 11.2 Plan Review

在 A1 模式下，正式实现前：

1. Planner 读取 Contract、代码库和 Policy；
2. 生成 Task DAG、影响分析和验证策略；
3. Evaluator 检查计划覆盖和风险；
4. Technical Owner 批准 Execution Plan Decision Package；
5. Executor 获得执行授权。

规划阶段可以执行只读分析和受限 Spike，但未批准的 Spike 代码不能直接混入正式实现。

### 11.3 Worktree 策略

- 默认每个 Change 一个 Worktree；
- 顺序任务共享 Change Worktree；
- 只有文件边界清晰、依赖独立的任务才使用并行子 Worktree；
- 合并前检查文件所有权冲突；
- Change 关闭后清理 Worktree。

### 11.4 验证策略

所有 Task 必须先声明如何证明正确，但不强制所有任务机械采用 TDD。

- 业务逻辑和 Bugfix：优先 TDD；
- API：契约与集成测试；
- UI：交互、E2E 和视觉验证；
- Migration：兼容性、数据校验、dry-run 和恢复演练；
- 配置/部署：静态校验、测试环境执行和健康检查；
- Spike：验证假设，不要求完整生产级测试。

### 11.5 运行与停止条件

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

每个 Task 必须配置最大修复次数、时间或成本、允许修改范围、权限、冲突处理和升级条件。不得无限自主循环。

### 11.6 Plan Amendment

- 不改变范围、风险和验证策略的实现细节：Executor 可更新并记录；
- 改变 Task 边界、权限、风险或验证策略：Technical Owner 批准 Plan Amendment；
- 改变 Intent 或 Acceptance Criteria：升级为 Contract Amendment。

### 11.7 N2 完成与测试部署

当实现、确定性工具和独立 Evaluator 均满足当前契约后，生成 Delivery Evidence Package。

如果没有新增风险、规则例外或契约变化，Change 自动进入测试环境部署，不增加额外人工批准。

---

## 12. N3：风险授权

N3 是贯穿全流程的状态流转检查能力，不是固定阶段。

检查输入至少包括：

- Change Profile；
- 多维风险画像；
- 当前状态与目标状态；
- 自治等级；
- Contract/Plan 版本；
- Evidence 完整性和新鲜度；
- 目标环境；
- 规则例外；
- 人工历史决策。

等待人工决策时：

- Change 进入 `AwaitingDecision`；
- 系统呈现对应决策包；
- 明确需要哪个 Owner；
- 无回应时保持等待，不采用“沉默视为同意”；
- 决策完成后从断点继续。

---

## 13. N4：环境验证与生产交付

### 13.1 构建一次、逐环境提升

- N2 生成唯一、不可变的构建制品；
- 同一制品先部署测试环境；
- 测试通过后提升至生产环境；
- 不在生产发布前重新构建；
- 测试和生产记录同一制品摘要、提交和配置版本。

### 13.2 测试环境自动循环

```text
部署测试环境
→ 执行验收、集成、冒烟、视觉或人工测试
→ 失败
→ 生成失败证据
→ Executor 修复
→ Evaluator 重新验证
→ 重新构建并部署
```

达到最大循环、风险变化或契约冲突时暂停并请求 Technical Owner。

### 13.3 生产发布包

生产发布包至少包含：

- Contract Version；
- 测试环境验证结论；
- 制品摘要；
- 已知问题和残余风险；
- 数据迁移与兼容说明；
- 生产上线 Checklist；
- 恢复方案；
- 发布时间与目标环境；
- 发布后即时验证步骤；
- Evaluator 建议；
- Release Owner 决策。

Release Owner 明确批准后，Deployment Agent 才获得一次性生产发布授权。

### 13.4 部署和恢复策略

部署策略由风险和现有平台能力决定。V1 优先复用现有 DevOps 平台，不强制建设新的发布平台。

恢复策略不能统一假设为版本回滚，应按 Change 选择：

- Rollback：版本回退；
- Roll-forward：向前修复；
- Feature Disable：关闭功能；
- Traffic Shift：切回旧实例；
- Data Restore：数据恢复；
- Manual Recovery：人工恢复。

不可逆数据变更必须提前验证备份、兼容窗口、双写或补偿方案。

### 13.5 凭据和部署记录

- cimicode V1 只获得触发指定 Pipeline 的权限；
- 生产凭据由 DevOps 平台管理；
- Agent 不读取和输出真实生产密钥；
- 每次部署记录 Deployment ID、Change ID、Artifact、Contract Version、环境、触发者、授权、时间、结果和恢复动作；
- 重试前查询环境状态，避免重复执行外部副作用。

### 13.6 即时发布验证

部署成功后必须完成：

- 目标版本确认；
- 基础健康检查；
- 核心路径冒烟；
- 配置和依赖检查；
- 必要人工 Checklist；
- 结果和异常记录。

验证失败时执行预先授权的恢复策略；超出授权范围则暂停并请求 Release Owner。

通过后进入 `ReleaseVerified`。V1 只能声明“生产发布即时验证通过”，不能声明“长期稳定”或“业务价值已验证”。

---

## 14. N5：复盘与学习

### 14.1 V1 输入边界

V1 使用真实可获得的信息：

- N1–N4 的 Decision 和 Evidence；
- Agent 失败、重试、阻塞和人工纠正；
- 测试环境发现的问题；
- 生产发布结果和即时验证；
- 人工补充的线上问题、反馈或事故；
- 遗留问题。

V1 暂不声称自动采集生产日志、Trace、SLO、业务指标和用户行为。

### 14.2 学习建议分类

Learning Agent 将建议分类为：

- Contract：契约或验收模板；
- Policy：规则；
- Eval：测试、反例和评估集；
- Skill：Skill 执行方法；
- Harness：调度、权限、记录或恢复机制；
- Codebase：技术债和参考实现；
- New Change：新的产品或修复变更。

V1 只生成建议，不自动修改全局 Policy、Skill 和 Harness。

### 14.3 人工干预记录

系统应记录：

- Agent 原始建议；
- 人类最终决定；
- 修改前后差异；
- 修改原因；
- 最终结果。

对于直接文件或代码修改，通过版本差异关联到人类操作；恢复流程时要求补充原因。Learning Agent 只能生成学习候选，不能推断“人类修改必然正确”。

### 14.4 学习晋升

Policy、Eval、Skill 或 Harness 更新必须经过：

```text
学习建议
→ Owner 批准
→ 历史 Change 或 Eval 回放
→ 回归检查
→ 版本发布
→ 新 Change 引用新版本
```

不得让 Agent 自动修改自身全局规则并立即生效。

### 14.5 Change 关闭

满足以下条件后 Change 可以关闭：

- 生产即时验证通过；
- 决策和证据完整；
- 已知问题已记录；
- Learning Agent 已完成复盘分类。

未完成的改进进入 Backlog 或形成新 Change，不阻塞当前 Change，也不阻塞其他 Change。

---

## 15. 交付状态与结果状态

Change 同时记录两个维度：

### Delivery Status

描述软件是否已实现、验证和发布。V1 可以推进至：

```text
ProductionVerified / DeliveryClosed
```

### Outcome Status

描述业务或用户结果是否得到验证：

```text
NotObserved
Observing
Validated
Invalidated
Inconclusive
```

由于 V1 暂不接入持续生产观察，生产发布后通常记录：

```yaml
delivery_status: ProductionVerified
outcome_status: NotObserved
observation_capability: manual_only
```

未来人工或系统补充结果证据时，可以更新 Outcome Status。结果未达到预期时创建新 Change，不篡改原 Change 历史。

---

## 16. 事实来源

### Repo：持久工件

保存变更契约、规格、规则、Task DAG 声明、代码、测试定义、决策和最终证据摘要。

### cimicode：运行时状态

保存 Session、任务实时状态、临时锁、暂停恢复、模型和 Skill 调用、预算与执行日志。

### CI/CD 与环境：运行事实

保存构建、测试、部署和环境执行结果。Harness 只在 Repo 中保存必要摘要、版本、查询条件和原始记录引用。

三者通过 Change ID、Contract Version、Artifact ID 和 Deployment ID 关联。

---

## 17. V1 能力边界

V1 明确面向单人或小团队、本地 Runtime 优先：

- 每位执行者使用本地 cimicode；
- Repo 是团队持久协作协议；
- 不建设中央数据库、复杂 Web 控制台或组织级 Agent 调度平台；
- 测试和生产部署通过现有 CI/CD/DevOps 能力；
- 打通测试部署、失败修复、生产 Checklist、明确授权、生产部署和即时验证；
- 暂不自动采集生产全量日志、Trace、SLO、业务 KPI 和用户反馈；
- 暂不自动修改全局规则；
- 通过统一 ID、Schema、事件和 Skill Contract 为未来组织级能力预留边界。

---

## 18. 已确认但留待 Harness 设计的问题

以下内容不属于范式争议，将在 CimiLoop Harness 技术设计中定义：

- Change Contract 的字段级 Schema；
- 每个 Profile 的完整必填项；
- 精确状态迁移表；
- Policy 文件格式和规则求值方式；
- Event、Decision、Evidence 的 JSON/YAML Schema；
- Skills 的输入输出和权限契约；
- 人工干预记录器的 Hook 和 Diff 实现；
- OpenSpec、Matt Skills、Superpowers 的适配方式；
- cimicode Session、Worktree 和 Evaluator 隔离实现；
- DevOps Adapter 接口；
- 旧 cimi-flow 资产的迁移或废弃计划。

---

## 19. 相关材料

- `AI-Native软件研发新范式行业深度调研-2026.md`
- `AI-Native产研全流程v1.7-行业对标与v2.0优化建议.md`
- `AI-Native-Harness开源项目深度调研与选型建议-2026.md`

