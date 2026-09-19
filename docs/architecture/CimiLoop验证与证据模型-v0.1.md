# CimiLoop 验证与证据模型 v0.1

> 状态：讨论确认稿
> 日期：2026-09-19
> 范围：定义 Claim、Evidence、独立评价、覆盖、适用性、失效与 Gate 证明语义；不规定具体测试框架、CI 产品、安全扫描器或质量指标阈值。

## 1. 文档定位

本文回答“CimiLoop 如何知道一个 Change 真的满足当前 Contract，并且具备进入下一阶段的证据”。

本文承接：

- `docs/architecture/CimiChangeProtocol核心领域模型-v0.1.md`；
- `docs/architecture/CimiLoopChange端到端状态机-v0.1.md`；
- `docs/architecture/CimiLoop角色与权限模型-v0.1.md`；
- `docs/architecture/CimiLoop上下文与知识模型-v0.1.md`；
- `docs/architecture/CimiLoop能力装配模型-v0.1.md`。

验证不是“测试命令返回 0”的别名。它是从 Contract 和风险要求推导 Claim，再使用适用、可追溯的 Evidence 进行独立评价，最终由 Gate 在精确版本快照上作出确定性结论。

## 2. 核心原则

1. **先明确命题，再收集证据**：Evidence 必须回答具体 Claim，不能用大量日志代替清晰的证明目标。
2. **Artifact 不是正确性证据**：Artifact 是被评价对象；其存在、构建成功或被提交不表示满足 Contract。
3. **Run 成功不等于 Change 正确**：Run 只说明一次尝试完成，状态迁移仍需 Evidence 与 Gate。
4. **证据是不可变事实**：新的测试、复核或反例创建新 Evidence，不覆盖旧记录。
5. **支持不抵消反驳**：一条仍适用的反驳 Evidence 不能靠增加更多正面数量被“投票覆盖”。
6. **未知必须保留为未知**：超时、缺失或无法核对不能伪装成通过或失败。
7. **适用性必须精确**：Evidence 绑定 Contract/Plan、Artifact Digest、环境、配置、时间和范围中的必要维度。
8. **风险决定证明强度**：风险越高，要求越强的确定性、独立性、环境真实性和人工判断。
9. **可自检，不可自证**：Executor 可以产生 Evidence，但正式评价必须满足独立性要求。
10. **Gate 才作准入结论**：Tool、Agent、Evaluator 和 Human 可以提供 Evidence 或 Decision，只有 Kernel Gate Evaluation 决定当前迁移是否允许。

## 3. 验证语义链

```text
Contract Acceptance Criteria / Policy / Risk
→ Claim Set
→ Gate Requirement Set
→ 执行、测试、扫描、评价与环境观察
→ Evidence
→ Claim Assessment / Coverage
→ Gate Evaluation
→ ALLOW / NEED_MORE_EVIDENCE / REQUIRE_HUMAN / DENY
```

每一层回答不同问题：

- Claim：需要证明什么；
- Evidence：实际观察到了什么；
- Claim Assessment：现有证据对命题意味着什么；
- Gate Requirement Set：这次迁移具体要求哪些命题和证明条件；
- Gate Evaluation：基于当时有效输入能否迁移。

## 4. Claim 模型

Claim（声明）是一个在明确作用域中可支持、反驳或保持无法判定的命题。它不是 Agent 的完成自述。

### 4.1 Claim 来源

| Claim 类别 | 来源 | 示例 |
|---|---|---|
| Intent Claim | Contract Outcome / Acceptance Criteria | 用户可以完成指定业务操作 |
| Boundary Claim | Non-goal、约束和兼容要求 | 未授权行为没有改变 |
| Technical Claim | Plan、架构和质量要求 | 数据迁移保持引用完整性 |
| Integrity Claim | Artifact、构建和供应链要求 | 被测试与被发布的是同一 Digest |
| Risk Claim | Risk Profile 与 Policy | 不产生未授权数据访问 |
| Environment Claim | Environment 与 Release 要求 | Artifact 在测试环境按目标配置运行 |
| Recovery Claim | Recovery Strategy | 回滚或补偿能恢复到已知安全状态 |
| Outcome Claim | 业务结果观察 | 交付后达成声明的结果指标 |

### 4.2 Claim 边界

一个有效 Claim 必须能够解析：

- 命题内容和预期方向；
- 来源 Contract/Plan/Policy/Risk Requirement；
- 被评价对象与作用域；
- 适用的版本、Artifact、Environment 或时间窗；
- 何种 Evidence 可以支持、反驳或仍不足；
- 是否为当前 Gate 的 required、conditional 或 advisory Claim。

Claim 本身不保存一个可随意修改的“通过状态”。当前结论来自具体 Evidence 与 Evaluation 快照。Contract 或要求变化时，旧 Claim 保留并执行 Valid、Stale 或 Superseded 影响判断。

### 4.3 Claim 分解与覆盖

- Contract Acceptance Criterion 可以派生一个或多个可验证 Claim；
- 一个 Claim 可以需要多个互补 Evidence，例如功能、回归、安全和环境证据；
- 一条 Evidence 可以关联多个 Claim，但必须分别说明适用性；
- Claim 分解不能把关键约束藏在自由文本中；
- 低层技术 Claim 全部通过，也不能自动替代未覆盖的意图或体验 Claim。

## 5. Evidence 模型

Evidence（证据）是支持、反驳或无法判定 Claim 的不可变观察，或对外部原始事实的稳定引用。

### 5.1 Evidence 结论方向

| 方向 | 中文解释 | 对 Claim 的含义 |
|---|---|---|
| Supports | 支持 | 观察与命题一致，但仍需满足 Requirement 的强度和覆盖要求 |
| Refutes | 反驳 | 观察与命题冲突；在适用时必须阻止该 Claim 被判定满足 |
| Inconclusive | 无法判定 | 已执行观察，但结果不足、模糊或超出能力范围 |

`Inconclusive` 表示“观察过但不能得出结论”。尚未执行验证或来源不可访问不是一种 Evidence 方向，而是 Evidence 缺口、Failure 或 Blocker；Claim 保持 Insufficient。两者都不能静默变成通过。

### 5.2 Evidence 来源

Evidence 可以来自：

- 确定性测试、类型检查、Lint、安全扫描和构建工具；
- CI/CD、Artifact Registry、DevOps 与 Environment Provider；
- 独立 Evaluator Agent；
- Human Review、体验验收或专业责任人判断；
- Git、Runtime、Workspace 和外部系统的原始事实；
- Reconciliation、Recovery 与生产即时验证。

原始日志、文件存在、Agent 总结或工具的单个 `success` 字段只有在被解析为明确观察、保留来源并符合 Requirement 时，才构成可用 Evidence。

### 5.3 Evidence 可信维度

Evidence 不使用一个笼统 Trust Score。Gate 分别检查：

| 维度 | 回答的问题 |
|---|---|
| Provenance | 谁或哪个系统产生，谁记录，原始事实在哪里 |
| Integrity | 内容是否由 Digest、签名或权威 ID 固定，是否被篡改 |
| Applicability | 是否适用于当前 Claim、版本、Artifact、环境和范围 |
| Freshness | 是否仍在 Requirement 允许的时间或变化窗口内 |
| Independence | 是否与被评价的 Executor、上下文或实现路径足够分离 |
| Determinism | 结果是否可重复、可计算，还是包含主观判断 |
| Coverage | 覆盖了哪些输入、路径、边界、风险和负面场景 |
| Reproducibility | 是否能够按记录的环境、工具与步骤复现或核对 |

不同 Claim 对这些维度的要求不同。例如体验 Claim 可以接受 Human Review，但 Artifact Digest 一致性应由确定性事实证明。

## 6. 原始结果到 Evidence

Tool、Runtime 或 Adapter 的原始输出不是自动有效 Evidence。提升流程为：

```text
原始执行 / 外部观察
→ 记录 Source、External Reference、版本与 Digest
→ 解析明确观察结果
→ 关联 Claim 与适用范围
→ 标记 Supports / Refutes / Inconclusive
→ 创建不可变 Evidence
```

解析器或 Agent 可以生成 Evidence Candidate，但 Kernel/Adapter 必须确保：

- 不丢失原始记录位置；
- 不把摘要写成原始事实；
- 不把未运行、跳过或超时写成通过；
- 不把不匹配的 Artifact、分支、环境或配置结果错误关联到当前 Claim；
- 解析失败时保留原始结果并标记 Inconclusive，而不是猜测。

## 7. Claim Assessment

Claim Assessment（声明评价）是基于一组当时有效 Evidence 对某个 Claim 的不可变判断。V1 不需要把它建成新的聚合根；它可以作为独立 Evaluator Evidence 或 Gate Evaluation 的结构化组成部分。

| 结论 | 中文解释 | 典型条件 |
|---|---|---|
| Satisfied | 已满足 | 所有 required Evidence 条件满足，且不存在仍适用的阻断性反驳 |
| Refuted | 已反驳 | 存在仍适用、强度足够的 Refutes Evidence |
| Insufficient | 证据不足 | 缺少必需证据、覆盖不足、只有 Inconclusive/Unavailable 结果 |
| Conflicted | 证据冲突 | 同一适用范围存在不能由确定性规则消解的有效支持与反驳证据 |
| NotApplicable | 不适用 | Requirement 的显式条件不成立，并有可审计依据 |

`NotApplicable` 必须由 Requirement 条件得出，不能由 Executor 为减少验证工作自行声明。

## 8. Gate Requirement Set

Gate Definition 回答“通常检查什么”；Gate Requirement Set 回答“这次迁移具体必须证明什么”。Requirement Set 根据以下输入解析并版本化：

- Change Profile；
- 目标 Transition；
- Contract/Plan Version；
- Risk Assessment；
- Policy Snapshot 与 Policy Exception；
- Artifact、Environment 与 Release 范围；
- 自治等级与角色独立性要求。

Requirement Set 对每个 Claim 声明：

- required、conditional 或 advisory；
- 接受的 Evidence 类型和最低可信维度；
- 覆盖、独立性、环境、时间和版本要求；
- 允许的组合规则；
- 哪些 Refutes Evidence 构成硬阻断；
- 是否必须由 Human Decision 补充判断。

Risk 或 Policy 变化可以产生新的 Requirement Set Version，但不改写旧 Gate Evaluation。

## 9. 分层验证与独立性

### 9.1 三层验证

1. **确定性工具**：测试、类型检查、Lint、构建、安全扫描、Digest 与平台状态；
2. **独立 Evaluator**：从 Contract 推导边界、反例、覆盖缺口和跨 Evidence 矛盾；
3. **Human Review**：意图、体验、风险接受、规则例外和不可逆判断。

三层不是简单的高低排名。Gate Requirement Set 按 Claim 类型选择必要组合。

### 9.2 Executor 与 Evaluator

- Executor 可以编写和运行测试、提交 Claims、自检结果和 Evidence；
- Executor 的自检可以满足某些低风险确定性 Requirement，但不能替代要求独立评价的 Claim；
- 正式 Evaluator 使用独立 Agent Run，不继承 Executor 完整对话与私有推理；
- Evaluator 从 Contract、Artifact 和原始 Evidence 重新推导检查重点；
- Evaluator 不直接修复被评价的生产代码；
- 修复产生新 Artifact Digest 后，重新执行受影响评价。

风险提高时，Policy 可以要求不同 Agent Profile、不同模型或工具、不同 Human Actor、多实现交叉验证或专门的安全/合规评价。

### 9.3 Human Decision 的边界

Human Decision 可以接受风险、批准例外或评价需要主观判断的 Claim，但不能：

- 把未执行的确定性测试声明为已经通过；
- 改写 Refutes Evidence；
- 让证据适用于错误 Artifact 或 Environment；
- 在没有 Policy Exception 的情况下绕过硬性规则；
- 追溯性修改历史 Gate Evaluation。

## 10. Evidence 覆盖与充分性

Gate 不通过“通过数 / 总数”或单一置信度决定充分性。它使用 Requirement Set 的结构化规则：

- 所有 required Claim 必须为 Satisfied 或被有效 Policy Exception 明确处理；
- conditional Claim 在触发条件成立时等同 required；
- advisory Claim 不单独阻止迁移，但必须向 Decision 和风险摘要暴露；
- 任何未解决的阻断性 Refutes Evidence 都阻止 ALLOW；
- Insufficient 返回 NEED_MORE_EVIDENCE；
- 需要责任角色判断或有效例外时返回 REQUIRE_HUMAN；
- 明确违反不可例外 Policy 时返回 DENY；
- Evidence 相互冲突且当前规则无法消解时，进入 Blocked 或 REQUIRE_HUMAN，而不是多数表决。

测试覆盖率、通过率和模型置信度可以作为 Evidence 的属性或风险信号，但不能单独替代 Claim 覆盖。

## 11. Evidence 适用性与失效传播

Evidence 创建后不可修改；所谓“失效”是新的影响判断，不删除历史事实。

### 11.1 常见变化

| 变化 | 默认影响 |
|---|---|
| Contract Acceptance Criteria 变化 | 重新判断对应 Claim 与 Evidence，可能 Stale 或 Superseded |
| Plan 实现策略变化 | 只影响依赖该策略或验证方法的 Evidence |
| Artifact Digest 变化 | 绑定旧 Artifact 行为的测试、扫描与评价默认 Stale |
| 仅文档或无行为变化 | 经影响分析后可保持 Valid |
| Environment 配置、数据或依赖变化 | 对环境级 Evidence 执行精确影响评估 |
| Policy/Risk 要求提高 | Evidence 事实保留，但可能不再满足新 Requirement Set |
| Tool/Evaluator 版本变化 | 历史结果保留；只有 Policy 或兼容规则要求时才重验 |
| Evidence 超过有效窗口 | 标记 Stale，重新采集或核对 |
| 外部原始记录不可访问 | 标记来源 Unavailable；按 Requirement 决定是否仍可使用摘要 |

### 11.2 影响结论

- Valid：仍可作为当前 Claim/Gate 依据；
- Stale：历史保留，但不能直接支撑当前 Gate；
- Superseded：已有明确新 Evidence 取代旧用途；
- Invalid：发现来源错误、完整性破坏或关联对象不匹配，禁止使用并记录原因。

Invalid 不表示历史被删除；它表示该记录不能再被当作可信 Evidence。

这里的 Invalid 只用于发现来源错误、完整性破坏或对象错配，不是 Contract/Plan 版本变化的第四种通用影响结论；普通版本影响仍统一使用 Valid、Stale 与 Superseded。

## 12. Evidence Package 与 Evidence Index

Delivery、Test、Release、Recovery 和 Learning 等 Evidence Package 是面向 Gate 或 Decision 的不可变清单/Manifest，不是新的事实权威，也不复制原始 Evidence。

Package 至少说明：

- 服务哪个 Gate、Decision 或评审；
- 使用的 Requirement Set；
- Contract/Plan Version、Artifact Digest、Environment 与时间范围；
- Claim 覆盖与当前 Assessment；
- Evidence 引用、来源和适用性；
- 未满足、冲突、例外和残余风险；
- 组装时间与 Package Digest。

Evidence Index 是可重建的查询视图，用于快速查找 Claim、Evidence、Package 与 Gate 的关系；删除或重建 Index 不影响原始事实。

## 13. 不同阶段的证明目标

| 阶段 | 主要证明目标 | 典型 Evidence |
|---|---|---|
| Intent Review | Contract 可理解、可验证且责任边界完整 | 结构检查、冲突分析、Human Decision |
| Plan Review | Task DAG 覆盖 Contract，风险和验证策略充分 | Traceability、依赖检查、独立计划评价 |
| Change Evaluation | Artifact 满足 Contract 与技术要求 | 测试、扫描、Diff、独立 Evaluator Evidence |
| Test Validation | 指定 Artifact 在测试环境满足验收要求 | Deployment、环境配置、黑盒测试与失败修复历史 |
| Release Decision | 同一 Artifact 具备进入目标生产环境的条件 | Test Package、风险、窗口、恢复策略和 Release Decision |
| Production Verification | 部署事实和即时健康满足要求 | Deployment、Digest、一致性、健康检查与业务冒烟 |
| Recovery / Reconciliation | 外部状态已知且系统回到安全状态 | 平台事实、恢复动作、补偿和验证 Evidence |
| Learning | 经验具备可复用性且不会固化错误结论 | 多案例、独立 Eval、Owner Decision |

## 14. V1 边界

V1 必须实现：

- Contract/Policy/Risk 到 required Claim 的可追踪关系；
- Supports、Refutes、Inconclusive Evidence，以及 Evidence 缺口/来源不可用的 Blocker 表达；
- Evidence 来源、Artifact Digest、版本、Environment、新鲜度和适用范围；
- 独立 Evaluator Run 与 Executor 自检分离；
- Requirement Set 驱动的 Claim Assessment 和 Gate Evaluation；
- Valid、Stale、Superseded、Invalid 影响判断；
- Delivery、Test、Release、Recovery Evidence Package Manifest；
- 原始 CI/Runtime/DevOps 记录的 External Reference；
- NEED_MORE_EVIDENCE、REQUIRE_HUMAN、DENY 和 ALLOW 的可解释结果。

V1 不承诺：

- 通用形式化证明系统；
- 自动生成所有业务验收标准；
- 单一跨领域质量分数；
- 长期生产业务指标观测平台；
- 替代现有测试、CI、安全或 DevOps 工具；
- 通过 LLM 自评自动获得高风险 Gate 通过。

## 15. Kernel 不变量

1. 每个用于 Gate 的 Evidence 必须关联明确 Claim 和来源。
2. Artifact、Run success、文件存在或原始日志不能自动等于 Claim Satisfied。
3. Stale、Invalid、Inconclusive Evidence 或尚未取得的 Evidence 不能满足 required Claim。
4. 仍适用的阻断性 Refutes Evidence 必须阻止 Gate ALLOW。
5. Evidence 与 Gate Evaluation 都是不可变记录；重验产生新记录。
6. Gate Evaluation 必须绑定精确 Requirement Set、Contract/Plan、Artifact、Risk 与 Policy Snapshot。
7. Executor 自检不能满足明确要求独立评价的 Requirement。
8. Human Decision 不能伪造确定性事实或改写 Evidence。
9. Evidence 失效必须按依赖精确传播，不允许无依据全量作废或继续沿用。
10. 原始记录留在权威系统时，CimiLoop 必须保留稳定 External Reference 和必要 Digest。

## 16. 阶段结论

本模型采用“Claim 驱动、Evidence 不可变、适用性精确、独立性按风险增强、Gate 基于 Requirement Set 求值”的证明体系。它不使用简单通过率、单一信任分数或 Agent 自述替代可追踪证据。

上述语义已经确认。后续测试框架、CI、安全扫描和评价工具只能作为 Evidence Provider 接入，不得降低 Claim 覆盖、来源追踪、独立性和 Gate 求值要求。
