---
illustration_id: 03
type: framework
style: notion
aspect_ratio: "16:9"
language: zh
---

Use case: infographic-diagram
Asset type: 中文流程规范横版决策框架图
Primary request: 制作一张 Notion 风格的 Gate 路由图，说明状态流转检查如何根据多维输入产生四类结果。

TITLE: Gate：状态流转检查

STRUCTURE: 16:9 横版。左侧 5 个输入卡片汇聚到中央菱形“Gate”，右侧四个结果卡片上下排列。

INPUTS:
- Change Context
- Risk Profile
- Evidence
- Policy
- Human Decision

CENTER:
- Gate
- 小字：“版本一致 · 风险匹配 · 证据充分 · 授权有效”

OUTPUTS — display exactly:
- ALLOW — 进入目标状态
- REQUIRE_HUMAN — AwaitingDecision
- DENY — Blocked
- NEED_MORE_EVIDENCE — 返回执行或验证

RELATIONSHIPS:
- 五类输入用箭头汇入 Gate
- Gate 用四条独立箭头指向结果
- REQUIRE_HUMAN 旁放一个简化人形决策图标
- NEED_MORE_EVIDENCE 的箭头弯回左侧 Evidence

COLORS: 白色背景 #FFFFFF；黑色 #1A1A1A 文字和主线；深灰 #4A4A4A 辅助线；ALLOW 淡蓝 #A8D4F0；REQUIRE_HUMAN 淡黄 #F9E79F；DENY 淡粉 #FADBD8；NEED_MORE_EVIDENCE 保持白底。颜色值仅用于渲染，不得显示为文字。

STYLE: Notion-like minimalist hand-drawn diagram, clean rounded cards, simple doodle icons, slight line wobble, sparse pastel accents, maximum whitespace, no gradients or shadows. Text large and readable.

CONSTRAINTS: 四个英文结果必须逐字准确；不得出现单一 Trust Score；无水印、品牌或长段落。

ASPECT: 16:9, medium information density.

