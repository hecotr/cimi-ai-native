---
illustration_id: 04-v2
type: flowchart
style: notion
aspect_ratio: "16:9"
language: zh
replaces_candidate: 04-flowchart-executor-evaluator.png
---

Use case: infographic-diagram
Asset type: 中文技术文章横版配图
Primary request: 制作一张 Notion 风格极简手绘流程图，展示 Executor 与 Evaluator 分离后的证据闭环。文字必须少而清晰。

TITLE (verbatim): 执行与评价分离

LAYOUT: 16:9 横版，从左向右六个节点；底部只有一条失败回路。留出大量白色空间。

MAIN FLOW — visible text must be exactly:
1. 契约授权
2. Executor
3. 确定性验证
4. Evaluator
5. 证据充分？
6. 下一状态

SMALL LABELS — visible text must be exactly:
- 在“确定性验证”下方仅写：类型检查 · 测试 · 扫描
- 在 Executor 与 Evaluator 上方写：独立角色
- 成功分支写：是
- 失败分支写：否
- 底部回路写：失败证据 → 修复并重新评价

CONNECTIONS:
- 主箭头：契约授权 → Executor → 确定性验证 → Evaluator → 证据充分？ → 下一状态
- 从“证据充分？”的“否”分支用底部弧形箭头返回 Executor
- 不添加任何其他可见文字

COLORS: 白色背景 #FFFFFF；黑色 #1A1A1A 为主线和文字；深灰 #4A4A4A 为次要连接；Executor 用淡蓝 #A8D4F0；Evaluator 用淡黄 #F9E79F；失败回路用淡粉 #FADBD8。Color values (#hex) and color names are rendering guidance only — do NOT display color names, hex codes, or palette labels as visible text in the image.

STYLE: Notion-like minimalist hand-drawn flowchart, rounded cards, single-weight black lines with slight wobble, tiny simple doodle icons, sparse pastel highlights, maximum whitespace, no gradients, no shadows, no photorealism. Text should be large, clear, and handwritten. Clean composition with generous white space.

CONSTRAINTS: “类型检查”必须逐字准确，不得写成“类别检查”或其他近似词；Executor 和 Evaluator 拼写必须准确；不得添加段落、品牌、水印或无关装饰。

ASPECT: 16:9, low-to-medium information density.

