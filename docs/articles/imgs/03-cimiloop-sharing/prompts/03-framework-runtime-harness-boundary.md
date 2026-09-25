---
illustration_id: 03
type: framework
style: sketch-notes
palette: macaron
language: zh
---

Use case: infographic-diagram
Asset type: CimiLoop 中文分享讲稿的 16:9 横版职责边界图
Primary request: 清楚区分人、CimiLoop、Agent Runtime 与外部工程系统的职责，避免把 CimiLoop 误解为另一个编码 Agent。

TITLE: CimiLoop 与 Agent Runtime

STRUCTURE: 16:9 横版，四层横向泳道，从上到下依次为“人类责任”“CimiLoop”“Agent Runtime”“工程系统”。每层是一条圆角手绘带，层间用有标签的箭头连接。

ZONES:
- 人类责任：逐字写“定义意图 · 批准风险 · 承担责任”，配人物、靶心、签字图标
- CimiLoop：逐字写“状态 · Gate · Policy · 证据 · 恢复”，配循环、门、盾牌、证据卡片图标
- Agent Runtime：逐字写“读取上下文 · 调用工具 · 执行任务”，配机器人、工具箱、终端图标
- 工程系统：逐字写“Git · CI/CD · DevOps · Knowledge”，配代码仓库、流水线、云环境、知识库图标

RELATIONSHIPS:
- 人类责任向 CimiLoop 箭头标签“授权与决策”
- CimiLoop 向 Agent Runtime 箭头标签“Work Item”
- Agent Runtime 向工程系统箭头标签“执行与查询”
- 工程系统返回 CimiLoop 的虚线箭头标签“事实与 Evidence”

BOTTOM TAKEAWAY: 逐字写“CimiLoop 管 Change；Runtime 管任务”

COLORS: 暖奶油背景 #F5F0E8；近黑 #1A1A1A；人类层浅桃 #FFD5C2；CimiLoop 层淡紫 #D5C6E0 并用少量珊瑚红强调 Gate；Runtime 层浅蓝 #A8D8EA；工程系统层薄荷绿 #B5E5CF。Color values and color names are rendering guidance only — do NOT display them as text.

STYLE: hand-drawn educational framework, sketch-notes；手绘泳道、略微抖动线条、简化人物与机器人图标、柔和色块、宽松留白、清晰大号手写文字。Human figures are simplified symbolic drawings, not photorealistic.

CONSTRAINTS: 不画成四个互相替代的产品，而是职责协作。只显示指定文字。保持 CimiLoop 拼写准确；不出现品牌 Logo、水印、渐变、阴影、3D 或复杂背景。

ASPECT: 16:9, presentation-ready, medium information density.
