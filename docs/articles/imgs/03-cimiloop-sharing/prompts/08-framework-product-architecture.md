---
illustration_id: 08
type: framework
style: sketch-notes
palette: macaron
language: zh
---

Use case: infographic-diagram
Asset type: CimiLoop 中文分享讲稿的 16:9 横版产品架构图
Primary request: 建立 CimiLoop 四层产品结构的整体心智模型，并说明人、Agent Runtime 与工程系统如何与四层结构协作。

TITLE: CimiLoop 四层产品结构

STRUCTURE: 16:9 横版，中央是四层纵向堆叠的圆角手绘结构。左侧有“人”，右侧有“Agent Runtime”和“工程系统”，分别用箭头连接对应层。顶部标题，底部一句总结。

LAYERS FROM TOP TO BOTTOM:
1. “Operator Surface” — 小字“CLI · Workbench · Change Room” — 人机界面图标
2. “CimiLoop Kernel” — 小字“State · Gate · Policy · Recovery” — 齿轮、门、盾牌、恢复箭头
3. “Cimi Change Protocol” — 小字“Change · Contract · Plan · Evidence · Decision” — 协议卡片与连接线
4. “Adapter & Capability” — 小字“Runtime · Skill · Git · DevOps · Knowledge” — 插头、工具箱和系统图标

SIDE ACTORS:
- 左侧人物标签逐字写“人：查看 · 决策 · 负责”，箭头连接 Operator Surface
- 右上机器人标签逐字写“Agent Runtime：执行任务”，箭头连接 Adapter & Capability
- 右下系统标签逐字写“工程系统：保存原始事实”，用虚线连接 Adapter & Capability

RELATIONSHIPS:
- 四层之间用向下实线箭头表示调用，用向上虚线箭头表示事实与结果返回
- Kernel 层用少量珊瑚红强调 Gate 与 Recovery

BOTTOM TAKEAWAY: 逐字写“稳定协议 + 确定性内核 + 可替换能力”

COLORS: 暖奶油背景 #F5F0E8；近黑 #1A1A1A；Surface 浅桃 #FFD5C2；Kernel 淡紫 #D5C6E0；Protocol 浅蓝 #A8D8EA；Adapter 薄荷绿 #B5E5CF；珊瑚红 #E8655A 只用于 Gate 和 Recovery。Color values and color names are rendering guidance only — do NOT display them as text.

STYLE: hand-drawn educational architecture framework, sketch-notes；四层圆角堆叠、手绘箭头、简化人物/机器人/系统图标、自然抖动黑线、柔和手工色块、纸张颗粒、清晰手写标签、留白充足。

CONSTRAINTS: 四层顺序必须准确，不得合并或倒置。CimiLoop 不包住外部工程系统；它通过 Adapter 连接。所有英文拼写准确。不要水印、Logo、渐变、阴影、3D、写实人物或复杂背景。

ASPECT: 16:9, presentation-ready, medium information density.
