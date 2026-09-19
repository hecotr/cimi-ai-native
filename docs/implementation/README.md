# CimiLoop 实施设计

本目录承接已经确认的领域架构，将其转化为可执行的工程决策、模块契约和 M0–M5 实施方案。实施文档可以细化技术形式，但不能绕过 Kernel 权威、聚合边界和 Cimi Change Protocol 的既有语义。

## 当前阶段

- 当前里程碑：M0 Kernel 最小闭环设计。
- 当前状态：技术栈已确认，代码布局、接口形式与首个纵向切片待讨论。
- 实现开始条件：M0 实施架构中的关键边界确认后，立即创建工程骨架并编码。

## 已确认技术决策

| 编号 | 决策 | 状态 | 说明 |
|---|---|---|---|
| I-001 | TypeScript + Node.js | 已确认 | 作为 CimiLoop V1 的实现语言与运行平台；不改变 Protocol 和 Harness 的运行时中立性。 |

## 推荐的代码边界

后续讨论以以下模块职责为起点，不把目录名称提前视为不可修改的协议：

```text
apps/
└─ cli/                 # V1 用户入口与本地编排
packages/
├─ protocol/            # 稳定 ID、引用、Command/Event Envelope 与 Schema
├─ kernel/              # 聚合规则、状态机、Gate 与命令处理
├─ store/               # Kernel 使用的逻辑 Store Port
└─ store-sqlite/        # Embedded Solo Mode 的 SQLite 实现
tests/
├─ contract/            # Protocol、Store Port 和 Adapter 契约测试
└─ scenarios/           # Change 端到端行为场景
```

Workbench、Team Server 和具体 Agent Runtime Adapter 不进入 M0 工程骨架；它们在核心闭环成立后按里程碑加入。

## M0 待确认事项

1. Node.js 版本基线、包管理器和工作区工具；
2. Protocol 的 Schema 表达与运行时校验方式；
3. Kernel API、Command Handler 和错误模型；
4. Store Port、SQLite 事务、Outbox 和幂等边界；
5. 第一个纵向切片及验收测试。
