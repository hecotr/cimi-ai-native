---
illustration_id: 05
type: flowchart
style: sketch-notes
palette: macaron
language: zh
---

Use case: infographic-diagram
Asset type: CimiLoop 中文分享讲稿的 16:9 横版流程图
Primary request: 展示 Executor 与 Evaluator 分离的执行—评价—修复循环，以及失败证据如何驱动下一次修复。

TITLE: 执行—评价—修复闭环

LAYOUT: 16:9 横版，主链从左到右，失败回路从 Evaluator 向下再返回 Executor。顶部标题，底部总结。

MAIN FLOW:
1. “Contract + Plan”
2. “Work Item”
3. “Executor” — 小字“实现与自检”
4. “Artifact”
5. “确定性验证” — 小字“测试 · 类型 · 扫描”
6. “Evaluator” — 小字“独立评价”

BRANCHES:
- Evaluator 通过：绿色箭头到“进入下一阶段”
- Evaluator 失败：红色箭头到“Failure Evidence”
- Failure Evidence 指向“Repair Work Item”
- Repair Work Item 用弧形箭头返回 Executor
- 证据不足：虚线箭头到“补充 Evidence”再回 Evaluator
- 高风险：虚线箭头到“人工决策”

BOTTOM TAKEAWAY: 逐字写“Executor 可以自检，但不能独自证明自己正确”

COLORS: 暖奶油背景 #F5F0E8；近黑 #1A1A1A；输入淡紫 #D5C6E0；执行浅蓝 #A8D8EA；验证薄荷绿 #B5E5CF；失败回路浅桃 #FFD5C2 与珊瑚红 #E8655A。Color values and color names are rendering guidance only — do NOT display them as text.

STYLE: hand-drawn educational flowchart, sketch-notes；圆角卡片、手绘弯曲箭头、简化机器人角色、测试勾选、放大镜与证据卡片图标；清晰手写体；柔和色块；纸张颗粒；留白充足。

CONSTRAINTS: Executor 与 Evaluator 必须画成两个独立角色。失败必须保留 Failure Evidence 后再创建 Repair Work Item。只显示指定文字。不要写实、3D、渐变、阴影、Logo 或水印。

ASPECT: 16:9, presentation-ready, medium information density.
