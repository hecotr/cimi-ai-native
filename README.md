# CimiLoop

CimiLoop 是一个面向 AI-Native 软件研发的 Runtime-neutral Harness（运行时中立研发控制框架）。它围绕一个 Change（变更）组织意图、计划、执行、证据、决策与知识更新，让 Claude Code、OpenCode 等 Agent Runtime 在统一协议和治理边界下完成可恢复、可审计、可闭环的研发流程。

## 当前状态

项目目前已完成从整体能力架构到 V1 产品范围的主要设计工作：

- 已确认六个一级能力域，以及 Kernel（内核）作为 Change 生命周期唯一状态权威。
- 已完成核心领域模型、聚合边界、身份与版本关系设计。
- 已完成 Cimi Change Protocol（Cimi 变更协议）、状态机、事件模型和命令语义设计。
- 已完成 V1 Embedded Solo Mode（嵌入式单人模式）的范围、里程碑与验收口径。
- 已补充 Knowledge Closure（知识闭环），把受影响文档更新纳入 Change 的任务、证据和关闭条件。
- V1 首批 Agent Runtime 目标为 OpenCode 和 Claude Code；cimicode 是企业内部基于 OpenCode 二次开发的 Runtime，后续通过同一适配边界接入。

项目已经进入正式实现阶段。M0 首个可恢复纵向切片已经可以运行：初始化 Project、创建 Draft Change、查询、暂停、恢复、幂等重放、Revision 冲突检查、Event/Outbox 原子提交及重启恢复。Contract、Plan、Gate 和 Agent Runtime Adapter 从后续里程碑逐步加入。

2026-09-29 文档校准：以上保留原设计与 M0 实现记录。现行流程继续采用 N1–N5，七段文章只是讲解顺序；需求 / 缺陷统一身份、目标版本可选及项目级共享发布已进入修订架构，但完整字段、状态与迁移尚未冻结。V1 旧范围及 M1–M5 / 原型计划待重对齐，暂不直接执行，不能据文档更新声称代码已迁移。详见 [文档适用状态](docs/README.md)。

## 建议阅读顺序

1. [AI Native 软件研发新范式](docs/articles/01-AI-Native软件研发新范式.md)：先沿 SkillsHub 版本需求理解七段流程，不先讲 CimiLoop。
2. [AI Native 软件研发流程基线](docs/architecture/AI-Native软件研发流程-v0.1.md)：已确认流程、协作边界与共同发布规则。
3. [CimiLoop 整体架构通俗解读](docs/architecture/CimiLoop整体架构通俗解读-v0.1.md)：再了解工具如何承载流程。
4. [CimiLoop 整体能力架构](docs/architecture/CimiLoop整体能力架构-v0.1.md)：正式架构总纲。
5. [CimiLoop V1 产品范围与实施里程碑](docs/plans/2026-09-19-cimiloop-v1产品范围与实施里程碑-v0.1.md)：旧范围参考，待按新流程重对齐，不直接执行。
6. [文档导航](docs/README.md)：查看完整架构、协议、角色与计划文档。

## 核心原则

- Change-centered（以变更为中心）：需求 / 缺陷在内部保持同一 Change 身份；项目级共同集成与发布关联实际纳入范围，不伪造额外需求承载部署。
- Kernel-authoritative（内核权威）：只有 Kernel 可以推进生命周期状态和记录 Gate（关卡）结论。
- Runtime-neutral（运行时中立）：Agent Runtime 可以替换，领域协议和治理语义保持稳定。
- Evidence-based（基于证据）：声明完成不等于完成，Gate 必须基于可验证 Evidence（证据）作出判断。
- Knowledge-closed（知识闭环）：代码、产品和业务事实变化后，相关知识必须同步或明确判定无需更新。
- Local-first（本地优先）：V1 先交付 Embedded Solo Mode，同时预留稳定 ID、Store Port、Event 和 Export/Import 边界。

## 仓库结构

```text
.
├─ apps/
│  ├─ cli/            # cimiloop 命令行入口与本地装配
│  └─ demo-web/       # 纯前端交互演示原型，不连接正式 Kernel
├─ packages/
│  ├─ protocol/       # Protocol Schema、ID、Command/Event 与校验
│  ├─ kernel/         # 聚合规则、状态转换和命令处理
│  ├─ store/          # Kernel 使用的逻辑 Store Port
│  └─ store-sqlite/   # Embedded Solo Mode SQLite 实现
├─ tests/
│  └─ scenarios/      # 跨模块和 CLI 端到端场景
├─ docs/
│  ├─ architecture/   # 正式架构、领域模型、协议与流程规范
│  ├─ plans/          # 讨论记录、决策账本、产品范围与实施计划
│  ├─ articles/       # 面向传播和理解的流程文章
│  ├─ research/       # 历史调研、选型输入及其图片
│  └─ implementation/ # 技术决策与 M0–M5 实施设计
├─ .agents/skills/    # 本地 Agent 辅助技能，不属于产品运行时
└─ .claude/skills/    # 本地 Claude Code 辅助技能，不属于产品运行时
```

## 本地开发

要求 Node.js 24.15+。项目精确使用 pnpm 12.4.2；尚未发布全局安装包，当前从源码运行：

```text
npx pnpm@12.4.2 install
npx pnpm@12.4.2 build
npx pnpm@12.4.2 test

node apps/cli/dist/bin.js --help
node apps/cli/dist/bin.js init
node apps/cli/dist/bin.js change create --title "第一个 Change"
node apps/cli/dist/bin.js change list
```

Agent 或脚本在命令中增加 `--json` 即可获得经过 Protocol Schema 校验的稳定结构输出。

交互式演示原型（固定数据，可离线）：

```text
npx pnpm@12.4.2 --filter @cimiloop/demo-web dev
```

讲解入口、7 个场景和 Presenter 快捷键见 [apps/demo-web/README.md](apps/demo-web/README.md)。

原型仍采用旧业务词汇与演示路径，尚未同步 2026-09-28 确认流程；不能把固定数据演示当成现行流程或能力已经实现。

## V1 北极星流程

这是目标闭环，不代表下列能力已全部实现。先理解独立研发流程，再讨论 CimiLoop 如何承载。

```text
录入需求 / 缺陷，先澄清，必要时平级拆分
  → 确认目标、范围、验收与实施计划
  → 人与 AI 按授权任务协作实施、自检和独立评价
  → 多需求合入 feature，共同构建与早期测试
  → 切出 release，测试环境切换并暂停 feature 覆盖
  → 修复优先，必要时安全剔除延期并验证最终软件包
  → 批准整批发布，同一获批软件包晋升生产
  → 生产验证或获准恢复
  → 逐需求确认交付、完成必要知识更新，保留记录
  → 观察效果、整理反馈，进入下一轮
```

## 下一阶段

下一步先沿 N1–N5 完善现行流程细则，再重对齐 V1 范围与 M1–M5 的任务和验收，另行确认后进入 M1。下述 M0 冻结记录继续保留，本轮未复验代码。

M0 已补齐 CLI 机器输出 Schema、JSON Schema 制品同步与全量注册、共享 Store Port 契约，以及事务回滚、幂等重放、双客户端 Revision 竞争、响应丢失恢复、数据库重开与 Outbox Lease 恢复测试，并已在 Node.js 24.15.0 + pnpm 12.4.2 基线上完成复验。M0 现已冻结；原计划中的 M1 包括真实 Contract、Risk、Profile、Decision、Gate、Plan 与 Knowledge Impact Assessment，仍需按新流程重对齐后再实施。实施边界见 [M0 实施架构](docs/implementation/2026-09-19-cimiloop-m0实施架构-v0.1.md)。
