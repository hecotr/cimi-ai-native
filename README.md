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

项目已经进入 V1 Release Candidate。M0–M5 均已在 Node.js 24.15.0 + pnpm 12.4.2 基线上交付：可恢复 Kernel、Intent/Plan Decision、执行切片、Independent Evaluation、Test/Production Delivery 与 Recovery、Knowledge Closure、Portable Export/Import 与完整 Workbench 投影。认证见 [北极星测试](tests/acceptance/v1-north-star.test.ts) 与 [demo-v1](scripts/demo-v1.ps1)。

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
├─ apps/
│  ├─ cli/            # cimiloop 命令行入口与本地装配
│  └─ workbench/      # 本地 Decision / Change Room
├─ packages/
│  ├─ protocol/       # Protocol Schema、ID、Command/Event 与校验
│  ├─ kernel/         # 聚合规则、状态转换和命令处理
│  ├─ store/          # Kernel 使用的逻辑 Store Port
│  ├─ store-sqlite/   # Embedded Solo Mode SQLite 实现
│  ├─ portability/    # Portable Export digest 与 Import staging
│  ├─ context/        # Context Pack 与 Capability Resolver
│  ├─ workspace-git/  # 隔离 Git worktree
│  ├─ runtime/        # Runtime Adapter Port
│  ├─ runtime-claude-code/
│  ├─ evaluator/      # 独立评价，无生产写权限
│  ├─ devops/         # DevOps Adapter Port
│  ├─ devops-command/ # argv-only Command Adapter
│  └─ orchestrator/   # Run 编排与恢复
├─ tests/
│  ├─ scenarios/      # M0–M4 跨模块场景
│  ├─ acceptance/     # V1 北极星、异常与 CLI
│  ├─ faults/         # 故障注入
│  └─ security/       # 安全与审计
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

## 已支持能力与认证

| 能力 | 认证 |
|---|---|
| Feature 闭环到 Close + Export | [v1-north-star.test.ts](tests/acceptance/v1-north-star.test.ts)、[demo-v1.ps1](scripts/demo-v1.ps1) |
| Intent / Plan Decision | [demo-m1.ps1](scripts/demo-m1.ps1)、`tests/scenarios/m1-cli.test.ts` |
| Work Item / Run / Artifact | [demo-m2.ps1](scripts/demo-m2.ps1) |
| Independent Evaluation | [demo-m3.ps1](scripts/demo-m3.ps1)、`tests/acceptance/v1-exceptions.test.ts` |
| Test / Production / Recovery | [demo-m4.ps1](scripts/demo-m4.ps1) |
| Knowledge Closure | `packages/kernel/test/knowledge-closure.test.ts` |
| Portable Export/Import | `packages/kernel/test/export.test.ts`、`packages/kernel/test/import.test.ts` |
| Workbench 六阶段 Room | `apps/workbench/test/workbench.test.ts` |
| 故障 / 安全 / 审计 | [v1-faults.test.ts](tests/faults/v1-faults.test.ts)、[audit-v1.ps1](scripts/audit-v1.ps1) |

操作说明见 [V1 操作指南](docs/implementation/2026-09-20-cimiloop-v1操作指南-v0.1.md)。发布门禁见 [V1 发布检查清单](docs/implementation/2026-09-20-cimiloop-v1发布检查清单-v0.1.md)。

## 明确未实现

- 导入后自动激活 Runtime ownership
- 云 DevOps 平台 Adapter、登录、实时协作、完整 SPA
- Agent 批准 Contract / Plan / Production Release
- Hard Delete、staging 环境

```text
powershell -NoProfile -File scripts/demo-m1.ps1
powershell -NoProfile -File scripts/demo-m2.ps1
powershell -NoProfile -File scripts/demo-m3.ps1
powershell -NoProfile -File scripts/demo-m4.ps1
powershell -NoProfile -File scripts/demo-v1.ps1
```
