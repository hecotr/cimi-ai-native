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

## 3. 已确认基线

- 产品名称为 **CimiLoop**，CLI 名称为 `cimi-loop`；
- cimicode 是 Agent Runtime；CimiLoop 是独立于具体 Runtime 的 AI Native 软件研发 Harness；
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
- **cimicode** 运行 Agent、调用工具并执行具体任务；
- **Agent** 完成推理、澄清、规划、编码、分析和评估；
- **Skill** 提供可替换的专业方法和能力；
- **外部框架** 通过 Adapter 提供规格、执行或分析能力；
- **Git、DevOps、知识平台** 提供代码、环境、部署和知识资源；
- **人类** 定义意图、处理关键决策、批准风险并承担最终责任。

> CimiLoop 管“这次变更如何可信地走完”；cimicode 管“Agent 如何把当前任务执行出来”。

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
- CLI、Workbench、cimicode 和未来 Teams/飞书是进入同一个 Change Room 的不同入口；
- 项目级看板负责跨 Change 汇总，不取代 Change Room；
- Change Room 是领域和交互概念，不等于 V1 必须实现完整聊天、实时多人在线或消息系统；
- 所有操作以 Command、Decision、Feedback 等形式提交给 Kernel，由 Kernel 校验权限、Gate 和状态迁移。

CimiLoop 提供两种部署模式，但共享同一套 Protocol、Kernel、Change 模型和交互语义：

- **Embedded Solo Mode（个人嵌入模式）**：Kernel、SQLite 和 Workbench 运行在本机，适合个人先跑通完整闭环；包含状态、参与者、时间线、产物、证据、Agent Run 和人工决策，不实现聊天、实时多人协作、消息推送和 Teams/飞书同步；
- **Shared Team Mode（团队共享模式）**：Kernel 与项目 Store 以共享服务方式部署，多个成员和本地 cimicode Runtime 连接同一项目空间，共享全部 Change、状态、Run、Evidence 和 Decision；代码、Worktree、凭据和原始执行仍保留在各自执行机器；
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
- CLI、Workbench、cimicode 以及未来 Teams/飞书使用相同的 Command 语义；
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
- cimicode Runtime 为 Work Item 创建 Agent Run，加载对应 Role、Skill 与 Context；
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
- V1 知识来源聚焦 Change 记录、仓库文档、代码/Git、Project Policy、cimicode Run 和测试结果；飞书、CodeGraph、向量库等通过 Adapter 后续接入；
- Agent/Skill 只能提交 Proposal、Artifact、Evidence Claim、Evaluation 和 Learning Candidate，不能直接修改权威状态、批准 Gate、修改全局 Policy、晋升知识或授予自身权限。

### 5.4 Engineering Execution & Delivery（工程执行与交付）

状态：**已确认**。

确认范围：Workspace 隔离、执行适配与权限、代码集成、构建制品、环境部署、测试到生产晋升及 V1 DevOps 边界。

已确认：

- 默认一个 Change 一个隔离 Worktree，顺序 Task 共享，只有依赖和文件范围明确时才创建并行子 Worktree；Agent 不直接修改主工作区；
- Kernel 下发 Work Item，Runtime Adapter 转换为 cimicode Session/Command，cimicode 执行真实文件、命令和工具操作；
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
- 普通 Change 允许一人多角色，高风险或不可逆动作必须执行与批准职责分离；
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
- V1 最小集成为 cimicode Runtime、Git/Local Workspace、File Knowledge 和现有 DevOps/Environment；其余能力按相同契约后续接入。

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

- 同一人可以兼任多个角色；
- 每次决策必须明确该用户以哪个角色行使权力；
- 系统保留未来进行权限校验、职责分离和审计所需的信息；
- V1 使用轻量本地身份配置，不建设登录系统和复杂组织权限后台。

Human 与 Agent 使用统一 Actor 抽象，并通过 `actor_type` 区分：

- Agent 作为一等参与者出现在 Change Room；
- Agent 行为同时关联稳定的 Agent Profile、当时承担的 Role 和具体 Agent Run；
- Agent 可以提交建议、Artifact、Evidence 和执行结果，并在 Policy 授权范围内执行工程动作；
- Agent 不能冒充 Human Actor，不能获得必须由人类责任角色行使的最终授权权力；
- Agent 的建议通过不等于 Gate 已通过。

V1 区分 Conversation、Feedback 与 Decision：

- 实时对话继续发生在 cimicode，Change Room 不实现通用聊天和自由评论系统；
- Feedback 必须关联到 Contract、Plan、Artifact、Evidence 或 Agent Run，并记录处理状态；
- Decision 具有正式流程效力，使用独立结构化模型；
- Change Room 只保存对流程有长期价值的 Feedback、Decision、Artifact、Evidence，以及必要的 Conversation 摘要和来源引用；
- 原始对话保留在对应 Runtime 的 Agent Run Log 中。

## 6. 后续阶段

- **阶段 C**：统一术语、核心对象关系、Cimi Change Protocol 边界和 Schema 目录；
- **阶段 D**：Change 状态机、各节点输入/输出/Gate/产物及异常恢复规则；
- **阶段 E**：角色模型、职责权限矩阵、人机与多 Agent 协作规则；
- **阶段 F**：Context & Knowledge、能力装配、Verification & Evidence、DevOps、Workbench、存储与 Teams 演进；
- **阶段 G**：开源能力 Build / Adopt / Adapt 矩阵、V1 范围、里程碑和验收计划。

## 7. Parking Lot

整体能力架构确认前只记录、不继续下钻：

- CodeGraph 的 worktree 索引策略；
- OpenSpec Adapter 字段映射和调用方式；
- `grill-with-docs` 的 Prompt 与 Context Pack 模板；
- Superpowers 的 Skill 组合；
- 飞书知识同步协议；
- CLI 命令和仓库目录树；
- UI 页面与技术栈；
- Store、Event Ledger 和服务化部署选型。

## 8. 决策记录

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
| D-042 | Runtime Adapter | 已确认 | Kernel 下发 Work Item，cimicode 负责真实执行；权限显式声明，凭据不进入 CimiLoop 记录。 |
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

## 9. 当前进度

- 阶段 A 产品边界与架构原则：已完成；
- 阶段 B 整体能力架构：已完成；
- 正式架构文档：`docs/architecture/CimiLoop整体能力架构-v0.1.md`；
- 下一步：阶段 C 核心领域模型与 Cimi Change Protocol；
- 阶段 D–G：尚未开始。
