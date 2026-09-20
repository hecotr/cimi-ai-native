# CimiLoop M3 Claim–Evidence 与 Independent Evaluation Implementation Plan

> **For development Agent:** REQUIRED SUB-SKILL: Use `executing-plans` after M2 gate passes.

**Goal:** 让 Artifact 的可交付性由 Claim、Evidence、Requirement Set 和独立 Evaluation 证明，并在失败时形成可审计 Repair Loop。

**Architecture:** Evidence 是不可变观察，Evaluation 是基于精确输入的一次判断，Gate 只消费有效 Evaluation；Artifact/Contract/Policy 变化通过 dependency binding 精确传播 Valid/Stale/Superseded/Invalid。Evaluator 使用独立 Work Item/Run/Context，不能继承 Executor 完整对话或修改生产代码。

**Tech Stack:** M2 stack、Protocol schemas、Kernel deterministic evaluator、Runtime Adapter、Local evidence objects。

---

## 1. Objects and invariants

新增：`Claim`、`Evidence`、`ExternalReference`、`GateRequirementSet`、`ClaimAssessment`、`GateEvaluation` 扩展、`EvidencePackageManifest`、`ImpactAssessment`、`RepairWorkItemLink`。

Evidence stance：`Supports | Refutes | Inconclusive`；validity：`Valid | Stale | Superseded | Invalid`。Run 成功、Artifact 存在、LLM 自评均不能直接 ALLOW；未解决 Refutes 阻止 ALLOW；Evaluator 不得修改被评价代码。

## 2. Tasks

### Task 1：M3 Protocol
**Files:** Create `packages/protocol/src/m3/{domain,commands,results}.ts`; modify exports/tests/artifacts。
1. 红灯覆盖 stance/validity、digest、subject binding、外部引用禁止秘密。
2. 定义 SubmitClaim/RecordEvidence/PromoteTestResult/RequestEvaluation/CompleteEvaluation/AssessImpact/CreateRepairWorkItem。
3. Result union 严格；schema registry 全量通过。
4. Commit `feat(protocol): define M3 evidence contracts`。

### Task 2：Store 与 Migration v4
**Files:** Modify Store/migrations/contracts; create m3 migration tests。
1. 新建 claims/evidence/requirements/assessments/evaluations/packages/impact tables。
2. 不可变记录只 insert；current validity 用追加 ImpactAssessment + query projection，禁止改历史 payload。
3. 约束 Evidence 精确绑定 subject type/id/digest/environment/context。
4. M0–M2 无损升级。
5. Commit `feat(store): persist M3 evidence and evaluation facts`。

### Task 3：Requirement Set Resolver
**Files:** Create `packages/kernel/src/evidence/{requirements,claims}.ts` and tests。
1. 由 core + profile + risk + policy + contract 生成版本化 Requirement Set。
2. required/conditional/advisory claim 分开；输入相同复用 digest，输入变化新版本。
3. 每项 requirement 可解释来源；未知 extension 不参与规则。
4. Commit `feat(kernel): resolve versioned gate requirements`。

### Task 4：Evidence Ingestion 与确定性提升
**Files:** Create `packages/kernel/src/evidence/{ingest,promotion}.ts`, tests。
1. Record 原始 Evidence 与 External Reference；验证 digest/subject/provenance。
2. 仅白名单测试格式可提升为 deterministic Evidence；解析失败为 Invalid，不猜结果。
3. Executor self-check 标注 producer role，不能替代 independent evaluation。
4. Refutes/Inconclusive 原样保留，不允许 Human Decision 改写。
5. Commit `feat(kernel): ingest trustworthy evidence records`。

### Task 5：独立 Evaluator Work Item/Run
**Files:** Create `packages/evaluator/src/{planner,runner,context}.ts`, tests; modify orchestrator。
1. 为 Artifact 创建 evaluator Work Item，绑定 requirements/artifact digest。
2. Context 不包含 Executor 完整对话/临时推理，只含 Contract/Plan/Artifact/Claims/必要 source。
3. Evaluator capability 禁止生产代码写权限；尝试写入必须失败并记录 Failure。
4. evaluation retry 新建 Run，不覆盖旧结论。
5. Commit `feat(evaluator): run independent artifact evaluations`。

### Task 6：Claim Assessment 与 Gate
**Files:** Create `packages/kernel/src/evidence/{assessment,evaluation-gate}.ts`, tests。
1. required 全 satisfied 才可能 ALLOW；Insufficient→NEED_MORE_EVIDENCE；Human judgment→REQUIRE_HUMAN；hard policy→DENY。
2. 未解决 Refutes 一律阻止 ALLOW；冲突不做多数表决。
3. 相同有效输入可复用 Evaluation；输入变化创建新记录并 re-evaluates 链接。
4. Evaluation 保存后由 Kernel 决定 transition，Evaluator 不能改状态。
5. Commit `feat(kernel): evaluate claims through deterministic gates`。

### Task 7：精确失效传播
**Files:** Create `packages/kernel/src/evidence/impact.ts`, tests。
1. Contract/Artifact/Environment/Policy/Context 变化只影响有 dependency binding 的 Evidence。
2. Digest 改变使绑定旧 digest 的测试/evaluation Stale 或 Superseded。
3. 损坏、主体不匹配、无法验证来源为 Invalid。
4. 每次判断记录 old/new input、rule、affected IDs、结论。
5. Commit `feat(kernel): propagate evidence validity precisely`。

### Task 8：Repair Loop
**Files:** Create `packages/kernel/src/repair.ts`, tests; modify scheduler。
1. Evaluation Refutes 时 Change 返回/保持 Executing，并创建 Repair Work Item。
2. Repair 关联失败 Evidence、原 Work Item、Task、Artifact；使用新 Run。
3. 修复产生新 Artifact；旧失败与旧 Artifact 永久保留。
4. 新 Artifact 必须重新 evaluation，不复用旧 ALLOW。
5. Commit `feat(kernel): create auditable repair loops`。

### Task 9：Evidence Package、UI 与场景
**Files:** Modify CLI/workbench; create `tests/scenarios/m3*.test.ts`, `scripts/demo-m3.ps1`。
1. Evidence Package manifest 组合 precise references，不复制原始大日志。
2. UI 展示 claim coverage、Refutes、freshness、evaluation reason、repair lineage。
3. 场景：pass；refutes→repair→new artifact→pass；artifact change invalidation；evaluator write denied。
4. Commit `feat: expose and verify M3 evidence evaluation`。

### Task 10：M3 冻结
**Files:** Create M3 implementation doc; update README。
1. schema drift、Node 24 全测、demo、diff check。
2. 证明 Artifact/Run 不能直接过 Gate，Refutes 阻止 ALLOW，Evaluator 独立。
3. Commit `docs: freeze M3 evidence architecture`。

## 3. Exit Gate

- Artifact 存在/Run 成功不能直接通过；
- Refutes 阻止 ALLOW；
- 失败形成 Repair Work Item、新 Run/Artifact 和重新评价；
- 影响精确传播；
- Evaluator 无代码修复权限且上下文独立；
- M0–M2 回归通过。
