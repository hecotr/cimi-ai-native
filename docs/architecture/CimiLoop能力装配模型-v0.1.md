# CimiLoop 能力装配模型 v0.1

> 状态：讨论确认稿
> 日期：2026-09-19
> 范围：定义 Capability Requirement、Provider、Resolver、Binding、Invocation、替换与审计语义；不选择具体 Skill、模型、工具、Adapter 产品或开源实现。

## 1. 文档定位

本文回答“流程知道需要什么能力，但如何在不绑定具体实现的情况下，安全、稳定地选择并运行 Skill、Tool、Model 或 Adapter”。

本文承接：

- `docs/architecture/CimiLoop整体能力架构-v0.1.md`；
- `docs/architecture/CimiChangeProtocol核心领域模型-v0.1.md`；
- `docs/architecture/CimiLoop角色与权限模型-v0.1.md`；
- `docs/architecture/CimiLoop上下文与知识模型-v0.1.md`。

能力装配属于 Kernel Runtime Protocol 与 Adapter Protocol 的交界面。它不改变 Cimi Change Protocol 的业务事实与状态权威。

## 2. 核心原则

1. **需求与实现分离**：流程、Gate 和 Work Item 声明 required capabilities，不写死具体 Skill、Tool、Model 或 Adapter。
2. **语义先于产品**：Capability 名称表达可验证的业务能力，不使用厂商名或包名充当能力语义。
3. **Policy 约束解析**：Resolver 只能从 Project Policy 允许且资格满足的 Provider 中选择。
4. **运行绑定不可变**：每个 Agent Run 或外部操作绑定精确 Provider、版本和配置摘要，运行中不得静默换实现。
5. **权限取交集**：最终权限不超过 Role、Assignment、Work Item、Project Policy、Environment 与 Provider 声明的共同允许范围。
6. **健康不等于可信**：Provider 可用只表示可以连接或运行，不表示其输出足以通过 Gate。
7. **输出必须提升为协议事实**：关键结果进入 Artifact、Evidence、Run、Deployment、Failure 或 Event，而不是只留在 Provider 私有日志中。
8. **替换不改写历史**：Provider 升级、失败或替换只影响新 Binding/Run，旧运行仍保留当时的精确实现信息。
9. **外部能力不能控制 Kernel**：Provider 可以返回结果和建议，不能直接迁移 Change 状态、批准 Gate 或授予权限。
10. **可核对优先于盲目重试**：外部副作用结果未知时先 Reconciliation，不通过切换 Provider 重复执行未知操作。

## 3. 能力装配中的核心概念

| 概念 | 中文解释 | 所属层 | 主要职责 |
|---|---|---|---|
| Capability Definition | 能力定义 | Capability Registry | 定义稳定能力语义、输入输出、约束与证明要求 |
| Capability Requirement | 能力需求 | Work Item / Gate / Flow | 声明当前任务需要什么能力及最低条件 |
| Provider Descriptor | 提供者描述 | Runtime / Adapter Protocol | 描述某个 Skill、Tool、Model、Adapter 或组合能力 |
| Capability Registry | 能力注册表 | Kernel Runtime | 提供可发现的 Definition 与 Provider 元数据 |
| Capability Resolver | 能力解析器 | Kernel Runtime | 按 Policy、权限、兼容性和健康选择候选 Provider |
| Capability Binding | 能力绑定 | Run / Operation | 将一次运行固定到精确 Provider 集合及版本 |
| Invocation Record | 调用记录 | Runtime / Adapter | 记录具体调用、输入摘要、结果与外部引用 |
| Capability Result | 能力结果 | Runtime / Adapter → Core | 把关键结果转换为协议对象或事实记录 |

Capability Definition 和 Provider Descriptor 是项目可见的版本化定义，其来源可以是内置目录、当前 Host、Adapter 或项目配置；Project Policy 决定当前项目允许使用哪些定义。Capability Binding 与 Invocation Record 是运行时不可变记录。它们不作为新的 Change 聚合根。

## 4. 能力分类

### 4.1 按实现形态分类

| Provider 类型 | 中文解释 | 典型职责 | 不拥有的权力 |
|---|---|---|---|
| Skill | 方法与工作指令 | 澄清、规划、评审、分析和生成方法 | 不能自行获得工具或状态写入权 |
| Tool | 可调用工具 | 文件、命令、测试、分析、查询等确定或受控操作 | 不能扩大调用者权限 |
| Model | 推理模型 | 理解、生成、归纳、推理和评价建议 | 不能作为身份、授权或事实来源 |
| Adapter | 外部系统适配器 | Runtime、SCM、Knowledge、DevOps、Environment、Notification、Spec 等集成 | 不能直写 Kernel Store |
| Composite Provider | 组合提供者 | 把多个 Provider 编排成一个可复用能力实现 | 不能隐藏子能力、权限或版本 |

Runtime 是承载 Agent Run 与工具调用的执行环境，不等同于 Model 或 Skill。一个 Run 通常同时绑定 Runtime、Model、Skill 和若干 Tool/Adapter。

### 4.2 按业务能力分类

Capability Definition 可以覆盖：

- intent.elicitation（意图澄清）；
- contract.analysis（契约分析）；
- planning.task_graph（任务图规划）；
- code.modify（代码修改）；
- test.execute（测试执行）；
- evaluation.independent（独立评价）；
- artifact.build（制品构建）；
- environment.deploy（环境部署）；
- environment.verify（环境验证）；
- environment.recover（环境恢复）；
- external.reconcile（外部状态核对）；
- knowledge.retrieve（知识检索）；
- notification.send（通知发送）。

以上是语义示例，不是本阶段冻结的枚举。命名空间用于避免不同领域把同名能力误认为兼容。

## 5. Capability Definition

能力定义描述“满足该能力意味着什么”，至少包含以下语义：

- 稳定 Capability ID 与语义版本；
- 输入、输出和错误分类；
- 是否会产生外部副作用；
- 是否要求幂等键、核对或补偿能力；
- 所需权限类别与允许作用域；
- 可接受的 Provider 类型；
- 兼容性、确定性、隔离与独立性要求；
- 结果必须形成的 Evidence 或协议对象；
- 健康、超时和终止语义。

Capability Definition 的版本变化只描述能力契约变化，不等同于某个 Provider 的软件版本变化。

## 6. Capability Requirement

Work Item、Gate、Context Builder 或流程模板可以声明能力需求。Requirement 表达：

- Capability ID 与兼容语义版本范围；
- required 或 optional；
- 目标作用域与允许副作用；
- 最低信任、隔离、独立性或确定性要求；
- 输入输出约束；
- 成本、时限、区域或数据边界；
- 必须支持的幂等、恢复、核对和审计特性；
- 失败时是否允许替换 Provider。

Requirement 不包含厂商名、安装路径、模型部署名或秘密。需要固定具体实现时，由 Project Policy 的 allowlist/pin 规则表达，而不是污染业务流程定义。

## 7. Provider Descriptor

每个可装配实现通过 Provider Descriptor 声明：

- 稳定 Provider ID、Provider Type 和实现版本；
- 实现的 Capability ID 与兼容版本；
- 输入输出 Schema 和限制；
- 所需权限、外部系统和 Runtime 条件；
- 是否有副作用、是否幂等、是否支持取消、恢复与 reconcile；
- 数据边界、网络需求、秘密需求和地域限制；
- 健康检查与可用性状态；
- 可信状态与来源，例如 allowed、quarantined、deprecated；
- 安装包、配置或镜像的 Digest；
- 可核对的原始运行记录位置。

Provider 自我声明只用于候选发现，不能自行证明可信。Project Policy、签名/摘要验证、Eval 结果和人工治理共同决定它能否被选择。

## 8. Capability Resolver

### 8.1 解析流程

```text
Capability Requirement
→ Registry 找到语义兼容的候选 Provider
→ Policy、可信状态与数据边界过滤
→ Role / Work Item / Environment 权限过滤
→ 健康、Runtime、依赖和资源条件过滤
→ 独立性、确定性、幂等与核对能力校验
→ 按 Project Policy 的确定性偏好排序
→ 生成 Capability Binding
→ Kernel 绑定 Run 或外部 Operation
```

候选为空时不能由 Agent临时安装或选择未授权实现。Kernel 创建 `capability unavailable` Blocker，等待配置、授权或 Plan 调整。

### 8.2 选择优先级

默认选择依据从硬约束到软偏好依次为：

1. 语义和 Schema 兼容；
2. Policy allow/deny/pin；
3. 权限与数据边界；
4. 副作用、幂等、核对和恢复要求；
5. 独立性、确定性和证据要求；
6. Provider 健康与依赖可用性；
7. 项目偏好、质量 Eval、成本和时延。

前六项未满足时不能通过降低质量偏好来补偿。成本最低不能覆盖安全、权限或证据要求。

### 8.3 确定性与建议

Resolver 的硬过滤和最终绑定由确定性规则完成。Agent 可以解释差异、推荐候选或预测质量，但不能：

- 绕过 deny 或 quarantine；
- 把不兼容版本声明为兼容；
- 为自己增加权限；
- 将健康状态伪装为可信证明；
- 在运行中静默换 Provider。

## 9. Capability Binding

Capability Binding 是一次 Run 或外部操作的不可变实现快照，绑定：

- 对应 Requirement 与 Capability Definition 版本；
- 精确 Provider ID、实现版本和 Digest；
- Runtime、Model、Skill、Tool、Adapter 的组合及依赖关系；
- 生效的 Policy Snapshot；
- 权限与数据边界摘要；
- 关键配置摘要，但不包含秘密；
- Resolver 选择依据和被排除候选的必要审计信息；
- 绑定时间与健康检查结果。

Run Record 引用 Capability Binding，而不是只记录一个可变的 Provider 名称。相同 Work Item 的不同 Agent Run 可以有不同 Binding，但每个 Run 内的 Binding 固定。

Provider 升级不会修改已有 Binding。新 Run 解析到新版本时，必须记录新的 Binding；若版本变化影响任务语义、权限、风险或验证策略，则先走 Plan Amendment 或新 Work Item。

## 10. 权限计算

最终可用权限是以下约束的交集：

```text
Role Assignment / Delegation
∩ Work Item Authorization
∩ Project Policy
∩ Change / Risk Profile
∩ Environment Policy
∩ Provider Declared Requirements
∩ Runtime 可实施边界
```

规则如下：

- Provider 声明需要更高权限时，Resolver 应拒绝候选，而不是自动扩权；
- Skill 不能因为引用 Tool 而继承 Tool 的全部权限；
- Composite Provider 的权限是所有实际子调用所需权限的显式并集，再与上层授权取交集；
- 秘密通过 Runtime 或外部系统的安全句柄注入，不进入 Binding、Prompt、Event 或 Artifact；
- Environment 权限单独校验，有代码修改权不等于有部署权；
- 一次性生产权限只对指定 Release、Artifact、Environment、范围和时间窗有效。

## 11. 调用与结果提升

Provider Invocation 的原始输入输出可以保留在 Runtime 或外部权威系统。CimiLoop 至少记录：

- Run/Operation 与 Capability Binding；
- 调用类型、开始/结束、结果分类和输入输出摘要；
- 幂等键、External Reference 与必要 Digest；
- 失败、取消、超时或未知状态；
- 使用的权限范围和外部副作用状态。

关键结果必须提升为 Cimi Change Protocol 事实：

| Provider 结果 | 协议表达 |
|---|---|
| 生成或修改实现 | Artifact、Claim、Evidence |
| 独立评价 | Evidence / Gate Evaluation 输入 |
| Runtime 执行 | Agent Run Record、Failure、Event |
| 构建 | Artifact 与构建 Evidence |
| 部署 | Deployment、Evidence、Failure、Event |
| 状态核对 | Reconciliation Evidence 与后续 Event |
| 通知 | 外部投递记录；不得替代 Decision 或 Event |
| 知识发现 | Context 引用、Claim 或 Learning Candidate |

Provider 返回 `success` 不自动等于 Gate 通过。Kernel 仍按 Claim、Evidence、Policy 和 Decision 重新评价。

## 12. 失败、替换与重试

### 12.1 失败分类

| 类型 | 含义 | 默认处理 |
|---|---|---|
| Unsupported | Provider 不满足能力或版本 | 不运行，重新解析或 Blocked |
| Unavailable | 暂时不可用或依赖缺失 | 在预算内等待或选择允许的替代 Provider |
| Invocation Failed | 已确认执行失败 | 记录 Failure，按重试和替换策略处理 |
| Result Invalid | 输出不满足 Schema、质量或 Evidence 要求 | 记录失败，不把结果提升为有效事实 |
| Result Unknown | 外部副作用结果未知 | 停止盲重试，先 Reconciliation |
| Policy Revoked | 运行前或运行中资格被撤销 | 禁止新调用；按风险安全停止当前 Run |

### 12.2 替换规则

- 运行开始前：可以重新解析并生成新 Binding；
- 无副作用调用确认失败后：可以在既有 Work Item 授权和重试预算内创建新 Run，使用新 Binding；
- 运行中的 Provider：不得在同一 Run 内静默替换；替换意味着新的 Run 或 Operation Record；
- 已产生外部副作用：必须先确认实际状态，再决定重试、补偿、恢复或替代；
- 替换改变权限、风险、Task 边界、主要方法或验证策略：必须创建新 Work Item 或 Plan Amendment；
- 独立性要求不能因替换而降低，例如 Evaluator 不得退化为原 Executor 的同一上下文自评。

## 13. Composite Provider

组合能力必须显式展开其子能力、顺序、权限和失败语义：

```text
Composite Capability
├── Skill：方法与步骤
├── Model：推理与生成
├── Tool：确定性操作
└── Adapter：外部系统访问
```

组合边界不能隐藏：

- 子 Provider 的版本和 Digest；
- 网络、数据和秘密访问；
- 可能的外部副作用；
- 重试、补偿与核对要求；
- 哪个结果由哪个 Provider 产生。

组合 Provider 可以简化装配，但不能成为绕过最小权限和审计的黑箱。

## 14. 健康、可信与生命周期

Provider 生命周期至少区分：

| 状态 | 中文解释 | 是否可用于新 Binding |
|---|---|---:|
| Allowed | 已允许 | 是 |
| Degraded | 降级但仍满足最低要求 | 由 Policy 决定 |
| Unavailable | 当前不可用 | 否 |
| Quarantined | 因安全、质量或完整性问题隔离 | 否 |
| Deprecated | 已弃用，等待迁移 | 默认否，已有 Binding 保留历史 |
| Revoked | 资格被撤销 | 否，并评估进行中 Run |

Health 描述“能否工作”，Trust 描述“是否允许使用”，Evaluation 描述“在特定任务中是否产出合格结果”。三者不能合并成一个分数。

Provider 版本或状态变化时：

- 旧 Binding 和历史 Run 不修改；
- 未开始的 Work Item 在启动前重新解析；
- 进行中 Run 按变化严重性继续、标记 Stale 或安全停止；
- 已生成结果是否仍可用于 Gate，由 Evidence 适用性和 Policy 决定。

## 15. V1 边界

V1 必须实现：

- 本地 Capability Definition 与 Provider Descriptor 注册；
- Work Item `required capabilities`；
- 基于 Project Policy 的确定性过滤与绑定；
- Runtime、Model、Skill、Tool、Adapter 精确版本摘要；
- Run 级不可变 Capability Binding；
- 最小权限计算与秘密隔离；
- Provider 失败、不可用、未知结果和替换规则；
- 关键结果到 Artifact、Evidence、Run、Deployment、Failure、Event 的提升；
- 能力缺失 Blocker 和人工处理入口。

V1 不承诺：

- 公共 Skill/Tool 市场；
- 自动下载和安装未审查能力；
- 基于在线竞价的动态模型路由；
- 跨组织能力共享；
- 通用插件生态治理后台；
- OpenSpec、Matt Pocock Skills、Superpowers、CodeGraph、Multica 等具体实现映射。

## 16. Kernel 不变量

1. 业务流程只依赖 Capability Definition，不依赖具体产品身份。
2. Run 或外部操作开始前必须存在有效 Capability Binding。
3. Binding 必须固定精确 Provider、版本、配置摘要和 Policy Snapshot。
4. Provider 不能通过自我声明获得信任或更高权限。
5. Provider 升级和替换不得改写历史 Binding。
6. 同一 Run 内不得静默切换 Model、Skill、Tool、Runtime 或 Adapter。
7. 权限不足时必须拒绝 Provider，不能由 Resolver 自动补权。
8. Result Unknown 时必须先 Reconciliation，不得通过换 Provider 盲重试。
9. Provider 输出不能直接改变 Change State、Gate、Decision、Policy 或 Assignment。
10. 关键运行结果必须进入可审计协议事实，不能只存在 Provider 私有日志中。

## 17. 阶段结论

本模型采用“Capability Requirement → Policy 约束解析 → 不可变 Capability Binding → Provider Invocation → 协议事实提升”的装配链。能力实现可以替换，但每次运行使用的实现、权限和结果来源必须被固定并可追溯。

上述语义已经确认。后续 Skill、Tool、Model、Runtime 与 Adapter 的具体选型和开源项目映射，只能作为 Provider 接入，不得反向改变能力需求、权限、绑定和状态权威语义。
