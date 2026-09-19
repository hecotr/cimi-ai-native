# CimiLoop 上下文与知识模型 v0.1

> 状态：讨论确认稿
> 日期：2026-09-19
> 范围：定义 Context Pack、知识来源与权威、Run/Change/Project Memory、冲突、过期与知识晋升语义；不定义向量数据库、CodeGraph、飞书、具体检索算法或存储实现。

## 1. 文档定位

本文回答三个问题：

1. Agent 在一次 Run 中究竟看到了哪些上下文；
2. 当多个来源对同一事实说法不一致时，谁是权威；
3. 一次执行中的观察如何经过验证，成为可复用的项目知识。

本文承接：

- `docs/architecture/CimiLoop整体能力架构-v0.1.md`；
- `docs/architecture/CimiChangeProtocol核心领域模型-v0.1.md`；
- `docs/architecture/CimiLoop角色与权限模型-v0.1.md`。

CimiLoop 管理上下文的选择、版本、来源和适用性，但不尝试把所有原始知识内容复制进自己的 Store。

## 2. 核心原则

1. **上下文必须可说明**：任何影响正式产出的信息，都能追溯到来源、版本或 Digest、选择理由与适用范围。
2. **Context Pack 是快照**：每个 Agent Run 绑定不可变的 Context Pack Manifest，不使用会被后台静默更新的“当前知识集合”。
3. **按角色最小供给**：Intent、Planner、Executor、Evaluator、Operator 等角色只获得完成其 Work Item 所需的最小上下文。
4. **权威按事实类型确定**：不存在对所有知识都有效的单一全局优先级；代码、状态、部署和 Policy 分别由不同系统负责。
5. **冲突必须显式**：权威来源冲突时，Agent 不得自行挑选更方便的答案。
6. **观察不自动成为知识**：Run Observation 只能先形成 Learning Candidate，经评价与责任 Owner 决定后才可晋升。
7. **派生内容不能覆盖事实**：LLM 摘要、索引、图谱和向量检索结果可以辅助发现，不能替代其来源。
8. **敏感信息不进入上下文内容**：凭据、令牌和秘密留在 Runtime 或外部系统的安全边界内。
9. **Evaluator 保持独立**：评价上下文包含 Contract、Artifact 和可验证 Evidence，不继承 Executor 的完整对话与私有推理轨迹。
10. **历史不可重写**：源知识变化后产生新快照和影响判断，不修改旧 Run 当时实际使用的上下文。

## 3. 三层 Memory 模型

Memory（记忆）不是一个无限增长的统一数据库，而是三个边界不同的层次。

| 层次 | 内容 | 生命周期与权威 |
|---|---|---|
| Run Memory（运行记忆） | 单次 Run 的消息、工具调用、临时文件引用、观察和原始日志 | 由 Runtime 保存原始记录；CimiLoop 保存 Run Record、摘要和 External Reference；不是 Project Knowledge |
| Change Memory（变更记忆） | Contract、Plan、Decision、Feedback、Artifact、Evidence、Failure、Event 与关键 Conversation Summary | 由 Change Protocol 对象共同构成，不另建可被自由改写的“Change Memory 文档” |
| Project Knowledge（项目知识） | 领域术语、架构规则、Policy、ADR、运行手册、已验证模式和参考实现 | 由各自权威载体版本化维护，通过知识来源描述和引用进入 Context Pack |

三层之间不是自动复制关系：

```text
Run Observation
→ Learning Candidate
→ 独立评价 / 确定性验证
→ 责任 Owner 决定
→ 新的 Project Knowledge Version
```

Change Memory 的事实可以作为学习依据，但“曾经发生”不等于“应该成为长期规则”。

## 4. 知识内容分类

每个被选入 Context Pack 的知识项都声明内容分类：

| 分类 | 中文解释 | 典型内容 | 是否可直接作为权威依据 |
|---|---|---|---|
| Canonical | 权威内容 | 当前 Contract、Plan、Policy、批准 ADR、Kernel Current State | 可以，但只在声明的事实类型、作用域和有效期内 |
| Derived | 派生内容 | LLM 摘要、CodeGraph 分析、索引、影响分析 | 不可以；必须能回到来源 |
| Reference | 参考内容 | 外部文章、历史方案、未采纳提案 | 不可以；只提供背景或候选方案 |
| Runtime Observation | 运行观察 | 测试结果、命令输出、部署状态、Agent 观察 | 是事实输入，但其真实性和适用性取决于来源与验证状态 |

内容分类与可信度、时效性相互独立。例如，Canonical 内容也可能已经失效；Runtime Observation 也可能来自高可信的确定性工具。

## 5. 来源权威矩阵

权威来源按“事实类型”确定，而不是按系统整体排名。

| 事实类型 | 第一权威来源 | CimiLoop 中的表达 |
|---|---|---|
| Change 当前状态、Gate、Decision、Assignment | CimiLoop Kernel Store / Event Ledger | 领域对象与不可变记录 |
| 当前 Contract、Plan 与业务版本关系 | CimiLoop Change Protocol | 精确 Domain Version 引用 |
| Project Policy 与有效例外 | CimiLoop Policy / Policy Exception | 精确 Policy Snapshot 与 Exception |
| Git 提交、分支和代码历史 | Git | External Reference、Commit ID、Digest |
| 当前隔离工作区内容 | Workspace / Runtime | Run、Workspace 引用与必要 Digest |
| 制品二进制内容 | Artifact Registry、Git 或构建系统 | Artifact 元数据、Digest 与 External Reference |
| CI、测试和扫描原始结果 | CI / Test Tool / Runtime | Evidence、来源和外部记录引用 |
| 部署动作与平台状态 | DevOps / Environment Provider | Deployment、Evidence 与 External Reference |
| 人类正式授权 | CimiLoop Decision | Actor、acting role、对象版本与 Decision |
| 原始对话与工具轨迹 | Agent Runtime | Run Record、Conversation Summary 与 External Reference |
| ADR、运行手册、领域文档 | 被 Project Policy 指定的仓库或知识系统 | 知识来源、版本/Digest 与适用范围 |

CimiLoop 保存“关联、摘要和治理事实”不代表它取代外部原始系统。例如，Deployment 在 CimiLoop 中有领域身份，但云平台仍是具体外部资源状态的原始权威。

## 6. Context Pack 模型

### 6.1 Context Pack Manifest

Context Pack Manifest 是一个不可变清单，描述一次 Agent Run 的初始上下文边界。它至少在语义上包含：

- 绑定的 Project、Change、Work Item 与 Agent Run；
- 角色、目标、允许动作和禁止动作；
- 精确 Contract Version、Plan Version 与 Policy Snapshot；
- 选入的知识项及其分类、来源、版本/Digest、适用范围与新鲜度；
- 依赖的 Artifact、Evidence 和 External Reference；
- 组装策略、组装者和组装时间；
- Manifest 自身的 Digest。

Manifest 是“目录和证据”，不是必须把所有内容内嵌在一个大文件中。内容可以来自 CimiLoop Store、Git、Runtime 或外部系统，但必须被精确固定或记录当时解析结果。

### 6.2 组装流程

```text
Work Item 声明 required context / capabilities
→ Context Builder 解析角色和 Policy
→ 从各权威来源选择最小必要内容
→ 校验权限、版本、新鲜度与冲突
→ 固定引用与 Digest
→ 生成不可变 Context Pack Manifest
→ Kernel 绑定 Agent Run 后才允许执行
```

Context Builder 可以使用检索、图谱或 LLM 帮助选择候选内容，但最终 Manifest 的来源、版本与权限校验必须是确定且可审计的。

### 6.3 运行中的动态获取

Context Pack 描述 Run 启动时获得的上下文，不禁止 Agent 在 Work Item 授权范围内调用工具查询新事实。动态结果按以下规则处理：

- 工具调用和返回值进入 Run Memory，并记录来源；
- 影响 Claim、Artifact 或 Decision 建议的结果必须被提升为 Evidence 或显式引用；
- 动态查询不能取得 Work Item 未授权的数据或凭据；
- 发现新的关键 Canonical 内容或原上下文已失效时，不静默替换 Manifest；Kernel 评估继续、标记 Stale 或终止并创建绑定新 Manifest 的 Run。

## 7. 按角色提供上下文

| 角色 | 默认包含 | 默认排除或限制 |
|---|---|---|
| Intent Analyst | 原始诉求、现有 Contract、领域术语、相关 Policy、历史相似 Change 摘要 | 实现细节噪声、无关 Run 日志、秘密 |
| Planner | 已批准 Contract、架构约束、代码结构、依赖、风险、可用能力与历史 Evidence | 无关对话、生产凭据 |
| Executor | 当前 Task/Work Item、相关代码、Plan 切片、验收标准、允许工具和依赖 Artifact | 其他 Task 的无关上下文、未授权环境信息 |
| Evaluator | Contract、Artifact、Claims、验证策略、确定性 Evidence、必要环境事实 | Executor 完整对话、私有推理、只表达信心而无来源的总结 |
| Operator / Deployment Actor | Release、Artifact Digest、Environment、操作步骤、窗口、停止和恢复条件 | 通用生产权限、无关 Change 内容、原始秘密值 |
| Reconciler | 目标外部操作、已知请求、幂等键、平台事实与核对规则 | 猜测性结论和未经授权的新动作 |
| Learning Curator | 失败、纠正、Decision、Exception、复盘与候选证据 | 未脱敏秘密、未经验证的临时推理 |

最小上下文是安全和质量边界，不只是 Token 优化。角色之间需要共享的正式事实通过 Contract、Plan、Artifact、Evidence、Decision 与 Event 传递，而不是复制完整对话。

## 8. 源变化与过期传播

Context Pack 一旦生成即不修改。其引用的来源变化时，Kernel 或知识 Adapter 产生影响信号，并根据相关性和关键性分类：

| 结论 | 含义 | 对进行中 Run 的处理 | 对产出的处理 |
|---|---|---|---|
| Valid | 变化与本 Work Item 无关 | 继续 | 正常使用 |
| Stale | 变化相关，但不立即构成安全或授权冲突 | 可以完成当前安全步骤，不再自动推进 Gate | 产出需基于新 Context 复核或重新评价 |
| Invalid | Contract、Policy、权限、关键依赖或安全前提已冲突 | Kernel 请求安全停止或取消 Run | 不得用于通过 Gate，必要时创建新 Work Item/Run |
| Superseded | 新快照或新产出正式取代旧版本 | 停止基于旧版本的新调度 | 历史保留，但后续引用使用新版本 |

影响传播遵循精确依赖关系，不因任意项目文件变化就把全部 Run 标记过期。

以下变化默认视为关键：

- 当前 Contract Version 或授权范围变化；
- 适用 Policy、Policy Exception 或 Assignment 失效；
- Work Item 依赖的 Artifact Digest、接口或安全边界变化；
- 生产 Environment、停止条件或恢复策略发生实质变化；
- 权威来源被撤销、无法核对或发现完整性问题。

## 9. 冲突处理

### 9.1 冲突不是简单排序

系统先判断两个说法是否在相同事实类型、作用域、版本和时间上真正冲突：

- Canonical 与 Reference 不一致：保留 Reference，但不能覆盖 Canonical；
- Derived 与来源不一致：派生内容失效并重建；
- Runtime Observation 反驳 Canonical 假设：保留观察，创建风险、Blocker 或 Decision Request，不自动改写 Canonical；
- 两个有效 Canonical 来源冲突：停止依赖该事实的推进，交由指定责任角色解决；
- 两个 Derived 结论不同：可以并存为候选观点，只有进入 Gate 或 Decision 输入时才要求消歧。

### 9.2 协议表达

V1 不新增一个万能 Conflict 聚合。冲突使用既有对象表达：

1. 用 Claim 明确冲突命题；
2. 用 Evidence 关联各来源和版本；
3. 用 Blocker 阻止受影响范围继续推进；
4. 需要人类裁决时创建 Decision Request；
5. 解决后产生 Decision、必要的 Amendment、Event 和新的 Context Pack。

这样既保留冲突事实，也避免把“冲突”变成另一个与 Gate、Blocker、Decision 重叠的状态系统。

## 10. Learning Candidate 与知识晋升

### 10.1 候选来源

Learning Candidate 可以来自：

- 重复失败或成功恢复模式；
- 人类纠正 Agent 的记录；
- 多次出现的 Policy Exception；
- 新的测试、反例或评价方法；
- Incident 复盘和残余风险；
- 已验证的工具、Skill 或 Adapter 使用模式。

### 10.2 晋升流程

```text
Observation / Feedback / Failure / Exception
→ Learning Candidate
→ 去重、脱敏与适用范围分析
→ 独立 Eval 或确定性验证
→ 对应 Owner 的结构化 Decision
→ 写入权威知识载体并产生新版本
→ 后续 Context Pack 才可作为 Canonical 或受控 Derived 内容使用
```

责任 Owner 按知识类型决定：

- 领域语义与意图：Intent Owner 或 Domain Owner；
- 架构、安全、合规和权限规则：Policy Owner；
- 技术实现与运行手册：Technical Owner；
- 评价集和专业红线：Domain Policy/Eval Owner；
- 跨 Change 组合经验：Flow / Portfolio Owner。

Agent 可以形成候选、归纳证据和提出建议，但不能自行完成晋升 Decision。

## 11. 权限、隐私与安全

- Context Builder 只能读取 Actor 与 Work Item 被授权访问的来源；
- Context Pack 不保存明文凭据、访问令牌、签名 URL 或私钥；
- Runtime 通过安全句柄或自身凭据边界执行外部动作，Agent 只获得必要能力；
- 导出、分享或进入模型上下文前执行来源允许的脱敏与数据边界规则；
- Evaluation 独立性不能成为越权读取 Executor 私有或敏感上下文的理由；
- 无权访问的内容不应通过 Derived 摘要、Embedding 或缓存侧漏；
- 权限撤销后，历史 Manifest 保留引用事实，但新的读取和 Run 必须按当前权限重新校验。

## 12. V1 边界

V1 必须实现：

- 不可变 Context Pack Manifest 及其 Run 绑定；
- Change、Contract/Plan Version、Policy Snapshot、Work Item 与角色的精确引用；
- Git/Repo 文档、代码、CimiLoop Store、Agent Runtime Run 和测试结果来源；
- 角色化最小上下文模板；
- 来源变化后的 Valid/Stale/Invalid/Superseded 判断；
- Learning Candidate、人工晋升 Decision 与审计链；
- 冲突到 Claim/Evidence/Blocker/Decision Request 的转换；
- External Reference 与不可访问状态处理。

V1 不承诺：

- 通用企业知识图谱；
- 向量数据库或复杂语义检索平台；
- 飞书、Confluence 等完整同步；
- CodeGraph 专用索引实现；
- 自动把 Run Memory 总结为长期知识；
- 跨组织知识共享与复杂数据治理后台。

这些能力以后通过 Knowledge Adapter、Index Adapter 或 Capability Resolver 接入，不改变本模型的权威与晋升语义。

## 13. Kernel 不变量

1. Agent Run 启动前必须绑定一个不可变 Context Pack Manifest。
2. Manifest 必须能解析到精确 Contract/Plan/Policy 与来源版本，不能只写“最新”。
3. Context Pack 的变化生成新对象，不修改旧 Manifest。
4. 动态获取的重要事实必须记录来源，并在影响正式结论时提升为 Evidence 或显式引用。
5. 权威冲突不得由 Agent 静默消解。
6. Stale 或 Invalid Context 产生的结果不得未经复核通过相关 Gate。
7. Executor 的完整对话和私有推理不进入 Evaluator 默认上下文。
8. Run Observation 不得直接写入 Canonical Project Knowledge。
9. Derived 与 Reference 内容不能覆盖 Canonical 内容或 Kernel State。
10. 凭据和秘密不得进入 Context Pack、Event、Artifact 元数据或可导出历史。

## 14. 阶段结论

本模型将 Context Pack 定义为“不可变、可追溯、按角色最小化的运行快照”，将 Change Memory 定义为既有协议事实的组合视图，并采用“Learning Candidate → Eval → Owner Decision → 新知识版本”的晋升链。它不新增万能 Conflict 或可自由改写的 Memory 聚合。

上述语义已经确认。后续可以独立演进检索、索引、图谱和知识 Adapter，但不得绕过本模型的来源权威、快照、冲突、过期和知识晋升规则。
