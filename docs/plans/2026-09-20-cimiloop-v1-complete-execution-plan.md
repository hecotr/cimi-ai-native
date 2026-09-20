# CimiLoop V1 Complete Execution Plan

> **For development Agent:** REQUIRED SUB-SKILL: Use `executing-plans` and execute the linked milestone plans task-by-task.

**Goal:** 从已冻结 M0 连续实现 M1–M5，交付 Embedded Solo Mode 的完整、可审计、可恢复 V1 Change 闭环。

**Architecture:** 以 Cimi Change Protocol 为稳定契约，Kernel 为唯一状态/授权权威，SQLite 与 Local Files 为可移植事实存储，Runtime/DevOps/Knowledge 通过 Port/Adapter 接入，CLI/Workbench 共享同一 Command/Query 语义。执行允许由一个 Agent 连续完成，但每个里程碑必须独立验证、提交和冻结。

**Tech Stack:** TypeScript 7 strict、Node.js 24.15、pnpm 12.4.2、ESM、TypeBox/Ajv、`node:sqlite`、Vitest、Git worktree、Claude Code Runtime Adapter、command-based DevOps Adapter、本地 Workbench。

---

## 1. 计划文档索引

按顺序执行，不得跳跃：

1. [M1：Intent、Plan 与 Human Decision](./2026-09-20-cimiloop-m1-intent-plan-decision-implementation-plan.md)
2. [M2：Execution、Context 与 Immutable Artifact](./2026-09-20-cimiloop-m2-execution-context-artifact-implementation-plan.md)
3. [M3：Claim–Evidence 与 Independent Evaluation](./2026-09-20-cimiloop-m3-evidence-evaluation-implementation-plan.md)
4. [M4：Test、Production 与 Recovery](./2026-09-20-cimiloop-m4-delivery-recovery-implementation-plan.md)
5. [M5：Product Closure、Portability 与 Release Hardening](./2026-09-20-cimiloop-m5-product-portability-release-implementation-plan.md)

上位范围基线：`docs/plans/2026-09-19-cimiloop-v1产品范围与实施里程碑-v0.1.md`。

## 2. 开发分支与提交策略

1. 从最新 `origin/main` 创建单一分支 `codex/v1-complete`。
2. M1–M5 全部在该分支连续完成，不把未审核代码合入 main。
3. 每个计划中的 Task 单独提交；禁止最后一次性提交全部代码。
4. 每个里程碑结束创建 annotated tag：`v1-m1-candidate` 至 `v1-m5-candidate`，只打本地 tag，终审前不推 tag。
5. 遇到需求矛盾、外部凭据、不可逆迁移或计划之外的新框架时停止，不自行替用户决定。
6. 允许修复前序里程碑缺陷，但提交信息必须明确 `fix(mN)`，并重跑受影响里程碑及后续全部回归。

## 3. 全局架构约束

- 依赖方向：`protocol ← store ← kernel ← operator/adapters`；Adapter 不能成为 Kernel 依赖。
- 只有 Kernel 能提交 Change Transition；UI、CLI、Runtime、Evaluator、DevOps Adapter 不得直接写状态。
- 外部输入、持久化读取、Adapter Result、CLI/Workbench JSON 全部通过 Protocol Schema。
- Command 幂等、expected revision、Event Ledger、Outbox 与 Receipt 语义贯穿所有里程碑。
- 外部副作用只能在事务提交后执行，且具备幂等键或明确的未知结果核对路径。
- 大文件、代码、日志、Transcript、制品不进入 SQLite JSON；保存 External Reference、Digest 与必要摘要。
- Secret 不进入 Protocol、Event、Context Manifest、日志、Export 或错误输出。
- 不可变对象只追加；Current State/Read Model 可迁移或重建，不能反写历史。
- 所有时间 UTC；可靠顺序使用 Event Sequence，不以时间戳排序。

## 4. 里程碑门禁

每个里程碑结束必须执行：

```powershell
pnpm schema:export
git diff --exit-code -- packages/protocol/schemas
npx --yes --package node@24.15.0 --package pnpm@12.4.2 -c "pnpm test"
git diff --check
```

并满足：

- 该里程碑计划中的场景/故障矩阵全部通过；
- 上一里程碑全部测试仍通过；
- migration 从任一已发布 schema version 升级成功且幂等；
- 文档没有把下一里程碑能力声称为已实现；
- 工作区只含当前任务预期改动；
- 形成里程碑报告：对象/命令/错误码、测试数、demo、限制、偏离项。

门禁失败时禁止继续下一里程碑。

## 5. 跨里程碑关键数据流

```text
M1 Contract vN + Plan vN + Human Decisions
  → M2 Work Item + Context/Capability Binding + Run + Source Snapshot + Artifact
  → M3 Claim + Evidence + Independent Evaluation + Repair Loop
  → M4 Test Release + Production Release + Deployment + Recovery/Reconciliation
  → M5 Knowledge Closure + Close/Archive + Export/Import + Full Workbench
```

任一上游版本变化只按精确引用传播影响，不做无差别全量失效。

## 6. V1 最终验收场景

开发 Agent 必须提供可重复脚本覆盖：

1. Feature：Draft→Contract approve→Plan approve→execute→evaluate→test→production→close。
2. Evaluator refutes：返回 Executing，Repair Work Item，新 Artifact 重新评价。
3. Artifact digest 改变：旧 Test/Evaluation Evidence 不再支撑新 Gate。
4. Decision 过期：目标版本或范围变化后旧批准不能复用。
5. 外部部署结果未知：停止盲重试，进入 Blocker/Reconciliation。
6. 生产验证失败：执行预授权 recovery，超范围进入 AwaitingDecision。
7. Kernel 重启：恢复 Run/Lease/Outbox/Deployment，不重复副作用。
8. 权限/Policy 撤销：停止新操作，历史保持不变。
9. Export/Import：保留 ID/version/event/digest，拒绝分叉历史，导入后不激活运行时所有权。
10. Knowledge closure：Mandatory Knowledge Task 未完成不能关闭。

## 7. 开发 Agent 每次里程碑交接格式

```markdown
## Milestone M?
- Base commit:
- Head commit:
- Tasks completed:
- Plan deviations:
- New schemas/commands/errors:
- Migrations:
- Tests: <command> / <files> / <tests> / PASS
- Demo:
- Known limitations:
- Security/recovery notes:
- Next milestone readiness:
```

## 8. 最终交接与终审

全部完成后，开发 Agent 必须：

1. 推送 `codex/v1-complete` 并创建 PR，但不得自行合并；
2. 提供 base/head、完整 commit 列表和 M1–M5 报告；
3. 附全量测试、五个 demo、北极星/异常验收输出；
4. 列出所有计划偏离、临时限制、真实外部环境依赖和未决风险；
5. 保持分支可复现，不提交凭据、临时数据库、运行日志、worktree 或制品；
6. 等待独立终审；审查发现问题后只在原分支修复并重新跑完整回归。

一次性完成意味着同一开发 Agent 可连续执行所有计划，不意味着取消里程碑门禁、TDD、频繁提交或最终独立审核。
