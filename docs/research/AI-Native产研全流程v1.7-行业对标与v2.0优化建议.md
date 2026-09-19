# AI Native 产研全流程 v1.7：行业对标与 v2.0 优化建议

> 对标对象：飞书《AI Native 产研全流程 v1.7》  
> 行业参照：OpenAI、Anthropic、Microsoft、Cursor、Coinbase、Dropbox、Siemens、Block 公开实践  
> 评估日期：2026-09-16

## 一、结论先行

v1.7 已经不是“传统 SDLC 各节点叠加 AI 工具”，而是一套接近 **L4：AI Native SDLC** 的目标设计，并包含部分 L5 自演进软件工厂特征。它已经实质改变了：

- 核心工件：从 PRD 转向机器可读、版本化的规格与验收标准；
- 执行主体：N2、N4、N5 由 Agent 主导持续执行；
- 人机分工：人负责意图、约束、风险和例外，而非逐步操作；
- 质量机制：生成、测试、修复融合为循环；
- 发布机制：根据信任度和风险动态调整审核与部署；
- 反馈闭环：生产信号能够生成下一轮 proposal；
- 角色模型：PO、DRRI、IC、PM 已不再等同于传统职能角色。

它最值得保留的不是某个具体工具，而是 **“意图—证据—授权—运行—学习”** 这条主线。

但 v1.7 仍有三个结构性限制：

1. **五阶段仍像串行流水线。** 文件交接很清楚，但还没有形成持续、可恢复、可并行调度的 Agent 控制面。
2. **Trust Score 承担了过多决策。** 一个单值分数无法同时代表 Agent、任务、仓库、验证覆盖、变更风险和生产置信度。
3. **Kit 更像 Skills 集合，而非完整 Harness。** `grill → OpenSpec → SuperPowers` 能串起澄清和开发，但尚不足以承担状态、权限、评测、可观测性和组织学习。

因此，v2.0 不需要推翻 N1–N5，而应把它升级为：

> **N1–N5 是价值流中的五种持续状态，不是五个一次性阶段；Kit 是贯穿五种状态的研发控制面和 Harness，不是 Skill 启动器。**

---

## 二、与前沿企业实践的逐项对标

| 维度 | v1.7 现状 | 行业对标 | 判断 |
|---|---|---|---|
| 核心工件 | `proposal + specs + config + evidence` 均在 Repo 内版本化 | Microsoft Living Spec、OpenAI repo-as-memory | 强，已进入 AI Native |
| 意图澄清 | PO 与 AI 对话，OpenSpec 生成规格；Kit 可融合 grill | Microsoft Spec Driven Development | 强，但缺少机会证据与成功指标 |
| Agent 工作单元 | N2 按任务启用全新子 Agent，并使用 Worktree | Anthropic 长任务 Harness、OpenAI/Cursor task runtime | 中强，缺持久任务图和恢复控制面 |
| 生成—验证循环 | TDD、spec reviewer、quality reviewer、自动修复 | Anthropic generator-evaluator、Coinbase QA Agent | 强，但生成者和评价者可能相关性失误 |
| 人类介入 | 条件触发；N3 支持 Bypass | Anthropic 分级自治、Coinbase 风险门禁 | 方向正确，但 Trust Score 过于单一 |
| 发布 | AI 驱动 CI/CD、灰度、健康检查和回滚 | Dropbox 多轮验证、前沿团队 progressive delivery | 强，但未充分处理不可逆变更和 blast radius |
| 生产闭环 | 监控、反馈、事故汇总为 backlog/proposal | Cursor Projects、Block world model 愿景 | 领先，但学习尚未回写 Eval/Policy/Skill |
| 组织知识 | 项目归档与组织级继承 | OpenAI Harness、Coinbase reference/skills/evals | 有雏形，缺 freshness、owner 和回归验证 |
| 角色重塑 | PO、DRRI、IC、PM 重新定义 | Intent Owner、Harness Architect、Eval Engineer、Flow Owner | 已重塑一部分，但 DRRI 过载，关键角色缺失 |
| 控制面 | plans 模板 + 文件目录 + 独立会话交接 | Symphony/Cursor coordinator/Nova 平台 | 当前最大缺口 |
| 治理 | Gate、扫描、签字、回滚 | 最小权限、沙箱、能力代理、完整 lineage | 流程治理较强，Agent runtime 治理不足 |
| 度量 | 周期、漂移、收敛、Bypass、Canary、Trust | DORA + Impact + Eval/Harness 成功率 | 有体系，但部分指标会诱发错误行为 |

### 范式判定

按“执行主体、核心工件、控制面、反馈闭环、权责结构、度量目标”六个试金石，v1.7 已满足其中五项的大部分要求。弱项主要是控制面和价值度量。

- **设计目标成熟度：L4，局部有 L5 特征。**
- **不能仅凭文档判断实际运行成熟度。** 若当前主要依赖人工打开模板、切换会话和确认交接，实际运行状态更可能处于 L2–L3。
- **N5 自动生成 proposal 不等于自演进。** 只有失败和人工纠正能够更新 Eval、Policy、Skill、参考实现，并验证更新确实改善下一轮，才进入 L5。

---

## 三、应保留并强化的设计

### 1. N1 不做过早任务分解

把任务分解放到 N2、在代码库上下文中完成，是正确判断。它避免产品阶段生成脱离实现环境的伪精确计划，也符合 Agent 时代 JIT planning 的方向。

### 2. 人审“意图和证据”，而不是逐行审代码

N3 从代码评审转为安全、体验、发布风险三项决策，是重要的权责重塑。人类注意力应投向不可逆判断，而不是和 Agent 比拼语法检查。

### 3. Worktree + 新上下文子 Agent

隔离环境和上下文重置能显著降低并行污染与长期上下文漂移，应作为 Kit Runtime 的默认能力，而非某个 Skill 的可选步骤。

### 4. 把异常和信任变化前移记录

N2–N4 实时记录事件，比 N5 事后补写复盘可靠。应保留事件溯源思想，但需要重构事件分类。

### 5. N5 能够重新进入 N1

生产信号生成 proposal，说明流程已形成闭环，而非止于部署。这是 v1.7 最具 AI Native 特征的部分。

---

## 四、需要修正的关键假设

### 1. “代码是唯一事实来源”不成立

代码描述“系统现在如何运行”，不能独立表达“系统为什么存在、什么不应该发生、成功标准是什么、哪些风险不可接受”。

建议改为：

> **Repo 是权威工作空间；Living Spec、代码、验证证据和生产事实共同构成可追踪的事实链。**

Spec 不是代码的附属文档，而是控制 Agent 行为的长期工件。代码与 Spec 冲突时，系统应识别冲突并要求决策，而不是默认代码胜出。

### 2. “先发 PR 再讨论”只适合可逆问题

低风险实现细节可以对着代码讨论；数据模型、公共 API、权限边界、合规和高成本架构决策不应等到 PR 才发现分歧。

建议建立按可逆性分级的决策机制：

- 可逆、局部：直接生成实现和 PR；
- 中等影响：先生成可运行 spike，再做选择；
- 不可逆或高影响：先形成 Decision Record、威胁模型和迁移策略，再授权实现。

### 3. “JIT 规划”不能替代组织级方向

500 人组织仍需要产品组合、资源边界、合规窗口和跨项目依赖。应区分：

- 长周期：战略主题、资金和约束；
- 中周期：证据化机会组合与实验赌注；
- 短周期：Agent 基于实时上下文进行 JIT 实施规划。

不做六个月任务清单是合理的，不做长期方向与容量选择则不可行。

### 4. Intent Baseline 不应成为冻结规格

“锁定基线 + 计算漂移百分比”容易把正常学习误判为偏离。`15%/30%/50%` 也缺乏稳定的可计算语义。

建议把 Intent Drift 拆成：

- 未覆盖：实现或测试无法追溯到 Spec；
- 未授权：实现改变了行为，但没有 Spec Change；
- 已批准演化：新证据导致 Spec 正式升级；
- 违反约束：触碰政策、安全或架构红线。

用“需求—任务—代码—测试—生产证据”的 traceability 和风险等级替代单一语义百分比。

### 5. AI 生成 Design 且无需任何人审，范围过宽

不是所有设计都需要架构师审批，但高风险和难逆转决策需要 challenge。建议 DRRI 不审整篇 `design.md`，只审批自动抽取出的：

- 不可逆决策；
- 数据和接口兼容性；
- 权限与信任边界；
- 显著偏离参考架构之处；
- 缺少回滚或迁移路径之处。

### 6. 生成 Agent 与评审 Agent 容易共同犯错

同一模型、同一 Spec、同一上下文生成代码和测试，会出现相关性失误。建议 Verification Layer 至少组合：

- 确定性检查：类型、lint、单测、集成、契约、属性测试、mutation/fuzz；
- 独立 evaluator：不同 system prompt、隔离上下文，关键任务可使用不同模型；
- 生产 oracle：shadow、canary、SLO、业务 KPI；
- 高风险领域专家判断。

`100% 测试通过`只能说明已有测试通过，不能证明测试本身正确或覆盖充分。

### 7. writing-plans 不应是 N2 内部临时产物

任务计划是 Agent 调度、恢复、成本和追踪的关键控制工件。若它不流转，跨会话恢复、并发依赖、失败重试和审计都会依赖隐式上下文。

建议将其升级为持久 Task DAG，记录：

- Spec/风险来源；
- 依赖、并行边界和文件所有权；
- Agent、模型、Skill/Harness 版本；
- 权限、预算、超时、重试和停止条件；
- 状态、证据、决策、失败原因和恢复点。

### 8. N3 Bypass 的“24 小时沉默视为同意”需要重构

如果真等 24 小时，低风险流程反而被等待拖慢；如果先发布再保留否决权，则需要清晰的撤回机制。建议：

- 低风险、可逆、证据充分：策略引擎即时授权，事后抽查；
- 中风险：限时异步确认，超时不自动扩大影响面；
- 高风险或不可逆：必须显式批准；
- 合规场景禁止用沉默代替签字。

### 9. Trust Score 不应是单一数字

当前加减分规则直观，但缺少样本量、任务类型和失败暴露量。同样的 90 分，对文案改动和数据库迁移没有同样意义。

建议改为 **Scoped Confidence Profile**：

`任务类型 × Repo/服务 × Agent/Harness 版本 × 证据覆盖 × 近期样本 × 风险等级`

至少分开记录：

- Agent 执行可靠度；
- Spec/Eval 完备度；
- 变更自身风险与可逆性；
- 服务运行健康度；
- 团队处理异常的能力。

置信度用于授予具体能力，例如“可自动开 PR”“可自动合并”“可灰度到 5%”，而不是笼统决定整个项目是否可信。

### 10. N2 直修不能按“bug/安全 + Trust ≥ 80”跳过 N3

安全修复、数据修复和依赖升级可能比新功能风险更高。路由应由影响面、可逆性、数据敏感度、权限变化和外部副作用决定，而不是由需求标签决定。所有变更至少保留轻量 machine-readable change contract。

### 11. N5 的学习对象太窄

当前闭环主要更新 backlog、proposal 和归档。真正的 Harness 学习还应自动建议或提交：

- 新增/修正 Eval 与回归测试；
- 更新 Policy/Constitution；
- 更新 Skill、工具适配器和停止条件；
- 更新参考实现、设计系统和项目脚手架；
- 标记过期知识、owner 和 freshness；
- 对变更前后的任务成功率做对照验证。

### 12. `incident_log` 混入代码审查问题，语义不清

建议拆为统一 Event Ledger，下分：execution event、defect、policy exception、deployment event、production incident、human override、learning action。事故仍保留独立事件类型，避免“发现一个 lint 问题”也被计为 incident。

---

## 五、角色模型需要进一步重塑

| v1.7 角色 | 建议演化 | 原因 |
|---|---|---|
| PO | Intent/Outcome Owner | 不只确认 Spec，还要定义机会证据、业务成功指标和停止实验条件 |
| DRRI | 拆为 Constitution Owner + Risk/Release Owner | 当前同时负责架构、安全、发布、事故，跨 3–5 项目容易成为新瓶颈 |
| IC | Outcome Engineer / Agent Orchestrator | 重点转为问题分解、系统建模、异常诊断、Harness 改进和最终责任 |
| PM | Flow/Portfolio Owner | 不再签部署细节，负责价值流吞吐、跨项目约束、资源赌注和等待时间 |
| 缺失：QA | Eval/Quality Engineer | 设计 oracle、评估集、对抗场景、测试数据和独立验证策略 |
| 缺失：设计 | Experience/Design-System Owner | 将体验原则、组件、视觉规则变成 Agent 可消费约束和参考实现 |
| 缺失：SRE/平台 | Agent Runtime/SRE | 负责沙箱、权限代理、恢复、可观测性、成本和生产安全 |
| 缺失：安全治理 | Agent Governance Engineer | 负责 prompt injection、工具权限、数据分级、供应链和审计策略 |

PO 不应成为“做对了没有”的唯一来源。产品意图属于 PO，但安全、合规、体验、运行可靠性分别需要 policy owner；系统通过规则合并这些权威，而不是把责任集中在单人身上。

---

## 六、Kit 的目标架构：从 Skills Bundle 到 AI R&D Harness

### 当前适合保留的 Skill 链

- grill 类 Skill：探索歧义、反例、边界、非目标和关键假设；
- OpenSpec：把澄清结果编译为可执行规格；
- SuperPowers：计划、TDD、实现、调试和分支收尾；
- reviewer/security/deploy skills：形成专业 evaluator 和执行器。

### 需要补上的六层能力

1. **Intent/Spec Kernel**：统一 Spec schema、change contract、risk class、outcome metric 和 lineage。
2. **Control Plane**：持久 Task DAG、事件状态机、队列、并发、暂停、恢复、重试和人工升级。
3. **Agent Runtime**：Worktree + sandbox + secret broker + network/tool policy + model router。
4. **Evidence/Eval Plane**：确定性测试、独立 evaluator、Eval Registry、证据图和回归基线。
5. **Policy/Release Plane**：基于风险、可逆性、影响面和证据的能力授权与渐进发布。
6. **Learning Plane**：把生产失败和人工纠正回写为 Eval、Policy、Skill、reference 和知识更新。

### 每个 Skill 必须具备的契约

| 字段 | 说明 |
|---|---|
| Inputs/Outputs | 机器可读输入输出 schema，避免靠自然语言猜交接 |
| Preconditions | 何时允许执行，缺什么必须阻断 |
| Permissions | 文件、网络、凭据、外部系统的最小能力范围 |
| Evidence | 成功必须提交哪些可验证证据 |
| Evals | 离线回归集、在线成功率和已知失败模式 |
| Version/Lineage | Skill、模型、工具和规则版本可追溯 |
| Budget/Stop | token、时间、重试、成本和升级条件 |
| Fallback | Skill 失败后换模型、降级或转人工的路径 |

Skills 应是可替换插件，而不是控制流程的顶层架构。这样未来更换 grill、SuperPowers、OpenSpec 或模型时，不会重写整套 operating model。

---

## 七、建议的 N1–N5 v2.0

### N1：Evidence-backed Intent Contract

保留意图锁定，但加入机会证据、non-goals、业务 KPI、风险等级、可逆性和停止条件。Spec 是 living contract，不是冻结文档。复杂或高风险变更自动触发 architecture/security challenge。

### N2：Plan—Execute—Evaluate Graph

把 writing-plans 升级为持久 Task DAG。生成 Agent 与 evaluator 隔离；每个任务在受控 runtime 中执行，并产出 evidence package。人只处理冲突、低置信证据、策略例外和未收敛任务。

### N3：Policy Decision，而非固定交付关卡

由 Policy Engine 根据风险和证据授予能力：开 PR、合并、部署 Preview、灰度、扩量。低风险即时自动授权，中风险异步决策，高风险显式批准。N3 是持续决策服务，不是所有任务都必须排队经过的一扇门。

### N4：Progressive Delivery + Production Verification

发布不以“Pipeline 成功”结束，而以生产证据满足目标结束。加入 feature flag、shadow traffic、kill switch、roll-forward、不可逆迁移策略、业务 KPI 和 SLO。Agent 的生产凭据通过能力代理临时授予。

### N5：Continuous Learning + Harness Evolution

生产与客户信号不只生成 proposal，还生成 Eval/Policy/Skill 更新候选。更新经过离线回放和 canary 验证后进入 Kit。不同 change 可并行处于 N1–N5，不能要求整个项目等待 7 天稳定后才进入下一轮 N1。

### 横向控制面

```
机会/生产信号
      ↓
N1 Intent Contract → N2 Task/Eval Graph → N3 Policy Decision → N4 Progressive Delivery
      ↑                                                          ↓
      └──────────── N5 Learning & Harness Evolution ─────────────┘

横向贯穿：Identity · Permission · State · Evidence · Lineage · Cost · Observability
```

---

## 八、度量体系调整

### 建议降低或删除

- `Bypass 率目标逐步提升`：容易驱动团队为了自动化而自动化；
- `信任度月度正增长`：健康系统会因新风险和诚实暴露而短期下降；
- 单一 `意图漂移率`：定义难稳定，容易伪精确；
- 仅按 capability 数量估算复杂度：忽略耦合、数据和风险。

### 建议建立四层指标

| 层级 | 核心指标 |
|---|---|
| Outcome | 客户/业务 KPI、Time to Validated Learning、实验终止率 |
| Flow | Intent-to-Production lead time、等待占比、批量大小、返工率 |
| Quality/Risk | Change Failure Rate、escaped defect、MTTR、policy exception、不可逆失败 |
| Agent/Harness | 无人介入完成率、首次证据通过率、恢复成功率、成本/accepted change、Eval 回归、人工覆盖负担 |
| Team Health | 认知负担、on-call 压力、学习速度、初级工程师成长和关键知识集中度 |

自动化率只能作为诊断指标，不能作为北极星。

---

## 九、优先级建议

### P0：先修正模型，不急着增加更多 Skill

1. 把 N1–N5 定义为并发状态机，而不是串行阶段；
2. 把 writing-plans 变成持久 Task DAG；
3. 用多维 Scoped Confidence 替换单一 Trust Score；
4. 把 Intent Drift 改为 traceability + unauthorized change；
5. 拆分 generator 与 evaluator，建立独立 Eval Registry；
6. 明确 Agent runtime 的权限、沙箱、凭据和审计边界。

### P1：把 Kit 产品化为 Harness

1. 定义 Skill Contract 和版本治理；
2. 建立统一 Event Ledger 与 Evidence Graph；
3. 建立 Policy Engine 和 capability-based authorization；
4. 将生产故障和人工纠正自动转为 Eval/Policy/Skill 更新候选；
5. 支持模型与工具替换，避免方案绑定 Claude/OpenSpec/SuperPowers。

### P2：选择两类价值流验证

- 高可验证、低风险：依赖升级、内部工具、测试补齐、规则化迁移；
- 中等业务价值、可灰度：一个有真实用户反馈和可量化 KPI 的产品能力。

先证明端到端 outcome、质量和人类负担都改善，再扩展到高风险核心交易。

---

## 十、最终判断

v1.7 的方向大体正确，而且比多数公开企业转型方案更完整。它已经跨过“在旧流程节点提效”的阶段，真正触及了工件、执行主体、权责和反馈闭环的重构。

下一步不应继续堆更多 Skills 或增加更多 Gate，而应完成三个升级：

> **从阶段流水线升级为事件驱动控制面；从单一信任分升级为范围化能力授权；从 Skills 工具包升级为可评测、可治理、可学习的 Harness。**

做到这三点，N1–N5 才会从一套先进流程规范，变成能够规模化运行和自我改进的 AI Native 研发操作系统。
