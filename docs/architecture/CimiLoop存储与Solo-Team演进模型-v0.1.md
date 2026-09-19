# CimiLoop 存储与 Solo–Team 演进模型 v0.1

> 状态：讨论确认稿
> 日期：2026-09-19
> 范围：定义 Store Port、事务一致性、可移植事实、备份、Export/Import 与 Embedded Solo Mode 到 Shared Team Mode 的迁移语义；不定义数据库表、ORM、云拓扑或高可用实现。

## 1. 文档定位

本文回答“V1 使用 SQLite 和本地文件时，如何保证未来迁移到 PostgreSQL 与共享服务，不改变 Cimi Change Protocol、稳定身份和历史事实”。

本文承接：

- `docs/architecture/CimiLoop整体能力架构-v0.1.md`；
- `docs/architecture/CimiChangeProtocol核心领域模型-v0.1.md`；
- `docs/architecture/CimiLoopChange端到端状态机-v0.1.md`；
- `docs/architecture/CimiLoop工作台与变更空间交互模型-v0.1.md`。

存储实现可以替换，但领域身份、版本、事件、授权、证据和审计语义不能随数据库变化。

## 2. 核心原则

1. **Protocol 与 Store 分离**：领域对象和事件不等于数据库表或文件目录。
2. **相同 Kernel 语义**：Solo 与 Team 使用同一 Command、聚合规则、Gate 和 Event 语义。
3. **Event-backed State**：Current State 与 append-only Event Ledger 并存，不采用纯 Event Sourcing。
4. **一次命令一次原子提交**：状态、不可变记录、Event、Outbox 和幂等结果在同一事务边界提交。
5. **跨聚合最终一致**：单个 Command 只主要写入一个聚合；跨聚合后续动作由 Event/Outbox 驱动。
6. **稳定身份不重映射**：Export/Import 和 Store 更换后保留 Internal ID、Domain Version、Digest 与谱系。
7. **运行协调不冒充业务历史**：Lease、Lock、Heartbeat 和调度检查点不进入默认可移植事实。
8. **原始大内容留在权威系统**：代码、Transcript、日志和制品内容通过 External Reference 与 Digest 关联。
9. **迁移不做双写**：Solo 到 Team 切换必须建立迁移屏障，禁止两个 Kernel 同时成为写入权威。
10. **导入先校验后生效**：Schema、完整性、身份、历史连续性和外部引用问题必须在激活前显式呈现。

## 3. 三类持久化内容

| 类别 | 典型内容 | 是否可移植 | 恢复方式 |
|---|---|---:|---|
| Core Durable Facts（核心持久事实） | Project、Change、Contract/Plan、Decision、Evidence、Event、Transition、Assignment、Release、Deployment | 是 | Export/Import 或同实例备份恢复 |
| Kernel Runtime State（内核运行状态） | Lease、Resource Lock、Heartbeat、Scheduler Checkpoint、Outbox 执行状态、临时重试计数 | 默认否 | 启动核对、超时、重建或同实例备份恢复 |
| External / Large Content（外部或大型内容） | Git 内容、完整 Transcript、工具输出、CI 日志、二进制 Artifact、平台资源 | 内容默认否；引用可移植 | 通过 External Reference 重新定位并用 Digest 核对 |

Derived Read Model（派生查询模型）不属于任何事实权威，可以删除并从 Current State、Event 和核心记录重建。

## 4. 逻辑 Store Port

Kernel 依赖逻辑 Port，而不是具体数据库 API：

| Store Port | 主要内容 |
|---|---|
| ProjectStore | Project、Profile、Policy、Environment 与项目级配置 |
| ChangeStore | Change 聚合、Current State、Contract/Plan 当前引用和 Revision |
| EventStore | append-only Event Ledger 与 Event Sequence |
| WorkItemStore | Task 关联、Work Item、授权边界与业务结果 |
| RunStore | 可移植 Agent Run Record、Context/Capability Manifest 引用 |
| ArtifactManifestStore | Artifact 身份、来源、Digest 与 External Reference |
| EvidenceStore | Claim、Evidence、Requirement Set、Gate Evaluation 与 Package Manifest |
| DecisionStore | Decision Request、Decision、Policy Exception 与授权历史 |
| IdentityStore | Actor、Role、Assignment 与 Delegation |
| DeliveryStore | Release、Deployment、Recovery 与 Reconciliation 业务事实 |
| OutboxStore | 事务后外部动作与投递状态 |
| ReadModelStore | Workbench、Change Room、Timeline、Attention 与 Decision Inbox 投影 |

这些 Port 是逻辑职责边界，不要求“一 Port 一数据库”或“一对象一表”。Solo 可以全部由一个 SQLite 数据库和本地内容目录实现；Team 可以按容量和可用性拆分。

## 5. Command 事务边界

一次 Command 的标准提交过程为：

```text
读取 Command Idempotency Key
→ 加载目标 Aggregate 与 Revision
→ 校验身份、Role、状态、版本、Policy 和 Gate
→ 产生新 Current State / 不可变记录
→ 追加 Event
→ 写入 Outbox Task
→ 保存 Command Result
→ 同一事务提交
```

原子性要求：

- 状态变化不能提交而 Event 丢失；
- Event 不能存在而对应聚合变化未提交；
- 需要外部副作用时，Outbox 必须与业务事实同事务写入；
- 同一 Idempotency Key 重复提交返回原结果，不重复产生状态变化或副作用；
- Aggregate Revision 不匹配时拒绝旧 Command，不使用最后写入覆盖。

外部动作只能在事务提交后执行。外部结果通过新 Command/Event/Evidence 回传，不延长数据库事务等待网络或 Agent。

## 6. 跨聚合一致性

单个 Command 只有一个主要写入聚合。需要影响其他聚合时：

1. 主要聚合提交事实 Event；
2. Outbox 可靠投递内部或外部后续动作；
3. 目标聚合根据当前 Revision 和幂等键处理；
4. 失败产生可重试 Outbox、Failure、Blocker 或 Reconciliation；
5. Read Model 最终收敛。

跨聚合不使用分布式数据库事务，也不通过直接更新多个 Store 绕过各自不变量。

## 7. Event Ledger 与 Current State

### 7.1 Current State

Current State 服务于高效读取、并发校验和调度，至少保存：

- 当前多维 Change 状态；
- 当前 Contract/Plan/Profile/Risk 引用；
- 当前 Change Owner 与关键责任引用；
- Aggregate Revision；
- 最新成功 Transition 与 Event Sequence；
- 当前可调度/等待/阻塞摘要。

### 7.2 Event Ledger

Event Ledger 保存不可变、按项目或流可靠排序的领域事实。Event Sequence 提供顺序，时间戳只表达发生或记录时间。

### 7.3 一致性核对

启动、恢复、导入后和定期维护时可以执行：

- Current State 与最新 Transition/Event 是否一致；
- 引用的 Contract/Plan Version、Decision、Gate Evaluation 是否存在；
- Event Sequence 是否连续或明确分段；
- Outbox 是否存在已提交但未执行事项；
- 外部状态未知的 Deployment 是否需要 Reconciliation；
- Read Model 是否需要重建。

CimiLoop 不要求仅从 Event 重放整个世界，但 Event 和不可变记录必须足以解释当前状态为何合法。

## 8. Transactional Outbox

Outbox 表达“事务提交后需要可靠执行的动作”，例如启动 Agent Run、触发测试、部署、通知或重建投影。

规则如下：

- Outbox Task 只在业务事务提交后可领取；
- 每个 Task 具有稳定幂等键和目标能力；
- 领取使用 Lease，超时后可以安全重领；
- 已发送不等于外部成功，必须等待回传或主动核对；
- 投递失败不撤销已提交业务事实；
- 外部结果未知时创建 Reconciliation，而不是把 Outbox 标为成功或直接重发；
- 关键结果提升为 Run、Deployment、Evidence、Failure 或 Event。

Outbox 内部游标、尝试计数和 Lease 属于 Kernel Runtime State，不成为长期业务语义。

## 9. Embedded Solo Mode

V1 的本地持久化模型：

```text
开发者电脑
├── CimiLoop Kernel
├── SQLite
│   ├── Aggregate Current State
│   ├── Immutable Records / Event Ledger
│   ├── Outbox / Runtime Coordination
│   └── Rebuildable Read Models
├── Local Content Store
│   ├── 小型 Manifest / Package
│   └── 可选择纳入备份的内容寻址对象
└── External References
    ├── Git / Workspace
    ├── cimicode Runtime
    └── CI/CD / DevOps / Artifact Registry
```

Solo Mode 仍执行 Revision、Event、Outbox、Actor、Role 和 Decision 规则，不因为只有一个用户而使用简化到不可迁移的本地专用语义。

SQLite 单写者边界适合 Embedded Solo Mode。并发 Agent/Adapter 通过 Kernel Command 队列、乐观并发、Lease 与 Resource Lock 协调，而不是直接并发写数据库。

## 10. Shared Team Mode

Team Mode 的推荐持久化职责：

```text
多个 Human / Runtime Host
        ↓ Command / Query / Event
CimiLoop Shared Service
├── Kernel
├── PostgreSQL
│   ├── Aggregates / Immutable Records / Event Ledger
│   ├── Outbox / Lease / Lock
│   └── Read Models
└── Shared Object Store
    └── 允许共享的 Manifest、Package 与附件
```

代码、Worktree、完整 Transcript、工具输出、密钥和可不共享的大型内容继续保留在执行 Host 或外部权威系统。Team Store 保存可移植 Run 摘要、Digest 与 External Reference。

Team Mode 增加多用户身份、并发写入、共享队列、通知路由和服务可用性，但不改变 Change 聚合边界和状态机。

## 11. Backup 与 Portable Export 的区别

| 机制 | 目的 | 内容 | 是否跨实现 |
|---|---|---|---:|
| Backup（备份） | 同一部署灾难恢复 | 数据库、Outbox、运行协调状态和受管文件的实现级快照 | 不保证 |
| Portable Export（可移植导出） | 迁移、归档、交换或独立校验 | Cimi Change Protocol 事实、Manifest、必要可携带内容与外部引用 | 是 |

Backup 可以依赖 SQLite/PostgreSQL 的具体机制；Portable Export 只能依赖协议对象 Schema 和 Export Manifest。

不能用逻辑 Export 代替在线实例的一致性备份，也不能把数据库文件复制当作跨 Solo/Team 的协议迁移。

## 12. Portable Export

### 12.1 Export Manifest

Export Manifest 至少在语义上声明：

- Manifest Schema Version；
- Project ID、显示信息和导出范围；
- 创建时间、导出者和来源实例；
- 包含的 Object Type、Schema Version、数量与顺序范围；
- Event Sequence 范围和最新 Aggregate Revision；
- 内容清单、单项 Digest 与整体 Root Digest；
- 被排除内容与原因；
- External Reference 可用性快照；
- Purge/Redaction 占位和敏感信息处理声明；
- 是否满足迁移用 quiesced snapshot（静止快照）条件。

### 12.2 默认包含

- Project、Profile、Policy、Environment；
- Actor、Role、Assignment 与 Delegation；
- Change、Contract/Plan、Task、Risk 与关系；
- Work Item 与可移植 Run Record；
- Artifact/Context/Capability Manifest；
- Claim、Evidence、Gate、Decision、Transition；
- Release、Deployment、Recovery、Failure、Blocker、Feedback、Learning Candidate；
- Event Ledger 与必要 Current State snapshot；
- 允许携带的小型 Package/附件。

### 12.3 默认排除

- 凭据、令牌、私钥和签名 URL；
- Work Item Lease、Resource Lock、Heartbeat 与 Scheduler Checkpoint；
- 未投递 Outbox Task 的执行所有权；
- Derived Read Model；
- 完整 Conversation、Transcript、Tool Call 和命令输出；
- Git 仓库内容、Worktree、CI 大日志和二进制 Artifact，除非使用显式可携带附件策略；
- Host 本地路径和不可移植进程信息。

被排除不等于删除历史。Export 保留允许的 External Reference、Digest 和“内容未包含”说明。

## 13. Portable Import

Import 分为验证、暂存、重建和激活四步：

```text
读取 Export Manifest
→ 校验 Schema、Digest、对象引用和事件连续性
→ 写入隔离 Staging Area
→ Upcast 为当前逻辑模型但保留原 Payload/Schema
→ 重建 Current State 与 Read Model 并交叉核对
→ 核对 External Reference、Actor 和 Environment 映射
→ 生成 Import Report
→ 明确激活后才允许 Command
```

Import 不在校验过程中修改原包，也不批量改写历史 Payload。

### 13.1 身份与历史规则

- Internal ID、Domain Version、Event ID、Artifact Digest 和关系谱系保持不变；
- Display Key 可以按目标项目展示规则重新生成，但不能替代 Internal ID；
- 外部 URL 可以更新 Locator，但 External Reference 身份不能静默重映射；
- Actor 可以关联目标组织身份，但历史 Decision 继续引用原 Actor ID；
- 无法访问的外部内容标记 Unavailable，不伪造本地副本或删除历史。

### 13.2 冲突规则

V1 Portable Import 不是双向同步或自动合并工具：

- 导入到新目标：保留原 Project ID 和全部对象身份；
- 导入到已有同 Project ID 的目标：只有目标历史与导入包共同前缀一致且目标没有分叉时，才允许幂等或 fast-forward 导入；
- 同一 Project ID 出现不同 Event/Revision 历史时拒绝激活并生成 Conflict Report；
- 不自动重编号、覆盖、拼接或选择“较新时间戳”；
- 需要整合分叉时，通过明确的项目迁移/合并流程产生新事实，而不是篡改任一历史。

## 14. Solo 到 Team 的迁移屏障

进行中 Kernel 不能边写 Solo Store 边复制到 Team Store。迁移步骤为：

1. **Prepare**：检查 Schema、存储健康、外部引用和可用空间；
2. **Quiesce**：暂停新调度和新 Command，等待可安全完成的事务提交；
3. **Drain**：完成、取消或安全停止 Agent Run 与外部操作；
4. **Reconcile**：核对所有未知 Deployment、Outbox 与外部副作用；
5. **Snapshot**：生成满足迁移条件的 Portable Export 与 Root Digest；
6. **Import**：在 Team Staging Area 校验、重建和生成报告；
7. **Map**：关联 Team Actor、Role、Environment、Adapter 与 Runtime Host；
8. **Verify**：比较对象数量、Event Sequence、Current State、Digest 和 Gate/Decision 引用；
9. **Activate**：Team Kernel 成为唯一写入权威；
10. **Seal Solo**：原 Solo 项目进入只读迁移完成状态，防止 split-brain；
11. **Resume**：重新解析 Lease、Lock、Capability 和外部可用性后恢复调度。

迁移不尝试继续原 Agent Session。未完成工作由 Team Kernel 基于既有 Work Item 状态创建新 Run 或显式重新授权。

## 15. 外部引用与执行 Host

迁移后 External Reference 可能出现：

- Available：目标仍可访问并已核对；
- Relocated：同一外部资源更新 Locator；
- Unavailable：资源暂时或永久不可访问；
- RequiresRemap：目标需要管理员明确关联对应实例；
- IntegrityMismatch：内容与历史 Digest 不一致。

只有 Locator 可以在身份不变时更新。外部系统实例或资源身份变化需要新 External Reference 和显式关系。

Runtime Host 重新注册后获得新的 Host/Capability 身份。旧 Run 仍引用原 Host 和 Provider；不能把历史执行伪装成由新 Host 完成。

## 16. Read Model 与客户端一致性

- Command 以 Kernel 事务结果为准；
- Workbench 从 Read Model 查询，允许短暂延迟；
- UI 在 Command 已提交但投影未更新时显示 pending projection，不重复发送；
- 投影记录消费到的 Event Sequence，可检测落后和重建；
- 删除或重建 Attention、Timeline、Decision Inbox、Board 不影响领域事实；
- Team Mode 客户端不直接写共享数据库，统一通过 Command API。

## 17. 生命周期、保留与清除

- Close 停止正常业务调度，但事实仍保留并可查询；
- Archive 只改变默认视图，不删除历史；
- V1 不提供 Project/Change 常规 Hard Delete；
- Backup 与 Export 遵循 Project Policy 的保留和加密要求；
- Purge/Redaction 使用独立受控流程，在原位置留下不含敏感内容的审计占位；
- 已导出的旧包不会被源实例自动远程擦除，导出前必须执行数据边界检查；
- Team Mode 的共享附件只保存 Policy 允许跨 Host 共享的内容。

## 18. 故障恢复

Kernel 启动或异常恢复时：

1. 校验数据库和 Schema；
2. 核对最近事务、Event Sequence 与 Aggregate Revision；
3. 重新领取过期 Lease，释放确认失效的 Lock；
4. 检查未完成 Outbox；
5. 对结果未知的外部动作执行 Reconciliation；
6. 将失联 Run 转化为明确状态、Failure 或新调度候选；
7. 重建或追平 Read Model；
8. 恢复满足 Gate 和授权条件的调度。

不得仅因本地进程重启就假设外部动作失败或重新执行。

## 19. V1 边界

V1 必须实现：

- SQLite + Local Files 的 Embedded Solo Store；
- 逻辑 Store Port 和实现无关的领域序列化；
- Current State、Event Ledger、Outbox 和幂等结果同事务提交；
- Aggregate Revision、Event Sequence、Lease 与 Resource Lock；
- 可重建 Read Model；
- Project 级 Portable Export/Import Manifest；
- 稳定 ID、Schema、Digest、External Reference 和历史引用保留；
- 导入前完整性校验与 Import Report；
- Solo→Team 迁移屏障与原实例只读封存语义。

V1 不承诺：

- 在线 Solo/Team 双向同步；
- 自动合并分叉 Project 历史；
- 多主写入或离线协同编辑；
- 跨区域 PostgreSQL 高可用拓扑；
- 完整二进制 Artifact 和 Runtime Transcript 的默认搬迁；
- 通用数据湖、事件流平台或企业备份产品。

Shared Team Mode 的服务实现可以后续交付，但 V1 的 ID、Event、Store Port 与 Export/Import 必须通过迁移测试验证。

## 20. Kernel 不变量

1. Current State、不可变事实、Event、Outbox 和幂等结果按 Command 原子提交。
2. Adapter、Runtime、Read Model 和客户端不能直接修改核心 Store。
3. 跨聚合更新通过 Event/Outbox 驱动，不绕过目标聚合不变量。
4. Export/Import 后 Internal ID、Domain Version、Digest 和历史引用保持不变。
5. Lease、Lock、Heartbeat 和未完成 Outbox 执行所有权不作为可移植业务事实激活。
6. Import 必须先进入 Staging 并完成校验，不能边导入边接受业务 Command。
7. 分叉历史不得按时间戳自动覆盖或合并。
8. Solo→Team 切换后只能有一个 Kernel 写入权威，原 Solo 实例只读封存。
9. 外部内容不可访问时保留引用并标记状态，不伪造已迁移或已验证。
10. Derived Read Model 可以重建，且永远不能反向成为事实权威。

## 21. 阶段结论

本模型采用“相同 Protocol/Kernel + 可替换 Store Port + Event-backed State + 原子 Outbox + 逻辑 Export/Import + 迁移屏障”的演进路径，使 Embedded Solo Mode 能在不重写领域历史的前提下迁移到 Shared Team Mode。

上述语义已经确认。后续数据库、对象存储、部署拓扑与同步机制可以独立演进，但不得改变稳定身份、原子提交、历史不可改写、导入先校验和单一写入权威等约束。
