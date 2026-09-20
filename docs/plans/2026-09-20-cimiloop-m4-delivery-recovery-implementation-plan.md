# CimiLoop M4 Test、Production 与 Recovery Implementation Plan

> **For development Agent:** REQUIRED SUB-SKILL: Use `executing-plans` after M3 gate passes.

**Goal:** 使用同一 Artifact 完成测试部署、验证、生产授权、生产晋升、即时验证，并对未知结果和失败提供可审计 Recovery/Reconciliation。

**Architecture:** Kernel 管理 Environment/Release/Deployment 状态与 Gate；DevOps Port 定义 build/deploy/status/verify/recover/reconcile，command adapter 执行项目配置脚本。外部调用由事务后 Outbox 驱动，operation key 幂等；超时/断连视为 Unknown，必须 reconcile，禁止盲重试。

**Tech Stack:** M3 stack、Node child process、项目级 command adapter、HTTP acceptance fixture、SHA-256。

---

## 1. Objects and invariants

新增：`Environment`、`Release`、`ReleasePackage`、`Deployment`、`DeploymentAttempt`、`VerificationResult`、`RecoveryStrategy`、`RecoveryExecution`、`Reconciliation`、`ExternalOperation`。

不变量：测试与生产使用相同 Artifact digest；Release Decision 只授权一个具体 Release/Environment/scope/window/recovery；未知结果不重试 deploy；Adapter 不能改状态；生产验证失败只执行预授权 recovery，超范围 REQUIRE_HUMAN。

## 2. Tasks

### Task 1：M4 Protocol
**Files:** Create `packages/protocol/src/m4/{domain,commands,results}.ts`; modify exports/tests/artifacts。
1. 红灯覆盖 environment kind、release digest、operation state、unknown result、recovery scope。
2. Command：RegisterEnvironment/CreateRelease/RequestReleaseDecision/SubmitDecision/QueueDeployment/RecordOperationResult/RequestReconciliation/RecordReconciliation/AuthorizeRecovery/RecordRecovery。
3. Adapter input/result 全部 strict schema；错误不得含 secret/process env。
4. Commit `feat(protocol): define M4 delivery contracts`。

### Task 2：Store 与 Migration v5
**Files:** Modify Store/migrations/contracts; create m4 migration tests。
1. 新建 environments/releases/deployments/attempts/verifications/recoveries/reconciliations/external_operations。
2. operation key 唯一；attempt append-only；current external state 由最新核对投影。
3. Outbox 与 Release/Deployment 创建同事务；外部调用不在事务内。
4. M0–M3 无损升级。
5. Commit `feat(store): persist M4 delivery and recovery facts`。

### Task 3：DevOps Port 与 Command Adapter
**Files:** Create `packages/devops/src/{port,contract}.ts`; create `packages/devops-command/src/{adapter,config,process}.ts`; tests。
1. Contract tests 覆盖 build/deploy/status/verify/recover/reconcile、timeout、signal、malformed JSON。
2. 项目配置声明 executable/args/working directory/input schema；禁止 shell 拼接。
3. operation key 传给脚本；stdout result 过 schema；大日志存文件并 digest/reference。
4. secret 只由 provider 注入，永不写 Event/manifest/export。
5. Commit `feat(devops): add schema-validated command adapter`。

### Task 4：真实 Acceptance Environment
**Files:** Create `examples/acceptance-target/**`, `scripts/m4-environment.ps1`, adapter tests。
1. 建最小 HTTP 服务，部署把指定 immutable artifact digest 安装到 test/prod 独立目录并切换明确 target。
2. status/verify 返回实际 digest、health、core path；recover 恢复 prior known-good digest。
3. 所有操作产生真实文件/进程副作用，不使用内存 mock；测试结束安全清理临时目录/进程。
4. 注入 timeout-before-effect、timeout-after-effect、wrong digest、health failure。
5. Commit `test: add real M4 acceptance environment`。

### Task 5：Test Release 与验证 Gate
**Files:** Create `packages/kernel/src/delivery/{release,test-gate}.ts`, tests。
1. 只有 M3 ALLOW Artifact 可创建 test Release。
2. Queue deployment 后 Outbox worker 调 adapter；result 用 Command 回写。
3. 部署实际 digest 必须等于 Release digest；否则 Invalid Evidence + Failure。
4. Test verify 形成环境绑定 Evidence；失败创建 Repair Work Item，不允许原地热修。
5. Commit `feat(kernel): gate test delivery by artifact evidence`。

### Task 6：Production Release Decision
**Files:** Create `packages/kernel/src/delivery/release-decision.ts`, tests。
1. Release Package 绑定 artifact digest、test evidence package、environment、scope/window/recovery。
2. Release Owner approve/request_changes/reject 复用统一 Decision engine。
3. Artifact/Environment/scope/window/recovery/test evidence 变化使 Decision 过期。
4. approve 只授权该 Release；不产生通用生产权限。
5. Commit `feat(kernel): authorize concrete production releases`。

### Task 7：Production Promotion 与即时验证
**Files:** Create `packages/kernel/src/delivery/production.ts`, tests。
1. production deploy 前再次核对 approved Release 和同 digest。
2. 成功 deploy 后必须 status + immediate verify 才能 ReleaseVerified。
3. wrong digest/health/core path 任一失败进入 recovery decision path。
4. 防止 test/prod 使用不同 digest；测试必须故意替换 artifact 并断言 DENY。
5. Commit `feat(kernel): promote and verify the same artifact digest`。

### Task 8：Unknown Result 与 Reconciliation
**Files:** Create `packages/kernel/src/delivery/reconciliation.ts`, `packages/orchestrator/src/external-worker.ts`, tests。
1. timeout/connection loss 把 operation 标 Unknown，创建 Blocker，不自动再次 deploy。
2. reconcile 查询外部 operation key/actual digest/state。
3. confirmed success/failure/not-found 各有确定状态；仍 unknown 保持 blocker。
4. 重启扫描 pending/unknown operations，先 reconcile 后决定，避免重复副作用。
5. Commit `feat: reconcile unknown external delivery results`。

### Task 9：Recovery
**Files:** Create `packages/kernel/src/delivery/recovery.ts`, tests。
1. Recovery Strategy 明确 trigger、target known-good digest、scope、steps、verify。
2. 预授权范围内可自动执行；范围超出、target 不可用或策略过期返回 REQUIRE_HUMAN。
3. Recovery 是新 append-only attempt，保留失败 deployment。
4. recovery 后核对 digest/health；失败保持 Blocker/AwaitingDecision。
5. Commit `feat(kernel): execute bounded production recovery`。

### Task 10：UI、场景与冻结
**Files:** Modify CLI/workbench; create `tests/scenarios/m4*.test.ts`, `scripts/demo-m4.ps1`, M4 implementation doc。
1. UI 展示 environment/release/deployment/unknown/recovery timeline 和 next action。
2. 场景：test fail→repair；same digest test/prod；decision stale；unknown→reconcile；prod verify fail→recover。
3. 重启/outbox 重投不重复 deploy。
4. schema drift、Node 24 全测、真实环境 demo、diff check。
5. Commit `docs: freeze M4 delivery and recovery architecture`。

## 3. Exit Gate

- test failure 走 Repair，不热修；
- production 只能晋升 test 通过的同 digest；
- Release approval 精确且一次性；
- Unknown 不盲重试，reconcile 后推进；
- production failure 可预授权 recovery 或 AwaitingDecision；
- M0–M3 全回归通过。
