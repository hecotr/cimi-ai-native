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

当前仓库仍以架构与规划文档为主，尚未进入正式代码实现。下一阶段是 M0：Kernel 最小闭环。

## 建议阅读顺序

1. [CimiLoop 整体架构通俗解读](docs/architecture/CimiLoop整体架构通俗解读-v0.1.md)：适合第一次了解 CimiLoop。
2. [CimiLoop 整体能力架构](docs/architecture/CimiLoop整体能力架构-v0.1.md)：正式架构总纲。
3. [CimiLoop V1 产品范围与实施里程碑](docs/plans/2026-09-19-cimiloop-v1产品范围与实施里程碑-v0.1.md)：了解首个版本交付什么。
4. [文档导航](docs/README.md)：查看完整架构、协议、角色与计划文档。

## 核心原则

- Change-centered（以变更为中心）：研发活动统一归属于可追踪的 Change。
- Kernel-authoritative（内核权威）：只有 Kernel 可以推进生命周期状态和记录 Gate（关卡）结论。
- Runtime-neutral（运行时中立）：Agent Runtime 可以替换，领域协议和治理语义保持稳定。
- Evidence-based（基于证据）：声明完成不等于完成，Gate 必须基于可验证 Evidence（证据）作出判断。
- Knowledge-closed（知识闭环）：代码、产品和业务事实变化后，相关知识必须同步或明确判定无需更新。
- Local-first（本地优先）：V1 先交付 Embedded Solo Mode，同时预留稳定 ID、Store Port、Event 和 Export/Import 边界。

## 仓库结构

```text
.
├─ docs/
│  ├─ architecture/   # 正式架构、领域模型、协议与流程规范
│  ├─ plans/          # 讨论记录、决策账本、产品范围与实施计划
│  └─ articles/       # 面向传播和理解的流程文章
├─ imgs/              # 现有研究材料引用的图片
├─ *.md               # 项目早期行业调研与选型材料
├─ .agents/skills/    # Agent 技能入口（当前为开发环境链接）
└─ .claude/skills/    # Claude Code 技能入口（当前为开发环境链接）
```

## V1 北极星流程

```text
创建 Change
  → 澄清并批准 Contract（变更契约）
  → 生成并批准 Plan（计划）
  → 执行 Work Item（工作项）
  → 产出 Artifact / Claim / Evidence（产物 / 声明 / 证据）
  → 完成 Verification 与 Knowledge Closure（验证与知识闭环）
  → Gate Evaluation（关卡评估）
  → 关闭 Change，并保留完整事件与决策记录
```

## 下一阶段

进入 M0 前只做一轮受控的实施设计，确定：

1. 技术栈与代码仓库布局；
2. Protocol、Kernel、Store、CLI 的模块边界；
3. 首批 ID、Reference、Command、Event 和错误语义；
4. Store Port、事务、Outbox（发件箱）与幂等实现策略；
5. 第一个可运行的纵向闭环及其契约测试。

完成这组决策后，直接开始实现，不再扩展宏观架构讨论。
