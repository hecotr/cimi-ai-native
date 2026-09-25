# CimiLoop 交互式演示原型

这是一个纯前端、固定数据、可离线运行的 CimiLoop 演示应用，用于向研发主管、产品经理和开发工程师讲清楚：一次“订单导出能力”Change 如何从创建走到关闭。

它不是已连接 Kernel 的产品，也不是静态线框。所有页面都是 Read Model 的演示投影；所有正式状态迁移都经过 `src/demo/reducer.ts` 中的 Command。

## 启动

在仓库根目录：

```bash
pnpm install
pnpm --filter @cimiloop/demo-web dev
```

浏览器打开 `http://localhost:5173`。最佳投影尺寸 **1440×900**，最低支持 **1280×720**。

```bash
pnpm --filter @cimiloop/demo-web test
pnpm --filter @cimiloop/demo-web build
```

构建结果在 `apps/demo-web/dist/`，可直接用静态服务器离线打开。不加载远程字体、远程图片或后端。

## Presenter Mode

底部 Presenter Bar 默认折叠，不遮挡产品界面。顶部主路径条始终显示当前走到哪一步。

| 操作 | 作用 |
|---|---|
| 上一步 / 下一步 | 按 1–9 顺序切换场景 |
| 场景下拉框 | 直接跳到任意 Scene |
| Reset Demo | 恢复固定初始状态 |
| `←` `→` | 切换场景 |
| `R` | 重置 |
| `P` | 展开或折叠 Presenter Bar |

输入框、标签页和对话框内不会误触发方向键。

## 9 个演示场景

主路径从创建开始，一次走完：

1. **Workbench**：林晓已经提出订单导出诉求，但 CHG-0242 还不存在。
2. **Create Change**：创建 Draft Change，只建立责任边界，不一次填完整份契约。
3. **Draft Clarify**：下一步是澄清，而不是立即实现。
4. **Contract Decision**：人对意图和边界负责。批准的是 `contract-v1`，acting role 是 Technical Owner。
5. **Agent Running**：Agent 承担主要执行。点击“运行到下一检查点”会有约 1.2 秒本地模拟。
6. **Evaluation Failed**：Run success 不等于 Change 完成。`CLM-02` 缺少权限反例 Evidence，Gate = `NEED_MORE_EVIDENCE`。
7. **Repair Verified**：失败 Evidence 驱动修复。完成后新增 `EVD-2207`，`CLM-02` 变为 Satisfied。
8. **Release Decision**：批准的是 `order-service:2026.09.21.3`、`sha256:8f2a…d91c` 和 `prod-cn`。
9. **Delivery Closed**：完整事实链、即时验证和学习候选都留在时间线里。

主故事线也可以不靠 Presenter，只点击每个场景的唯一主动作走完。

## 重置方式

- Presenter Bar 中的 **Reset Demo**
- 快捷键 `R`
- 刷新页面（状态只存在内存，刷新后回到 Workbench）

## 非目标

- 不连接真实 Kernel、Agent、模型、Git、CI/CD、数据库或环境
- 不实现登录、多租户、实时协作或通用聊天
- 不把演示状态写入正式 CimiLoop Store
- 不承诺这些组件直接进入 V1 产品

## 已知限制

- 只有 `CHG-0242` 进入完整状态机；其余 Change 是背景投影
- Request changes / Reject 只展示结构化反馈，不展开分支故事
- 运行过程由本地 timer 模拟，不消耗模型或网络
- 非法 Command（例如 Digest 不一致）有拒绝原因，但主路径不会主动触发
