# AI Native 软件研发新范式：前沿企业落地深度调研

> 研究日期：2026-09-15  
> 研究目标：辨别行业中的真实范式重构与局部节点提效，为后续内部研发转型方案对照和优化建立基线。

## 一、执行摘要

### 1. 核心结论

当前行业已经出现了真正的 AI Native 软件研发，但它只发生在少数团队和少数公司中。多数企业仍处于“传统 SDLC + AI 工具”的增强阶段。

真正的分界线不是 AI 生成了多少代码，而是研发系统的**主要执行者、核心工件、流程控制面、质量闭环和人的职责**是否同时发生改变。

综合 OpenAI、Anthropic、Microsoft、Cursor、Coinbase、Dropbox、Siemens 和 Block 的公开实践，本报告给出如下定义：

> **AI Native 软件研发，是以可执行意图为核心工件，以 Agent 为主要执行主体，以仓库、工具、环境和组织知识构成的 Harness 为生产基础设施，以自动验证和风险分级治理形成反馈闭环，由人负责目标、约束、判断与责任的研发操作系统。**

其本质不是“AI 加入传统流水线”，而是研发操作系统从以下模式迁移：

`人理解 → 人分工 → 人执行 → 人检查 → 人交接`

迁移为：

`人定义意图与约束 → 系统形成可执行任务图 → Agent 并行执行 → 环境自动反馈与纠偏 → 人按风险验收 → 生产信号回流到规格、知识和规则`

最重要的行业共识有七点：

1. **规格和验收条件正在取代代码，成为研发的上游核心工件。** Microsoft 将 living specification 设为单一事实源；OpenAI 把计划、设计、产品原则和技术债都版本化在仓库中。
2. **Agent 不再只是 IDE 内的结对助手，而成为异步、并行、持续运行的执行者。** OpenAI Symphony 直接把任务系统变成 Agent 控制面；Cursor 和 Coinbase 都让一个人同时调度多个 Agent。
3. **Harness Engineering 正在成为新的平台工程。** 真正的壁垒不是模型，而是企业特有的上下文、工具、测试、权限、沙箱、观测与恢复机制。
4. **测试、日志和生产环境不是末端检查，而是 Agent 的“感知器官”。** 可执行反馈的覆盖率决定可放权的深度。
5. **质量治理从统一人工审批迁移为风险分级、机器互审和异常升级。** 人仍然负责结果，但不再逐步参与每个执行动作。
6. **工程师由主要实现者转向意图澄清者、系统设计者、Agent 编排者和结果审判者。** PM 成为规格与结果的持续 owner；架构师把原则编码成可执行约束；设计系统团队开始同时服务人和 Agent。
7. **代码产量和 PR 数已经失去作为核心生产力指标的资格。** Dropbox、Microsoft 和 DORA 都转向端到端价值流、质量、返工、认知负担和客户结果。

### 2. 回答最关键的问题：流程是否“完全重塑”了？

答案是：**少数样本已经重塑，多数样本仍在过渡，而且不存在一刀切的“全自动 SDLC”。**

- OpenAI 的新建产品实验最接近完整重塑：三名工程师驱动 Codex 生成约百万行代码和约 1,500 个 PR，代码、测试、CI、文档、观测和工具均由 Agent 生成；人的工作上移到环境设计、意图表达和反馈闭环。[OpenAI：Harness Engineering](https://openai.com/index/harness-engineering/)
- Microsoft Digital 明确否定“个人节点提效即团队提效”，重新以 living spec 串联 PM、架构、开发、测试和 Agent，是大型企业中公开程度最高的流程重构样本之一。[Microsoft：AI-native 与规格驱动研发](https://www.microsoft.com/insidetrack/blog/engineering-the-frontier-firm-sharing-our-ai-native-approach-to-software-development/)
- Coinbase 已经同时改变设计到代码、并行实现、测试和招聘评价机制，是角色重塑最明显的企业样本；但其核心高风险系统仍强调人工架构决策和审查。[Coinbase：多 Agent 并行研发](https://www.coinbase.com/blog/coding-had-a-concurrency-problem-how-mux-helped-solve-it)
- Dropbox 已经把 Agent 做成企业级通用平台，并把 CI 修复、flaky test、迁移和依赖升级变为持续工作流；但发布权和最终判断仍有意保留在人类一侧。[Dropbox：Nova 平台](https://dropbox.tech/machine-learning/introducing-nova-our-internal-platform-for-coding-agents)
- Anthropic 在模型、Harness、长任务和多 Agent 方面处于前沿，但其内部调研也显示，大多数员工能完全放手委托的工作仍只有 0–20%。这说明“高频使用”不等于“高自治”。[Anthropic：内部工作变化研究](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic)

因此，更准确的判断是：**行业正在从“人主导的线性 SDLC”迁移到“人治理的 Agent 执行网络”，但自治边界按任务风险和可验证性分层，而不是整条流程统一替换。**

---

## 二、研究方法与证据标准

### 1. 纳入标准

企业被纳入核心样本，至少满足以下两项：

- 有企业自身发布的内部研发实践，而非只描述对外销售的产品能力；
- 覆盖编码之外的规划、测试、评审、发布、运维或持续改进；
- 公开了真实组织用法、系统架构、流程变化或可核验指标；
- 明确讨论角色、权责或管理机制变化；
- 有实际生产用户、已合并代码或已运行工作流，而非纯概念演示。

### 2. 证据分级

- **A 级：** 公司自身工程团队发布的内部生产实践，含系统细节、边界和指标。
- **B 级：** 公司内部研究、客户零号实践或具名负责人访谈，含方法和限制。
- **C 级：** 工具供应商客户案例，数据可能真实，但具有选择和营销偏差。
- **D 级：** 战略宣言、管理层观点或尚处早期的组织设计愿景。

本报告不把“AI 代码占比”“工具安装率”“自报节省时间”单独视为范式重构证据。

---

## 三、前沿企业逐案分析

## 3.1 OpenAI：从 Agent-first Repo 到持续运行的软件工厂

**证据等级：A；当前最完整的 AI Native 新建系统样本。**

### 如何定义

OpenAI 没有把 AI Native 定义成“人人用 Codex”，而是提出一个更严格的操作原则：

> Humans steer. Agents execute.

工程团队的主要工作不再是直接写代码，而是设计环境、表达意图、建立反馈回路，让 Agent 能可靠执行。

### 如何落地

在一个真实使用的内部产品中，团队强制要求零行人工手写代码。Codex 生成产品代码、测试、CI、文档、观测配置、内部工具、评审意见和仓库维护脚本。关键基础设施包括：

- 简短的 `AGENTS.md` 只充当地图，详细知识放在结构化、版本化的仓库文档中；
- 产品规格、架构、设计原则、执行计划、决策日志和技术债成为一等工件；
- 自定义 lint 和结构测试将架构边界、命名、日志、可靠性和“品味”机械化；
- 每个 worktree 有独立可运行应用、日志、指标和 trace；Agent 可以操作 UI、复现缺陷和验证修复；
- Agent 自审、Agent 互审、响应反馈、修 CI，并在只剩判断问题时升级给人；
- 后台“垃圾回收”Agent 持续扫描架构漂移、文档腐化和技术债。

这不是把 AI 接到一个节点，而是**把整个代码库重构成 Agent 可读、可执行、可验证的生产环境**。

### 如何闭环

闭环不是“生成 → 人审”，而是：

`任务/用户反馈 → Agent 复现 → 生成失败证据 → 修改 → 驱动应用验证 → Agent 互审 → CI/观测反馈 → 修复 → 必要时人判定 → 合并 → 经验编码为文档、lint、skill 或测试`

人的一次判断会被固化到 Harness 中，成为未来每个 Agent 的默认能力，形成复利。

### 流程控制面的进一步变化

OpenAI 随后发布 Symphony：不再以聊天 session 或 PR 为中心，而让 Linear 任务成为状态机和控制面。每个开放任务对应一个隔离工作区和持续运行 Agent；Agent 可拆任务、形成依赖 DAG、创建后续任务，并自动恢复中断工作。部分团队的 landed PR 增长了 500%。[OpenAI：Symphony](https://openai.com/index/open-source-codex-orchestration-symphony/)

这个变化非常关键：**研发调度的对象从“人”变成“任务 + Agent + 环境”，人的注意力不再承担 Agent session 的微观调度。**

### 角色重塑

- 工程师：从作者变成系统使能者、环境设计者和验收责任人；
- 架构师/资深工程师：把架构和判断转化为 lint、测试、规则和可检索知识；
- Reviewer：大量评审转向 Agent-to-Agent，人处理高语境、高风险和审美判断；
- 平台工程：从给人提供 CI/CD，扩展为给 Agent 提供可恢复运行时、工具、上下文和观测。

### 边界

这是 greenfield、小团队、高投入实验，不能直接外推到所有大型遗留系统。OpenAI 自己也承认，长期架构一致性、人类判断的最佳介入点仍未得到多年验证。

---

## 3.2 Anthropic：从结对工具到长时自治 Harness

**证据等级：A/B；技术方法成熟，组织自治程度更审慎。**

### 如何定义

Anthropic 的公开材料没有强制一种统一工作流，而是把 Claude Code 定义为低层、可组合、可脚本化的 Agent 工具。其核心思想是：模型能力只是上限，**任务分解、上下文管理、工具设计、验证器和安全边界共同决定真实表现**。

### 如何落地

内部团队把 Claude Code 用在数据基础设施、产品研发、安全、推理、API、设计、增长、法务等场景。具体模式包括：

- 用仓库内 `CLAUDE.md` 记录工作方式和上下文；
- 探索、计划、编码、提交分阶段执行；
- 测试先行，让 Claude 自动执行 build、test、lint 并自我纠错；
- 多实例并行处理独立任务；
- 对敏感数据通过受控 MCP 工具而非通用 CLI 暴露能力；
- 任务结束时总结工作并反向改进文档。

在长任务研究中，Anthropic 逐步形成三类 Harness 模式：

1. 初始化 Agent 建立任务清单、运行脚本和进度工件；执行 Agent 每次只完成一个可验证功能；
2. planner、generator、evaluator 三 Agent 结构，将规划、实现和评价分离；
3. 并行 Agent 团队通过隔离容器、共享 Git、测试 oracle 和专业角色完成大规模工程任务。

相关实验包括 16 个并行 Claude、近 2,000 次 session 构建约十万行 C 编译器。这更像前沿能力压力测试，而不是通用企业实践，但它揭示了未来软件工厂的关键规律：**并行的前提不是多开 Agent，而是问题可拆分、状态可隔离、进度可合并、正确性有 oracle。**[Anthropic：并行 Agent 构建 C 编译器](https://www.anthropic.com/engineering/building-c-compiler)

### 如何闭环

Anthropic 的典型闭环是：

`规格 → 任务分解 → 实现 → evaluator/测试验证 → 失败回流 → 重试或换 Agent → 结构化 handoff → 下一上下文继续`

其 Managed Agents 平台进一步把 session 日志、Harness 和 sandbox 解耦，使运行时或沙箱失败后可以恢复，并把凭据保存在沙箱之外。[Anthropic：Managed Agents](https://www.anthropic.com/engineering/managed-agents)

### 角色重塑与实证

Anthropic 对约 40 万次 Claude Code session 的研究发现：人平均做约 70% 的规划决策，而 Claude 做约 80% 的执行决策；成功与用户的领域能力更相关，而不只与编码能力相关。[Anthropic：Agentic coding 与专业能力](https://www.anthropic.com/research/claude-code-expertise)

对 132 名内部工程师和研究人员的调查显示，员工自报在约 60% 的工作中使用 Claude、生产力提高约 50%，但大多数人认为可以“完全委托”的任务仍只有 0–20%；同时出现技术能力退化、同事协作减少、监督能力下降等担忧。

因此 Anthropic 给出的角色结论比“程序员消失”更准确：

- 人控制“做什么、为什么、什么算完成”；
- Agent 控制大量“具体怎么做”；
- 领域知识和判断力升值；
- 纯编码壁垒下降，但有效监督仍依赖技术理解；
- 学习、导师制和初级人才成长路径成为新问题。

---

## 3.3 Microsoft：以 Living Spec 重写大型企业 SDLC

**证据等级：A/B；大型企业中最清晰的规格驱动转型样本。**

### 如何定义

Microsoft Digital 的关键发现是：给每个开发者配置 AI 后，个人速度上升，但团队速度没有同步上升，因为传统 SDLC 建立在人类之间的阶段性交接上，意图在每次交接中损耗。

其答案是 Spec-Driven Development（SDD）：

> 把持续演化、可版本化、包含业务目标与验收条件的规格，作为整个生命周期的核心事实源。

这和传统“需求文档更详细”不同。传统规格在编码开始后逐渐失效；AI Native 规格同时驱动计划、任务、代码、测试、文档和验证，并与实现持续同步。

### 如何落地

团队先共同定义 constitution：架构原则、治理要求、安全标准和开发约束。随后使用 GitHub Spec Kit 形成六阶段流程：

1. 定义业务问题和期望结果；
2. 澄清歧义和未知问题；
3. 生成技术实施计划；
4. 拆分成可追踪任务；
5. 验证需求与计划一致性；
6. 生成、测试和验证实现。

核心不是六个新节点，而是**所有角色与 Agent 共同围绕同一个持续工件协作，减少文档到人、人到人、人到代码的翻译链**。

在更广泛的 Microsoft Engineering 实践中，超过 90% 开发者使用 GitHub Copilot，AI code review 覆盖约 90% PR；安全修复、跨仓迁移和 SRE 处置正在转化为专门 Agent 工作流。[Microsoft：Agentic 软件生命周期](https://developer.microsoft.com/blog/learn-from-microsoft-transform-software-development-through-an-agentic-platform/)

### 如何闭环

Microsoft 的闭环是双向的：

`业务意图 → living spec → 计划/任务 → 代码与测试 → 验证结果`

以及：

`实现偏差/用户反馈/生产问题 → 更新 spec 或 constitution → 重新生成任务与验证 → 规则持续复用`

它解决的是“意图可追踪性”，而不是只解决代码生成。

### 角色重塑

- PM：从需求发起和排期者，升级为规格 steward，持续维护成功标准和业务意图；
- 开发者：先澄清问题和验收标准，再评估计划、验证生成结果，而非立即进入编码；
- 架构师：维护 constitution，把架构、安全、治理和设计原则前置并机器化；
- Leader：不以个人活动量衡量成功，负责建立规范化采用环境；
- 测试/安全：从末端把关者前移为验收规则和自动化反馈的设计者。

Microsoft 同时用 EngThrive 将生产力定义为 Speed、Ease、Quality 和 Thriving，明确反对用代码量、PR 数或个人 AI 使用量替代业务结果。[Microsoft：EngThrive](https://commandline.microsoft.com/engineering-thrive-engthrive-productivity-measurement-framework-agentic-ai-era/)

---

## 3.4 Cursor：从 AI IDE 到“建造软件工厂的工具”

**证据等级：A；Agent 产品公司自身的前沿用法。**

### 如何定义

Cursor 把软件研发分为三个时代：逐字符编写、同步 Agent 对话、异步长时 Agent 工厂。第三阶段的目标不再是帮助开发者写软件，而是帮助开发者**建造能够生产软件的工厂**。[Cursor：The Third Era](https://cursor.com/blog/third-era)

### 如何落地

- 内部约 35% 合并 PR 已由在云端 VM 中自主运行的 Agent 创建；
- 高阶使用者让 Agent 写接近全部代码，自己拆问题、审工件并同时调度多个 Agent；
- 自动化 Agent 由 GitHub、Linear、Slack、PagerDuty 或定时事件触发；
- Agent 在云端沙箱中运行，通过 MCP、memory、测试和观测工具验证工作；
- 安全审查、性能回归、测试覆盖和文档维护转为持续后台工作。

Cursor Projects 更进一步：项目具有跨月上下文，由 coordinator 研究系统、拆解任务、调度大量子 Agent；上线后同一个 Project 可继续监控日志和处理缺陷，使“构建”和“运营”共享原始决策上下文。[Cursor：Projects](https://cursor.com/blog/projects)

### 如何闭环

`目标 → coordinator 调研并积累共享上下文 → 规划和并行实现 → Agent 验证 → 人反馈 → 上线 → 订阅日志/PR/Slack 信号 → 自动修复或新任务 → 项目记忆更新`

这是目前公开材料中最接近“项目生命周期常驻 Agent”的产品形态。

### 角色重塑

开发者从单个 Agent 的 prompt operator 继续上移为多 Agent 生产系统的导演；新的稀缺资源是问题分解、评价标准和人的注意力分配。

### 边界

Cursor 的内部数据来自工具制造者和高熟练团队，不能直接外推到普通企业；“PR 占比”也不能等同于客户价值。

---

## 3.5 Coinbase：角色、设计、实现、测试和招聘同时变化

**证据等级：A；现有大型业务组织中重塑范围最广的样本。**

### 如何定义

Coinbase 使用 agent-first engineering model。其关键表述是：当代码变便宜，瓶颈从写代码变成可同时调度多少工作，以及能否正确界定、审查和承担结果。

### 如何落地

#### 多 Agent 实现

内部 Mux 给每个 Agent 独立 worktree、branch 和 terminal。一个工程师常同时运行 3–4 个 Agent，分别实现 API、写集成测试、修 bug 和重构。2026 年 4 月的公开数据包括 600+ 用户、5,068 个已合并 PR；重度用户合并 PR 数是基线的 3.5 倍，但 Coinbase 明确承认存在高绩效者自选择偏差。

#### 设计到生产代码

Figma-to-code 流程不是直接让通用模型看图，而是提供：

- 一套真实的高质量参考实现；
- 明确到步骤、权限、审计、数据访问和验证门的规则；
- 可复用 prompt 模板；
- lint、类型检查、查询编译、测试和覆盖率门禁。

当单次生成造成 85 文件大 PR、人工无法有效审查时，Coinbase 没有要求 Reviewer 更努力，而是把工作重构为“计划审批 → scaffold PR → 每组件一个并行 worker 和小 PR”。这正是范式重构：**根据 Agent 吞吐重新设计评审和 Git 工作单元。**[Coinbase：Figma-to-code](https://www.coinbase.com/blog/automating-figma-to-code-at-coinbase)

#### 设计系统变成 Agent 基础设施

Coinbase Design System 通过 skills、MCP 和 Figma Code Connect 同时服务设计师、工程师和 Agent。设计师可在预装上下文的浏览器 Playground 中直接生成符合生产组件规范的高保真原型，使原型不再是一次性图片，而成为生产工作的可延续起点。[Coinbase：AI Native 设计系统](https://www.coinbase.com/blog/how-coinbase-design-systems-are-powering-the-ai-prototyping-era)

#### 测试角色改变

QA Agent 直接以自然语言操作真实界面和判断功能结果，不以“先生成测试脚本”为必要中间层。Coinbase 使用人工对照、接受率、缺陷数量、扩展速度和成本评估 Agent，并用第二个 LLM 判断缺陷置信度。公开测试中准确率为 75%（人工 80%），同时间发现缺陷数为人工的 3 倍，已开始淘汰可完全替代的手工测试。[Coinbase：QA Agent](https://www.coinbase.com/blog/how-we-are-improving-product-quality-at-coinbase-with-ai-agents)

### 如何闭环

Coinbase 的关键不是一个统一大 Agent，而是多个闭环组成的内部技能平台：

- 设计规则与组件库 → 生成 → 自动门禁 → 小 PR 人审；
- 自然语言测试 → 浏览器执行 → 缺陷证据 → LLM judge → Jira/Slack → 修复；
- 使用、质量、交付和事故指标 → DevX 投资 → 新 MCP、skill 和内部工具。

### 角色重塑

- 工程师：实现者 → Agent fleet orchestrator；稀缺能力变为 scope、system thinking、review 和判断；
- 设计师：像素交付者 → 可运行体验构建者，直接进入代码化原型；
- 设计系统团队：组件库维护者 → 面向人和 Agent 的组织品味编码者；
- QA：重复执行者 → 场景、oracle、评估集和异常分析设计者；
- DevX：工具支持团队 → Agent substrate 和组织知识产品团队；
- 招聘：Coinbase 已公开表示其工程面试开始评价候选人如何指挥 AI、审查输出以及在模型失效处运用判断，而不是只考察无工具编码。

---

## 3.6 Dropbox：从工具普及到企业级 Agent 平台

**证据等级：A；大型 monorepo 和遗留工程环境中的代表。**

### 如何定义

Dropbox 公开承认：编码吞吐提升只会把瓶颈推向评审、CI、验证、发布协调和生产运维。AI Native 不是引入单一工具，而是让整个价值流能吸收更高吞吐，并保持质量和信任。

### 如何落地

Nova 是统一的内部云 Agent 平台，而不是多个一次性 bot：

- 每个 session 在指定 commit 的隔离环境运行；
- 使用 Dropbox 自有 monorepo、Bazel、远程执行和验证路径；
- 同一接口支持多模型、Web 交互、CLI、API 和后台工作流；
- 可读取日志、失败记录和观测系统；
- 提供 prompt eval、可观测和反馈收集；
- Agent 仅操作单 branch，发布权留在外部确定性流程中。

最成熟的 Deflaker 工作流为：检测 flaky test → 提供成功/失败日志 → Agent 根因分析和修复 → CI 重复运行 100 次以上 → 若失败则把新日志和前次笔记传入下一轮 → 成功落地或达到五次上限。

这是真正的机器闭环，因为“是否修好”由环境证据决定，而不是模型自述决定。

### 角色与度量重塑

Nova 已约占 Dropbox 十二分之一的 PR，但 Dropbox 明确认为更重要的是 operating model 改变。其度量分为：

`Fuel（工具是否被使用） → Adoption（工作流是否改变） → Output（是否进入生产） → Impact（是否缩短想法到客户价值）`

同时观察 review turnaround、首次测试通过率、缺陷率和返工率。这避免把 AI 使用率或 PR 数变成绩效指标。[Dropbox：重新定义工程生产力](https://dropbox.tech/culture/beyond-code-generation-rethinking-engineering-productivity-in-the-age-of-ai-agents)

---

## 3.7 Siemens：知识图谱驱动的遗留系统 Agent 流水线

**证据等级：B；复杂工业遗留系统的代表。**

### 如何定义与落地

面对数亿行、跨十多年、工业安全要求高的代码库，Siemens 与 Google Cloud 构建 Knowledge Fabric。它不是直接做 RAG 问答，而是把代码结构、调用关系和文档形成图谱，通过专门 Agent 串联：

1. Search Agent 探索代码图和文档；
2. User Story Agent 访谈 PO，生成带验收条件的故事；
3. Architecture Impact Agent 在写代码前评估依赖和副作用；
4. Task Breakdown Agent 将大任务切成携带上下文的小任务；
5. Coding Agent 实现具体改动；
6. 人在每个高风险阶段保留审查。

该案例的核心不是自动编码，而是**先把遗留系统从“只有资深工程师脑中可理解”转化为 Agent 可推理的世界模型，再自动化需求到实现的知识流**。[Google Cloud/Siemens：Knowledge Fabric](https://cloud.google.com/blog/products/ai-machine-learning/how-siemens-sliced-the-elephant-modernizing-legacy-code-with-agentic-workflows)

### 边界

公开材料只给出试点效果，没有提供完整产能、缺陷率和长期运维数据；属于高价值、窄场景的流程重构，而非全组织完成态。

---

## 3.8 Block：从研发流程继续上推到组织操作系统

**证据等级：D；重要的方向性样本，不应当作成熟落地。**

Block 认为多数公司只是给每个人一个 Copilot，使原有层级稍微高效；它试图用公司 world model 取代层级组织的信息汇总和路由功能：决策、讨论、代码、设计、计划、问题和进展均成为机器可读工件，AI 持续维护组织状态。

其设想把产品公司拆成 capabilities、公司/客户 world model、intelligence layer 和 interfaces。客户现实而非静态 roadmap 生成 backlog。人员角色收敛为：

- IC：建设和运营底层能力；
- DRI：临时拥有跨域问题和客户结果；
- Player-coach：同时做专业工作与培养人，替代以信息中转为主的传统经理。

Block 明确承认仍处转型早期。因此本案例的价值是揭示 AI Native 的最激进终局：**当 Agent 能执行，研发流程图最终可能与组织图融合成 execution graph。**[Block：From Hierarchy to Intelligence](https://block.xyz/inside/from-hierarchy-to-intelligence)

---

## 3.9 中国企业公开信号：方向一致，证据透明度仍不足

国内公开材料大量集中在工具覆盖率、代码生成率和单点提效，能同时说明端到端流程、运行架构、角色权责、质量结果和失败边界的一手材料较少，因此暂不宜与 OpenAI、Microsoft、Coinbase、Dropbox 的公开案例做同等级结论。

较有价值的一线组织观察来自阿里技术作者许晓斌：其内部先锋访谈显示，深度使用者写代码时间从约 30% 降到 5%，与 Agent 对话从 5% 升至 60%，纯编码效率提升约 10 倍但端到端交付只提升 2–3 倍；小团队从前后端职能划分转向 3–5 人垂直结果团队，沟通从需求评审转向成果评审。这是有价值的方向信号，但样本只有四名深度使用者，不能视为公司级成熟度证明。[许晓斌：AI Native 时代研发组织](https://juven.github.io/2026/05/08/ai-native-organization/)

对内部方案而言，建议把国内企业案例作为组织语境和落地约束补充，而把可复验的系统机制作为主要基准。

---

## 四、横向比较：谁在节点提效，谁在重构系统

| 企业 | 核心工件 | Agent 工作单元 | 控制面 | 自动反馈闭环 | 人的主要位置 | 成熟度判断 |
|---|---|---|---|---|---|---|
| OpenAI | Repo 内规格、计划、知识和规则 | 完整任务/特性/迁移 | Issue tracker + Symphony | 测试、UI、日志、指标、互审、垃圾回收 | 定目标、设计环境、验收 | 端到端重构先锋 |
| Anthropic | 规格、任务清单、进度与 handoff | 长时任务/专业子任务 | Harness/session/sandbox | generator-evaluator、测试 oracle、恢复 | 规划、监督、高风险判断 | 技术前沿，分级自治 |
| Microsoft | Living spec + constitution | 可追踪 spec/task | Spec Kit + 工程平台 | 需求到测试可追踪，SRE/安全 Agent | 意图 owner、规则 owner、验收 | 大企业流程重构 |
| Cursor | 持久 Project context | 项目/任务/持续订阅事件 | Project coordinator | 测试、评审、生产日志和记忆 | 定方向、拆解、审结果 | 软件工厂先锋 |
| Coinbase | 参考实现、规则、skill、设计系统 | 小 PR/测试场景/并行任务 | Mux + 内部平台 | 自动门禁、QA Agent、LLM judge | 架构、判断、风险与产品体验 | 多环节深度重构 |
| Dropbox | 企业 Agent 平台配置与验证命令 | CI 修复/迁移/维护工作流 | Nova API/UI/自动触发 | CI 多轮验证、日志回流、次数上限 | 发布与最终判断 | 平台化过渡至重构 |
| Siemens | 代码知识图谱、用户故事和影响分析 | 遗留现代化任务 | 专业 Agent 流水线 | 图谱验证、阶段性人工门 | 领域与工业安全判断 | 窄域端到端重构 |
| Block | 公司/客户 world model | 客户问题和能力缺口 | 设想中的 execution graph | 客户信号自动生成路线图 | 现实边缘、伦理、创新 | 组织级愿景，早期 |

### 判断“是否 AI Native”的六个试金石

一个方案如果主要回答“每个传统节点用哪个 AI 工具”，它仍是 AI-assisted SDLC。至少满足以下四项，才可以称为 AI Native：

1. **执行主体改变：** Agent 能接收任务并持续行动，而非人逐步复制粘贴；
2. **核心工件改变：** 意图、规格、验收和决策记录机器可读、版本化且持续有效；
3. **流程控制面改变：** 任务系统或项目状态直接驱动 Agent，而非只给人派单；
4. **反馈闭环改变：** 测试、界面、日志、指标和用户反馈能自动回到 Agent；
5. **权责结构改变：** 人按风险处理判断和例外，而非审批每个步骤；
6. **度量目标改变：** 从 AI 使用率/代码量转向意图到客户价值的周期、质量、返工和认知负担。

---

## 五、正在形成的 AI Native 端到端研发闭环

### 阶段 1：机会发现不再直接进入 roadmap

传统模式：PM 汇总访谈、工单和数据，形成季度 roadmap。  
AI Native 模式：Agent 持续读取客户反馈、运营指标、销售/支持记录和生产信号，形成证据化机会；人决定战略和优先级。

关键变化：roadmap 从静态承诺转为由持续信号驱动的假设队列。

### 阶段 2：规格成为可执行契约

人和 Agent 共同澄清目标、非目标、业务规则、边界、风险与验收标准；Agent 结合代码和生产上下文做可行性、依赖和影响分析。

关键变化：需求不是交给研发的输入文档，而是全生命周期持续维护的控制工件。

### 阶段 3：任务从人员分工转为执行图

Agent 将规格拆为有依赖关系的任务 DAG，自动分配隔离环境并并行执行。人负责批准高风险方案和调整优先级。

关键变化：项目经理不再逐人跟进状态，调度系统直接管理 Agent work。

### 阶段 4：实现、测试和评审融合为生成—评价循环

实现 Agent 与测试/安全/设计/架构 evaluator 并行协作；代码只是循环中的一个中间工件。失败信息自动触发下一轮修改。

关键变化：测试不是编码后的阶段，评审也不是唯一质量入口；它们是 Agent 思考过程中的在线 oracle。

### 阶段 5：发布采用风险分级自治

低风险、可逆、验证充分的变更可自动合并或发布；中风险由人审工件和证据；高风险必须由领域 owner 决策。凭据与沙箱隔离，权限最小化，执行全程可审计。

关键变化：Human-in-the-loop 从每一步审批，变成 Human-on/above-the-loop 的政策制定、抽查和异常介入。

### 阶段 6：生产成为下一轮开发的输入

上线后，Project/Agent 继续订阅日志、trace、SLO、用户反馈和缺陷；复现并提出修复。每次人工纠正被转化为测试、规则、skill、文档或设计系统更新。

关键变化：项目结束不等于上下文销毁；构建与运营共享持久记忆。

完整闭环可以概括为：

`客户/生产信号 → 机会假设 → 可执行规格 → 任务图 → Agent 并行执行 → 自动证据 → 风险分级验收 → 发布 → 生产验证 → 知识与规则更新`

真正的“闭环”要求最后一步能够改善下一轮执行。如果经验只停留在某个人的 prompt 技巧里，就还没有形成组织能力。

---

## 六、角色不是简单减少，而是权责和专业价值重新分配

| 传统角色 | 正在弱化的工作 | AI Native 中升值的工作 | 可能的新定位 |
|---|---|---|---|
| 产品经理 | 文档搬运、拆票、跨团队追状态 | 机会判断、规格所有权、成功标准、实验设计 | Intent/Spec Owner |
| 研发工程师 | 样板代码、逐文件实现、手工迁移 | 问题分解、系统设计、Agent 编排、验证与责任 | Agent Orchestrator / Outcome Engineer |
| 架构师 | 只写原则文档、末端评审 | 把架构、安全和品味变成可执行约束与参考实现 | Harness Architect / Constitution Owner |
| 测试/QA | 重复脚本编写和人工回归 | 测试 oracle、场景模型、评估集、对抗测试、异常裁决 | Eval/Quality Engineer |
| 设计师 | 静态稿交接、像素标注 | 可运行原型、体验标准、设计意图和 Agent 可消费设计系统 | Experience Director / Design-System Author |
| DevOps/SRE | 重复排障、命令搬运 | Agent 可观测性、恢复策略、权限边界、生产验证 | Agent Runtime/SRE |
| 安全与合规 | PR 末端排队审批 | policy-as-code、能力授权、审计、风险分级、红队 | Agent Governance Engineer |
| 工程经理 | 任务分派、状态汇总、信息中转 | 目标与资源选择、人才培养、冲突与伦理判断、系统吞吐优化 | Player-coach / Flow Owner |
| 初级工程师 | 从简单编码任务积累经验 | 学习评审、验证、领域建模和受控 Agent 使用 | 尚未解决的培养路径 |

### 不应误判的三件事

1. **工程师并没有只变成“Prompt Engineer”。** Prompt 是临时接口，长期价值在领域判断、系统设计和把经验编码成可复用 Harness。
2. **QA 不应被简单取消。** 重复执行可能被替代，但“什么叫正确”比以前更重要，QA 的工作会向 oracle 和评估工程迁移。
3. **管理不会自然消失。** 信息中转型管理会收缩，但目标冲突、人才成长、伦理责任、跨组织资源和创新保护仍是人类工作。

---

## 七、技术与组织底座：前沿公司实际在建设什么

### 1. Intent/Spec Layer

- living spec、acceptance criteria、non-goals；
- 架构 constitution、设计原则、风险策略；
- 计划、决策、技术债和进度的版本化记录。

### 2. Context/Knowledge Layer

- Repo 作为一部分 system of record；
- 代码图谱、文档、设计系统、生产信息和组织数据；
- 渐进式检索而非把所有规则塞入一个超长 instruction；
- freshness、ownership、cross-link 的自动检查。

### 3. Agent Runtime/Orchestration Layer

- 独立 session、worktree/branch、sandbox；
- task DAG、并发限制、重试、恢复、handoff；
- 模型可替换、Harness 可演进、状态持久化；
- skills、MCP、CLI 和企业内部 API。

### 4. Verification Layer

- 单元/集成/E2E 测试、lint、类型和结构约束；
- UI 操作、截图、视频和视觉评价；
- 日志、指标、trace、SLO；
- evaluator Agent、LLM judge 与确定性 oracle 组合；
- 评估集、回归测试和通过证据。

### 5. Governance Layer

- 最小权限、凭据与沙箱分离；
- repo sensitivity 和数据分级；
- 可逆性、金额、影响面决定审批级别；
- 完整执行日志、身份、模型和工件 lineage；
- 明确的停止条件、预算、升级和事故响应。

### 6. Learning Layer

- 人工反馈不只修本次结果，还转化为规则、测试、skill 或参考实现；
- 生产失败产生新的 eval；
- 后台 Agent 清理文档腐化、架构漂移和技术债；
- 衡量不同模型/Harness/提示版本的真实成功率。

---

## 八、成熟度模型：从工具提效到自演进研发系统

### L0：传统研发

AI 未进入正式研发环境，或只用于公共知识问答。

### L1：个人增强

IDE 补全、聊天、生成测试和文档。传统流程、工件和权责不变。典型指标是使用率和采纳率。

### L2：节点 Agent 化

在编码、评审、测试、运维等节点出现能调用工具的 Agent，但每个节点仍独立，交接仍由人完成。

### L3：工作流 Agent 化

Agent 能完成“任务 → 修改 → 测试 → PR”或“告警 → 排查 → 修复建议”的闭环；有隔离环境、工具和评价，但跨生命周期上下文仍有限。

### L4：AI Native SDLC

规格成为核心工件，任务系统驱动 Agent；规划、实现、评价和运维共享上下文；人的参与按风险分级；度量端到端价值流。Microsoft Digital、Coinbase 部分团队、Dropbox 部分工作流正在此层。

### L5：自演进软件工厂

生产与客户信号自动形成改进任务；多个 Agent 持续运行；经验自动进入 Harness；大量低风险工作无人干预完成。OpenAI 的特定 greenfield 团队和 Cursor Projects 接近该层，但长期可持续性仍待验证。

### L6：组织即智能系统

Execution graph 取代大部分层级信息路由，客户信号动态生成工作，组织角色与软件 Agent 统一调度。Block 描述了这一方向，但目前仍属愿景。

成熟度不应按公司整体打分，而应按“价值流/任务类型”分别打分。一个企业可以在依赖升级上处于 L5，在核心交易架构上仍保持 L2，这是合理的风险选择。

---

## 九、风险、反证与尚未解决的问题

### 1. 局部速度可能损害系统速度

DORA 2025 的核心结论是 AI 更像放大器：它会同时放大强系统和弱系统。早期研究中，AI 采用增加与交付吞吐和稳定性下降相关，原因之一是更大的变更批次压垮评审和交付系统。[DORA 2025](https://dora.dev/research/2025/dora-report/)

这和 Dropbox、Microsoft 的实际教训一致：如果只加速编码，系统总吞吐未必上升。

### 2. 供应商案例有选择偏差

Cursor、OpenAI、Anthropic 的客户与内部案例天然偏向前沿模型、高熟练用户和 AI 友好任务；PR、token 和代码行也容易被任务拆分方式影响。报告中的倍数不能直接作为转型 ROI 承诺。

### 3. 生产力测量仍不稳定

METR 对 2025 年初、熟悉大型开源仓库的资深开发者随机试验发现，使用当时 AI 工具反而慢 19%；其 2025 年末后续数据出现约 4–20% 的正向趋势，但选择偏差和并行 Agent 使传统工时实验难以解释。[METR：后续实验说明](https://metr.org/blog/2026-02-24-uplift-update/)

这提醒我们：不要问“同一个旧任务快了多少”，还要问 AI 是否让团队完成了过去不会做的新任务，以及最终价值是否增加。

### 4. 自动评审可能形成相关性失误

生成和评价若使用相似模型、相似上下文，可能共同忽略同一类问题。高风险系统需要异构验证：确定性测试、不同模型、形式约束、生产 canary 与人类领域专家组合。

### 5. 经验可能断层

如果初级工程师不再通过实现、调试和失败积累内在模型，未来谁来进行高质量监督仍无答案。Anthropic 内部员工也担心技术能力和协作下降。

### 6. Agent 产生的熵需要持续回收

高吞吐会快速复制仓库中的坏模式。没有架构约束、doc gardening、技术债扫描和持续重构，AI Native 可能比传统研发更快形成“可运行但不可演进”的系统。

### 7. 安全边界从代码扩展到上下文和工具

Agent 可读取仓库指令、运行 shell、访问内部系统，prompt injection、凭据泄漏和供应链文件都成为新的研发安全面。沙箱、能力代理、凭据隔离和完整审计必须是底层设计，而非上线前补丁。

---

## 十、对内部研发转型方案的建议性基线

在尚未看到现有方案前，本报告建议后续对照不要按“需求、设计、开发、测试各用了什么 AI”来评估，而应检查以下十个系统问题：

1. **North Star：** 目标是代码提效、交付周期、客户验证速度，还是新业务容量？
2. **核心工件：** 是否存在可版本化、可执行、包含验收的 living spec？
3. **事实源：** 业务规则、架构、设计、安全和运行知识在哪里，谁负责 freshness？
4. **Agent 工作单元：** 是代码片段、PR、任务、项目还是长期 value stream？
5. **控制面：** 谁创建任务、调度 Agent、处理依赖、重试和中止？
6. **可验证性：** 每类任务有什么确定性 oracle、评价集和生产证据？
7. **自治政策：** 如何根据风险、可逆性、数据敏感度和影响面动态放权？
8. **角色与激励：** PM、架构、研发、QA、设计和管理者的新责任是什么，绩效是否同步改变？
9. **组织学习：** 人工纠错如何沉淀为测试、规则、skill、reference implementation 或文档？
10. **价值度量：** 是否从 Fuel/Adoption/Output 一直追踪到 Impact，并同时观察质量和团队健康？

### 建议采用的目标 operating model

不建议直接复制某一家公司的完整方案，更合理的是组合：

- 用 **Microsoft SDD** 解决“意图不丢失”；
- 用 **OpenAI Harness Engineering** 解决“Agent 能可靠工作”；
- 用 **Dropbox Nova** 解决“大企业统一运行、验证和恢复”；
- 用 **Coinbase Skills/Reference/Evals** 解决“组织 know-how 产品化”；
- 用 **Anthropic 分层自治与 evaluator** 解决“长任务与风险控制”；
- 用 **Cursor/Symphony** 解决“任务系统成为持续 Agent 控制面”；
- 用 **EngThrive + Dropbox Impact 模型** 解决“避免虚假繁荣”；
- 把 **Block execution graph** 作为远期组织假设，而非近期实施蓝图。

组合后的最小闭环为：

`Living Spec → Task DAG → 隔离 Agent Runtime → 自动验证证据 → 风险分级人审 → 发布与生产观测 → 规则/知识/Eval 回流`

如果内部方案没有最后的“回流”机制，它是自动化流水线，不是可学习的 AI Native 研发系统；如果没有风险分级，它要么无法规模化，要么不可控；如果没有 living spec，它会高速地产生与业务意图错位的代码。

---

## 十一、下一阶段：与现有方案对照时的产出

收到现有方案后，建议形成四份结果：

1. **逐项映射表：** 当前方案对应本报告十个系统问题的覆盖、缺口和冲突；
2. **范式判定：** 哪些仍是传统节点提效，哪些已经改变控制面或权责；
3. **目标态设计：** 结合组织现实形成适合自身的 Agentic SDLC、角色模型和技术参考架构；
4. **分阶段路线：** 从 1–2 个高可验证价值流切入，逐步建设 Harness、自治和组织机制，而不是一次性全流程改造。

评审现有方案时应特别保护其中已经形成的组织语境和实践积累。行业案例应作为验证假设和补足机制的参照，而不是覆盖内部经验的标准答案。

---

## 十二、主要来源

### 企业一手材料

- [OpenAI — Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)
- [OpenAI — An open-source spec for Codex orchestration: Symphony](https://openai.com/index/open-source-codex-orchestration-symphony/)
- [OpenAI — Building an AI-native engineering team](https://cdn.openai.com/business-guides-and-resources/building-an-ai-native-engineering-team.pdf)
- [Anthropic — How Anthropic teams use Claude Code](https://www-cdn.anthropic.com/58284b19e702b49db9302d5b6f135ad8871e7658.pdf)
- [Anthropic — How AI is transforming work at Anthropic](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic)
- [Anthropic — Agentic coding and persistent returns to expertise](https://www.anthropic.com/research/claude-code-expertise)
- [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic — Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Anthropic — Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents)
- [Microsoft — Engineering the Frontier Firm: AI-native software development](https://www.microsoft.com/insidetrack/blog/engineering-the-frontier-firm-sharing-our-ai-native-approach-to-software-development/)
- [Microsoft — Transform software development through an agentic platform](https://developer.microsoft.com/blog/learn-from-microsoft-transform-software-development-through-an-agentic-platform/)
- [Microsoft — EngThrive](https://commandline.microsoft.com/engineering-thrive-engthrive-productivity-measurement-framework-agentic-ai-era/)
- [Cursor — The third era of AI software development](https://cursor.com/blog/third-era)
- [Cursor — Projects](https://cursor.com/blog/projects)
- [Cursor — Build agents that run automatically](https://cursor.com/blog/automations)
- [Coinbase — Coding Had a Concurrency Problem: How Mux Helped Solve It](https://www.coinbase.com/blog/coding-had-a-concurrency-problem-how-mux-helped-solve-it)
- [Coinbase — Automating Figma-to-Code](https://www.coinbase.com/blog/automating-figma-to-code-at-coinbase)
- [Coinbase — AI Native Design Systems](https://www.coinbase.com/blog/how-coinbase-design-systems-are-powering-the-ai-prototyping-era)
- [Coinbase — Improving Product Quality with AI Agents](https://www.coinbase.com/blog/how-we-are-improving-product-quality-at-coinbase-with-ai-agents)
- [Dropbox — Introducing Nova](https://dropbox.tech/machine-learning/introducing-nova-our-internal-platform-for-coding-agents)
- [Dropbox — Beyond code generation](https://dropbox.tech/culture/beyond-code-generation-rethinking-engineering-productivity-in-the-age-of-ai-agents)
- [Google Cloud / Siemens — Knowledge Fabric](https://cloud.google.com/blog/products/ai-machine-learning/how-siemens-sliced-the-elephant-modernizing-legacy-code-with-agentic-workflows)
- [Block — From Hierarchy to Intelligence](https://block.xyz/inside/from-hierarchy-to-intelligence)

### 独立研究与反证

- [DORA — State of AI-assisted Software Development 2025](https://dora.dev/research/2025/dora-report/)
- [METR — Early-2025 AI and experienced developer productivity](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- [METR — Late-2025 follow-up and experiment limitations](https://metr.org/blog/2026-02-24-uplift-update/)
- [METR — Task substitution and uplift](https://metr.org/blog/2026-05-08-task-substitution-and-uplift/)

