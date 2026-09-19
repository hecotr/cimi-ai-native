# CimiLoop 整体能力架构讨论计划

> 状态：整体能力架构已确认
> 创建日期：2026-09-18
> 类型：架构讨论路线图与决策账本
> 上位约束：`docs/plans/2026-09-17-cimiloop-ai-native研发操作模型-v0.1.md`

## 1. 目的

本文记录 CimiLoop Harness 的架构讨论顺序、确认结论、当前进度和暂缓议题。当前阶段先回答 CimiLoop 是什么、需要哪些能力、能力如何协作，以及哪些职责属于内核、Agent、Skill、Runtime 或外部系统。

在整体能力架构确认前，不进入具体 Schema、目录结构、技术栈和开源项目适配实现。

## 2. 讨论路线

1. 产品边界与架构原则；
2. 整体能力架构；
3. 核心领域模型与 Cimi Change Protocol；
4. Change 端到端运行流程；
5. 人与 Agent 的角色及协作模型；
6. 知识、执行、验证、交付、可视化等横切能力；
7. OpenSpec、Matt Skills、Superpowers、CodeGraph 等开源能力映射；
8. CimiLoop V1 范围与实现路线。

每轮只讨论一个主题：定义边界，对比方案，明确职责、输入、输出和事实权威，记录决策后再进入下一主题。

讨论严格区分：能力架构、协议设计、实现设计、开源融合。上层未确认前，不用具体工具或实现反向定义 CimiLoop 架构。

术语表达优先使用“中文（English）”形式。对用户可见的状态、动作和领域名词首次出现时必须同时给出中文解释与英文协议名，避免只使用英文缩写或枚举值。

## 3. 已确认基线

- 产品名称为 **CimiLoop**，CLI 名称为 `cimi-loop`；
- Claude Code、OpenCode 和企业内部 cimicode 都是 Agent Runtime；CimiLoop 是独立于具体 Runtime 的 AI Native 软件研发 Harness；
- CimiLoop 不是松散 Skills，也不是在传统研发节点上逐点提效；
- Change 是独立运行、交付、验证和追踪的基本单元；
- 同一项目中的多个 Change 可以并行处于不同阶段；
- Change 可来源于需求、Feature、Bugfix、Incident、技术改造等，进入流程后使用统一模型管理；
- 每阶段形成结构化产物，关键迁移由 Evidence 支撑并通过 Gate；
- V1 保留明确的人工审核和风险决策节点；
- 开发后先完成测试环境验证与修复闭环，再进入带独立 Checklist 和 Gate 的生产发布；
- V1 同时打通测试和生产环境部署，优先复用现有 DevOps 能力；
- V1 local-first，但协议与数据模型支持未来 Teams/Change Room；
- CimiLoop 需要 Workbench 展示项目、Change、阶段、Gate、产物、证据、Agent Run 和待决策事项；
- Cimi Change Protocol 是内部标准，外部框架通过 Adapter 接入，不能成为内核事实权威。

## 4. 阶段 A：产品边界与架构原则

状态：**已确认**。

### 4.1 一句话产品定义

> CimiLoop 是一套以 Change（变更）为运行单元、以 Change Contract（变更契约）为基线、以 Evidence（证据）驱动 Gate（关卡）的 AI Native 软件研发 Harness，用于编排人和 Agent 完成从意图澄清到生产闭环的完整研发过程。

“研发操作系统”可表达长期愿景，但不作为当前首要定义；“Control Plane”可描述部分内部能力，但不意味着必须建设中心化服务。

### 4.2 产品组成

CimiLoop 由四层组成：

```text
Operator Surface：CLI / Workbench / Future Change Room
        ↓
CimiLoop Kernel：状态机 / Gate / Policy / 调度 / 审计 / 恢复
        ↓
Cimi Change Protocol：Change / Contract / Artifact / Evidence
        ↓
Adapter & Capability：Runtime / Skill / SCM / DevOps / Knowledge
```

职责边界：

- **CimiLoop** 决定 Change 当前状态、下一步是否允许执行，以及需要哪些产物和证据；
- **Agent Runtime**（V1 首个实现从 Claude Code 或 OpenCode 中选择）运行 Agent、调用工具并执行具体任务；企业内部 cimicode 后续按相同契约接入；
- **Agent** 完成推理、澄清、规划、编码、分析和评估；
- **Skill** 提供可替换的专业方法和能力；
- **外部框架** 通过 Adapter 提供规格、执行或分析能力；
- **Git、DevOps、知识平台** 提供代码、环境、部署和知识资源；
- **人类** 定义意图、处理关键决策、批准风险并承担最终责任。

> CimiLoop 管“这次变更如何可信地走完”；Agent Runtime 管“Agent 如何把当前任务执行出来”。

### 4.3 十项架构不变量

1. **唯一状态权威**：Change 状态只能由 CimiLoop Kernel 按规则迁移；
2. **契约先于执行**：正式实现前必须有明确契约，范围变化形成 Contract Amendment；
3. **证据先于通过**：没有满足要求的 Evidence，不能通过 Gate；
4. **概率性执行、确定性治理**：Agent 可以概率性执行，状态迁移、权限、Gate 和审计必须确定；
5. **行为可追溯**：产物、决策和状态变化可追溯到 Actor、时间、输入、工具和运行记录；
6. **流程可恢复**：中断后可从持久化状态恢复，不依赖聊天上下文；
7. **执行与验证适度独立**：关键节点不能只依赖执行 Agent 的自我评价；
8. **环境逐级晋升**：测试环境验证通过是生产发布的前置条件；
9. **人工权力由 Policy 表达**：人工审批点不能只隐藏在 Prompt 中；
10. **外部能力不能反向控制内核**：外部工具可提交产物、建议和证据，但不能修改核心状态语义。

## 5. 阶段 B：整体能力架构

状态：**待讨论**。

候选一级能力域：

1. Interaction & Collaboration（交互与协作）；
2. Change Lifecycle Kernel（Change 生命周期内核）；
3. Intelligence & Context（智能与上下文）；
4. Engineering Execution & Delivery（工程执行与交付）；
5. Trust & Governance（信任与治理）；
6. Protocol, Data & Integration（协议、数据与集成基础）。

依次确认：

1. 六个能力域是否完整，是否存在职责重叠；
2. Trust & Governance 是否作为独立横切能力；
3. Intelligence & Context 与 Engineering Execution & Delivery 是否分离；
4. 各能力域的二级能力、输入、输出、事实权威和边界；
5. 核心控制流、数据流和事件流。

阶段 B 只产出一级/二级能力地图，不涉及模块和目录设计。

### 5.1 Interaction & Collaboration（交互与协作）

状态：**已确认**。

交互与协作能力负责让人和 Agent 围绕同一个 Change 看见信息、参与工作、作出决策并理解过程，不负责自行判断 Gate 或直接修改 Change 状态。

已确认以 **Change Room（变更协作空间）** 作为核心逻辑容器：

- 每个 Change 自动拥有唯一的 Change Room；
- 人、Agent、Decision、Artifact、Evidence、Agent Run 和流程事件均围绕 Change Room 组织；
- CLI、Workbench、Agent Runtime 和未来 Teams/飞书是进入同一个 Change Room 的不同入口；
- 项目级看板负责跨 Change 汇总，不取代 Change Room；
- Change Room 是领域和交互概念，不等于 V1 必须实现完整聊天、实时多人在线或消息系统；
- 所有操作以 Command、Decision、Feedback 等形式提交给 Kernel，由 Kernel 校验权限、Gate 和状态迁移。

CimiLoop 提供两种部署模式，但共享同一套 Protocol、Kernel、Change 模型和交互语义：

- **Embedded Solo Mode（个人嵌入模式）**：Kernel、SQLite 和 Workbench 运行在本机，适合个人先跑通完整闭环；包含状态、参与者、时间线、产物、证据、Agent Run 和人工决策，不实现聊天、实时多人协作、消息推送和 Teams/飞书同步；
- **Shared Team Mode（团队共享模式）**：Kernel 与项目 Store 以共享服务方式部署，多个成员和本地 Agent Runtime 连接同一项目空间，共享全部 Change、状态、Run、Evidence 和 Decision；代码、Worktree、凭据和原始执行仍保留在各自执行机器；
- Solo Mode 的 SQLite 是项目运行事实存储；Team Mode 的共享 Store 才是团队事实权威，本地 SQLite 仅作为缓存、Outbox 和离线恢复；
- 两种模式不是两套产品，后续可通过稳定 ID、Event、Artifact Reference 和 Store 接口将 Solo 项目迁移到 Team Mode。

发布顺序采用 Solo-first：

- V1 完整交付 Embedded Solo Mode，用于验证端到端研发闭环；
- Shared Team Mode 不阻塞 V1，在后续版本基于同一 Protocol 与 Kernel 实现；
- 从 V1 起使用可替换 Store、全局稳定 ID、事件协议和导入导出格式；
- Solo 项目后续能够迁移到 Team Mode，而不是创建一套新的 Change 历史。

Project Workbench 采用 Attention-first 的项目视图：

- 首先展示待决策、失败、阻塞、风险变化、证据不足等需要人类关注的事项；
- Decision Inbox 只包含正式决策请求，Attention Queue 包含更广泛的异常与行动；
- 项目级生命周期看板的基本卡片是 Change，不是 Task；
- 项目级使用 Draft、Intent、Planning、Executing、Test、Release、Closed 等简化生命周期列；
- N1–N5 是价值与责任模型，不直接作为看板列；
- Task DAG、精确状态和详细运行信息在 Change Room 内呈现。

所有交互入口通过统一 Query/Command 接口访问 CimiLoop：

- Query 读取 Change、Timeline、Run、Evidence、Decision Inbox 和 Attention Queue 等 Read Model；
- Command 表达 Actor 希望执行的动作，但是否接受由 Kernel 根据身份、Policy、Gate 和当前状态决定；
- CLI、Workbench、Agent Runtime 以及未来 Teams/飞书使用相同的 Command 语义；
- 任何入口都不能直接写 Store 或绕过 Gate 修改 Change 状态；
- Command 记录 Actor、Acting Role、来源和幂等信息，避免重试或重复点击造成重复副作用。

Notification 是由 Event 派生的通知投影：

- Event Ledger 和 Decision/Attention Read Model 是事实来源，通知发送失败不影响原始事项；
- 已送达、已读或确认看到均不等于正式 Decision；
- V1 实现 Workbench 内通知和可选桌面通知，普通成功事件只进入时间线；
- 外部 Teams、飞书、邮件等通知渠道后续通过 Adapter 接入；
- Notification Policy 决定是否通知、通知对象、优先级、渠道和重复提醒策略。

### 5.2 Change Lifecycle Kernel（Change 生命周期内核）

状态：**已确认**。

待依次确认：生命周期模型、状态迁移权威、Profile 与路径、Gate 求值、调度与恢复、并发控制、异常与补偿，以及 Kernel 与 Agent Runtime 的边界。

已确认采用“稳定生命周期骨架 + Change Profile 驱动路径”的混合模型：

- CimiLoop 定义稳定的生命周期状态语义、允许的状态图和不可绕过的架构不变量；
- Feature、Bugfix、Incident、Migration、Experiment 等 Profile 在受约束的状态图中选择路径、Gate、Evidence 和人工介入强度；
- Profile 可以增减活动、增加证据或人工 Gate，并在允许的终点结束；
- Profile 不能任意创造不兼容的状态语义、绕过生产授权或允许 Agent 自行宣布完成；
- CimiLoop 不使用所有 Change 完全相同的固定流水线，也不建设任意定义节点和连线的通用工作流平台。

Change 使用多维状态模型：

- `lifecycle_state` 表示 Change 在生命周期中的精确位置；
- `flow_condition` 表示 Active、AwaitingDecision、Paused、Blocked、Failed 等当前运行状况，不覆盖生命周期位置；
- `delivery_status` 表示 NotStarted、InProgress、TestVerified、ProductionVerified、DeliveryClosed 等交付结果；
- `outcome_status` 表示 NotObserved、Observing、Validated、Invalidated、Inconclusive 等业务结果；
- Pending Decision、Failure 等使用独立关联对象表达原因，不继续膨胀状态枚举；
- 多维状态使等待、失败或暂停解除后能够恢复到原生命周期位置。

所有生命周期变化必须通过统一迁移协议：

- Actor 只能提交具有业务含义的 Transition Request，不能直接调用 `setStatus`；
- Transition Guard（迁移守卫）检查当前状态与版本、Profile 路径、权限、Contract、Evidence、Risk、Policy 和并发冲突；
- 守卫统一返回 ALLOW、REQUIRE_HUMAN、NEED_MORE_EVIDENCE 或 DENY；
- Human Decision 是迁移求值的输入，不是直接修改状态的后门，批准后仍需基于最新条件重新求值；
- 迁移通过后，Kernel 原子提交状态、Transition Event 和后续待执行任务；
- 测试、部署等外部副作用在事务提交后通过带幂等键的任务执行，并将结果作为新 Event 回传。

Gate 与 Transition Guard 分离：Transition Guard 是每次迁移的通用执法器，Gate 是具有业务和质量含义的命名准入判断。

Gate 使用组合式、版本化要求模型：

- 要求由不可绕过的 Core Requirements、Change Profile、Risk Modifiers、Environment Policy、Project Policy 和 Change Contract 共同组成；
- 在当前 Contract Version 与 Risk Revision 下生成明确的 Gate Requirement Set；
- Agent 和人类从执行前即可知道后续 Gate 所需 Evidence 与 Decision；
- 要求变化必须生成新版本，不能在发布前静默增加隐含条件；
- Gate Requirement Set 更新时必须判断既有 Evidence 是否仍然有效，并触发补证据或重新决策。

Kernel 通过结构化 Work Item 调度 Human 或 Agent，而不是下发无边界自由 Prompt：

- Work Item 绑定 Change、Task、Contract Version 与 Plan Version；
- Work Item 明确目标、允许范围、输入、预期产物、验证要求、权限、预算和停止条件；
- Agent Runtime 为 Work Item 创建 Agent Run，加载对应 Role、Skill 与 Context；
- Agent Run 返回 Artifact、Evidence、Claim、Feedback、Decision Request 或 Failure；
- Agent Run 成功只表示本次工作项执行完成，不直接代表 Change 可以迁移；
- Agent 可以在 Work Item 授权范围内迭代，但超出范围、预算、权限或出现 Contract 冲突时必须停止并升级。

Task DAG 与变更控制采用三级模型：

- Task 是批准后 Plan 中的持久工作单元，Work Item 是一次执行授权，Agent Run 是一次实际执行尝试；
- 不改变 Task 边界、风险、权限和验证策略的内部执行细节由 Agent 自主调整并记录；
- 新增或删除 Task、改变依赖、范围、权限、风险、恢复或验证策略时提交 Plan Amendment；
- 改变 Intent、Outcome、Non-goals、Acceptance Criteria 或业务约束时升级为 Contract Amendment；
- Agent 可以提出修订，只有相应决策通过后，Kernel 才启用新的 Plan/Contract Version；
- Work Item 和 Evidence 绑定版本，修订时由 Kernel 判断任务、运行和证据的失效范围。

失败、重试和恢复采用分类模型：

- 瞬态故障允许带退避和最大次数的自动重试；
- 验证失败生成失败 Evidence，并进入有预算的 Repair Work Item 修复循环；
- 配置、权限、Contract 冲突和 Policy/Risk 问题暂停并升级，而不是原样重试；
- 外部副作用结果未知时必须先 Reconciliation（状态核对），确认未执行后才能重试；
- 每次尝试产生独立 Agent Run 与 Event，不覆盖历史失败；
- 达到次数、时间或成本限制后进入 AwaitingDecision，由对应 Owner 决定继续、修订、暂停或取消。

并发控制采用三层模型：

- Change 使用版本号进行乐观并发控制，过期请求必须重新读取并求值；
- Work Item 使用带 Heartbeat 和过期时间的 Lease，避免多个 Runtime 重复领取；
- Worktree、代码范围、环境和部署目标使用 Resource Lock 控制实际并行；
- Task DAG 只表达逻辑并行，真正执行还必须满足范围不冲突、Runtime 可用、资源锁和 Policy；
- Lease 到期不等于工作未发生，重新分配前必须核对原 Run 和外部副作用状态。

生命周期历史只追加，恢复动作向前执行：

- 状态循环通过新的 Transition Event 表达，不删除旧状态、失败 Run、Decision 或 Deployment Event；
- Pause 停止新调度并保留原生命周期位置，恢复后从原位置继续；
- Cancel 需要安全停止 Run、核对外部动作并完成必要清理或补偿后才能终止；
- Supersede 使用新旧 Change 关联表达，保留旧 Change 的授权和历史；
- Production Rollback 与 Compensation 是新的受控动作和 Event，不把数据库历史倒回过去；
- 已发生且不可逆的副作用只能补偿，不能声明其从未发生。

Kernel 持久化采用 Event-backed State，而不是纯 Event Sourcing：

- Current State 保存 Change 当前多维状态、版本和当前 Contract/Plan 引用；
- append-only Event Ledger 保存不可变生命周期历史；
- Transactional Outbox 保存事务提交后需要执行的 Agent、测试、部署等外部动作；
- Current State、Event 与 Outbox 在同一事务中一致提交；
- Workbench 使用可从 Current State 与 Event Ledger 重建的 Read Model；
- 启动时核对未完成 Outbox、过期 Lease、失联 Run 和状态未知的外部动作，再恢复调度。

跨 Change 调度由确定性规则控制：

- Change 业务优先级由 Human Flow/Portfolio Owner 决定，Agent 只能提出建议；
- Kernel 在 Priority、WIP Limit、Task DAG、Risk、Resource Lock 和 Runtime 可用性约束内选择 Ready Work Item；
- 高优先级不能绕过 Gate、资源锁或不可中断的外部操作；
- V1 只实现人工排序、Ready Queue、最大活跃 Change 和最大 Agent Run，不建设复杂智能调度优化器；
- Team Mode 后续再扩展公平性、预算、队列配额和跨机器调度。

### 5.3 Intelligence & Context（智能与上下文）

状态：**已确认**。

已确认：

- 采用 Orchestrator + 临时角色 Session，按 Work Item 创建 Intent、Planner、Executor、Evaluator、Deployment 等角色运行；
- Evaluator 使用独立 Session，不继承 Executor 的完整对话上下文；
- 每个 Agent Run 使用与 Change、Contract Version 和 Work Item 绑定的版本化 Context Pack；
- Context Pack 中的知识标记 Canonical、Derived、Reference、Runtime Observation，并记录来源、版本/Digest、新鲜度和适用范围；
- 权威来源冲突时 Agent 不能静默选择，必须生成 Conflict 或 Decision Request；
- Kernel 与流程只声明 required capabilities，不写死具体 Skill；Capability Resolver 根据项目 Policy 选择并固定可信 Skill、Tool、Model 或 Adapter 实现。

进一步确认：

- Context Pack 按角色组装最小必要上下文，Intent、Planner、Executor、Evaluator 和 Deployment 角色获得不同范围；
- Context Pack 是不可变版本快照，源知识变化时生成新版本，并按关键性判断旧 Run 继续、标记 Stale 或取消；
- 区分 Run Memory、Change Memory 和 Project Knowledge，Run Observation 只能先成为 Learning Candidate，经 Owner 与 Eval 后才能晋升；
- V1 知识来源聚焦 Change 记录、仓库文档、代码/Git、Project Policy、Runtime Run 和测试结果；飞书、CodeGraph、向量库等通过 Adapter 后续接入；
- Agent/Skill 只能提交 Proposal、Artifact、Evidence Claim、Evaluation 和 Learning Candidate，不能直接修改权威状态、批准 Gate、修改全局 Policy、晋升知识或授予自身权限。

### 5.4 Engineering Execution & Delivery（工程执行与交付）

状态：**已确认**。

确认范围：Workspace 隔离、执行适配与权限、代码集成、构建制品、环境部署、测试到生产晋升及 V1 DevOps 边界。

已确认：

- 默认一个 Change 一个隔离 Worktree，顺序 Task 共享，只有依赖和文件范围明确时才创建并行子 Worktree；Agent 不直接修改主工作区；
- Kernel 下发 Work Item，Runtime Adapter 转换为 Claude Code/OpenCode Session/Command，由所选 Runtime 执行真实文件、命令和工具操作；未来 cimicode 复用同一契约；
- 权限由 Work Item 声明，凭据留在 Runtime 或 DevOps，不进入 Prompt、Event 或 Artifact；
- 每次有效代码变化产生不可变 Artifact Candidate，测试通过后将同一 Digest 晋升生产；修复后必须生成新 Artifact 并重新验证；
- 通过统一 Environment/DevOps Adapter 执行 build、deploy、status、verify、recover 和 reconcile，V1 复用现有 DevOps；
- 测试环境自动执行部署、验证、失败 Evidence、修复与重部署循环；生产发布必须形成 Release Package 并由 Release Owner 明确批准；
- V1 打通测试与生产环境并完成生产即时验证，不承诺长期生产遥测和业务结果观察。

### 5.5 Trust & Governance（信任与治理）

状态：**已确认**。

确认范围：Evidence 可信度、独立评价、风险与 Policy、Human Approval、Exception、审计与 V1 治理边界。

已确认：

- Evidence 采用 Claim–Evidence 模型，明确证明对象、来源、Contract/Artifact 版本、新鲜度与适用范围，原始日志不能自动等同于有效证据；
- 采用确定性工具、独立 Evaluator Agent 与 Human Review 的分层评价，风险越高要求越强的独立性；
- 使用 Blast Radius、Reversibility、Data Impact、Security/Compliance、External Side Effect、Novelty/Uncertainty 等多维风险画像；
- Agent 可以建议风险，不能自行降级；V1 使用确定性项目 Policy，不引入复杂通用策略平台；
- Human Approval 是结构化 Decision，不能沉默同意，并绑定具体 Change、版本、Artifact 与环境；
- 普通 Change 允许一人多角色；高风险或不可逆动作默认要求执行与批准职责分离；Embedded Solo Mode 无法获得第二责任人时，只能使用限时、限范围、增强证据并强制事后复盘的紧急越权（break-glass），且不得把同一人伪装为多人复核；
- 规则例外使用有限范围、有效期、Owner 和补偿措施明确的 Exception Record，不自动修改长期 Policy；
- 重复 Exception 只能形成 Policy Change Candidate，并进入审计与复盘。

### 5.6 Protocol, Data & Integration（协议、数据与集成基础）

状态：**已确认**。

确认范围：Cimi Change Protocol 范围、Schema 演进、数据权威、Store 抽象、Adapter 契约、API/Event 和 V1 集成边界。

已确认：

- Cimi Change Protocol 定义 Project、Change、Contract、Plan/Task、Work Item/Run、Artifact/Evidence、Gate/Decision、Actor、Environment/Deployment、Event/Policy 等稳定领域语义；
- Protocol 不等于某个文件目录、数据库表或传输格式，JSON/YAML、API、Event 和 Repo Artifact 都是协议载体；
- 所有关键对象使用稳定 CimiLoop ID、显式对象版本、Schema Version、来源和 Digest，外部系统 ID 作为 External Reference；
- 数据权威分层：CimiLoop Store 保存运行状态和协作记录，Git 保存工程工件，Runtime 保存原始执行记录，CI/CD 与 DevOps 保存原始运行事实；
- Kernel 依赖 ChangeStore、EventStore、RunStore、EvidenceStore、DecisionStore、OutboxStore 等逻辑 Port；Solo 使用 SQLite/Local Files，Team 使用 PostgreSQL/Shared Store；
- Solo 与 Team 使用同一 Protocol 和 Kernel，并通过 Export/Import 迁移项目历史；
- Runtime、SCM、Workspace、Knowledge、DevOps、Environment、Notification、Spec 等外部能力通过声明能力、版本、权限、健康、幂等和核对能力的 Adapter 接入；
- Adapter 只能使用 Command、Query 和 Event，不能直接修改 Kernel Store；
- V1 最小集成为 Claude Code 或 OpenCode Runtime（先实现一个）、Git/Local Workspace、File Knowledge 和现有 DevOps/Environment；企业内部 cimicode 与其余能力按相同契约后续接入。

Change Room 采用两层时间线：

- 默认展示经过整理的 Change 生命周期事件，包括契约批准、Gate 结果、人工决策、部署和状态迁移；
- 进入具体 Agent Run 后再展示完整技术执行日志，包括 Agent 输出、工具调用、命令、Token、重试和错误；
- 技术运行事件不会直接淹没 Change 主时间线，但关键失败和结论会被提升为生命周期事件。

人工决策采用结构化 Decision：

- Change Room 展示当前 Change 的待决策事项，Workbench 的 Decision Inbox 汇总所有 Change 的待决策事项；
- 所有可能引发状态迁移、权限变化、规则例外或生产操作的人类决定，必须通过结构化 Decision 提交；
- Decision 至少记录 Decision ID、Change ID、决策类型、所需角色、上下文、可选动作、建议及理由；
- 评论、聊天和自然语言回复只能作为上下文，不能自动视为正式授权；
- 外部审批或协作入口最终也必须转换为相同的 Decision，由 Kernel 校验身份、权限和当前状态。

V1 即使只有一个本地用户，也建立 Human Actor，并在正式决策中同时记录 `actor_id` 与 `acting_role`：

- 每个 Change 从 Draft 到关闭始终有且只有一名当前 Human Change Owner，对推进、阻塞处理和闭环负责，但不因此自动获得其他角色的批准权；
- Change Owner 可以移交；移交必须记录原负责人、新负责人、生效时间和原因，并保持完整责任链；
- Incident Commander 可以临时指挥应急动作，但不会自动取代 Change Owner，除非完成正式负责人移交；
- 所需责任角色未指派或不可用时，不允许 Change Owner 自动代行；Change 进入等待决策（AwaitingDecision），直到完成显式指派、限时委托或符合 Policy 的紧急越权；
- Solo Mode 可以把多个角色显式指派给同一 Human Actor，但每次行动仍须声明 acting_role；职责分离禁止同一人代行时，只能等待其他 Actor 或显式使用 break-glass；
- 同一人可以兼任多个角色；
- 每次决策必须明确该用户以哪个角色行使权力；
- 角色重叠不等于职责分离；是否允许同一 Actor 连续执行和批准，由当时生效的风险与 Project Policy 判定；
- 高风险场景默认要求另一 Actor 复核；Solo Mode 缺少复核者时只能显式使用紧急越权（break-glass），并记录原因、范围、时限、补偿措施、增强 Evidence 和事后复盘要求；
- 系统保留未来进行权限校验、职责分离和审计所需的信息；
- V1 使用轻量本地身份配置，不建设登录系统和复杂组织权限后台。

Human 与 Agent 使用统一 Actor 抽象，并通过 `actor_type` 区分：

- Agent 作为一等参与者出现在 Change Room；
- Agent 行为同时关联稳定的 Agent Profile、当时承担的 Role 和具体 Agent Run；
- V1 将角色分为人类责任角色与可执行角色：Change Owner、Intent Owner、Technical Owner、Release Owner、Policy Owner 和 Incident Commander 只能由 Human Actor 承担；Planner、Executor、Evaluator、Operator 等角色可由 Human 或 Agent 承担；
- Agent 可以提交建议、Artifact、Evidence 和执行结果，并在 Policy 授权范围内执行工程动作；
- Agent 不能冒充 Human Actor，不能获得必须由人类责任角色行使的最终授权权力；
- 后续自治等级提高时，调整 Decision 与 Gate 的授权策略，不把 Agent 重写或伪装为历史中的人类责任主体；
- Agent 的建议通过不等于 Gate 已通过。

V1 区分 Conversation、Feedback 与 Decision：

- 实时对话继续发生在所选 Agent Runtime，Change Room 不实现通用聊天和自由评论系统；
- Feedback 必须关联到 Contract、Plan、Artifact、Evidence 或 Agent Run，并记录处理状态；
- Decision 具有正式流程效力，使用独立结构化模型；
- Change Room 只保存对流程有长期价值的 Feedback、Decision、Artifact、Evidence，以及必要的 Conversation 摘要和来源引用；
- 原始对话保留在对应 Runtime 的 Agent Run Log 中。

## 6. 阶段 C：核心领域模型与 Cimi Change Protocol

状态：**进行中**。

阶段 C 先定义统一语言、领域对象、聚合边界、身份关系与版本关系，再讨论字段级 Schema、目录、存储和外部能力映射。

### 6.1 第一轮：核心对象与聚合边界

状态：**已确认**。

#### Project、Change 与 Change Room

- Project 与 Change 分别是聚合根，Change 必须归属一个 Project；
- Project 管理项目级身份、治理边界和跨 Change 关系，不承载单个 Change 的运行状态；
- Change 是独立交付、验证、发布和责任单元，也是生命周期状态的权威聚合；
- 每个 Change 自动拥有唯一逻辑 Change Room；
- Change Room 不是第三个事实聚合，而是与 Change 一一对应的交互与查询投影；
- Change Room 组合展示 Contract、Plan、Work Item、Agent Run、Artifact、Evidence、Decision 和 Timeline，但不拥有这些对象，也不能成为绕过 Kernel 的写入边界。

#### Change Contract 与版本

- Change Contract 是从属于 Change、但独立版本化的聚合；
- Contract 不能脱离所属 Change 存在，但拥有稳定 Contract ID 和不可变 Contract Version；
- Change 只引用当前生效的 Contract Version，不把完整契约内容内嵌为可原地修改的状态；
- Contract Amendment 产生新的不可变版本，旧版本永久保留；
- Contract Version 的启用必须经过相应 Decision 与 Kernel 校验，修订不能直接改变 Change 生命周期状态。

#### Plan、Task DAG、Work Item 与 Agent Run

- Plan 是从属于 Change 的独立版本化聚合，并绑定授权它的 Contract Version；
- Task 是 Plan 内的持久实体，Task 之间的依赖共同构成该 Plan Version 的 Task DAG；
- Work Item 是 Kernel 针对某个 Task 创建的一次有边界执行授权，是独立的调度聚合；
- Agent Run 是 Runtime 执行一次 Work Item 的独立尝试记录；
- 一个 Task 可以产生多个 Work Item，一个 Work Item 也可以因重试、恢复或接管产生多个 Agent Run；
- Plan Amendment 产生新的 Plan Version，不覆盖历史 Task、Work Item 和 Agent Run；
- Work Item 和 Agent Run 必须引用执行时有效的 Contract Version 与 Plan Version，Run 成功不直接改变 Task 或 Change 状态。

#### Artifact、Claim、Evidence 与 Gate Evaluation

- Artifact 表示不可变候选交付物或外部工件引用，以稳定 ID、版本或 Digest 识别；
- Claim 表示需要被证明或反驳的明确命题；
- Evidence 表示支持、反驳或无法判定某个 Claim 的不可变观察或原始事实引用；
- Gate Requirement Set 定义某次 Gate 必须满足的 Claim 与证据要求，并独立版本化；
- Gate Evaluation 是针对某个 Requirement Set Version、Contract/Plan Version、Artifact Digest 和当时有效 Evidence 的一次不可变求值快照；
- Gate Evaluation 只给出准入判断及依据，真正的生命周期迁移仍由 Kernel 执行。

#### Actor、Role、Assignment、Decision 与权限

- Actor 是稳定参与者身份，通过类型区分 Human 与 Agent；
- Role 是责任与决策权定义，不直接固化在 Actor 上；
- Assignment 把 Actor、Role、作用域和有效期绑定起来，是权限求值的重要输入；
- Decision 是不可变事实，记录实际 Actor、acting role、目标对象及目标版本；
- 当前权限由 Assignment、Policy、作用域和当前状态共同求值，不能只根据 Actor 或历史角色判断；
- Decision 保存作出决定时的授权依据快照，后续 Role 或 Assignment 变化不改变历史 Decision 的含义；
- Agent Actor 不能通过 Assignment 获得必须由 Human Role 行使的最终授权权力。

### 6.2 第二轮：聚合引用方向与精确版本引用

状态：**已确认**。

已确认：

- 所有跨聚合关系统一使用“稳定对象 ID + 精确业务版本”引用，不跨聚合复制完整对象；
- 下游对象必须引用其创建或执行时实际依据的上游版本，不能只引用“最新版”；
- Change 保存当前生效的 Contract Version 与 Plan Version 指针；
- 历史 Plan、Task、Work Item、Agent Run、Artifact、Evidence、Decision 和 Gate Evaluation 保留原始精确版本引用，不自动追随 Change 的当前版本；
- 反向关系和组合视图由 Read Model 构建，不通过在多个聚合中维护双向可变对象图实现。

版本概念收敛为：

- 主要业务版本只有 Contract Version 与 Plan Version，分别表达“当前授权做什么”和“当前授权如何实施”；
- Change 使用稳定 Change ID，不设置面向用户的 Change Version；其 Aggregate Revision 只用于乐观并发控制；
- Artifact 是不可变对象，使用 Artifact ID 与 Digest 标识，不采用可原地修改的 Artifact Version；
- Task 使用稳定 Task ID；同一任务在不同 Plan Version 中的细节变化可使用内部 Task Revision，拆分、合并或目标边界变化时创建新的 Task ID；
- Decision、Evidence、Gate Evaluation、Work Item、Agent Run、Deployment 和 Event 每次发生均创建新的不可变记录 ID，不引入面向用户的业务版本号；
- Schema Version 标识协议结构，Event Sequence 标识事件顺序，Aggregate Revision 标识并发修订；三者与 Contract/Plan 业务版本严格分离，默认不作为用户日常操作概念；
- 跨聚合引用的“精确版本”规则只适用于 Contract、Plan 等版本化业务对象；引用不可变对象时使用其稳定 ID，引用 Artifact 内容时同时使用 Digest。

Contract Amendment 与正式版本的关系：

- Contract Amendment 是独立的修订提案，不等于新的正式 Contract Version；
- Amendment 必须声明其基于的父 Contract Version、修改原因和影响范围；
- Amendment 在审核中可以被修改、拒绝或撤回，这些过程保留审计记录，但不占用正式 Contract Version；
- 只有相应 Owner 正式批准后，Kernel 才基于父版本生成新的不可变 Contract Version，并将 Change 的当前生效契约指针切换到新版本；
- 批准时如果父版本已不再是当前生效版本，必须重新检查冲突和影响，不能直接覆盖较新的契约；
- 新 Contract Version 必须能够追溯到父版本、产生它的 Amendment 和授权它的 Decision。

Plan Version 与 Task 身份的关系：

- Plan Amendment 经批准后生成新的不可变 Plan Version；
- Task 的工作含义、目标和责任边界不变时，在新的 Plan Version 中沿用稳定 Task ID；
- Task 在不同 Plan Version 中的依赖、执行细节或描述变化使用内部 Task Revision 表达，不向用户增加一套独立业务版本概念；
- Task 被拆分、合并，或工作目标与责任边界发生变化时，必须创建新的 Task ID；
- 新旧 Task 通过 `supersedes`、`split-from` 或 `merged-from` 等谱系关系关联；
- 历史 Work Item 和 Agent Run 永远引用执行时对应的 Plan Version 与 Task Revision，不因后续计划修订而改写。

版本变化的下游影响：

- Contract 或 Plan 产生新版本后，不对 Task、Work Item、Artifact、Evidence、Decision 和 Gate Evaluation 执行全量级联失效；
- Kernel 根据对象依赖、修改影响范围、目标版本和 Policy 执行可审计的影响评估；
- 影响评估统一区分 `Valid`（仍然有效）、`Stale`（历史事实保留但不能作为当前依据）和 `Superseded`（已被明确的新对象取代）；
- 失效范围必须尽可能精确，既不能继续使用不适用的旧证据，也不能无依据要求所有工作重做；
- Agent 和 Evaluator 可以提交影响分析建议，最终有效性判断由 Kernel 根据确定性规则和必要的人类 Decision 作出；
- 每次判断必须记录所比较的旧版本、新版本、受影响对象、结论和规则依据。

关闭、归档与清除语义：

- Close（关闭）表示业务流程结束并停止正常调度，历史仍可查询，并允许按 Policy 补充后续观察或审计记录；
- Archive（归档）表示从默认工作视图隐藏，不改变 Change 的关闭状态，也不删除任何历史；
- Project 或 Change 的关闭与归档不得级联删除 Contract、Plan、Task、Work Item、Agent Run、Artifact、Evidence、Decision、Gate Evaluation、Deployment 或 Event；
- V1 不提供 Project 或 Change 的常规 Hard Delete（硬删除）；
- 未来因隐私、合规或密钥泄漏需要清除内容时，必须使用独立受控的 Purge/Redaction（清除/脱敏）流程；
- 清除或脱敏后仍保留不含敏感内容的审计占位记录，说明执行时间、授权依据、范围与原因。

### 6.3 第三轮：Command、Event、Transition、Gate 与 Decision 边界

状态：**已确认**。

已确认：

- Command（命令）表达某个 Actor 请求系统执行的动作，是意图而不是事实；
- Command 必须经过身份、权限、当前状态、版本、Policy 和幂等性校验，可能被接受或拒绝；
- Event（事件）表达已经发生并由系统提交的事实，一经记录不得改写；
- Command 不能直接作为状态变化已经发生的证据，Event 也不能被复用为再次执行动作的指令；
- Kernel 接受 Command 后，在同一事务中提交状态变化与相应 Event；拒绝时记录明确结果，但不得产生表示成功的事实事件。

Transition Request 与 Command 的关系：

- Transition Request（迁移请求）是具有生命周期语义的领域 Command，不是独立的状态对象或另一套写入通道；
- Transition Request 表达 Actor 希望 Change 执行某项迁移动作，可以声明期望起点、目标动作和所依据的 Contract/Plan Version；
- 提交 Transition Request 不代表状态已经迁移，也不能直接写入目标状态；
- Kernel 对其执行当前状态与版本检查、权限校验、Gate Evaluation 和并发校验；
- 只有求值为 ALLOW 且事务提交成功后，Kernel 才更新 Change Current State 并产生 ChangeTransitioned Event；
- REQUIRE_HUMAN、NEED_MORE_EVIDENCE 或 DENY 均保持迁移尚未发生，并返回对应的结构化后续动作。

Gate 与 Gate Evaluation 的关系：

- Gate 是稳定、具名的准入规则定义，例如“进入测试部署检查”，本身不保存某个 Change 的通过或失败状态；
- Gate Requirement Set 是 Gate 在当前 Profile、Risk、Policy、Environment 和 Contract 下解析出的版本化具体要求；
- Gate Evaluation 是针对某一 Requirement Set Version、目标迁移和当时上下文执行的一次不可变求值记录；
- 同一 Gate 可以先后产生多次 Gate Evaluation，NEED_MORE_EVIDENCE、REQUIRE_HUMAN、DENY 或 ALLOW 等历史结果均不得被覆盖；
- Change 的实际 Transition 必须引用直接支撑该次迁移的 Gate Evaluation；
- Gate 定义回答“检查什么”，Requirement Set 回答“这次具体要求什么”，Gate Evaluation 回答“基于当时事实得出了什么结果”。

Decision 与迁移的关系：

- Gate 返回 REQUIRE_HUMAN 时创建 Decision Request，明确需要回答的问题、所需 Role、候选动作、上下文和目标版本；
- Human 通过 Record Decision Command 提交决定，Kernel 必须校验 Actor、acting role、Assignment、Policy、作用域和目标版本；
- 校验通过后形成不可变 Decision，Decision Request 与 Decision 分别表达“系统在问什么”和“有资格的 Actor 决定了什么”；
- Decision 本身不能直接修改 Change 状态，也不能作为绕过 Gate 的迁移后门；
- Decision 记录后，Kernel 必须使用最新状态、版本、风险、Evidence 和 Decision 重新执行 Gate Evaluation；
- 只有新的 Gate Evaluation 返回 ALLOW 后才能执行 Transition，过期 Decision 不能授权已经变化的 Contract、Artifact、环境或操作范围。

Transition Record、Current State 与 Event 的关系：

- 每次成功生命周期迁移都创建独立、不可变的 Transition Record；
- Transition Record 记录起始状态、迁移动作、目标状态、Contract/Plan Version、Transition Request、Gate Evaluation 和所依据的 Decision；
- Change Current State 保存当前多维状态与最新成功 Transition 引用，用于高效读取和并发控制；
- ChangeTransitioned Event 表达迁移已经提交的事实，用于驱动 Read Model、Outbox 和外部 Adapter；
- Transition Record 负责解释迁移为何合法，Event 负责传播已发生事实，Current State 负责表达当前位置，三者不能相互替代；
- 被拒绝、需要人工或证据不足的请求不创建成功 Transition Record，但保留 Command 处理结果与 Gate Evaluation。

### 6.4 第四轮：跨 Change 与运行关系语义

状态：**已确认**。

已确认：

- 每个 Change 始终是独立聚合，拥有自己的 Change Owner、Contract、Plan、生命周期、Gate、Evidence、Decision 和交付结论；
- 从一个 Change 拆分或派生出的新 Change 不成为原 Change 内部的子对象，原 Change 不能直接修改其状态；
- Change 之间通过显式、带类型的 Change Relationship 关联；
- 基础关系类型包括 `depends-on`、`blocks`、`spawned`、`supersedes` 和 `related-to`；
- 只有 `depends-on`、`blocks` 等被 Policy 明确定义的关系参与调度约束，普通关联不产生隐含生命周期控制；
- 一个 Change 的关闭、归档或取消不得级联改变关联 Change 的状态。

Supersede（取代）语义：

- 建立 `supersedes` 关系首先表示取代提案或意图，不直接把旧 Change 改为 Superseded；
- Kernel 必须核对旧 Change 的活动 Work Item、Agent Run、Artifact、Deployment、外部副作用和未完成事项；
- 必须明确哪些工作转移到新 Change、哪些历史 Evidence 仅作引用、哪些资源需要停止、清理或补偿；
- 旧 Change Owner 或 Policy 指定的责任角色必须确认取代范围与处置结果；
- 完成核对且 Gate 返回 ALLOW 后，Kernel 才停止旧 Change 的后续调度并执行到 Superseded 的 Transition；
- 旧 Change 的 Contract、Decision、Evidence、Run、Deployment 和 Event 历史永久保留，不迁移或重写为新 Change 的历史。

Retry、Agent Run 与 Work Item 的关系：

- 执行目标、输入版本、授权范围、权限、预算和停止条件均未变化时，Retry 保留原 Work Item，并创建新的 Agent Run 表示同一授权下的再次尝试；
- Contract/Plan Version、目标、修改范围、权限、验证策略、预算或停止条件发生变化时，必须结束旧 Work Item 并创建新的 Work Item；
- 验证或环境测试发现实现缺陷时，创建明确的 Repair Work Item，并关联失败 Evidence、原 Work Item 和受影响 Task；
- 每次 Agent Run 都拥有独立 Run ID、尝试序号、输入快照、结果和失败记录，不覆盖此前 Run；
- 外部操作结果未知时不得直接 Retry，必须先执行 Reconciliation（状态核对），确认安全后再决定继续原 Work Item 或创建新 Work Item。

Gate Re-evaluation（重新求值）语义：

- 对同一 Gate、目标 Transition 和完全相同的有效输入快照重复求值时，返回原 Gate Evaluation，不重复创建等价记录；
- 有效输入至少包含 Change Current State、Contract/Plan Version、Gate Requirement Set Version、Artifact Digest、Evidence 集合、Risk Revision、Decision、Exception、目标 Environment 和相关 Policy Version；
- 任一有效输入变化时，必须创建新的不可变 Gate Evaluation；
- 新 Evaluation 通过 `re-evaluates` 关联此前 Evaluation，旧结果永久保留；
- 该规则同时保证重复请求的幂等性，以及从 NEED_MORE_EVIDENCE、REQUIRE_HUMAN 或 DENY 演化为 ALLOW 的可解释历史。

跨 Change 依赖与 Blocked 的关系：

- `depends-on` 首先约束受影响 Task 或 Work Item 的 Ready 状态，不自动把整个依赖方 Change 标记为 Blocked；
- 只要 Change 仍存在满足其他约束的可推进工作，其 `flow_condition` 保持 Active；
- 只有当前 Change 已不存在任何可推进工作，且原因确实是未满足的跨 Change 依赖时，才设置 `flow_condition = Blocked`；
- Blocked 不覆盖 `lifecycle_state`，并通过独立 Blocker 记录被依赖 Change、等待条件、责任方和解除条件；
- 依赖条件必须可确定求值，例如目标 Change 达到指定状态、产生指定 Artifact、批准指定 Contract/接口版本或完成指定 Task；
- 不允许仅使用“等待另一个 Change 完成”这种无法精确判断的模糊依赖条件。

### 6.5 第五轮：Protocol 对象分层与 V1 最小集合

状态：**已确认**。

已确认：

- Cimi Change Protocol 对象分为 Authoritative Domain Objects（权威领域对象）、Immutable Records（不可变事实记录）和 Derived Read Models（派生查询模型）三层；
- 权威领域对象表达当前有效的业务约束、身份、授权和状态，例如 Project、Change、Contract、Plan、Task、Actor、Role、Assignment；
- 不可变事实记录表达一次已经发生的行为、观察、判断或状态变化，例如 Work Item、Agent Run、Artifact、Evidence、Decision、Gate Evaluation、Transition、Deployment、Event；
- 权威领域对象和不可变事实记录共同构成协议事实，必须遵守稳定 ID、版本/摘要、来源和审计规则；
- Change Room、Timeline、Attention Queue、Decision Inbox 和 Lifecycle Board 属于派生查询模型，可以从协议事实重建；
- 派生查询模型可以被删除和重建，不能反向成为生命周期状态、授权、证据或决策的事实权威。

Risk Profile 与 Risk Assessment：

- Risk Profile 是从属于 Change 的独立权威对象，不内嵌在 Contract Version 中；
- Contract 表达被授权的意图与约束，Risk Profile 表达系统当前对影响和不确定性的认识，两者可以独立变化；
- 每次风险重新评估产生不可变 Risk Assessment，Change 引用当前有效的评估结果；
- 风险评估继续使用 Blast Radius、Reversibility、Data Impact、Security/Compliance、External Side Effect 和 Novelty/Uncertainty 等多维结构；
- Risk Assessment 使用独立记录 ID 和时间线，不增加面向用户的 Risk v1/v2 业务版本概念；
- Agent 可以提交风险评估建议，但风险降低必须经过 Policy 规定的 Human Role 确认；
- Risk Assessment 变化可以触发 Gate Requirement Set 重新解析和下游影响评估，但不自动产生新的 Contract Version。

Change Profile 的身份与版本：

- Change Profile 不是写死在代码中的简单枚举，而是由 Project Policy 管理的版本化规则定义；
- 标准 Profile 可以包括 Feature、Bugfix、Incident、Security Fix、Migration、Experiment、Tech Debt 和 Ops Change，但每个定义均具有稳定 Profile ID 与版本；
- Profile 定义允许的生命周期路径、契约完整度、默认 Gate、必需 Evidence、默认人工决策点、允许终止状态以及风险和恢复附加约束；
- Change 必须引用创建或最近一次获批变更时生效的精确 Profile ID 与版本；
- 发布新的 Profile Version 不得静默改变正在运行的 Change；是否升级必须提交明确请求并执行影响评估；
- Profile 变更如果实质改变 Change 类型、Intent、验收或授权边界，仍须遵守 Contract Amendment 与相应 Decision 规则。

Project Policy 与 Policy Snapshot：

- Project Policy 是项目级版本化权威定义，规则更新产生新的 Policy Version；
- 每次创建 Work Item、执行 Gate Evaluation、校验 Decision 或授权外部副作用时，必须保存实际参与求值的 Policy Snapshot；
- 发布新 Policy Version 后，新建 Change 默认使用新版本，运行中的 Change 必须执行影响评估，不能无痕改变既有授权边界；
- 新增安全、合规等强制红线可以立即阻止尚未执行的后续操作，但必须记录规则来源、命中结果和受影响对象；
- 历史 Work Item、Decision、Gate Evaluation 和 Transition 继续引用当时的 Policy Snapshot，不因 Policy 更新而改写；
- Policy Exception 是独立、有限范围、带有效期和补偿措施的授权记录，不修改或派生替代原 Policy 定义。

Environment、Release 与 Deployment：

- Environment 是 Project 级稳定目标定义，例如测试环境或生产环境，并通过外部引用关联真实平台环境；
- Release 是从属于 Change 的受控发布对象，绑定精确 Contract Version、Artifact ID 与 Digest、目标 Environment、Release Package、Recovery Strategy 和 Release Decision；
- Release Owner 批准的是具体 Release，即指定 Artifact 在规定时间、范围和环境中的一次发布授权，不是通用生产权限；
- Deployment 是在某个 Release 授权下调用外部平台的一次不可变执行尝试；
- 同一 Release 可以因瞬时故障或状态核对后重试而产生多个 Deployment，但每次尝试都保留独立记录；
- Artifact、目标 Environment、发布范围或 Recovery Strategy 发生实质变化时，必须创建新 Release 或重新取得有效 Release Decision。

### 6.6 第六轮：Core、Runtime 与 Adapter Protocol 边界

状态：**已确认**。

已确认：

- Cimi Change Protocol 只定义能够跨 Solo/Team、Store 和 Runtime 移植的业务事实与稳定语义；
- Kernel Runtime Protocol 定义 Work Item Lease、Resource Lock、Scheduler Checkpoint、Outbox Task、Heartbeat 和 Reconciliation 状态等运行协调对象；
- Adapter Protocol 定义外部执行请求、外部结果、External Reference、Capability、Health、Idempotency 和状态核对契约；
- Lease、锁续期、心跳和内部 Outbox 状态不成为 Change 的长期业务语义，也不进入默认生命周期时间线；
- Kernel 或 Adapter 的关键运行结果必须提升为 Cimi Change Protocol 中的 Event、Evidence、Run、Deployment 或 Failure 等业务事实；
- 更换调度器、Store、Runtime 或 Adapter 实现不得要求改变 Cimi Change Protocol 的核心语义。

Agent Run 的协议边界：

- Cimi Change Protocol 保存可移植的 Agent Run Record，不保存完整 Transcript、内部推理、工具调用和命令输出；
- Run Record 关联 Work Item、Agent Profile、acting role、Contract/Plan Version、Context Pack、Policy Snapshot、Runtime/Model/Skill/Tool 版本摘要以及开始、结束和结果；
- Run 产生的 Artifact、Claim、Evidence、Failure 和关键资源使用通过稳定 ID 关联；
- 原始 Session、Transcript、工具调用和命令输出由 Runtime 保存，Run Record 使用 External Reference 与 Digest 定位和校验；
- 凭据、密钥和不应持久化的敏感运行内容不得进入 Run Record、Event 或可移植导出包；
- 关键失败和结论提升为 Change 级业务 Event 或 Attention 事实，普通技术日志只在具体 Run 中查看。

Context Pack 的协议边界：

- Cimi Change Protocol 保存不可变 Context Pack Manifest，不复制代码、文档、Spec、ADR、知识库或完整历史 Evidence 内容；
- Manifest 关联 Contract、Plan、Task、Policy、Role 和 Work Item，并记录每项上下文来源的位置、版本或 Digest；
- 每项来源标记 Canonical、Derived、Reference 或 Runtime Observation 等权威级别和适用范围；
- Manifest 记录生成时间、组装规则版本和整体 Digest，使 Agent Run 能够说明当时实际获得了什么上下文；
- 原始内容继续由 Git、文件、知识平台或其他权威来源保存，需要时按 External Reference 定位并用 Digest 校验；
- 来源不可访问时标记为 Unavailable，不删除 Run 历史，也不得声称仍能完整重放该次执行。

Feedback 与 Conversation 的协议边界：

- 只有关联到具体 Contract、Plan、Task、Artifact、Evidence 或 Agent Run 的结构化 Feedback 进入 Cimi Change Protocol；
- Feedback 记录提出者、目标对象、内容摘要、处理状态与最终处置，但本身不具有授权效力；
- Feedback 不能替代 Decision，自然语言中的同意、评论或表态不得被默认推断为正式批准；
- 对流程有长期价值的对话内容可以形成 Conversation Summary，并附原始对话的 External Reference；
- 原始聊天消息、流式输出、临时讨论和完整 Conversation 继续保存在 Runtime 或外部协作系统；
- 对话中需要产生正式授权时，Actor 必须通过统一 Command 另行提交结构化 Decision。

Failure、Blocker 与 Attention Item：

- Failure 是一次已经发生的不可变失败事实，例如 Agent Run、测试、Gate、部署或恢复失败；
- Blocker 是当前仍阻止 Change、Task 或 Work Item 推进的可解除条件，记录责任方、原因、影响范围和解除条件；
- Attention Item 是 Workbench 使用的派生查询项，由 Failure、Blocker、Evidence 缺口、Risk 变化、过期 Decision 等协议事实生成；
- 一个 Failure 可以打开 Blocker，也可以只留下历史而不阻塞当前工作；
- Blocker 解除后保留其打开和解除历史，相关 Attention Item 可以从当前视图消失；
- Attention Item 不是事实权威，删除或重建 Read Model 不影响 Failure 与 Blocker 原始记录。

### 6.7 第七轮：Cimi Change Protocol V1 最小对象目录

状态：**已确认**。

已确认的第一组“项目与治理基础对象”：

- `Project`：Change、Policy、Actor 和 Environment 的治理边界；
- `Change Profile`：不同 Change 类型的路径与默认要求定义；
- `Policy`：项目规则的版本化权威定义；
- `Environment`：测试、生产等稳定目标定义；
- `Actor`：Human 或 Agent 的稳定身份；
- `Role`：责任、权限类别与决策权定义；
- `Assignment`：Actor 在指定作用域与有效期内承担 Role 的关系。

以上对象进入 V1 核心协议，但不意味着 V1 建设组织账号后台或通用策略平台；Embedded Solo Mode 可以使用单一本地 Human Actor、内置 Role、文件化 Policy 和少量 Environment 定义。

已确认的第二组“Change 定义与计划对象”：

- `Change`：独立交付、责任和生命周期单元；
- `Change Relationship`：Change 之间的依赖、派生、取代和普通关联；
- `Change Contract`：当前被授权的意图、范围、验收与约束；
- `Contract Amendment`：契约修订提案；
- `Risk Profile`：Change 当前风险画像；
- `Risk Assessment`：一次不可变风险评估；
- `Plan`：当前被授权的实施方式、Task DAG 和验证策略；
- `Plan Amendment`：计划修订提案；
- `Task`：Plan 中具有稳定身份的持久工作节点。

其中 Contract 与 Plan 使用正式业务版本；Amendment 表示审批中的提案；Risk Assessment 使用不可变记录 ID；Task 使用稳定 Task ID，并通过所属 Plan Version 与内部 Revision 追踪变化。

已确认的第三组“执行与交付对象”：

- `Work Item`：Kernel 下发的一次有边界执行授权；
- `Agent Run Record`：Runtime 执行 Work Item 的一次实际尝试摘要；
- `Context Pack Manifest`：某次 Run 实际使用的不可变上下文清单；
- `Artifact`：不可变候选交付物或外部工件引用；
- `Release`：把指定 Artifact 晋升到指定 Environment 的受控发布对象；
- `Deployment`：执行某个 Release 的一次外部部署尝试。

Worktree、Lease、Resource Lock、Heartbeat 和 Outbox 属于 Kernel Runtime Protocol；完整运行日志和真实制品内容留在 Runtime、Git、Artifact Registry 或 DevOps 等权威系统，核心协议只保存摘要、Digest 与 External Reference。

已确认的第四组“信任、Gate 与授权对象”：

- `Claim`：需要被证明或反驳的明确命题；
- `Evidence`：支持、反驳或无法判定 Claim 的事实；
- `Gate`：稳定、具名的准入规则；
- `Gate Requirement Set`：某次 Gate 在具体上下文中的版本化要求；
- `Gate Evaluation`：一次不可变 Gate 求值；
- `Decision Request`：系统请求指定 Human Role 回答的问题；
- `Decision`：具备资格的 Actor 作出的正式决定；
- `Policy Exception`：有限范围、带期限和补偿措施的规则例外；
- `Transition Record`：一次成功生命周期迁移及其完整依据。

Approval 不另设对象，而是 Decision 的一种类型；Intent Decision、Execution Plan Decision、Release Decision 和 Exception Decision 使用统一 Decision 模型表达。

已确认的第五组“协作、异常与审计对象”：

- `Event`：已经提交的不可变领域事实；
- `Failure`：一次已经发生的失败记录；
- `Blocker`：当前阻止推进、可以解除的条件；
- `Feedback`：关联具体领域对象、但不具有授权效力的结构化反馈；
- `Conversation Summary`：按需保存的对话摘要与原始记录引用；
- `Learning Candidate`：从失败、纠正、例外或复盘中形成的改进候选。

V1 同时定义两个通用协议构件：

- `External Reference`：指向 Git、Runtime、CI/CD、DevOps、Artifact Registry 等外部权威事实；
- `Command Envelope`：所有写入请求共用的命令外壳，承载 Actor、acting role、作用域、幂等键和期望 Aggregate Revision 等通用语义。

Conversation Summary 是可选记录；Attention Item、Timeline、Decision Inbox 和 Lifecycle Board 继续作为可重建的 Derived Read Model，不进入最小事实对象目录。

### 6.8 第八轮：通用字段与 Schema 语义

状态：**进行中**。

已确认的内部身份语义：

- 所有核心领域对象和不可变事实记录都使用全局稳定、不可变的 CimiLoop Internal ID；
- Internal ID 在 Embedded Solo Mode、Shared Team Mode、Export/Import、项目迁移和 Store 更换后保持不变；
- Internal ID 是不承载业务含义的机器身份，当前阶段不指定 UUID、ULID 等具体编码格式；
- 项目内可读编号只作为 Display Key，例如 `CML-42`，可以按项目规则生成或调整，不能替代 Internal ID；
- Git Commit、Issue ID、CI Run ID、Deployment ID 等外部系统身份使用 External Reference 表达，不能作为 CimiLoop 对象主身份；
- 对象之间的协议引用使用 Internal ID，并按既有规则附带精确业务版本、Digest 或不可变记录 ID。

已确认的 Common Metadata（通用元数据）语义：

- 所有协议对象共同具备 Internal ID、Object Type、Schema Version、Project Scope、Created At 和 Source；
- Aggregate Revision 只出现在需要乐观并发控制的可变聚合上；
- Domain Version 只出现在 Contract、Plan 等正式业务版本对象上；
- Digest 只出现在不可变内容、Manifest 或外部内容引用上；
- Actor/Producer 只出现在行为、判断、观察或生成记录上；
- Change ID 只出现在 Change 范围内对象上，项目级定义不强制携带；
- 不要求每个对象同时拥有 Version、Revision 和 Digest，字段是否存在由对象语义决定。

已确认的时间语义：

- `created_at` 表示 CimiLoop 创建协议对象或记录的时间；
- `occurred_at` 表示外部动作或领域事实实际发生的时间，允许早于 created_at；
- `effective_at` 表示 Assignment、Policy、Decision 或 Exception 等授权从何时生效，按对象需要使用；
- `expires_at` 表示授权、例外或其他有时效对象何时失效，按对象需要使用；
- CimiLoop 内部时间统一保存为 UTC，交互界面按用户时区显示；
- Event 的可靠顺序由 Event Sequence 确定，不能只按时间戳排序；
- 缺少可信外部发生时间时，occurred_at 保持未知，不能使用 created_at 冒充。

已确认的 Source（来源）语义：

- Common Metadata 中的 Source 使用结构化 Source Descriptor，不使用自由文本作为唯一来源描述；
- `origin` 表示事实最初来自哪个权威系统或渠道，例如 Git、Runtime、CI、DevOps、Human 或 CimiLoop；
- `producer` 表示实际产生内容或行为的 Actor、Agent Run、Tool、CI Run 等主体；
- `recorder` 表示将事实写入 CimiLoop 的 Kernel 或 Adapter；
- origin、producer 和 recorder 可以相同，也可以分别指向不同主体；
- 自由文本来源说明只作为补充，不能替代稳定对象引用、External Reference 或结构化来源类型。

已确认的 External Reference 语义：

- External Reference 的稳定身份由外部系统类型、外部系统实例、资源类型和外部 ID 共同确定；
- Locator/URL 是可变定位信息，不作为外部事实的唯一身份；
- External Reference 可以附带外部版本或 Revision、内容 Digest、最后核对时间和 Adapter ID；
- 同一 CimiLoop 对象可以关联多个 External Reference，但既有引用不得被静默重映射到另一个外部资源；
- External Reference 不得包含访问令牌、凭据、签名 URL 或其他秘密；
- 外部资源移动或 URL 改变时只更新定位信息；暂时无法访问时标记 Unavailable，不声明原事实不存在。

已确认的 Digest（内容摘要）语义：

- Digest 使用结构化表达，至少包含摘要算法、摘要值和摘要所针对的 Subject；
- 对 JSON、Manifest 等需要规范化的内容，Digest 同时声明 Canonicalization（规范化规则）；
- 只有算法和规范化方式一致的 Digest 才能直接比较；
- Git、Artifact Registry 等权威系统已有可信 Digest 时优先引用其结果；
- CimiLoop 无法取得原始内容时，不得声称已经自行重新计算或验证 Digest；
- 摘要算法允许演进，算法不能隐藏在字段名或默认约定中；
- Digest 证明内容一致性，不等同于数字签名、身份认证或来源真实性证明。

已确认的 Schema Version 作用域：

- 每种序列化对象按 Object Type 独立维护自己的 Schema Version；
- Export/Import Manifest 使用独立的 Manifest Schema Version 描述包结构；
- 修改一种对象的结构不要求其他对象同步升级 Schema Version；
- Schema Version 只描述数据结构，不表示 Contract、Plan 等业务内容版本；
- 读取端根据 Object Type 与 Schema Version 选择兼容或迁移逻辑；
- 不设置一个迫使全部协议对象同步升级的单一全局 Schema Version。

已确认的 Schema 兼容与历史迁移语义：

- 新增可选字段且旧读取端可以安全忽略时，可以作为兼容扩展；
- 删除字段、改变字段含义、改变必填性或改变结构时，必须产生新的对象 Schema Version；
- Event、Decision、Evidence、Agent Run、Gate Evaluation、Transition 等不可变历史记录保留原始 Payload 与原 Schema Version；
- 读取时通过 Upcaster（向上转换器）将旧 Payload 映射为当前逻辑模型，不批量改写历史 Ledger；
- 无法安全转换时返回 Unsupported Schema，不得猜测、静默丢字段或伪造默认值；
- Current State 和 Derived Read Model 可以迁移或重建，但不能反向修改不可变历史；
- Export/Import 保留对象原始 Schema 信息和必要转换来源，使迁移后的对象仍可追溯原记录。

已确认的扩展字段语义：

- 核心对象顶层字段使用严格 Schema，拼写错误或未知顶层字段必须报错；
- Adapter、外部框架和项目自定义信息统一放入命名空间化的 `extensions`；
- 扩展键必须带稳定命名空间，避免不同提供方发生字段冲突；
- Kernel 不理解扩展内容时可以保留和转发，但不能依据未知扩展修改核心状态；
- Extension 不能覆盖核心字段，也不能绕过 Policy、Gate、权限或版本规则；
- 旧读取端可以保留未知扩展；不理解较新核心 Schema 的旧写入端不得重写对象并丢失未知核心字段。

已确认的 Object Reference（对象引用）语义：

- CimiLoop 内部对象引用统一使用 Typed Reference，至少包含 Object Type 与 Internal ID；
- Contract、Plan 等版本化对象的引用必须附精确 Domain Version；
- Artifact 等需要绑定具体内容的引用必须附 Digest；
- 不可变事实记录使用 Object Type 与记录 ID 引用；
- Aggregate Revision 不进入普通引用，只用于 Command 的并发前置条件；
- Display Key、名称和标题不复制进引用，由 Read Model 在展示时解析；
- CimiLoop Object Reference 与 External Reference 使用不同结构，不能混用。

已确认的 Command Envelope 最小语义：

- Command Envelope 包含 Command ID、Command Type、Schema Version、Project Scope、可选 Change Reference、Actor Reference、acting role、Target Reference、Expected Revision、Idempotency Key、Requested At、Source、Correlation ID、Causation ID 和业务 Payload；
- Command Type 必须表达业务动作，例如 approve contract，禁止使用通用 set status；
- Envelope 只表达请求，不包含动作已经成功的结论；
- Actor 不能通过 Payload 自行声明权限，授权由 Assignment、Policy 和当前状态求值；
- 相同作用域内重复 Idempotency Key 必须返回原处理结果，不重复产生副作用；
- Expected Revision 过期时拒绝写入，并要求调用方重新读取和求值；
- 每个 Command 只指定一个主要写入聚合，跨聚合后续动作由 Kernel 事务、Event 和 Outbox 协调。

已确认的 Event Envelope 最小语义：

- Event Envelope 包含 Event ID、Event Type、Schema Version、Project Scope、可选 Change Reference、Subject Reference、Aggregate Reference、提交后的 Aggregate Revision、Occurred At、Created At、Source、可选 Actor/Producer Reference、Command Reference、Correlation ID、Causation ID、Sequence 和业务 Payload；
- Event Type 使用已经发生的事实语义，例如 contract approved，不能使用命令式名称；
- Event 一经提交不可修改，并只声明一个主要 Subject/Aggregate；
- Payload 不复制 Contract、Plan 或 Actor 的完整内容，只保存必要快照和 Typed Reference；
- Event 不承载凭据、秘密、大型日志或二进制内容。

### 6.9 阶段 C 后续议题

- 通用对象元数据、来源、时间和 Digest 语义；
- External Reference 与对象引用结构；
- Contract、Plan、Task、Risk、Work Item 和 Run 的最小字段；
- Claim、Evidence、Gate、Decision、Transition 与 Event 的最小字段；
- Release、Deployment、Failure、Blocker、Feedback 和 Learning Candidate 的最小字段；
- Schema Version 演进、兼容性和 Export/Import 引用完整性。

## 7. 阶段 D：Change 端到端运行流程

状态：**进行中**。

阶段 D 定义 Change 从创建到关闭的完整状态迁移、各节点输入/输出、Gate、人工决策、异常与恢复规则。字段级 Schema 的剩余细节由已确认领域语义继续推导，不再逐字段阻塞流程讨论。

### 7.1 第一轮：Change 创建与 N1 意图契约

状态：**进行中**。

已确认的 Change 创建边界：

- 普通对话、头脑风暴和未确认建议不自动创建 Change；
- 用户明确请求创建，或确认 Agent 提出的创建建议后，立即生成 Draft Change；
- Draft 创建时生成稳定 Change ID、指定唯一 Human Change Owner，并保存原始诉求的摘要与来源引用；
- Draft 允许 Contract、Risk、Profile 和 Owner 信息尚未完整，后续澄清在该 Change Room 内持续补齐；
- Draft 阶段产生的 Feedback、Agent Run、Spike、Decision Request 和 Evidence 均归属该 Change；
- Contract 获授权前，只允许澄清、只读分析和明确授权的受限 Spike，不允许进入正式实现。

已确认的 Change Profile 确认时点：

- Draft 创建时由 Agent 建议 Provisional Profile（暂定类型），用于选择澄清问题、风险维度和候选路径；
- Agent 必须说明 Profile 建议依据，不能自行把高风险 Change 归类为低风险类型；
- Draft 阶段 Human 可以调整 Provisional Profile，调整后重新计算澄清项和初步 Gate 要求；
- Intent Decision 批准当前 Contract Version 时，由 Human 同时确认正式 Change Profile ID 与版本；
- 正式 Profile 成为当前 Contract 授权边界的一部分；
- Contract 批准后的 Profile 变化必须提交 Contract Amendment，并执行影响评估与相应授权。

已确认的意图审核（Intent Review）结果：

- 批准（approve）：将当前 Contract Candidate 固化为正式 Contract Version，同时确认正式 Profile；Kernel 基于最新条件重新执行 Gate，满足后执行 `Draft → IntentReady`；
- 请求修改（request changes）：Change 保持 `Draft + Active`，关闭本次 Decision Request，生成结构化 Feedback，继续修改同一个 Contract Candidate，完成后重新发起审核；
- 拒绝（reject）：不自动取消或删除 Change；Change 保持 Draft，但运行状况进入暂停（Paused）并记录拒绝理由；
- 拒绝后由 Change Owner 明确选择修改意图并恢复，或提交取消 Change 的 Command；
- 首个 Contract Candidate 只有在批准后才成为正式 Contract v1，审核中的修改不产生多个正式 Contract Version。

已确认的意图就绪到规划启动：

- Contract 获批准且 Gate 允许后，Change 进入意图就绪（IntentReady）；
- 默认不等待用户再次点击，Kernel 自动创建规划工作项（Planning Work Item）；
- 自动规划的前提是不存在阻塞项（Blocker）、暂停（Paused）、预算限制、Profile 路径限制或 Planner/Runtime 不可用；
- Planner Agent 生成技术方案、任务图（Task DAG）、验证策略和影响分析后，提交执行计划审核（Plan Review）；
- 自动规划不等于自动实现，V1 监督模式（A1）下必须由技术负责人（Technical Owner）批准计划后才能正式执行；
- Project Policy 可以配置“契约批准后暂停”，但默认策略是满足条件时连续推进。

已确认的计划细化策略：

- Plan 采用“全局覆盖 + 滚动细化”，不要求在首次实现前把所有 Task 一次性细化到底；
- 初始 Plan 必须覆盖整个 Change 的主要工作范围，形成完整高层 Task DAG，并说明关键依赖、风险、验证策略和恢复考虑；
- 即将执行的 Task 必须细化到能够生成有明确目标、范围、权限、预算和停止条件的 Work Item；
- 较远 Task 可以保持高层定义，在接近执行前补充细节；
- 不改变 Task 边界、依赖、权限、风险和验证策略的内部细化可以直接记录；
- 改变 Task 边界、DAG、权限、风险、预算或验证策略时，必须提交计划修订（Plan Amendment）。

已确认的 Plan 授权与执行启动：

- 技术负责人（Technical Owner）批准 Plan Version，即批准其中的 Task DAG、验证策略和声明的授权边界；
- Kernel 基于最新条件重新执行关卡检查（Gate Evaluation），允许后执行 `IntentReady → Planned`；
- 进入已规划（Planned）后，Kernel 自动识别依赖满足、范围已细化且权限明确的可执行任务（Ready Task）；
- Kernel 为 Ready Task 创建 Work Item，随后 Change 进入执行中（Executing）；
- Task 只有获得 Work Item 后才能执行，Agent 不能直接领取或执行裸 Task；
- 普通 Task 不重复进行逐项人工审批；高风险、不可逆或 Policy 指定的 Task 可以增加单独人工关卡；
- Plan 批准后出现范围、权限、风险或验证策略变化时，必须通过 Plan Amendment 或 Contract Amendment 重新授权。

已确认的 Task 级循环与 Change 级状态：

- Task、Work Item 和 Agent Run 维护各自执行、验证和失败状态，不用每次局部变化驱动 Change 生命周期迁移；
- 只要当前 Plan 仍有实现任务推进，Change 通常保持执行中（Executing）；
- Task 级测试或内部检查失败只更新对应 Task、Run 和 Failure，并在原授权范围内重试或修复；
- 当当前 Plan 的阻塞 Task 全部完成，并形成完整 Artifact Candidate 与 Delivery Evidence 后，Change 才进入评价中（Evaluating）；
- 独立 Evaluator 对完整候选交付进行 Change 级评价；
- Change 级评价失败时执行 `Evaluating → Executing`，并创建关联失败 Evidence 的修复工作项（Repair Work Item）。

### 7.2 状态机场景核对

状态：**已完成**。

已完成普通 Feature、评价失败修复、测试失败重建 Artifact、Release Decision 过期、生产 Deployment 结果未知、生产恢复、Incident 应急恢复、Experiment 提前结束、Pause/Cancel/Supersede 和跨 Change 依赖场景核对。

Incident 采用“压缩流程、不跳过语义”：可以快速通过 IntentReady 与 Planned，但执行前必须形成最小应急 Contract、最小应急 Plan、Gate、Decision 和一次性权限；恢复后强制补齐详细材料、Evidence、核对与复盘，且不得用事后补录替代事前最小授权。

### 7.3 后续阶段

- **阶段 E**：角色模型、职责权限矩阵、人机与多 Agent 协作规则；
- **阶段 F**：Context & Knowledge、能力装配、Verification & Evidence、DevOps、Workbench、存储与 Teams 演进；
- **阶段 G**：开源能力 Build / Adopt / Adapt 矩阵、V1 范围、里程碑和验收计划。

## 8. Parking Lot

整体能力架构确认前只记录、不继续下钻：

- CodeGraph 的 worktree 索引策略；
- OpenSpec Adapter 字段映射和调用方式；
- `grill-with-docs` 的 Prompt 与 Context Pack 模板；
- Superpowers 的 Skill 组合；
- 飞书知识同步协议；
- CLI 命令和仓库目录树；
- UI 页面与技术栈；
- Store、Event Ledger 和服务化部署选型。

## 9. 决策记录

| 编号 | 主题 | 状态 | 结论 |
|---|---|---|---|
| D-001 | 讨论顺序 | 已确认 | 先完成整体能力架构，再讨论协议、流程细节和开源融合。 |
| D-002 | 产品定位 | 已确认 | 首要定位为 AI Native 软件研发 Harness。 |
| D-003 | 产品组成 | 已确认 | 由 Protocol、Kernel、Operator Surface、Adapter & Capability 四层组成。 |
| D-004 | 架构不变量 | 已确认 | 十项不变量作为后续设计的强约束。 |
| D-005 | CodeGraph | 暂停 | 作为 Context & Knowledge 候选能力进入 Parking Lot。 |
| D-006 | Change Room | 已确认 | 每个 Change 拥有唯一逻辑协作空间，各交互渠道是其不同入口，项目看板只做跨 Change 汇总。 |
| D-007 | Solo Mode Change Room | 已确认 | 个人模式实现本地单用户的事件驱动详情页，不实现聊天、实时多人协作和外部协作平台同步。 |
| D-008 | Change Room 时间线 | 已确认 | 默认展示生命周期事件，具体 Agent Run 内展示完整技术执行日志。 |
| D-009 | 结构化人工决策 | 已确认 | 影响状态、权限、例外或生产操作的决定必须通过 Decision 提交，评论和聊天不能作为正式授权。 |
| D-010 | Human Actor 与角色 | 已确认 | V1 建立本地 Human Actor，正式决策同时记录 actor_id 和 acting_role，并保留职责分离信息。 |
| D-011 | Agent Actor | 已确认 | Human 与 Agent 使用统一 Actor 抽象并区分类型；Agent 关联 Profile、Role、Run，不能行使人类最终授权权力。 |
| D-012 | V1 协作信息 | 已确认 | V1 不建设聊天系统；保存结构化 Feedback、Decision、Artifact、Evidence 及必要对话摘要和引用。 |
| D-013 | 双模式部署 | 已确认 | 同一协议和内核支持 Embedded Solo Mode 与 Shared Team Mode；本地执行不等于协作数据必须只保存在本地。 |
| D-014 | 发布顺序 | 已确认 | V1 先完整交付 Solo Mode，同时预留 Store 替换、稳定 ID、事件协议和项目导入导出；Team Mode 后续实现。 |
| D-015 | Project Workbench | 已确认 | 采用 Attention-first 与 Change 生命周期看板；项目卡片是 Change，N1–N5 不直接作为看板列。 |
| D-016 | 统一交互接口 | 已确认 | 所有入口统一使用 Query/Command；只有 Kernel 可以接受 Command 并执行状态修改。 |
| D-017 | 通知模型 | 已确认 | 通知是 Event 的派生投影，已读不等于 Decision；V1 提供 Workbench 内和可选桌面通知。 |
| D-018 | 交互与协作能力域 | 已确认 | Change Room、Workbench、Actor、Feedback/Decision、Query/Command、通知及 Solo/Team 演进边界已完成一级能力确认。 |
| D-019 | 生命周期路径模型 | 已确认 | 采用稳定生命周期骨架与 Profile 驱动路径，不采用单一固定流程或完全自由工作流。 |
| D-020 | Change 多维状态 | 已确认 | 分离 lifecycle_state、flow_condition、delivery_status、outcome_status，等待和失败不覆盖生命周期位置。 |
| D-021 | 状态迁移协议 | 已确认 | 禁止直接 setStatus；迁移请求经迁移守卫求值，Kernel 原子提交状态、事件和后续任务。 |
| D-022 | Gate 要求模型 | 已确认 | Gate 要求由核心、Profile、风险、环境、项目 Policy 与 Contract 组合并版本化，变化时检查 Evidence 失效。 |
| D-023 | Work Item 调度 | 已确认 | Kernel 调度有边界且版本绑定的 Work Item；Runtime 创建 Agent Run，Run 成功不等于 Change 可迁移。 |
| D-024 | Task DAG 变更控制 | 已确认 | Task 内细节可自主调整；结构性变化走 Plan Amendment；意图和验收变化走 Contract Amendment。 |
| D-025 | 失败与重试 | 已确认 | 按失败类型选择自动重试、修复、升级或状态核对；每次尝试保留独立 Run，所有循环受预算限制。 |
| D-026 | 并发控制 | 已确认 | 使用 Change Version、Work Item Lease 和 Resource Lock 三层控制；状态不明时先核对再重新分配。 |
| D-027 | 向前恢复语义 | 已确认 | 生命周期历史只追加；Pause、Cancel、Supersede、Rollback、Compensation 都通过新动作和 Event 表达。 |
| D-028 | Kernel 持久化 | 已确认 | 使用 Current State、append-only Event Ledger、Transactional Outbox 和可重建 Read Model，不采用纯 Event Sourcing。 |
| D-029 | 调度与 WIP | 已确认 | 人类决定 Change 优先级；Kernel 在 WIP、DAG、风险和资源约束内确定性调度，V1 不做复杂智能优化。 |
| D-030 | 生命周期内核能力域 | 已确认 | 生命周期、迁移、Gate、调度、修订、失败恢复、并发、持久化与 WIP 的一级能力边界已完成。 |
| D-031 | Agent 运行模型 | 已确认 | 使用 Orchestrator 与按需临时角色 Session，Evaluator 与 Executor 保持上下文隔离。 |
| D-032 | Context Pack | 已确认 | 每个 Agent Run 使用与 Change、Contract 和 Work Item 绑定的版本化 Context Pack。 |
| D-033 | 知识可信度 | 已确认 | 知识按权威级别分类并记录来源、版本和新鲜度；权威冲突必须升级。 |
| D-034 | 能力装配 | 已确认 | Kernel 声明能力需求，Capability Resolver 按 Policy 选择具体 Skill、Tool、Model 或 Adapter。 |
| D-035 | 角色化上下文 | 已确认 | Context Pack 按角色提供最小必要上下文，Evaluator 不继承 Executor 的完整推理。 |
| D-036 | Context Pack 版本 | 已确认 | Context Pack 是不可变快照，源变化生成新版本并按关键性处理旧 Run。 |
| D-037 | Memory 分层 | 已确认 | 分离 Run、Change、Project Memory；运行观察需审查与评测后才能晋升项目知识。 |
| D-038 | V1 知识范围 | 已确认 | V1 使用 Change、Repo、Code/Git、Policy、Run 与测试信息；外部知识和 CodeGraph 后续适配。 |
| D-039 | 智能能力边界 | 已确认 | Agent/Skill 只提交候选结果，不能直接改变权威状态、权限、Policy 或全局知识。 |
| D-040 | 智能与上下文能力域 | 已确认 | 角色 Session、Context Pack、知识可信度、能力装配、Memory 治理与 V1 边界已完成。 |
| D-041 | Workspace 隔离 | 已确认 | 默认每个 Change 使用独立 Worktree，并行子 Worktree 只在依赖和范围清晰时使用。 |
| D-042 | Runtime Adapter | 已确认（由 D-130 更新具体实现） | Kernel 下发 Work Item，Agent Runtime 负责真实执行；权限显式声明，凭据不进入 CimiLoop 记录。 |
| D-043 | Artifact 晋升 | 已确认 | Artifact Candidate 不可变；测试验证与生产使用同一 Digest，代码变化后重新构建和验证。 |
| D-044 | DevOps Adapter | 已确认 | 使用统一环境接口并复用现有 DevOps，外部状态不明时先 reconcile。 |
| D-045 | 测试到生产闭环 | 已确认 | 测试环境自动修复循环，生产发布显式批准并即时验证；长期生产观察后续接入。 |
| D-046 | 工程执行与交付能力域 | 已确认 | Workspace、Runtime、Artifact、DevOps 和环境晋升的一级能力边界已完成。 |
| D-047 | Claim–Evidence | 已确认 | Evidence 明确证明对象、来源、版本、新鲜度和范围；原始日志不自动等于有效证据。 |
| D-048 | 分层独立评价 | 已确认 | 组合确定性工具、独立 Evaluator 与 Human Review，评价独立性随风险增强。 |
| D-049 | 风险与 Policy | 已确认 | 使用多维风险画像和确定性 Policy；Agent 可建议但不能自行降低风险。 |
| D-050 | Human Approval | 已确认 | Approval 结构化且绑定版本和环境；高风险场景执行与批准职责分离。 |
| D-051 | Exception | 已确认 | 例外具有范围、期限、Owner 和补偿措施，不自动升级为长期 Policy。 |
| D-052 | 信任与治理能力域 | 已确认 | Evidence、独立评价、风险、Policy、Approval、Exception 与审计边界已完成。 |
| D-053 | Protocol 范围 | 已确认 | Protocol 定义稳定领域语义，不绑定具体文件、数据库或传输格式。 |
| D-054 | ID 与版本 | 已确认 | 核心对象使用稳定内部 ID、对象版本、Schema Version、来源和 Digest；外部 ID 仅作引用。 |
| D-055 | 数据权威 | 已确认 | CimiLoop、Git、Runtime、CI/CD/DevOps 分别保存其权威事实，通过引用和 Digest 聚合。 |
| D-056 | Store Port | 已确认 | Kernel 依赖逻辑 Store Port；Solo 与 Team 使用不同实现并支持项目迁移。 |
| D-057 | Adapter 契约 | 已确认 | 外部能力通过声明式 Adapter 及 Command/Query/Event 接入，不能直写 Kernel Store。 |
| D-058 | 协议、数据与集成能力域 | 已确认 | Protocol、身份版本、数据权威、Store、Adapter 与 V1 最小集成边界已完成。 |
| D-059 | 整体能力架构 | 已确认 | 六个一级能力域、核心运行闭环、权威关系、Solo/Team 拓扑和后续设计顺序已确认。 |
| D-060 | Project、Change 与 Change Room 聚合边界 | 已确认 | Project 与 Change 分别是聚合根；Change Room 是与 Change 一一对应的交互与查询投影，不拥有事实对象或写入权威。 |
| D-061 | Change Contract 聚合与版本 | 已确认 | Contract 从属于 Change 但独立版本化；Change 引用当前生效版本，Amendment 产生不可变新版本并保留完整历史。 |
| D-062 | Plan、Task、Work Item 与 Agent Run 边界 | 已确认 | Plan 是独立版本化聚合，Task 属于 Plan；Work Item 是执行授权聚合，Agent Run 是独立执行尝试，均绑定执行时有效版本。 |
| D-063 | Artifact、Claim、Evidence 与 Gate Evaluation | 已确认 | Artifact 是不可变工件，Claim 是待证明命题，Evidence 是不可变观察；Gate Evaluation 基于版本化要求和证据形成快照，Kernel 仍是迁移权威。 |
| D-064 | Actor、Role、Assignment 与 Decision | 已确认 | Actor、Role 与作用域化 Assignment 分离；Decision 记录实际 Actor、行权角色、目标版本及当时授权依据，权限由 Policy 动态求值。 |
| D-065 | 跨聚合引用 | 已确认 | 跨聚合统一使用稳定 ID 与精确业务版本引用；Change 保存当前生效版本指针，历史对象保留原始版本引用且不自动追随最新版。 |
| D-066 | Change 内版本模型 | 已确认 | 主要业务版本仅为 Contract Version 与 Plan Version；Artifact 使用不可变 ID 和 Digest，运行事实使用独立记录 ID；Revision、Schema Version 与 Event Sequence 作为分离的内部技术标识。 |
| D-067 | Contract Amendment 与版本生成 | 已确认 | Amendment 是独立修订提案；批准后才基于父版本生成并启用新的不可变 Contract Version，未批准提案保留审计记录但不占正式版本号。 |
| D-068 | Plan Version 与 Task 身份 | 已确认 | Plan 修订产生新版本；任务含义与边界不变时沿用稳定 Task ID，拆分、合并或目标变化时创建新 ID 并保留谱系关系。 |
| D-069 | 版本变化与精确影响评估 | 已确认 | Contract/Plan 新版本不触发全量级联失效；Kernel 将下游对象判定为 Valid、Stale 或 Superseded，并保存影响范围与判断依据。 |
| D-070 | 关闭、归档与清除 | 已确认 | Project/Change 关闭或归档不级联删除历史；V1 不提供常规硬删除，未来清除或脱敏必须受控授权并保留审计占位记录。 |
| D-071 | Command 与 Event 边界 | 已确认 | Command 是可能被接受或拒绝的行动请求；Event 是已经提交且不可改写的事实，两者使用不同语义且不能相互替代。 |
| D-072 | Transition Request 定位 | 已确认 | Transition Request 是具有生命周期语义的领域 Command；它只表达迁移意图，Kernel 完成 Gate 求值并原子提交后迁移才成为事实。 |
| D-073 | Gate 与 Gate Evaluation | 已确认 | Gate 是稳定命名的准入规则，不保存运行状态；每次检查产生不可覆盖的 Gate Evaluation，实际迁移引用直接支撑它的求值记录。 |
| D-074 | Decision 与状态迁移 | 已确认 | Decision 是 Gate 的不可变输入而非状态修改指令；记录后必须基于最新事实重新求值，只有 ALLOW 才能执行 Transition。 |
| D-075 | Transition Record、Current State 与 Event | 已确认 | 成功迁移创建不可变 Transition Record；Current State 表达当前位置，ChangeTransitioned Event 传播已提交事实，三者职责分离。 |
| D-076 | 跨 Change 关系 | 已确认 | Change 之间通过显式类型关系连接，不形成可级联控制状态的父子聚合；每个 Change 保持独立 Owner、Contract、生命周期与证据链。 |
| D-077 | Change Supersede 语义 | 已确认 | supersedes 关系只表达取代提案；完成运行、副作用、未完成事项和责任核对且 Gate 允许后，Kernel 才将旧 Change 迁移为 Superseded。 |
| D-078 | Retry、Agent Run 与 Work Item | 已确认 | 授权边界未变时在原 Work Item 下创建新 Run；版本、目标、范围、权限或预算变化时创建新 Work Item，外部结果未知时先 Reconciliation。 |
| D-079 | Gate Re-evaluation | 已确认 | 有效输入完全相同时复用原 Gate Evaluation；输入变化时创建新 Evaluation 并关联前次记录，兼顾幂等性与完整求值历史。 |
| D-080 | 跨 Change 依赖与 Blocked | 已确认 | depends-on 先约束具体工作的 Ready 状态；仅当 Change 无其他可推进工作时才标记 Blocked，且依赖必须具有可确定求值的满足条件。 |
| D-081 | Protocol 对象三层分类 | 已确认 | 协议对象分为权威领域对象、不可变事实记录和派生查询模型；前两者构成协议事实，Read Model 可重建且不能成为写入权威。 |
| D-082 | Risk Profile 与 Risk Assessment | 已确认 | Risk Profile 是 Change 下独立权威对象；每次评估形成不可变记录，Change 指向当前结果，风险变化不强迫 Contract 升版。 |
| D-083 | Change Profile 身份与版本 | 已确认 | Change Profile 是 Project Policy 管理的版本化规则定义；Change 引用精确 Profile ID 与版本，新版本必须经显式影响评估才能作用于运行中的 Change。 |
| D-084 | Project Policy 与求值快照 | 已确认 | Project Policy 使用版本化定义；关键授权与 Gate 保存实际 Policy Snapshot，新规则不得改写历史，强制红线阻止后续动作时必须留下影响记录。 |
| D-085 | Environment、Release 与 Deployment | 已确认 | Environment 是 Project 级目标定义，Release 是绑定 Artifact、环境、恢复策略和授权的 Change 级发布对象，Deployment 是一次不可变执行尝试。 |
| D-086 | Core、Runtime 与 Adapter Protocol 边界 | 已确认 | Cimi Change Protocol 定义可移植业务事实；Lease、Lock、Outbox 等属于 Kernel Runtime Protocol，外部调用契约属于 Adapter Protocol。 |
| D-087 | Agent Run 协议边界 | 已确认 | 核心协议保存可移植 Run Record；完整 Transcript、工具调用和命令输出留在 Runtime，以 External Reference 和 Digest 关联，关键结论提升为业务事实。 |
| D-088 | Context Pack 协议边界 | 已确认 | 核心协议保存不可变 Context Pack Manifest；大内容留在原始权威来源，以引用、权威级别和 Digest 描述，来源丢失时明确标记不可用。 |
| D-089 | Feedback 与 Conversation 边界 | 已确认 | 结构化 Feedback 进入核心协议但不具有授权效力；原始 Conversation 留在 Runtime/外部系统，只保存必要摘要与引用，正式授权必须形成 Decision。 |
| D-090 | Failure、Blocker 与 Attention Item | 已确认 | Failure 是不可变失败事实，Blocker 是当前可解除条件，Attention Item 是可重建查询投影，三者职责分离。 |
| D-091 | V1 项目与治理基础对象 | 已确认 | Project、Change Profile、Policy、Environment、Actor、Role、Assignment 进入 V1 核心协议；Solo Mode 可使用轻量内置实现。 |
| D-092 | V1 Change 定义与计划对象 | 已确认 | Change、Change Relationship、Contract/Amendment、Risk Profile/Assessment、Plan/Amendment 和 Task 进入 V1 核心协议。 |
| D-093 | V1 执行与交付对象 | 已确认 | Work Item、Agent Run Record、Context Pack Manifest、Artifact、Release 和 Deployment 进入 V1 核心协议；运行协调与大对象留在各自权威系统。 |
| D-094 | V1 信任、Gate 与授权对象 | 已确认 | Claim、Evidence、Gate/Requirement Set/Evaluation、Decision Request/Decision、Policy Exception 和 Transition Record 进入 V1 核心协议；Approval 统一为 Decision 类型。 |
| D-095 | V1 协作、异常与审计对象 | 已确认 | Event、Failure、Blocker、Feedback、可选 Conversation Summary 和 Learning Candidate 进入核心协议；External Reference 与 Command Envelope 作为通用构件。 |
| D-096 | 全局稳定内部 ID | 已确认 | 所有核心对象使用全局稳定、不可变且无业务含义的 CimiLoop Internal ID；Display Key 与 External Reference 分离，具体编码格式后续选择。 |
| D-097 | Common Metadata | 已确认 | 所有对象共享精简通用元数据；Revision、Domain Version、Digest、Actor/Producer 和 Change ID 按对象语义选择性出现，不对所有对象一刀切。 |
| D-098 | 时间语义 | 已确认 | 区分 created_at、occurred_at、effective_at 与 expires_at；内部统一 UTC，事件顺序使用 Event Sequence，未知外部发生时间不得伪造。 |
| D-099 | Source Descriptor | 已确认 | Source 使用结构化描述并区分 origin、producer 与 recorder；自由文本只能补充，不能替代稳定引用和来源类型。 |
| D-100 | External Reference 身份 | 已确认 | 外部引用以系统类型、系统实例、资源类型和外部 ID 作为稳定身份；URL 仅作可变定位且不得包含凭据。 |
| D-101 | Digest 语义 | 已确认 | Digest 结构化记录算法、值、Subject 和必要规范化规则；只证明内容一致性，不等同于签名或来源真实性。 |
| D-102 | Schema Version 作用域 | 已确认 | 每种 Object Type 独立维护 Schema Version，Export/Import Manifest 单独版本化；不使用迫使所有对象同步升级的全局 Schema Version。 |
| D-103 | Schema 兼容与历史迁移 | 已确认 | 不可变历史保留原 Payload 与 Schema Version，通过 Upcaster 读取；Current State/Read Model 可迁移或重建，但不得反向改写 Ledger。 |
| D-104 | Schema 扩展字段 | 已确认 | 核心顶层字段严格校验；外部扩展使用带命名空间的 extensions，未知扩展可保留转发但不能覆盖核心字段或控制状态。 |
| D-105 | Typed Object Reference | 已确认 | 内部引用使用 Object Type + Internal ID；按对象语义附精确 Domain Version 或 Digest，普通引用不携带 Revision 或展示字段。 |
| D-106 | Command Envelope | 已确认 | 所有写入使用统一 Envelope，承载身份、作用域、目标、并发、幂等和因果信息；业务参数进入 Payload，每个 Command 只有一个主要写入聚合。 |
| D-107 | Event Envelope | 已确认 | 所有领域事件使用统一 Envelope，承载主体、聚合、版本、时间、来源、因果与顺序信息；Event Type 使用已发生事实语义且 Payload 不复制完整对象。 |
| D-108 | Draft Change 创建边界 | 已确认 | 普通对话不自动创建 Change；用户明确创建或确认 Agent 建议后立即生成 Draft，后续澄清和受限分析归入其 Change Room，授权前不得正式实现。 |
| D-109 | Change Profile 确认时点 | 已确认 | Draft 使用 Agent 建议的 Provisional Profile 引导澄清；Intent Decision 批准 Contract 时由 Human 正式确认，之后变化走 Contract Amendment。 |
| D-110 | Intent Review 结果语义 | 已确认 | 批准生成正式 Contract Version 并经 Gate 进入 IntentReady；请求修改留在 Draft 继续完善；拒绝进入 Paused，由 Change Owner 明确修改恢复或取消。 |
| D-111 | IntentReady 自动启动规划 | 已确认 | 契约批准且无阻塞、暂停或能力限制时，Kernel 默认自动创建 Planning Work Item；V1 计划完成后仍须 Technical Owner 批准才能实现。 |
| D-112 | Plan 全局覆盖与滚动细化 | 已确认 | 初始 Plan 覆盖完整范围和高层 Task DAG，近期 Task 细化到可授权；后续滚动细化，结构性变化走 Plan Amendment。 |
| D-113 | Plan 授权与 Task 调度 | 已确认 | Plan Version 获批后普通 Task 不逐项人工审批；Kernel 只为满足依赖、细化和权限条件的 Ready Task 创建 Work Item，高风险任务可由 Policy 加 Gate。 |
| D-114 | Task 循环与 Change 宏观状态 | 已确认 | Task/Run 维护局部执行与验证状态；Change 在完整候选交付形成后才进入 Evaluating，Change 级评价失败再返回 Executing 并创建 Repair Work Item。 |
| D-115 | Incident 压缩应急路径 | 已确认 | Incident 不从 Draft 无语义跳转到 Executing；它可以快速通过 IntentReady 与 Planned，但执行前保留最小应急 Contract、Plan、Gate、Decision 与一次性权限，恢复后强制补齐 Evidence、核对、复盘和永久修复安排。 |
| D-116 | 角色重叠与职责分离 | 已确认 | Solo Mode 允许同一 Human Actor 兼任多个角色，每次 Decision 明确 acting_role；普通风险可按 Policy 连续批准，高风险或不可逆动作默认要求另一 Actor 复核，无法满足时仅可使用限时、限范围、增强 Evidence 并强制复盘的 break-glass。 |
| D-117 | 唯一当前 Change Owner | 已确认 | 每个 Change 从 Draft 到关闭始终有且只有一名当前 Human Change Owner；其对推进与闭环负责但不自动拥有全部批准权，负责人可经审计化移交，Incident Commander 也只有在正式移交后才取代该责任。 |
| D-118 | 责任角色缺失与代行 | 已确认 | 所需角色未指派或不可用时进入 AwaitingDecision，Change Owner 不自动获得代行权；必须显式指派或限时委托，Solo Mode 也要记录 acting_role，职责分离冲突只能等待其他 Actor 或使用合规 break-glass。 |
| D-119 | 人类责任角色与可执行角色 | 已确认 | V1 中 Project/Change/Intent/Technical/Release/Policy Owner 与 Incident Commander 只能由 Human Actor 承担；Planner、Executor、Evaluator、Operator 可由 Human 或 Agent 承担，未来提高自治等级只调整授权策略，不伪装或重写责任主体。 |
| D-120 | Executor 与 Evaluator 独立性 | 已确认 | Executor 可以运行测试并提交自检 Evidence，但不能自证正式通过；正式 Evaluation 至少来自不同且上下文隔离的 Evaluator Run，风险升高时由 Policy 要求不同 Profile、Actor 或确定性工具，且评价通过不替代 Release Owner 的发布决定。 |
| D-121 | Project 级与 Change 内角色指派权 | 已确认 | 新增 Human Project Owner 管理 Project 级责任角色 Assignment，但不代替这些角色作业务决定；Change Owner 仅能在 Policy 范围内安排当前 Change 的可执行角色，不能授予责任角色或扩大环境权限；Solo 创建者在建项时被显式初始化为 Project Owner。 |
| D-122 | Context & Knowledge 模型 | 已确认 | Agent Run 绑定不可变、可追溯且按角色最小化的 Context Pack；Run/Change/Project Memory 分层，权威按事实类型确定，来源变化精确传播，冲突复用 Claim/Evidence/Blocker/Decision Request，Run Observation 只有经过 Learning Candidate、评价和 Owner Decision 才能晋升项目知识。 |
| D-123 | Capability Assembly 模型 | 已确认 | 流程声明语义化 Capability Requirement，Resolver 按 Policy、权限、兼容性、可信与健康确定 Provider，并为每个 Run/操作生成不可变 Binding；运行中不静默替换实现，外部结果未知先 Reconciliation，关键结果提升为协议事实。 |
| D-124 | Verification & Evidence 模型 | 已确认 | 从 Contract/Policy/Risk 推导 Claim，Evidence 只记录支持、反驳或无法判定的不可变观察；Gate 按 Requirement Set、适用性、覆盖和独立性求值，未取得 Evidence 是缺口而非证据，反驳不能以数量投票覆盖，Human Decision 不能伪造事实。 |
| D-125 | Engineering Delivery & DevOps 模型 | 已确认 | Change 在隔离 Workspace 中形成不可变 Source Snapshot 与 Artifact；测试和生产晋升同一 Digest，Release 管授权、Deployment 管尝试，未知外部状态先 Reconciliation，Recovery/Compensation 作为新的受控动作保留完整历史。 |
| D-126 | Workbench & Change Room 交互模型 | 已确认 | Project Workbench 采用跨 Change 的 Attention-first 视图，Change Room 负责单 Change 闭环并以 Current Focus 驱动下一动作；Decision 结构化、Evidence 按 Claim 呈现，生命周期事件与 Run 技术日志使用双层时间线。 |
| D-127 | Storage & Solo-to-Team Evolution 模型 | 已确认 | Solo/Team 使用同一 Protocol 与 Kernel；Command 的状态、Event、Outbox 和幂等结果原子提交，Portable Import 先暂存校验且不自动合并分叉历史，Solo→Team 通过暂停、排空、核对、导入、激活和原实例只读封存避免双写。 |
| D-128 | V1 产品范围与实施里程碑 | 已确认 | V1 采用 Embedded Solo Mode 的窄范围完整闭环，以真实 Feature 主场景、八类异常路径、Feature/Bugfix/Incident 关键 Profile、M0–M5 纵向里程碑和可恢复/可审计/可移植 Definition of Done 作为范围基线。 |
| D-129 | Build / Adopt / Adapt 选型 | 已确认 | CimiLoop 核心 Build；SQLite、Git、Agent Skills 格式 Adopt；Runtime、DevOps 和外部能力经 Adapter 接入；Matt Skills 选择性适配；OpenSpec 降为可选 Spec Provider；CodeGraph、Multica 等延后。 |
| D-130 | V1 Agent Runtime | 已确认 | V1 首个 Runtime 从 Claude Code 或 OpenCode 中通过 spike 与契约测试选择一个；优先验证 OpenCode 以降低未来企业内部 cimicode 接入成本，若关键能力不满足则选择 Claude Code；cimicode 不再是 V1 前置依赖。 |
| D-131 | Change 知识闭环 | 已确认 | 每个 Change 执行 Knowledge Impact Assessment；受影响知识通过既有 Plan/Task/Work Item 分配给 Agent、开发者、业务或运维人员，以版本化 External Reference 和 Evidence 证明更新；Policy 决定阻塞 Release 或 Closure Gate，V1 使用 Human Work Item，不以前置飞书 Adapter 为条件。 |
| D-132 | V1 实现语言与运行平台 | 已确认 | 首版采用 TypeScript + Node.js；该选择只约束 CimiLoop V1 的工程实现，不改变 Cimi Change Protocol 的运行时中立性，也不把 Kernel 绑定到 Claude Code、OpenCode 或 cimicode。 |

## 10. 当前进度

- 阶段 A 产品边界与架构原则：已完成；
- 阶段 B 整体能力架构：已完成；
- 阶段 C 核心领域模型与 Cimi Change Protocol：已完成领域与协议语义设计；字段级 Schema 延后到实现设计，不再逐字段讨论；
- 阶段 D Change 端到端运行流程：已完成，主状态机、异常恢复语义和十类典型场景核对均已确认；
- 正式架构文档：`docs/architecture/CimiLoop整体能力架构-v0.1.md`、`docs/architecture/CimiChangeProtocol核心领域模型-v0.1.md`；
- 状态机确认稿：`docs/architecture/CimiLoopChange端到端状态机-v0.1.md`；
- 角色与权限模型确认稿：`docs/architecture/CimiLoop角色与权限模型-v0.1.md`；
- Context & Knowledge 模型确认稿：`docs/architecture/CimiLoop上下文与知识模型-v0.1.md`；
- Capability Assembly 模型确认稿：`docs/architecture/CimiLoop能力装配模型-v0.1.md`；
- Verification & Evidence 模型确认稿：`docs/architecture/CimiLoop验证与证据模型-v0.1.md`；
- Engineering Delivery & DevOps 模型确认稿：`docs/architecture/CimiLoop工程交付与DevOps模型-v0.1.md`；
- Workbench & Change Room 交互模型确认稿：`docs/architecture/CimiLoop工作台与变更空间交互模型-v0.1.md`；
- Storage & Solo-to-Team Evolution 模型确认稿：`docs/architecture/CimiLoop存储与Solo-Team演进模型-v0.1.md`；
- V1 产品范围与实施里程碑基线：`docs/plans/2026-09-19-cimiloop-v1产品范围与实施里程碑-v0.1.md`；
- Build / Adopt / Adapt 选型基线：`docs/plans/2026-09-19-cimiloop-build-adopt-adapt选型矩阵-v0.1.md`；
- 面向非专业读者的整体讲解基线：`docs/architecture/CimiLoop整体架构通俗解读-v0.1.md`；
- 下一步：基于已确认的 TypeScript + Node.js 进入实施架构与 M0 技术设计，先确定代码结构、协议 Schema 边界、Store Port、Command/Event Envelope 与首个纵向切片；M2 前完成 OpenCode/Claude Code Runtime Adapter spike；
- 阶段 E：已完成；阶段 F：已完成；阶段 G：已完成，V1 范围、里程碑和开源能力 Build / Adopt / Adapt 组合已经确认。
