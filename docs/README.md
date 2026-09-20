# CimiLoop 文档导航

本页是 CimiLoop 架构、协议和实施规划的统一入口。第一次了解项目时，建议先读“快速理解”；准备参与设计或实现时，再按“正式架构”顺序阅读。

## 快速理解

1. [CimiLoop 整体架构通俗解读](architecture/CimiLoop整体架构通俗解读-v0.1.md)
2. [CimiLoop AI-Native 软件研发流程规范](articles/02-CimiLoop-AI-Native软件研发流程规范-v0.1.md)
3. [AI-Native 软件研发新范式](articles/01-AI-Native软件研发新范式.md)

## 正式架构

建议按以下顺序阅读：

1. [整体能力架构](architecture/CimiLoop整体能力架构-v0.1.md)
2. [Cimi Change Protocol 核心领域模型](architecture/CimiChangeProtocol核心领域模型-v0.1.md)
3. [Change 端到端状态机](architecture/CimiLoopChange端到端状态机-v0.1.md)
4. [验证与证据模型](architecture/CimiLoop验证与证据模型-v0.1.md)
5. [上下文与知识模型](architecture/CimiLoop上下文与知识模型-v0.1.md)
6. [角色与权限模型](architecture/CimiLoop角色与权限模型-v0.1.md)
7. [工作台与变更空间交互模型](architecture/CimiLoop工作台与变更空间交互模型-v0.1.md)
8. [能力装配模型](architecture/CimiLoop能力装配模型-v0.1.md)
9. [工程交付与 DevOps 模型](architecture/CimiLoop工程交付与DevOps模型-v0.1.md)
10. [存储与 Solo–Team 演进模型](architecture/CimiLoop存储与Solo-Team演进模型-v0.1.md)

## 产品范围与计划

- [V1 产品范围与实施里程碑](plans/2026-09-19-cimiloop-v1产品范围与实施里程碑-v0.1.md)
- [V1 完整执行计划（开发 Agent 总入口）](plans/2026-09-20-cimiloop-v1-complete-execution-plan.md)
- [M1：Intent、Plan 与 Human Decision 实施计划](plans/2026-09-20-cimiloop-m1-intent-plan-decision-implementation-plan.md)
- [M2：Execution、Context 与 Immutable Artifact 实施计划](plans/2026-09-20-cimiloop-m2-execution-context-artifact-implementation-plan.md)
- [M3：Claim–Evidence 与 Independent Evaluation 实施计划](plans/2026-09-20-cimiloop-m3-evidence-evaluation-implementation-plan.md)
- [M4：Test、Production 与 Recovery 实施计划](plans/2026-09-20-cimiloop-m4-delivery-recovery-implementation-plan.md)
- [M5：Product Closure、Portability 与 Release Hardening 实施计划](plans/2026-09-20-cimiloop-m5-product-portability-release-implementation-plan.md)
- [Build / Adopt / Adapt 选型矩阵](plans/2026-09-19-cimiloop-build-adopt-adapt选型矩阵-v0.1.md)
- [能力架构讨论计划与决策账本](plans/2026-09-18-cimiloop-capability-architecture-discussion-plan.md)
- [AI-Native 研发操作模型](plans/2026-09-17-cimiloop-ai-native研发操作模型-v0.1.md)

## 背景研究

以下材料形成于正式架构之前，保留作为行业背景、方案来源和历史依据：

- [背景研究导航](research/README.md)
- [AI-Native Harness 开源项目深度调研与选型建议](research/AI-Native-Harness开源项目深度调研与选型建议-2026.md)
- [AI-Native 软件研发新范式行业深度调研](research/AI-Native软件研发新范式行业深度调研-2026.md)
- [AI-Native 软件研发新范式行业调研精炼版](research/AI-Native软件研发新范式行业调研-精炼版-2026.md)
- [AI-Native 产研全流程 v1.7 行业对标与 v2.0 优化建议](research/AI-Native产研全流程v1.7-行业对标与v2.0优化建议.md)

## 实施设计

- [实施设计导航与已确认技术决策](implementation/README.md)
- [M0 实施架构](implementation/2026-09-19-cimiloop-m0实施架构-v0.1.md)
- [M1 实施架构](implementation/2026-09-20-cimiloop-m1实施架构-v0.1.md)
- [M2 实施架构](implementation/2026-09-20-cimiloop-m2实施架构-v0.1.md)

## 文档职责

| 类型 | 主要职责 | 更新时机 |
|---|---|---|
| `architecture/` | 稳定的领域语义、协议和架构边界 | 架构决策改变时 |
| `plans/` | 讨论过程、决策账本、范围和实施计划 | 决策确认或计划变化后立即更新 |
| `articles/` | 面向非架构参与者的解释和传播 | 正式架构发生重要变化后 |
| `research/` | 保存背景研究、历史输入及其图片 | 原则上只修正事实，不持续承载正式设计 |
| `implementation/` | 技术选型、模块布局、接口契约和可执行里程碑 | 实施决策确认后立即更新 |

`implementation/` 不替代 `architecture/` 中稳定的领域语义；实现如果发现结构冲突，应先回到架构决策账本确认，再修改代码边界。
