# CimiLoop 交互式演示原型：开发 Agent 执行提示词

你正在 `D:\cc\cimi-ai-native` 仓库中工作。请直接实现 CimiLoop 交互式演示原型，不要只输出方案、分析或二次规划。

## 必读材料

开始修改前，完整阅读：

1. `docs/plans/2026-09-21-cimiloop-interactive-demo-prototype.md`
2. `docs/architecture/CimiLoop工作台与变更空间交互模型-v0.1.md`
3. `docs/architecture/CimiLoopChange端到端状态机-v0.1.md`
4. `docs/architecture/CimiLoop验证与证据模型-v0.1.md`
5. `docs/articles/03-从AI-Native新范式到CimiLoop-分享讲稿-v0.1.md`

仓库中如果存在 `AGENTS.md` 或更具体的局部说明，也必须先阅读并遵守。

## 目标

在 `apps/demo-web/` 实现一个高完成度、纯前端、固定数据、可离线运行的 CimiLoop 可交互演示原型，用于向研发主管、产品经理和开发工程师进行 5–7 分钟现场讲解。

完整演示以下故事：

```text
Workbench 发现待决策 Change
→ 审阅并批准 Contract v1
→ Agent 执行 Work Item
→ 独立评价发现 CLM-02 权限反例 Evidence 缺失
→ 创建 Repair Work Item
→ 修复并补齐 Evidence
→ 审批绑定具体 Artifact、Digest、Environment 的 Release
→ 模拟生产部署与即时验证
→ Delivery Closed
→ 查看完整生命周期时间线
```

## 强制边界

- 使用 React + TypeScript + Vite，包管理器使用仓库现有 pnpm；
- 使用固定演示数据和前端内存 reducer/state machine；
- 不连接真实 Kernel、数据库、Agent、模型、Git、DevOps 或网络服务；
- 不修改正式运行时包：`packages/protocol`、`packages/kernel`、`packages/store`、`packages/store-sqlite`、`apps/cli`；
- 只允许新增 `apps/demo-web/`、更新 `pnpm-lock.yaml`，以及必要的文档入口；
- 不加载远程字体、远程图片或 CDN 资源；
- 不做通用聊天、Issue Tracker、复杂 Dashboard 或流程编辑器；
- 界面必须标注 `DEMO DATA`；
- 所有场景可重复、可重置、无随机结果；
- 页面不能直接写状态，所有正式迁移必须通过集中 reducer Command；
- 不提交 Git commit，除非调用者明确要求。

## 实施要求

严格按需求计划中的 Task 1–8 推进，尤其注意：

1. 先实现并测试 7 场景 reducer，再做 UI；
2. Workbench 必须 Attention-first，而不是 Task Kanban；
3. Change Room 首屏必须优先展示 Current Focus；
4. Decision 必须绑定精确版本、Artifact、Digest、Environment 和 acting role；
5. Evidence 必须按 Claim 组织；
6. `CLM-02` 从 Insufficient 到 Satisfied 是核心失败修复故事；
7. 生命周期时间线与 Run 技术明细必须分层；
8. Presenter Mode 必须支持上一步、下一步、场景跳转、Reset 和键盘快捷键；
9. 视觉应像专业的决策运营工作台，不要使用霓虹、玻璃拟态或通用 Admin 模板；
10. 最佳演示尺寸 1440×900，最低支持 1280×720。

## 质量门槛

至少覆盖并通过以下自动化测试：

- 合法和非法状态迁移；
- Attention 排序；
- Contract Decision 版本绑定；
- Agent Run 进入评价失败；
- `CLM-02` 修复前后状态变化；
- Release Decision 绑定 Artifact/Digest/Environment；
- 部署关闭后的生命周期事件；
- Reset Demo；
- Presenter Mode 遍历 7 个场景。

完成前必须运行：

```bash
pnpm install
pnpm --filter @cimiloop/demo-web test
pnpm --filter @cimiloop/demo-web build
pnpm test
```

如果工具支持浏览器预览或截图，请实际打开原型，按计划中的 10 步人工验收脚本走完整流程，并检查 1280×720 与 1440×900 两种尺寸。不要仅凭测试通过就宣称视觉验收完成。

## 工作方式

- 开始前检查 `git status`，保留用户已有修改；
- 做合理假设并继续推进，只有真正影响产品语义或造成安全风险时才询问；
- 遇到失败先诊断根因，不要删除或绕过测试；
- 控制依赖数量，不为单个小功能引入大型库；
- 不使用 mock API 或假后端，固定数据应明确放在 `src/demo/scenario.ts`；
- 在 `apps/demo-web/README.md` 写明启动方式、7 个演示场景、Presenter 快捷键、非目标和已知限制。

## 最终交付报告

完成后请报告：

1. 实现了哪些页面、场景和关键交互；
2. 主要文件路径；
3. 自动化测试和构建命令的真实结果；
4. 是否完成浏览器人工验收及使用的视口尺寸；
5. 仍存在的演示限制；
6. 如何启动和重置 Demo。

不要在实现完成前结束任务。
