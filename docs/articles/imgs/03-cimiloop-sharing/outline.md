---
type: mixed
density: rich
style: sketch-notes
palette: macaron
language: zh
image_count: 8
---

## Illustration 1

**Position**: 第一节“AI Native 不是给传统流程增加更多 AI 工具”六维对比表之后
**Purpose**: 让主管、产品和开发一眼理解局部工具增效与系统级范式重构的区别
**Visual Content**: 左右对比 AI 辅助研发与 AI Native 研发，中间以“工具升级 → 系统重构”连接
**Type Application**: comparison
**Filename**: 01-comparison-assisted-vs-native-v2.png

## Illustration 2

**Position**: 第三节“Change Contract 是人、Agent 与系统的共同语言”之后
**Purpose**: 解释 Change 为什么是稳定主线，以及契约如何连接意图、执行、证据和责任
**Visual Content**: 中心为 Change Contract，四周连接意图与约束、Plan 与 Task、Artifact 与 Evidence、Decision 与责任
**Type Application**: framework
**Filename**: 02-framework-change-contract.png

## Illustration 3

**Position**: 第五节“用一句话认识 CimiLoop”之后
**Purpose**: 清晰划分 CimiLoop 与 Agent Runtime、Git、DevOps、知识系统的职责边界
**Visual Content**: CimiLoop 管 Change 如何可信走完，Runtime 管当前任务如何执行，外部工程系统保留各自事实权威
**Type Application**: framework
**Filename**: 03-framework-runtime-harness-boundary.png

## Illustration 4

**Position**: 第六节“一次订单导出 Change 如何在 CimiLoop 中走完”开头
**Purpose**: 作为整场讲解的端到端导航图
**Visual Content**: N1 意图契约、N2 计划执行评价、N4 环境验证交付、N5 复盘学习组成主闭环，N3 风险授权横向贯穿
**Type Application**: flowchart
**Filename**: 04-flowchart-cimiloop-end-to-end.png

## Illustration 5

**Position**: N2“计划—执行—评价”小节之后
**Purpose**: 解释 Executor 与 Evaluator 分离，以及失败证据如何推动修复循环
**Visual Content**: Contract/Plan → Work Item → Executor → Artifact → Deterministic Checks → Evaluator，失败返回 Repair Work Item
**Type Application**: flowchart
**Filename**: 05-flowchart-executor-evaluator-loop.png

## Illustration 6

**Position**: 第七节“不是相信 Agent，而是相信证据链”开头
**Purpose**: 把可信交付机制压缩成一条可记忆的因果链
**Visual Content**: Artifact → Claim → Evidence → Evaluation → Gate → Human Decision → Kernel Transition
**Type Application**: flowchart
**Filename**: 06-flowchart-trust-chain.png

## Illustration 7

**Position**: 第八节“对主管、产品和开发分别意味着什么”角色表之后
**Purpose**: 展示人的价值如何从执行和交接转向意图、规则、风险、异常和责任
**Visual Content**: 主管、产品、开发三类角色的 Before/After 责任变化
**Type Application**: comparison
**Filename**: 07-comparison-role-redesign.png

## Illustration 8

**Position**: 第九节“CimiLoop 的产品和技术结构”四层结构之后
**Purpose**: 建立 CimiLoop 产品结构与技术职责的整体心智模型
**Visual Content**: Operator Surface、CimiLoop Kernel、Cimi Change Protocol、Adapter & Capability 四层，并标注人、Agent Runtime 与工程系统的输入关系
**Type Application**: framework
**Filename**: 08-framework-product-architecture.png
