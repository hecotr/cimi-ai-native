---
illustration_id: 05
type: flowchart
style: notion
aspect_ratio: "16:9"
language: zh
---

Use case: infographic-diagram
Asset type: 技术规范横版发布链路图
Primary request: 制作一张规整的 Notion 手绘发布链路图，强调测试与生产使用同一个 Immutable Artifact，并展示发布失败时的恢复路径。

TITLE: 同一制品从测试晋升到生产

LAYOUT: 16:9 横版。中央是一条从左到右的发布链路；一个带唯一指纹的小立方体图标代表同一制品，在每个阶段保持完全一致。

STEPS:
1. Build — Immutable Artifact
2. TestDeploying
3. TestValidating
4. Test Evidence Package
5. Release Owner Decision
6. ProductionDeploying
7. ReleaseVerified

CONNECTIONS:
- 所有主步骤用连续实线箭头连接
- Artifact ID 从 Build 一直延伸到 ReleaseVerified，标签“同一 Artifact ID”
- TestValidating 失败时返回 Executing
- ProductionDeploying 或即时验证失败时进入 Recovery Strategy
- Recovery Strategy 分为：Rollback · Roll-forward · Feature Disable
- 最底部短结论：“发布成功 ≠ 业务结果已验证”

LABELS: 同一制品从测试晋升到生产；Immutable Artifact；TestDeploying；TestValidating；Test Evidence Package；Release Owner Decision；ProductionDeploying；ReleaseVerified；同一 Artifact ID；Executing；Recovery Strategy；Rollback；Roll-forward；Feature Disable；发布成功 ≠ 业务结果已验证。

COLORS: 白色背景 #FFFFFF；黑色 #1A1A1A 主线和文字；测试阶段淡蓝 #A8D4F0；人工决策淡黄 #F9E79F；恢复路径淡粉 #FADBD8；制品图标保持黑白并用淡蓝描边。颜色值仅用于渲染，不得显示为文字。

STYLE: clean technical flowchart with restrained Notion hand-drawn character, rounded stage cards, precise left-to-right hierarchy, slight line wobble, sparse pastel fills, generous whitespace, no gradients or shadows.

CONSTRAINTS: 必须明确是同一制品而不是重新构建；英文标签逐字准确；不显示生产凭据；无水印、品牌或无关人物。

ASPECT: 16:9, medium information density.

