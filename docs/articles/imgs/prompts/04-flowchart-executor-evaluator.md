---
illustration_id: 04
type: flowchart
style: notion
aspect_ratio: "16:9"
language: zh
---

Use case: infographic-diagram
Asset type: 中文技术文章横版配图
Primary request: 制作一张 Notion 风格的极简手绘流程图，说明 Executor 与 Evaluator 分离后的独立验证闭环。

TITLE: 执行与评价分离：证据驱动的修复闭环

LAYOUT: 16:9 横版，从左向右主流程，中间包含一个清晰的失败回路。

STEPS:
1. 契约授权 — 验收条件与权限边界
2. Executor — 规划、实现、修复
3. 确定性工具 — 类型检查、测试、扫描、部署结果
4. Evaluator — 独立推导场景、边界与反例
5. 证据充分？ — 菱形决策节点
6. 是 → 进入下一状态
7. 否 → 失败证据返回 Executor

CONNECTIONS:
- 主箭头：契约授权 → Executor → 确定性工具 → Evaluator → 证据充分？
- 决策“是”向右到“进入下一状态”
- 决策“否”使用下方弧形回箭头返回 Executor，箭头标签“修复并重新评价”
- 在 Executor 与 Evaluator 之间保留明显视觉间隔，并加短标签“独立角色”

LABELS: 契约授权；Executor；确定性工具；Evaluator；证据充分？；进入下一状态；失败证据；修复并重新评价；独立角色。

COLORS: 白色背景 #FFFFFF；黑色 #1A1A1A 为主线和文字；深灰 #4A4A4A 为次要连接；Executor 用淡蓝 #A8D4F0；Evaluator 用淡黄 #F9E79F；失败回路用淡粉 #FADBD8；成功箭头保持黑色。Color values (#hex) and color names are rendering guidance only — do NOT display color names, hex codes, or palette labels as visible text in the image.

STYLE: Notion-like minimalist hand-drawn flowchart, rounded cards, hand-drawn arrows with slight wobble, simple doodle icons, sparse pastel highlights, maximum whitespace, no gradients, no shadows, no photorealistic people. Text should be large and prominent with handwritten-style fonts. Keep minimal, focus on keywords. Clean composition with generous white space. Simple or no background. Main elements centered or positioned by content needs.

CONSTRAINTS: 必须清晰表达 Executor 不能自证正确，Evaluator 独立评价；不要添加“AI 生成、人工逐行审查”的旧流程；无水印、无品牌、无密集小字。

ASPECT: 16:9, medium information density.

