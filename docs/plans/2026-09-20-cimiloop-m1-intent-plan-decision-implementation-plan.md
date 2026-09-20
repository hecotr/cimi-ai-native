# CimiLoop M1 Intent、Plan 与 Human Decision 实施计划

> **For development Agent:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** 在已冻结的 M0 可恢复 Kernel 上交付 M1，使一个 Draft Change 能形成并批准 Contract v1、形成并批准 Plan v1，最终可靠进入 `Planned`，并完整记录角色授权、风险、知识影响、Decision、Feedback、Gate、Transition、Event 与查询视图。

**Architecture:** 保持 `protocol ← store ← kernel ← cli/workbench`。Protocol 定义对象、Command、Result 与 JSON Schema；Kernel 用纯领域规则校验候选、Task DAG、Policy、角色和 Decision 新鲜度；SQLite 在单事务中保存 Current State、不可变记录、Event、Outbox 与 Command Receipt；CLI/Workbench 只调用 Kernel。Workbench 使用 Node 服务端渲染的本地基础页，不提前引入完整 SPA。

**Tech Stack:** TypeScript 7 strict、Node.js 24.15、ESM、pnpm 12.4.2、TypeBox、Ajv strict、`node:sqlite`、Commander、Vitest、Node `http`/`fetch`。

---

## 1. 范围与不变量

### 必须交付

- `Draft → IntentReady → Planned` 纵向闭环；
- Feature、Bugfix、Incident Profile；
- Contract Candidate/Version/Amendment、Risk Profile/Assessment；
- Plan Candidate/Version/Amendment、Task DAG；
- Knowledge Impact：`Create | Update | Deprecate | Verify | NoImpact`；
- Project/Change/Intent/Technical Owner Human Assignment；
- Project Policy、Policy Snapshot、Intent/Plan Decision、Feedback、Gate；
- 三类 decision outcome、过期、Revision 冲突和越权的确定行为；
- Decision Inbox、Change Room、Timeline、CLI 与 Workbench；
- M0 无损升级、回滚、幂等、并发和重启恢复。

### 不进入 M1

- Agent Runtime、Work Item、Lease、Lock、Worktree；
- Context Pack、Capability Binding、Artifact、Claim/Evidence；
- Release、Deployment、Recovery、Reconciliation；
- 通用 Policy 编辑器、登录、实时协作、聊天、外部知识 Adapter；
- 大型前端框架和拖拽看板。

### 不变量

1. Agent Actor 不能承担 Human Owner 或提交正式 Decision。
2. Decision 不直接改状态；保存后 Kernel 按最新事实重新求值 Gate。
3. Decision Request 绑定候选 revision、Profile、Risk、Knowledge、Policy Snapshot 和摘要；输入变化即过期。
4. `request_changes` 保持生命周期并生成 Feedback；`reject` 保持生命周期并进入 `Paused`；只有有效 `approve` 推进生命周期。
5. 正式 Contract/Plan 不可变；候选 revision 不占正式版本号。
6. Plan 精确绑定 Contract Version；Task 依赖必须为 DAG。
7. `NoImpact` 是显式结论，不能用“没有 Knowledge Task”代替。
8. Current State、Decision/Version、Transition、Event、Outbox、Receipt 原子提交。
9. Read Model 可重建，不能成为授权或状态权威。

## 2. Protocol 目录

新增对象：`ChangeProfile`、`ProjectPolicy`、`PolicySnapshot`、`ContractCandidate`、`ContractVersion`、`ContractAmendment`、`RiskProfile`、`RiskAssessment`、`KnowledgeImpactAssessment`、`PlanCandidate`、`PlanVersion`、`PlanAmendment`、`Task`、`DecisionRequest`、`Decision`、`Feedback`、`GateEvaluation`、`ChangeRoomView`、`DecisionInboxItem`。

新增 Command：`BootstrapSoloGovernance`、`SubmitContractCandidate`、`RequestIntentDecision`、`SubmitDecision`、`SubmitContractAmendment`、`SubmitPlanCandidate`、`RequestPlanDecision`、`SubmitPlanAmendment`。

```ts
type DecisionOutcome = "approve" | "request_changes" | "reject";
interface SubmitDecisionPayload {
  request_id: InternalId;
  outcome: DecisionOutcome;
  acting_role_id: InternalId;
  reason: string;
  feedback?: Array<{
    category: "scope" | "acceptance" | "risk" | "plan" | "knowledge" | "other";
    body: string;
  }>;
}
```

`request_changes`/`reject` 必须有 reason；`request_changes` 至少有一条 Feedback。新增 Query：`GetContractCandidate`、`GetCurrentContract`、`GetPlanCandidate`、`GetCurrentPlan`、`GetDecisionRequest`、`ListDecisionInbox`、`GetChangeRoom`、`GetTimeline`。

## 3. 执行纪律

- 最新 main 创建 `codex/m1-intent-plan-decision`，不直接在 main 开发。
- 严格 TDD：红灯、最小实现、目标测试、全量回归、提交。
- 每任务单独提交；Schema 变化同步 JSON Schema。
- SQLite 写路径进入共享 Store contract。
- 每个 Command 测幂等、command ID 冲突、revision 冲突和失败零写入。
- 如需改变不变量，停止并提出设计变更。

## 4. 逐任务实施计划

### Task 1：M1 基线与夹具

**Files:** Create `tests/fixtures/m1.ts`、`tests/scenarios/m1-baseline.test.ts`；modify `docs/implementation/README.md`。

1. `git pull --ff-only origin main && git switch -c codex/m1-intent-plan-decision`。
2. Node 24.15 + pnpm 12.4.2 执行 `pnpm test`，确认 M0 绿灯。
3. 建固定时钟、确定性 ID、临时 SQLite、Human/Agent command builder。
4. 写失败场景：完整流程后 Change 为 `Planned`。
5. Run: `pnpm vitest run tests/scenarios/m1-baseline.test.ts`；Expected: FAIL。
6. Commit: `test: define M1 vertical slice baseline`。

### Task 2：M1 领域 Schema

**Files:** Create `packages/protocol/src/m1/{common,domain}.ts`；modify schemas/validation/index/export/tests；regenerate artifacts。

1. 红灯：非法 outcome/profile/knowledge conclusion、version 0、额外字段拒绝。
2. 核心对象 `additionalProperties: false`；扩展只进命名空间化 `extensions`。
3. 正式 version/candidate revision 从 1 开始；可变聚合带 revision。
4. Run: `pnpm schema:export && pnpm vitest run packages/protocol/test/schema.test.ts`。
5. 全部 Schema 同时注册 Ajv strict registry。
6. Commit: `feat(protocol): define M1 domain schemas`。

### Task 3：Command、Result 与 Read Model Schema

**Files:** Create `packages/protocol/src/m1/{commands,results}.ts`；modify validation/index/export/tests。

1. 为 8 Command、Inbox、Room、Timeline 写红灯 parser 测试。
2. 修改命令要求 expected revision；Decision 要 acting role。
3. `CommandSuccess.data` 用严格 union，禁止任意 Record。
4. Query Result 仅含引用与摘要，不复制 Transcript、路径或秘密。
5. Run: `pnpm schema:export && pnpm test`。
6. Commit: `feat(protocol): add M1 commands and query results`。

### Task 4：Store Port 与版本化 Migration

**Files:** Modify Store/SQLite/shared contract；create `packages/store-sqlite/src/migrations.ts`、`packages/store-sqlite/test/m1-migration.test.ts`。

1. Store contract：对象 insert/get/list；候选 update 要 expected revision；不可变记录无 update。
2. Migration 改为 v1/v2 显式序列，逐版本事务执行。
3. 建 profiles/policies/snapshots、contract/risk/knowledge、plan/tasks、decision/feedback/gate 表与索引。
4. 任一写失败回滚 Change、Decision、Gate、Transition、Event、Outbox、Receipt。
5. M0→M1：原 ID、revision、event sequence、receipt、outbox 不变；重复打开幂等。
6. Run: `pnpm vitest run packages/store-sqlite/test/m1-migration.test.ts packages/store-sqlite/test/project-store.contract.test.ts`。
7. Commit: `feat(store): persist M1 governance and planning facts`。

### Task 5：Solo Governance 与 Policy

**Files:** Create `packages/kernel/src/{governance,policy}.ts`、`packages/kernel/test/governance.test.ts`；modify kernel/index。

1. 红灯：bootstrap 创建 Change/Intent/Technical Owner role/assignment；Agent 被拒；重放幂等。
2. Policy：Intent 需 Intent Owner；Plan 需 Technical Owner；Decision 只允许 Human；Knowledge Task 必须覆盖。
3. Policy Snapshot 对规范化输入计算 digest。
4. 老项目不在 open 时静默新增事实；显式 Command 写事实/Event/Outbox/Receipt。
5. Run: `pnpm vitest run packages/kernel/test/governance.test.ts`。
6. Commit: `feat(kernel): add solo governance and M1 policy`。

### Task 6：Contract、Risk 与 Knowledge Impact

**Files:** Create `packages/kernel/src/{contract,risk,knowledge-impact}.ts`、test；modify kernel。

1. 红灯：candidate revision、stale revision、Risk 不完整、知识分类缺失、失败零写入。
2. Contract 含 intent、outcomes、scope、non-goals、acceptance、constraints、profile。
3. 四类知识来源逐项结论；NoImpact 需理由；其他结论需 owner/gate。
4. 纯函数不访问 Store/时钟/随机数。
5. 原子保存 Candidate、Risk、Knowledge、Event、Outbox、Receipt。
6. Run: `pnpm vitest run packages/kernel/test/contract.test.ts`。
7. Commit: `feat(kernel): add contract candidate and impact assessment`。

### Task 7：Intent Decision 与 Gate

**Files:** Create `packages/kernel/src/decision.ts`、`gates/intent-gate.ts`、test；modify kernel/change。

1. 红灯覆盖四类 Gate Result。
2. Request digest 含 Change/candidate/Profile/Risk/Knowledge/Policy/role/scope。
3. approve：身份→Decision→重算摘要→Gate→Contract v1→IntentReady→Transition/Event/Outbox/Receipt。
4. request_changes：Draft Active + Feedback；reject：Draft Paused。
5. 输入或 Assignment 变化使 request expired。
6. 测 Agent 越权、错误 role、幂等、回滚。
7. Run: `pnpm vitest run packages/kernel/test/intent-decision.test.ts`。
8. Commit: `feat(kernel): authorize contracts through intent decisions`。

### Task 8：Plan、Task DAG 与 Knowledge Task

**Files:** Create `packages/kernel/src/{plan,task-dag}.ts`、test；modify kernel。

1. 红灯：仅 IntentReady；绑定当前 Contract；Task key 唯一；依赖存在、无自依赖、无环。
2. Plan 覆盖 acceptance、风险、验证策略、恢复考虑。
3. 非 NoImpact 必须由 `kind=knowledge` Task 引用。
4. DAG 错误返回排序后的 `cycle_task_ids`。
5. 批准前不创建 Work Item/Ready Task。
6. Run: `pnpm vitest run packages/kernel/test/plan.test.ts`。
7. Commit: `feat(kernel): validate plan candidates and task DAGs`。

### Task 9：Plan Decision 与 Planned

**Files:** Create `packages/kernel/src/gates/plan-gate.ts`、test；modify decision/kernel/change。

1. 红灯覆盖三 outcome、错误 role、过期和双客户端竞争。
2. 复用统一 Decision 引擎，通过 strategy 注入 Intent/Plan 差异。
3. approve 原子保存 Decision/Gate/Plan v1/Task/Planned/Transition/Event/Outbox/Receipt。
4. request_changes 保持 IntentReady Active；reject 保持 IntentReady Paused。
5. 上游输入变化使 request 过期。
6. Run: `pnpm vitest run packages/kernel/test/plan-decision.test.ts`。
7. Commit: `feat(kernel): authorize plans through technical decisions`。

### Task 10：Contract/Plan Amendment

**Files:** Create `packages/kernel/src/amendment.ts`、test；modify decision/kernel。

1. IntentReady 时 Contract Amendment 批准产生 v2，旧版本保留，旧 Plan request 过期。
2. M1 禁止 Planned 后批准 Contract Amendment，返回 `M1_AMENDMENT_AFTER_PLANNED_UNSUPPORTED`。
3. Plan Amendment 批准产生 v2，保持 Planned，重验 DAG/验证策略/Knowledge Task。
4. stale base 返回 `AMENDMENT_BASE_STALE`；拒绝/撤回不占版本。
5. Run: `pnpm vitest run packages/kernel/test/amendment.test.ts`。
6. Commit: `feat(kernel): preserve versioned contract and plan amendments`。

### Task 11：Inbox、Change Room、Timeline

**Files:** Create `packages/kernel/src/read-models.ts`、test；modify Store/SQLite/Kernel query。

1. Inbox 只显示 actor assignment 可处理的 open request。
2. Room 组合 Focus、下一动作、Contract/Plan、Risk、Knowledge、Decision、Feedback、Timeline。
3. Timeline 按 Event Sequence。
4. M1 使用 query-time projection，保留 `ReadModelBuilder` 边界。
5. Result 在 Kernel 和 Operator 边界均过 parser。
6. Run: `pnpm vitest run packages/kernel/test/read-models.test.ts`。
7. Commit: `feat: add M1 decision and change room read models`。

### Task 12：CLI 闭环

**Files:** Modify `apps/cli/src/{bin,commands,output}.ts`；create CLI/scenario tests。

```text
cimiloop governance bootstrap-solo
cimiloop contract submit <change> --file <json>
cimiloop contract request-review <change>
cimiloop plan submit <change> --file <json>
cimiloop plan request-review <change>
cimiloop decision inbox
cimiloop decision submit <request> --outcome <...> --acting-role <id> --reason <text> [--feedback-file <json>]
cimiloop room show <change>
cimiloop timeline <change>
```

1. 先写红灯；写命令支持 command ID/expected revision，全部支持 JSON。
2. 文件先 parse；非法 JSON/Schema 返回稳定 DomainError。
3. JSON 不向 stderr 泄露路径/stack/SQL，输出过具体 parser。
4. 人类输出突出 role、revision 和下一动作。
5. Run: `pnpm vitest run apps/cli/test/m1-output.test.ts tests/scenarios/m1-cli.test.ts`。
6. Commit: `feat(cli): expose M1 contract plan and decision flow`。

### Task 13：本地 Workbench

**Files:** Create `apps/workbench` package、server/routes/render/styles/test；modify root workspace/config。

1. 红灯 HTTP：`GET /`、`GET /changes/:id`、`POST /decisions/:id`、stale 409、HTML escaping。
2. Node `http` SSR，仅监听 `127.0.0.1`；拒绝非 loopback。
3. POST 只构造 Kernel Command，含 form token/expected revision；禁止直写 Store。
4. 页面不显示 DB 路径/SQL/stack/token；退出关闭资源。
5. 根脚本增加 `workbench`。
6. Run: `pnpm vitest run apps/workbench/test/workbench.test.ts`。
7. Commit: `feat(workbench): add local M1 decision workspace`。

### Task 14：可靠性与升级矩阵

**Files:** Modify shared Store contract/baseline；create `tests/scenarios/m1-reliability.test.ts`。

1. 在 Decision/Version/Change/Transition/Event/Outbox/Receipt 写点注入故障；重开无部分事实。
2. 提交后响应丢失；相同 command ID 返回原结果且计数不变。
3. 两 Store 同 revision approve：一成功一冲突；仅一个正式版本。
4. 改变 candidate/profile/risk/knowledge/policy/assignment/current contract；旧 request 全失效。
5. Run: Node 24.15 + pnpm 12.4.2 `pnpm test`。
6. Commit: `test: harden M1 decisions and recovery paths`。

### Task 15：演示、文档与冻结

**Files:** Create `examples/m1/{feature-contract,feature-plan}.json`、`scripts/demo-m1.ps1`、`docs/implementation/2026-09-20-cimiloop-m1实施架构-v0.1.md`；modify README。

1. Demo 在临时 Git repo 执行 init→governance→create→contract approve→plan approve→room/timeline。
2. 文档准确列出 M1 已实现/未实现，不宣称 M2+。
3. Run: schema export；schema diff；Node 24 全测；demo；`git diff --check`。
4. Commit: `docs: complete M1 implementation and demo`。

## 5. 验收矩阵

| ID | 场景 | 必须产生 | 通过标准 |
|---|---|---|---|
| A01 | Bootstrap | Role/Assignment/Policy/Event | Human 明确承担；幂等 |
| A02 | Contract candidate | Candidate/Risk/Knowledge/Event | 无正式版本；revision 可控 |
| A03 | Intent request | Snapshot/Gate/Request | 绑定全部输入 |
| A04 | Contract approve | Decision/Contract v1/Gate/Transition/Event | 原子进入 IntentReady |
| A05 | request changes | Decision/Feedback/Event | Draft Active |
| A06 | reject | Decision/Feedback/Event | 原状态 Paused |
| A07 | Plan candidate | Candidate/DAG/Knowledge Task/Event | 绑定 Contract；无环 |
| A08 | Plan approve | Decision/Plan v1/Task/Gate/Transition/Event | 原子进入 Planned |
| A09 | stale decision | Expired Request/Event | 旧批准不可复用 |
| A10 | Agent 越权 | DomainError | 零写入 |
| A11 | 双客户端 | 一成功一冲突 | 单版本单迁移 |
| A12 | 响应丢失 | 原 Result | 不重复事实/Outbox |
| A13 | M0 升级 | migration v2 | 既有事实不变 |
| A14 | Room/Inbox | Derived View | 可重建 |
| A15 | Workbench approve | Kernel Command 链 | 不直写 Store |

## 6. 开发 Agent 交接清单

完成后提供：分支/head/base commit；Task 1–15 完成/偏离；新增对象/Command/Error code；全量测试数量与结果；migration/demo 结果；已知限制；Schema drift 与 diff check；不要自行合并 main。

## 7. 终审拒绝条件

以下任一项成立不得合并：

- UI/Adapter/Agent 可直接写 Store 或 Change State；
- Agent 可提交 Human Decision；
- Decision 未绑定 role/scope/candidate revision/policy snapshot，或 Decision 后未重新 Gate；
- 正式 Contract/Plan 被更新或历史被覆盖；
- DAG/Knowledge 只在 UI 校验；
- 失败路径留下部分状态、Event、Outbox 或 Receipt；
- JSON/Workbench 泄露路径、SQL、stack、token 或未校验字段；
- M0 升级改变 ID、revision、event sequence 或 receipt；
- 文档将 M2+ 误报为已实现。

全部通过后冻结 M1，进入 M2。
