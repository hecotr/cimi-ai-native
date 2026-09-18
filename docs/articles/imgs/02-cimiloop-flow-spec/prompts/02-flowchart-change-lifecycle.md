---
illustration_id: 02
type: flowchart
style: notion
aspect_ratio: "16:9"
language: zh
---

Use case: infographic-diagram
Asset type: 技术规范横版状态机
Primary request: 制作一张规整而简洁的 Notion 手绘状态机，准确展示 CimiLoop Change 的主生命周期和异常状态。所有英文状态名必须逐字准确。

TITLE: Change 生命周期状态

LAYOUT: 16:9 横版。上方用两行连续箭头容纳 11 个主状态；下方单独放置“异常 / 等待状态”容器。字体清晰，避免装饰。

MAIN STATES — display exactly:
Draft → IntentReady → Planned → Executing → Evaluating → TestDeploying → TestValidating → ReleaseReady → ProductionDeploying → ReleaseVerified → DeliveryClosed

EXCEPTION STATES — display exactly:
AwaitingDecision · Blocked · Failed · RolledBack · Superseded · Cancelled

CONNECTIONS:
- Executing 与 Evaluating 之间画双向返修箭头
- TestValidating 失败时返回 Executing
- ProductionDeploying 失败时指向 RolledBack 或 Failed
- AwaitingDecision 与 Blocked 使用虚线连接到主链路，表达可恢复断点
- Superseded 与 Cancelled 使用终止符号，不返回主链路

LABELS: Change 生命周期状态；主状态；异常 / 等待状态；恢复断点。除所列文字外不要添加说明句。

COLORS: 白色背景 #FFFFFF；黑色 #1A1A1A 文字与主线；深灰 #4A4A4A 辅助线；淡蓝 #A8D4F0 主状态；淡黄 #F9E79F 等待状态；淡粉 #FADBD8 失败与恢复状态。颜色值仅用于渲染，不得显示为文字。

STYLE: clean technical flowchart with subtle Notion hand-drawn wobble, rounded compact state pills, precise spacing, sparse pastel fills, no gradients, no shadows, maximum whitespace.

CONSTRAINTS: 不得翻译或缩写英文状态；状态拼写和顺序必须完全一致；不出现额外状态、水印、品牌或人物插画。

ASPECT: 16:9, high legibility, medium information density.

