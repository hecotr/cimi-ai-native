# CimiLoop 实施设计

本目录承接已经确认的领域架构，将其转化为可执行的工程决策、模块契约和 M0–M5 实施方案。实施文档可以细化技术形式，但不能绕过 Kernel 权威、聚合边界和 Cimi Change Protocol 的既有语义。

## 当前阶段

- 当前里程碑：M0 Kernel 最小闭环设计。
- 当前状态：M0 关键产品边界和实施架构已确认，可以创建工程骨架并编码。
- 实施基线：[CimiLoop M0 实施架构 v0.1](2026-09-19-cimiloop-m0实施架构-v0.1.md)。

## 已确认技术决策

| 编号 | 决策 | 状态 | 说明 |
|---|---|---|---|
| I-001 | TypeScript + Node.js | 已确认 | 作为 CimiLoop V1 的实现语言与运行平台；不改变 Protocol 和 Harness 的运行时中立性。 |
| I-002 | Node.js 24 LTS + pnpm Workspace | 已确认 | Node.js 使用 24 LTS 基线；pnpm 管理多包工作区并锁定准确版本，开发环境与 CI 显式安装，不依赖系统预装的 Corepack。 |
| I-003 | Monorepo 模块布局 | 已确认 | 使用 `apps/cli` 与 `packages/protocol`、`packages/kernel`、`packages/store`、`packages/store-sqlite`；包内放单元测试，根目录 `tests/scenarios` 放跨模块端到端场景。 |
| I-004 | Protocol Schema 工具链 | 已确认 | TypeBox 是 TypeScript 内的 Schema 定义源，导出 JSON Schema 2020-12 作为跨语言协议制品，Ajv strict mode 负责所有外部边界的运行时校验；不重复手写 Protocol interface。 |
| I-005 | M0 演示边界 | 已确认 | M0 实现 Project 初始化、Draft Change 创建与查询、暂停/恢复、非法操作解释、重启恢复、命令幂等及 Event/Current State 一致性；真实 `Draft → IntentReady` 留到 M1。 |
| I-006 | Repository 与 Project 默认映射 | 已确认 | Embedded Solo Mode 默认一个本地 Git Repository 对应一个 CimiLoop Project；`cimiloop init` 自动发现 Git 根目录，非 Git 目录允许显式初始化，多仓库 Project 只预留协议能力。 |
| I-007 | Project Store 与全局索引 | 已确认 | 每个 Git Repository 在 Git Common Directory 下保存独立权威 `project.db` 和项目内容；用户级 `registry.db` 只保存可重建的项目位置与最近使用信息，不能修改领域状态或成为 Kernel 权威。 |
| I-008 | CLI 名称与双输出模式 | 已确认 | 可执行命令统一命名为 `cimiloop`；人类默认使用友好文本，Agent 与自动化使用符合 Protocol Schema 的 `--json` 输出，二者调用同一 Kernel Command。 |
| I-009 | Solo 身份初始化 | 已确认 | `cimiloop init` 读取 Git `user.name`/`user.email` 作为建议，经用户确认后创建稳定 Human Actor 与 Project Owner Assignment；Git 邮箱不是内部主键，Agent 不得借用该身份批准 Gate。 |
| I-010 | M0 SQLite Driver | 已确认 | 使用 Node.js 24 自带的 `node:sqlite`，最低 24.15，并完全封装在 `store-sqlite`；不使用 ORM，兼容性不满足时只替换 Store Adapter。 |
| I-011 | M0 Kernel 执行模型 | 已确认 | Command Handler 使用纯领域函数和注入的 ID/Clock；Current State、不可变记录、Event、Outbox 与 Command Receipt 在同一 Unit of Work 原子提交。 |
| I-012 | M0 身份与展示键 | 已确认 | Internal ID 使用 UUIDv7；Change Display Key 使用项目内 `CHG-0001`，只用于交互，Typed Reference 和迁移始终使用 Internal ID。 |

## 技术决策协作方式

TypeScript 与 Node.js 的常规工程选择由实现负责人按稳定性、可维护性和可测试性直接决策、记录并验证，不逐项请求产品负责人确认；说明时优先使用 Java/Python 类比。涉及产品语义、领域边界、协议兼容性、数据迁移或交付范围的决定仍需显式确认。

## 推荐的代码边界

代码使用以下模块职责，并保持依赖单向：

```text
apps/
└─ cli/                 # V1 用户入口与本地编排
packages/
├─ protocol/            # 稳定 ID、引用、Command/Event Envelope 与 Schema
├─ kernel/              # 聚合规则、状态机、Gate 与命令处理
├─ store/               # Kernel 使用的逻辑 Store Port
└─ store-sqlite/        # Embedded Solo Mode 的 SQLite 实现
tests/
└─ scenarios/           # 跨模块的 Change 端到端行为场景
```

依赖规则：`kernel` 依赖 `protocol` 与 `store`，`store` 只依赖 `protocol`，`store-sqlite` 依赖 `store` 与 `protocol`，`cli` 负责组装 `kernel` 与 `store-sqlite`。Kernel 不得依赖 CLI、SQLite 或具体 Agent Runtime。

Workbench、Team Server 和具体 Agent Runtime Adapter 不进入 M0 工程骨架；它们在核心闭环成立后按里程碑加入。

## M0 待完成的工程设计

1. Kernel API、Command Handler 和错误模型；
2. Store Port、SQLite 事务、Outbox 和幂等边界；
3. 第一个纵向切片的 CLI 命令细节与验收测试。

## M0 纵向演示

```text
初始化 Project
→ 创建 Draft Change
→ 查询 Change
→ 暂停并恢复 Change
→ 非法操作返回稳定错误与解释
→ 重启进程后恢复权威状态
→ 重复 Command 不重复产生 Event 或 Outbox
```

M0 只证明 Kernel 权威、事务一致性、事件留痕、幂等与恢复机制成立。`Draft → IntentReady` 需要真实 Contract、Risk、Profile、Decision 与 Gate，属于 M1，不在 M0 使用临时审批逻辑模拟。

## CLI 入口

V1 使用与产品同名的 `cimiloop` 可执行命令。人类默认获得中文友好的文字或表格输出；Claude Code、OpenCode 和脚本使用 `--json` 获得稳定结构。修改类命令支持 `--command-id` 与 `--expected-revision`，所有调用都经过相同 Kernel，不提供 Agent 绕过接口。

`cimiloop init` 可以读取 Git 用户名和邮箱作为 Human Actor 建议，但必须由用户确认或通过显式参数提供。确认后初始化 Project Owner Assignment；Git 身份信息只作为来源属性，CimiLoop 使用独立稳定 Actor ID。

## 本地存储拓扑

- Git 项目的权威库位于 Git Common Directory 下的 `cimiloop/project.db`，因此同一 Repository 的多个 Worktree 共享一个 Project。
- 项目级 `objects/` 保存由 CimiLoop 管理的内容寻址附件；缓存、暂存与备份使用独立子目录并应用不同清理规则。
- 用户级 `registry.db` 只用于发现和展示本机项目，是可重建 Read Model（读模型），不保存 Change 权威状态。
- Git clone 不复制 Solo 状态；跨设备和 Solo→Team 迁移必须使用 Portable Export/Import。
