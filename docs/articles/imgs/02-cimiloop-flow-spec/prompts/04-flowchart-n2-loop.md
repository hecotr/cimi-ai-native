---
illustration_id: 04
type: flowchart
style: notion
aspect_ratio: "16:9"
language: zh
---

Use case: infographic-diagram
Asset type: 中文流程规范横版执行闭环图
Primary request: 制作一张 Notion 风格极简手绘流程图，展示 N2 中 Executor 与 Evaluator 分离的持续执行和独立评价闭环。

TITLE: N2 计划—执行—评价闭环

LAYOUT: 16:9 横版，中央主流程从左到右，底部放返修回路，上方放风险升级分支。

MAIN FLOW:
Task DAG → Executor → 确定性验证 → Claims & Evidence → Evaluator → 评价结果

RESULT BRANCHES:
- 通过 → TestDeploying
- 失败 → 返回 Executor
- 证据不足 → 补充测试或环境事实
- 风险 / 契约变化 → AwaitingDecision

RELATIONSHIPS:
- Executor 与 Evaluator 之间留明显间隔，顶部标注“独立 Session”
- Evaluator 不直接修改代码
- 失败分支用底部弧形箭头返回 Executor
- 每个 Task 旁仅放三个边界词：“范围 · 预算 · 停止条件”

LABELS: N2 计划—执行—评价闭环；Task DAG；Executor；确定性验证；Claims & Evidence；Evaluator；评价结果；通过；失败；证据不足；风险 / 契约变化；TestDeploying；AwaitingDecision；独立 Session。

COLORS: 白色背景 #FFFFFF；黑色 #1A1A1A 主线和文字；Executor 淡蓝 #A8D4F0；Evaluator 淡黄 #F9E79F；失败回路淡粉 #FADBD8。颜色值仅用于渲染，不得显示为文字。

STYLE: Notion-like minimalist hand-drawn flowchart, rounded cards, simple icons, single-weight lines with slight wobble, maximum whitespace, no gradients or shadows. Text large, short and clear.

CONSTRAINTS: Executor 与 Evaluator 必须分离；不要画成人工逐行审查；英文拼写准确；无水印、品牌或额外段落。

ASPECT: 16:9, medium information density.

