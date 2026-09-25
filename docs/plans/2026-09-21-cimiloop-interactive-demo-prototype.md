# CimiLoop Interactive Demo Prototype Implementation Plan

> **For implementation agent:** Implement this plan task-by-task. Do not stop after producing another plan.

**Goal:** 构建一个面向研发主管、产品经理和开发工程师的 CimiLoop 纯前端可交互演示原型，在 5–7 分钟内稳定演示一次“订单导出能力”Change 如何从意图授权、Agent 执行、独立评价失败、修复补证据、生产发布决策走到关闭。

**Architecture:** 在 `apps/demo-web/` 创建独立的 React + TypeScript + Vite 单页应用。应用使用固定演示数据和前端内存状态机，不连接真实 Kernel、数据库、Agent Runtime、Git 或 DevOps；所有界面都是 CimiLoop Read Model 的演示投影，所有交互以模拟 Command 驱动确定性场景迁移。原型必须可重置、可跳转场景、可离线演示，并与正式运行时代码保持隔离。

**Tech Stack:** pnpm 12、Node 24、React、TypeScript、Vite、React Router、Lucide React、原生 CSS、Vitest、Testing Library、jsdom。

---

## 1. 产品定位与设计选择

### 1.1 推荐方案：叙事型可点击产品原型

本原型不是静态线框图，也不是连接真实后端的半成品。它介于两者之间：

- 具有完整产品外观、导航、标签页、抽屉、决策面板和状态变化；
- 使用固定数据和确定性状态机，确保每次分享都能复现同一条故事线；
- 只实现一条精心设计的黄金路径和一个评价失败修复回路；
- 支持 Presenter Mode 一键跳转场景，现场不依赖网络、模型或环境；
- 通过真实产品语义解释 CimiLoop，而不是假装已经接通生产系统。

不采用以下方案：

1. **纯静态多页面稿**：开发快，但无法表现 Decision、Evidence 和状态迁移之间的因果关系；
2. **连接真实 Kernel 的 Demo**：真实性更高，但扩大范围、增加现场失败风险，也会把分享重点带入实现细节；
3. **通用 Dashboard 模板**：视觉完成度可能高，但容易把 CimiLoop 误解为普通项目管理或 Issue 系统。

### 1.2 演示必须让听众理解的三件事

1. Agent Run 成功不等于 Change 完成；
2. 人处理的是绑定精确版本、制品和环境的结构化决策包，而不是原始日志；
3. 每次状态迁移都能追溯到 Contract、Evidence、Gate、Decision 和责任角色。

### 1.3 非目标

- 不实现登录、多租户、组织权限后台或实时协作；
- 不连接真实 Agent、模型、Git、CI/CD、Artifact Registry 或环境；
- 不实现通用聊天、评论流或完整 Issue Tracker；
- 不实现自由编辑的流程设计器；
- 不引入服务端、数据库、WebSocket、远程字体或远程图片；
- 不把演示状态写入正式 CimiLoop Store；
- 不承诺原型组件直接进入 V1 正式产品。

## 2. 目录与工程边界

创建以下独立应用：

```text
apps/demo-web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── README.md
└── src/
    ├── main.tsx
    ├── app.tsx
    ├── styles/
    │   ├── tokens.css
    │   └── global.css
    ├── demo/
    │   ├── types.ts
    │   ├── scenario.ts
    │   ├── reducer.ts
    │   └── commands.ts
    ├── components/
    │   ├── app-shell.tsx
    │   ├── status-badge.tsx
    │   ├── lifecycle-strip.tsx
    │   ├── attention-card.tsx
    │   ├── decision-panel.tsx
    │   ├── evidence-matrix.tsx
    │   ├── lifecycle-timeline.tsx
    │   ├── run-summary.tsx
    │   ├── presenter-bar.tsx
    │   └── toast.tsx
    ├── pages/
    │   ├── workbench-page.tsx
    │   ├── create-change-page.tsx
    │   └── change-room-page.tsx
    └── tests/
        ├── reducer.test.ts
        ├── workbench.test.tsx
        ├── decision-flow.test.tsx
        └── presentation-flow.test.tsx
```

约束：

- `apps/demo-web` 可以加入 pnpm workspace，但不得加入根 `tsconfig.json` 的正式项目引用；
- 不修改 `packages/protocol`、`packages/kernel`、`packages/store`、`packages/store-sqlite` 或 `apps/cli`；
- 不从正式包中导入尚不稳定的内部类型；演示领域类型只放在 `src/demo/types.ts`；
- 允许更新根 `pnpm-lock.yaml`；
- 所有演示素材必须在仓库内，构建后断网仍可运行。

建议脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

## 3. 固定演示数据

所有数据在 `src/demo/scenario.ts` 中声明。页面不得散落硬编码对象。

### 3.1 Project

| 字段 | 值 |
|---|---|
| Project | Commerce Platform |
| Mode | Embedded Solo Demo |
| Current user | 周航 |
| Acting roles | Technical Owner、Release Owner |
| Environment | `staging-cn`、`prod-cn` |

### 3.2 主 Change

| 字段 | 值 |
|---|---|
| Display Key | `CHG-0242` |
| Title | 订单导出能力 |
| Profile | Feature |
| Change Owner | 陈晨 |
| Intent Owner | 林晓 |
| Technical Owner | 周航 |
| Release Owner | 贺敏 |
| Contract | `contract-v1` |
| Plan | `plan-v1` |
| Artifact | `order-service:2026.09.21.3` |
| Digest | `sha256:8f2a…d91c` |
| Test environment | `staging-cn` |
| Production environment | `prod-cn` |
| Risk | Medium，权限与敏感字段风险 |

### 3.3 Contract 摘要

- 目标：管理员可以异步导出十万条订单；
- 范围：订单筛选、异步任务、下载链接、审计记录；
- Non-goals：自定义导出模板、跨租户导出、实时同步导出；
- 验收条件：
  - AC-01 管理员可以创建导出任务；
  - AC-02 普通用户不能看到入口，也不能调用接口；
  - AC-03 文件不包含内部备注字段；
  - AC-04 十万条订单异步导出在规定时间内完成；
  - AC-05 导出失败可重试且不产生重复文件。

### 3.4 Claim 与 Evidence

| Claim | 初始状态 | 修复后状态 | Evidence |
|---|---|---|---|
| `CLM-01` 管理员可以导出 | Satisfied | Satisfied | API 集成测试、UI E2E |
| `CLM-02` 普通用户不能导出 | Insufficient | Satisfied | 初始缺失；修复后增加权限反例测试 |
| `CLM-03` 不包含内部备注 | Satisfied | Satisfied | Schema 断言、样本文件检查 |
| `CLM-04` 十万条异步性能达标 | Satisfied | Satisfied | `staging-cn` 性能结果 |
| `CLM-05` 失败重试无重复文件 | Satisfied | Satisfied | 幂等测试 |

必须让 `CLM-02` 的 Evidence 缺口成为演示中的核心失败，而不是制造代码语法错误。这样可突出“实现完成不等于契约已被证明”。

## 4. 演示状态机

在 `src/demo/types.ts` 定义：

```ts
export type DemoScene =
  | "workbench"
  | "contract_decision"
  | "agent_running"
  | "evaluation_failed"
  | "repair_verified"
  | "release_decision"
  | "delivery_closed";

export type DemoCommand =
  | { type: "OPEN_CHANGE" }
  | { type: "APPROVE_CONTRACT" }
  | { type: "COMPLETE_AGENT_RUN" }
  | { type: "START_REPAIR" }
  | { type: "COMPLETE_REPAIR" }
  | { type: "APPROVE_RELEASE" }
  | { type: "COMPLETE_DEPLOYMENT" }
  | { type: "RESET_DEMO" }
  | { type: "JUMP_TO_SCENE"; scene: DemoScene };
```

状态迁移必须集中在 `src/demo/reducer.ts`，组件不能直接拼装下一个状态。

| Scene | lifecycle state | flow condition | Current Focus | 主动作 |
|---|---|---|---|---|
| `workbench` | IntentReady | AwaitingDecision | Contract v1 等待批准 | 打开 Change |
| `contract_decision` | IntentReady | AwaitingDecision | 审阅 Contract v1 | 批准 Contract |
| `agent_running` | Executing | Active | Executor 正在执行 Work Item | 完成模拟运行 |
| `evaluation_failed` | Evaluating | Blocked | CLM-02 缺少反例 Evidence | 创建修复 Work Item |
| `repair_verified` | TestValidating | Active | 修复已验证，准备发布包 | 提交生产发布 |
| `release_decision` | ReleaseReady | AwaitingDecision | 审批指定 Artifact 进入 `prod-cn` | 批准发布 |
| `delivery_closed` | DeliveryClosed | Completed | 发布即时验证完成 | 查看完整时间线 |

非法 Command 必须返回可展示的拒绝原因，例如：“当前 Artifact Digest 与 Decision Request 不一致”。即使演示主流程不会主动触发，也要为 reducer 写测试。

## 5. 页面需求

### 5.1 全局 App Shell

必须包含：

- 左侧导航：Workbench、Changes、Decisions、Environments；
- 顶部项目切换器：Commerce Platform；
- 当前身份：周航，显示当前 acting role；
- “DEMO DATA”明显但克制的标识，避免听众误认真实系统；
- 页面宽度适合 1440×900 投影，最低支持 1280×720；
- Presenter Bar 默认折叠，不遮挡产品界面。

导航中未实现的页面可以显示轻量 Empty State，但 Workbench、创建 Change、Change Room 必须完整可用。

### 5.2 Project Workbench

首屏采用 Attention-first，而不是传统任务看板。布局顺序：

1. 顶部摘要：Active Changes、Awaiting Decisions、Blocked、Active Runs；
2. Attention Queue：突出 `CHG-0242` 当前需要的动作和责任角色；
3. Decision Inbox：展示 Decision Request ID、对象版本和过期状态；
4. Change 列表：至少展示 4 个固定 Change，状态分布不同；
5. Active Run 与 Environment 摘要。

Change 卡片必须显示 lifecycle state、flow condition、owner、risk 和 next action，不把 N1–N5 当作看板列。

### 5.3 创建 Change

提供可演示但不进入主故事线的表单：

- 标题；
- 原始诉求；
- 来源；
- Change Owner；
- Provisional Profile；
- 紧急度和已知影响。

表单提交后进入 Draft Change Room，首屏主动作是“开始澄清”，不是“立即实现”。使用内存数据即可，刷新可丢失。

### 5.4 Change Room

顶部身份区持续显示：

- `CHG-0242 订单导出能力`；
- Profile、Change Owner 和关键责任角色；
- lifecycle state、flow condition、delivery status、outcome status；
- Contract/Plan Version、Artifact Digest、Risk；
- 最后更新时间。

生命周期导航压缩为六段：创建、契约、执行评价、测试验证、生产发布、关闭学习。它只负责解释当前位置，不创造新状态字段。

首屏最重要区域为 Current Focus，必须回答：

- 现在发生什么；
- 为什么停在这里；
- 已满足哪些 Gate 条件；
- 还缺少什么；
- 下一状态是什么；
- 当前用户可以执行的唯一主动作。

详情标签页：Overview、Contract、Plan & Work、Evidence、Delivery、Activity。

### 5.5 Decision Panel

使用右侧抽屉或居中宽面板，至少展示：

- 系统正在询问什么；
- acting role；
- 被决定对象、Contract/Plan Version、Artifact Digest、Environment；
- 系统建议及明确的“建议”标签；
- 支持 Evidence、反驳 Evidence、缺口；
- 风险、Policy、残余问题和 Recovery Strategy；
- Approve、Request changes、Reject 三种结果及后果。

演示中只要求 Approve 推进主流程；Request changes 和 Reject 可展示确认反馈但无需扩展新故事线。

Decision 提交后显示结构化 Event toast，例如：

```text
Decision DEC-1042 recorded as Technical Owner.
Gate re-evaluated: ALLOW.
Change transitioned to Executing.
```

### 5.6 Plan & Work / Run

显示：

- Plan v1 和五节点 Task DAG；
- 当前 Work Item 目标、授权范围、Context Pack、Capability Binding；
- Executor Run 状态、耗时、预算、重试次数；
- Artifact Candidate；
- 关键日志摘要，而不是完整 token/tool-call 噪声。

进入 `agent_running` 后允许点击“运行到下一检查点”。使用 800–1500ms 本地计时器制造可感知的执行过程，随后确定性进入 `evaluation_failed`。

### 5.7 Evidence

Evidence 必须按 Claim 组织，而不是文件列表。至少展示：

- Claim ID 与对应 Acceptance Criterion；
- Satisfied、Refuted、Insufficient、Conflicted 状态；
- Supports、Refutes、Inconclusive Evidence；
- Evidence 适用的 Contract、Artifact、Environment 和时间；
- Gate 当前还缺什么。

进入 `evaluation_failed` 时，`CLM-02` 必须以高优先级卡片置顶，明确显示：

```text
普通用户不能导出订单
状态：Insufficient
缺口：没有独立的权限反例测试
后果：Evaluation Gate = NEED_MORE_EVIDENCE
```

点击“创建修复 Work Item”后显示 Repair Run；完成修复后，`CLM-02` 变为 Satisfied，并新增 Evidence `EVD-2207 权限反例测试通过`。

### 5.8 Delivery

明确分开：

- Artifact：来源、Digest、构建与评价状态；
- Release：目标环境、范围、窗口、Recovery Strategy 和批准状态；
- Deployment：实际尝试、外部状态和即时验证；
- Recovery：Rollback、Feature Disable、Roll-forward；
- Reconciliation：结果未知时先核对，不直接重试。

Release Decision 必须绑定 `order-service:2026.09.21.3`、`sha256:8f2a…d91c` 和 `prod-cn`。

生产部署模拟完成后显示：Digest matched、Health check passed、Core path passed，然后允许关闭 Change。

### 5.9 Activity 与双层时间线

默认显示生命周期时间线：Contract Approval、Plan Approval、Run、Evaluation Failure、Repair、Evidence Added、Release Decision、Deployment、Closure。

点击某个 Run 才显示技术明细：命令、耗时、重试、错误、Context Pack 与 Tool 摘要。技术明细使用抽屉，不占据生命周期主线。

## 6. Presenter Mode

这是演示可靠性的关键功能，不属于 CimiLoop 正式产品语义。

Presenter Bar 必须支持：

- 当前场景名称与 `1/7` 进度；
- 上一步、下一步；
- 直接选择任意 Scene；
- Reset Demo；
- 自动打开该 Scene 最适合讲解的页面或标签页；
- 可折叠；
- 键盘快捷键：左右方向键切换，`R` 重置，`P` 折叠/展开；
- 所有场景迁移都可重复，不依赖随机数或网络。

建议演示顺序：

1. Workbench：为什么不是普通项目看板；
2. Contract Decision：人对意图和边界负责；
3. Agent Running：Agent 承担主要执行；
4. Evaluation Failed：Run success 不等于 Change 完成；
5. Repair Verified：失败 Evidence 驱动修复；
6. Release Decision：批准具体制品、环境和恢复策略；
7. Delivery Closed：完整事实链和学习候选。

## 7. 视觉与体验要求

视觉方向：专业的“决策运营工作台”，不是赛博大屏，也不是通用 Admin Template。

- 背景：暖灰白；主表面为白色和极浅灰；
- 主色：深靛蓝或墨蓝；可信/通过使用青绿色；风险使用克制的珊瑚红；
- 卡片边框清晰、阴影很轻、信息密度中等；
- 状态不能只靠颜色，必须有文字和图标；
- 使用系统字体栈，不加载远程字体；
- 动效仅用于状态迁移、运行进度和抽屉，时长 150–250ms；
- 支持 `prefers-reduced-motion`；
- 页面主动作始终唯一且醒目，危险操作不得使用模糊“确定”；
- 重要版本、Digest、Environment 使用等宽字体；
- 1280×720 不产生横向滚动，1440×900 为最佳展示尺寸。

禁止：霓虹渐变、玻璃拟态、无意义 KPI 图表、全屏聊天框、复杂可配置 Dashboard、把所有对象同时堆在首屏。

## 8. 无障碍和健壮性

- 所有按钮支持键盘操作并有可见 focus ring；
- Dialog/Drawer 使用正确的 `aria-modal`、标题关联和 Escape 关闭；
- 标签页具备键盘导航语义；
- Toast 不成为唯一反馈，状态区域同时更新；
- 颜色对比满足 WCAG AA 的常规文本要求；
- 非法状态迁移显示原因，不静默失败；
- 本地 timer 在组件卸载或 Reset 时清理；
- 刷新后默认回到 `workbench`，不要求持久化；
- 页面出现运行时异常时提供简单 Error Boundary 和 Reset Demo 动作。

## 9. 测试与验收

### 9.1 自动化测试

至少覆盖：

1. reducer 接受合法 Command 并进入正确 Scene；
2. reducer 拒绝非法 Command 并返回原因；
3. Workbench 以 Decision、Blocker、Active Run 的优先级排序 Attention；
4. Contract Decision 面板展示精确版本和 acting role；
5. Agent Run 完成后进入 `evaluation_failed`；
6. `CLM-02` 在修复前为 Insufficient、修复后为 Satisfied；
7. Release Decision 绑定 Artifact、Digest、Environment；
8. 完成部署后生命周期时间线包含发布验证和关闭事件；
9. Reset Demo 恢复固定初始状态；
10. Presenter Mode 可以顺序遍历 7 个场景。

### 9.2 必须执行的命令

```bash
pnpm install
pnpm --filter @cimiloop/demo-web test
pnpm --filter @cimiloop/demo-web build
pnpm test
```

预期：原型自身测试通过、原型构建成功、根仓库现有测试不回归。

### 9.3 人工验收脚本

1. 在 1440×900 打开 Workbench，10 秒内能找到需要处理的 Change；
2. 打开 `CHG-0242`，首屏能回答当前状态、阻塞原因、责任人和下一步；
3. 批准 Contract，看到结构化 Decision Event 和 Gate 重新求值；
4. 运行 Agent，稳定进入权限反例 Evidence 缺失；
5. 打开 Evidence，能一眼看到 `CLM-02` 为什么阻塞；
6. 创建并完成 Repair Work Item，Claim 转为 Satisfied；
7. 打开 Release Decision，看到 Artifact、Digest、环境、风险和恢复策略；
8. 批准并完成部署，看到 Digest matched 和即时验证通过；
9. 打开 Activity，能追溯整条生命周期时间线；
10. 点击 Reset Demo 后可从头再演示，状态完全一致。

## 10. 实施任务

### Task 1：搭建独立前端应用

**Files:** 创建 `apps/demo-web/package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`src/main.tsx`、`src/app.tsx`。

步骤：

1. 添加最小 React/Vite/Vitest 依赖；
2. 建立 `dev`、`build`、`test` 脚本；
3. 启动空壳页面；
4. 运行 build，确认独立构建成功。

### Task 2：先实现并测试 Demo State Machine

**Files:** 创建 `src/demo/types.ts`、`scenario.ts`、`commands.ts`、`reducer.ts`、`src/tests/reducer.test.ts`。

步骤：

1. 先写 7 场景合法迁移和非法迁移测试；
2. 运行测试确认失败；
3. 实现最小 reducer；
4. 运行测试确认通过；
5. 将所有固定数据集中到 `scenario.ts`。

### Task 3：建立视觉 Token 和 App Shell

**Files:** 创建 `src/styles/tokens.css`、`global.css`、`src/components/app-shell.tsx`、`presenter-bar.tsx`。

步骤：

1. 定义颜色、间距、圆角、字号、状态色和等宽字体 token；
2. 实现侧栏、顶栏、主内容区；
3. 实现可折叠 Presenter Bar 和快捷键；
4. 验证 1280×720 与 1440×900。

### Task 4：实现 Workbench 与创建 Change

**Files:** 创建 `src/pages/workbench-page.tsx`、`create-change-page.tsx`、`attention-card.tsx`、`status-badge.tsx` 及测试。

步骤：

1. 先写 Attention 排序与打开 Change 测试；
2. 实现摘要、Attention Queue、Decision Inbox、Change 列表和 Active Runs；
3. 实现最小创建表单和 Draft 结果；
4. 验证首屏 Attention-first，而非 Task Kanban。

### Task 5：实现 Change Room 框架

**Files:** 创建 `src/pages/change-room-page.tsx`、`lifecycle-strip.tsx`、`run-summary.tsx`。

步骤：

1. 实现顶部身份区和六段生命周期导航；
2. 实现 Current Focus；
3. 实现六个详情标签；
4. 确保每个 Scene 只突出一个主动作。

### Task 6：实现 Decision、Evidence 与 Delivery

**Files:** 创建 `decision-panel.tsx`、`evidence-matrix.tsx`、Delivery 相关组件和测试。

步骤：

1. 先写版本绑定、Evidence 缺口和 Release Digest 测试；
2. 实现 Contract Decision；
3. 实现 Claim-centered Evidence；
4. 实现 Release/Deployment/Recovery 卡片；
5. 实现结构化 Event toast。

### Task 7：实现运行模拟和双层时间线

**Files:** 创建 `lifecycle-timeline.tsx`、Run Detail Drawer、presentation flow 测试。

步骤：

1. 实现可取消的本地运行 timer；
2. 实现 evaluation failure → repair → verified；
3. 实现 lifecycle timeline；
4. 实现 Run Detail 技术抽屉；
5. 验证 Reset 不残留 timer 或旧事件。

### Task 8：演示打磨与交付

**Files:** 创建 `apps/demo-web/README.md`，必要时更新根 README 的演示入口。

步骤：

1. 按 10 步人工验收脚本完整走一遍；
2. 修复 1280×720 投影可读性；
3. 检查键盘导航和 reduced motion；
4. 运行原型测试、构建和根测试；
5. 在 README 写明启动命令、7 场景讲解词、快捷键、非目标与重置方式；
6. 报告完成文件、测试结果和仍存在的演示限制。

## 11. 完成定义

只有同时满足以下条件才算完成：

- 7 个场景都能通过产品交互和 Presenter Mode 到达；
- 一次完整演示无需网络，可在 5–7 分钟稳定完成；
- Workbench、Change Room、Decision、Evidence、Delivery、Timeline 均可用；
- `CLM-02` 缺口与修复是清晰可见的核心故事；
- Release Decision 精确绑定 Artifact、Digest 和 Environment；
- 所有正式状态变化来自 reducer Command，而不是页面直接赋值；
- 8 个以上关键自动化测试通过；
- 原型 build 成功，根仓库测试不回归；
- README 提供启动和现场讲解说明；
- 页面明确标识 Demo Data，不会被误认为已连接生产。

## 12. 设计依据

- `docs/architecture/CimiLoop工作台与变更空间交互模型-v0.1.md`
- `docs/architecture/CimiLoopChange端到端状态机-v0.1.md`
- `docs/architecture/CimiLoop验证与证据模型-v0.1.md`
- `docs/architecture/CimiLoop角色与权限模型-v0.1.md`
- `docs/architecture/CimiLoop工程交付与DevOps模型-v0.1.md`
- `docs/articles/03-从AI-Native新范式到CimiLoop-分享讲稿-v0.1.md`
