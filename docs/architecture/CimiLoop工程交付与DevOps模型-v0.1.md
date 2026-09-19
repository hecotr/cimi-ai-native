# CimiLoop 工程交付与 DevOps 模型 v0.1

> 状态：讨论确认稿
> 日期：2026-09-19
> 范围：定义 Workspace、Source Snapshot、Artifact、Environment、Release、Deployment、Recovery 与 Reconciliation 的权威边界和生命周期；不规定具体 Git 平台、CI/CD 产品、云厂商或部署技术。

## 1. 文档定位

本文回答“一个 Change 如何从隔离实现形成不可变制品，再把同一制品安全地送入测试和生产环境，并在失败或外部状态未知时闭环”。

本文承接：

- `docs/architecture/CimiLoop整体能力架构-v0.1.md`；
- `docs/architecture/CimiChangeProtocol核心领域模型-v0.1.md`；
- `docs/architecture/CimiLoopChange端到端状态机-v0.1.md`；
- `docs/architecture/CimiLoop能力装配模型-v0.1.md`；
- `docs/architecture/CimiLoop验证与证据模型-v0.1.md`。

CimiLoop 是 Runtime-neutral Harness，不替代 Git、构建系统、Artifact Registry 或 DevOps 平台。它负责授权、编排、关联、Gate、恢复决策与审计。

## 2. 核心原则

1. **隔离执行**：Agent 不直接修改主工作区；默认一个 Change 一个隔离 Worktree。
2. **授权先于动作**：任何构建、部署、恢复和环境变更都必须来自有效 Work Item 或 Release 授权。
3. **构建一次、逐环境晋升**：测试验证和生产部署使用同一 Artifact ID 与 Digest。
4. **制品不可变**：修复或重新构建产生新 Artifact，不在原对象上覆盖内容。
5. **Release 与 Deployment 分离**：Release 表达“允许部署什么、到哪里、在什么边界内”；Deployment 表达“一次实际尝试”。
6. **外部事实留在外部权威系统**：CimiLoop 保存领域关联、摘要、Digest 与 External Reference，不复制所有日志或制品。
7. **结果未知先核对**：外部副作用状态未知时先 Reconciliation，不盲目重试。
8. **恢复是向前动作**：Rollback、Roll-forward 和 Compensation 都创建新动作、记录与 Evidence，不回写历史。
9. **权限最小化**：生产权限一次性、范围化、限时，并绑定具体 Release 与 Artifact。
10. **即时验证不等于长期成功**：ReleaseVerified 只表示生产部署和即时检查通过。

## 3. 交付语义链

```text
Change / Plan / Task
→ 隔离 Workspace / Worktree
→ Work Item / Agent Run
→ 不可变 Source Snapshot
→ Build
→ Artifact Candidate
→ Change 级独立评价
→ Test Release / Deployment / Validation
→ Production Release Decision
→ 同一 Artifact 晋升生产
→ Production Deployment / Immediate Verification
→ ReleaseVerified 或 Recovery
```

Task 和 Run 可以多次产生中间结果；只有具备固定来源、完整性和构建 Evidence 的不可变输出才能成为可晋升 Artifact Candidate。

## 4. Workspace 与 Worktree

### 4.1 Workspace 不是领域事实权威

Workspace/Worktree 是 Kernel Runtime Protocol 中的执行资源，不是 Cimi Change Protocol 的聚合根。Git 负责源代码历史，Runtime/Workspace Adapter 负责实际目录与进程，CimiLoop 负责其与 Change、Work Item 和 Run 的绑定。

### 4.2 默认隔离策略

- 每个 Change 默认拥有一个隔离 Worktree；
- 同一 Change 的顺序 Task 共享该 Worktree，以保持连续实现上下文；
- 只有 Task 依赖、文件范围和集成策略明确时，才创建并行子 Worktree；
- 并行子 Worktree 必须绑定具体 Task/Work Item，并声明整合目标；
- Agent 不直接在主工作区或未授权目录中修改文件；
- Worktree 的创建、占用、释放和异常恢复由 Lease 与 Resource Lock 控制。

### 4.3 并行与整合

并行执行不意味着自动安全合并：

1. 每个子 Worktree 产生独立来源引用和局部验证结果；
2. 合并冲突、接口不兼容或跨 Task 影响形成 Failure/Blocker；
3. 集成必须在授权的 Integration Work Item 中完成；
4. Change 级 Artifact 从集成后的统一 Source Snapshot 构建；
5. 子 Worktree 的局部测试不能替代集成 Artifact 的评价。

## 5. Source Snapshot

Source Snapshot（源快照）是 Artifact 构建输入的不可变引用，至少在语义上固定：

- Repository 与精确 Git Commit/Tree；
- 必要的子模块、依赖锁文件和生成输入；
- 构建配置与构建脚本版本；
- 来源 Change、Plan、Task、Work Item 和 Run；
- 未提交内容的内容 Digest（仅用于允许的中间构建）。

可发布 Artifact 必须来自可重建的不可变 Source Snapshot。脏工作区可以用于开发期自检，但不能仅凭“当前目录内容”成为生产 Release 的来源。

是否使用 PR、Merge Commit、Squash、Rebase 或直接提交属于 SCM Policy；CimiLoop 只要求最终来源可固定、可追踪且经过必要 Gate。

## 6. Artifact 模型

Artifact 是不可变的候选交付物或交付物 Manifest。它可以代表二进制包、容器镜像、静态资产、配置包、迁移包，或多个组件组成的不可变集合。

### 6.1 Artifact 身份

- 每次有效内容变化创建新 Artifact ID；
- Artifact 使用 Digest 固定内容，不提供可原地修改的业务版本；
- 多组件交付使用一个不可变 Artifact Manifest 固定全部成员及各自 Digest；
- 同一内容可以被多个 Change 或 Release 引用，但不能更改其历史来源；
- Artifact 元数据不包含凭据或可变签名 URL。

### 6.2 构建来源与证明

Artifact 必须关联：

- Source Snapshot；
- Build Work Item、Run 与 Capability Binding；
- 构建工具和环境摘要；
- 构建结果与原始记录 External Reference；
- 内容 Digest 与必要供应链 Evidence；
- 当前适用的 Contract/Plan Version。

Build success 只证明构建动作成功，不证明 Artifact 满足 Contract。它仍需任务级验证、独立评价和环境验证。

### 6.3 修复与重建

- 代码、配置、依赖或构建输入改变后产生新 Artifact；
- 即使来源代码未变，导致输出 Digest 变化的重建也产生新 Artifact；
- 修复后不得把旧测试结果直接关联到新 Digest；
- 新旧 Artifact 通过来源和取代关系追踪，不覆盖或删除旧对象。

## 7. Environment 模型

Environment 是 Project 级稳定目标定义，表达测试、预发布、生产等部署边界，而不是一次部署结果。

Environment 至少在语义上声明：

- 稳定 Environment ID、类别和责任 Owner；
- 允许的部署与恢复能力；
- 数据、安全、网络和地域边界；
- 生产或非生产属性；
- 并发、维护窗口和资源锁规则；
- DevOps/Environment Adapter 引用；
- 必需 Gate、Evidence 与职责分离要求。

环境的实时资源状态由 DevOps/Environment Provider 负责。CimiLoop 保存最后核对事实和 Evidence，但不把缓存状态冒充外部当前事实。

## 8. Release 模型

Release 是 Change 范围内、面向一个目标 Environment 的部署授权边界。它回答：

> 允许把哪个不可变 Artifact，在什么时间、范围和策略下部署到哪个 Environment？

Release 绑定：

- Change、Contract/Plan Version 与 Risk Assessment；
- Artifact ID 与 Digest；
- 目标 Environment；
- 发布范围、流量、租户或资源边界；
- 时间窗口与失效时间；
- 部署策略、即时验证步骤和成功条件；
- 停止条件与 Recovery Strategy；
- Evidence Package、Policy Snapshot 与必要 Decision。

Artifact、Environment、发布范围、关键配置、时间窗口或 Recovery Strategy 发生实质变化时，必须创建新 Release 或重新取得 Release Decision，不能沿用旧批准。

### 8.1 测试 Release

测试环境 Release 在 Change 级评价和 Gate 通过后可以由 Kernel 自动授权，不重复增加人工点击；Policy 指定的高风险测试环境除外。

### 8.2 生产 Release

生产 Release 必须由 Release Owner 明确返回批准、请求修改或拒绝。批准只针对该 Release，不形成通用生产权限。

Release Decision 写入后，Kernel 使用最新 Artifact、Environment、Risk、Policy 与 Evidence 重新执行 Gate；只有 ALLOW 才生成一次性部署授权。

## 9. Deployment 模型

Deployment 是执行某个 Release 的一次不可变外部尝试。一个 Release 可以在允许的重试边界内关联多个 Deployment，但每次尝试都有独立身份、幂等键、状态和外部引用。

Deployment 记录或关联：

- Release 与 Artifact Digest；
- 目标 Environment 和部署范围；
- 触发 Actor、Work Item 与一次性权限；
- DevOps Adapter、Pipeline/Operation External Reference；
- 幂等键、请求时间和外部发生时间；
- 已知结果、失败、未知状态与后续核对；
- 即时验证和 Recovery 关系。

Deployment 的过程状态可以通过 Event 与 Read Model 展示；历史尝试和结果不能被后续重试覆盖。

## 10. 测试环境闭环

```text
Artifact Candidate
→ Test Release
→ Test Deployment
→ Test Validation
→ 成功：ReleaseReady
→ 失败：Failure / Refutes Evidence
→ Repair Work Item
→ 新 Source Snapshot / 新 Artifact
→ 独立评价
→ 新 Test Deployment
```

测试循环遵循：

- 指定 Artifact ID/Digest 与实际部署目标必须一致；
- 测试 Evidence 绑定 Environment、配置与 Artifact；
- 测试失败不直接在部署环境中进行未经记录的热修复；
- 任何实现修复都回到授权的 Workspace/Work Item，生成新 Artifact；
- 达到修复、成本或时间预算时进入 AwaitingDecision；
- 旧 Artifact 的通过结论不能自动转移到新 Artifact。

## 11. 制品晋升

生产发布使用已经在测试环境验证的同一 Artifact Digest：

```text
Tested Artifact Digest
→ Production Release Decision
→ Digest / Registry / Provenance 再核对
→ Production Deployment
```

生产前允许改变的是环境特定的外部配置，不允许重新构建应用制品。配置必须：

- 由 Environment/Release 明确引用并固定版本或 Digest；
- 接受独立的 Policy 与风险检查；
- 在即时验证中核对实际生效值或版本；
- 发生实质变化时使相关环境 Evidence 或 Release Decision 失效。

如果平台无法直接晋升同一物理对象，迁移/复制过程必须验证源与目标 Digest 一致；Digest 不一致视为新的 Artifact，不能沿用原生产批准。

## 12. 生产部署与即时验证

生产路径为：

```text
ReleaseReady / AwaitingDecision
→ Release Owner approve
→ Kernel 重新执行 Gate
→ ProductionDeploying
→ 一次性 Deployment
→ 查询并记录外部结果
→ 目标版本、健康、配置和核心路径即时验证
→ ReleaseVerified 或 Recovery
```

即时验证至少按 Release Requirement 检查：

- 实际 Artifact Digest 或目标版本；
- 基础健康与关键依赖；
- 核心路径冒烟；
- 配置和迁移结果；
- 发布范围、流量或租户；
- 必要人工 Checklist；
- 已知异常与残余风险。

ReleaseVerified 不声明长期稳定、SLO 达标或业务价值已经实现。长期 Outcome Evidence 可以在 DeliveryClosed 后继续补充。

## 13. 外部结果未知与 Reconciliation

当调用超时、连接中断或 Adapter 无法确认外部操作结果时：

1. Deployment 保持结果未知，Change 保持原生命周期位置；
2. Kernel 打开“外部状态未知”Blocker，停止同类操作重试；
3. 创建 Reconciliation Work Item，绑定原请求、幂等键和外部引用；
4. 优先查询实际资源、Pipeline、版本、Digest 和副作用；
5. 核对为成功时继续即时验证；
6. 核对为未执行时，才可在授权和预算内安全重试；
7. 核对为失败时进入恢复或修复；
8. 超出核对预算仍未知时进入 AwaitingDecision。

更换 Adapter、Runtime 或 Pipeline 不能绕过 Reconciliation，因为未知的是外部世界是否已经发生变化。

## 14. Recovery 与 Compensation

Recovery Strategy 可以包括：

- Rollback（版本回退）；
- Roll-forward（向前修复）；
- Feature Disable（功能关闭）；
- Traffic Shift（流量切换）；
- Data Restore（数据恢复）；
- Compensation（业务补偿）；
- Manual Recovery（人工恢复）。

### 14.1 预授权恢复

若 Release 已固定恢复目标、范围、停止条件和验证方式，部署失败后 Kernel 可以创建对应 Recovery Work Item 和 Deployment/Operation，而无需重复等待普通发布审批。

恢复动作仍必须：

- 使用独立身份、幂等键和权限；
- 关联失败 Deployment；
- 记录外部结果和 Recovery Evidence；
- 核对系统是否回到已知安全状态；
- 在超出预授权范围时立即进入 AwaitingDecision。

### 14.2 超出范围的恢复

目标 Artifact、数据操作、权限、影响范围或风险超出 Release 预授权时，必须取得新的 Decision、Policy Exception 或 Incident 应急授权。

不可逆副作用只能通过补偿或前向修复处理。任何恢复成功都不能删除原 Deployment、Failure 或已发生副作用。

### 14.3 恢复后的流程断点

恢复成功只说明系统回到已知安全状态：

- 原失败和恢复历史保留；
- Change 进入 AwaitingDecision，暂停新的生产动作；
- 修复重发时回到 Executing，产生新 Artifact 并重走评价和测试；
- 结束本次交付时记录未交付结论、残余影响和后续 Change；
- 需要事故治理时创建独立 Incident Change。

## 15. 权威边界

| 系统 | 第一权威事实 | CimiLoop 的责任 |
|---|---|---|
| Git / SCM | Commit、Tree、Branch、Diff 和合并历史 | 关联 Change/Task/Artifact，执行 Gate 与审计 |
| Workspace / Runtime | 当前工作目录、进程、命令和原始 Session | 授权 Work Item，记录 Run、摘要和引用 |
| Build / CI | 构建与测试原始执行结果 | 转换为 Artifact、Evidence、Failure 和 Event |
| Artifact Registry | 制品内容、Digest、存储位置和可用性 | 维护领域 Artifact 身份、来源和晋升关系 |
| DevOps / Environment Provider | Pipeline、资源和部署的外部实际状态 | 管理 Release、Deployment、核对、Gate 和恢复闭环 |
| CimiLoop Kernel | Change 状态、授权、Decision、Gate、Transition 和关联历史 | 唯一执行状态迁移与调度决策 |

Adapter 只能通过 Command、Query 和 Event 与 Kernel 协作，不能直接修改 Change State、Release Decision 或 Gate 结果。

## 16. 权限、凭据与审计

- Work Item 声明允许的仓库、目录、命令、网络、环境和副作用；
- Workspace、Environment 与部署目标使用 Resource Lock 避免冲突操作；
- Agent 只获得触发被授权操作的能力，不获得通用生产管理员权限；
- 凭据由 Runtime、CI/CD 或 DevOps Secret Store 管理；
- Prompt、Context Pack、Event、Artifact 元数据和普通日志不得包含真实秘密；
- 每次外部操作记录 Actor、acting role、Work Item、Capability Binding、Policy Snapshot、幂等键和外部引用；
- 权限过期或撤销后禁止新调用，进行中不可中断操作按 Policy 安全完成或停止。

## 17. V1 边界

V1 必须实现：

- 每个 Change 默认一个隔离 Worktree；
- Work Item 驱动的 Agent Runtime 执行；V1 首个 Runtime 从 Claude Code 或 OpenCode 中选择；
- 不可变 Source Snapshot 与 Artifact/Digest；
- 测试部署、验证、修复和重建循环；
- 测试到生产的同 Digest 晋升；
- Environment、Release 与 Deployment 分离；
- Release Owner 的生产发布 Decision；
- build、deploy、status、verify、recover、reconcile Adapter 能力；
- 外部结果未知时的 Blocker 与 Reconciliation；
- 预授权 Recovery 和超范围升级；
- 生产即时验证与 ReleaseVerified。

V1 不承诺：

- 自建 Git 托管、Artifact Registry 或 CI/CD 平台；
- 统一替代现有 DevOps 控制面；
- 自动选择复杂蓝绿、金丝雀或多集群策略；
- 长期生产日志、Trace、SLO 和业务指标平台；
- 跨组织、多区域、大规模发布编排；
- 具体云厂商、Pipeline 或容器平台绑定。

## 18. Kernel 不变量

1. Agent 不直接修改主工作区，所有工程动作来自 Work Item。
2. 可发布 Artifact 必须关联不可变 Source Snapshot、构建来源和 Digest。
3. Artifact 内容变化必须创建新 Artifact，不能覆盖旧对象。
4. 生产部署必须使用测试通过并获批的同一 Artifact Digest。
5. Release 必须绑定 Artifact、Environment、范围、窗口、验证与 Recovery Strategy。
6. Deployment 是一次独立尝试，后续重试不能覆盖历史结果。
7. 生产权限一次性且范围化，凭据不得进入 CimiLoop 内容记录。
8. 外部结果未知时必须先 Reconciliation，不得盲目重试。
9. Recovery 和 Compensation 创建新动作与 Event，不回滚历史记录。
10. ReleaseVerified 只表示即时验证通过，不表示长期稳定或业务 Outcome 已实现。

## 19. 阶段结论

本模型采用“隔离 Workspace → 不可变 Source Snapshot → Artifact/Digest → 测试环境验证 → 同制品生产晋升 → 即时验证或恢复”的交付链，并以 Release 管授权、Deployment 管尝试、Reconciliation 管未知外部状态。

上述语义已经确认。后续 Git、Runtime、CI/CD、Artifact Registry、DevOps 与云平台选型只能作为 Adapter/Provider 接入，不得改变隔离执行、制品不可变、同 Digest 晋升、授权先行和未知结果先核对等核心约束。
