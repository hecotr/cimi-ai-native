# CimiLoop M2 Execution、Context 与 Immutable Artifact Implementation Plan

> **For development Agent:** REQUIRED SUB-SKILL: Use `executing-plans` task-by-task after M1 gate passes.

**Goal:** 让 Planned Change 产生有边界 Work Item，在隔离 worktree 中通过首个 Runtime Adapter 执行，并形成可追溯的 Run、Context/Capability Binding、Source Snapshot 与不可变 Artifact。

**Architecture:** Kernel 负责 ready 规则、授权、lease/lock 和调度事实；Runtime、Git Workspace、Context Builder 通过 Port 注入。外部执行只消费已提交 Work Item，结果通过 Command 回传；Run 成功不能直接迁移 Change。Artifact 只保存 manifest/digest/reference，不复制大型内容。

**Tech Stack:** M1 stack、Git CLI、Claude Code command adapter、Node child process、SHA-256、SQLite/Local Files。

---

## 1. M2 边界与对象

新增 Protocol：`WorkItem`、`AgentRunRecord`、`ContextPackManifest`、`ContextSource`、`CapabilityRequirement`、`ProviderDescriptor`、`CapabilityBinding`、`SourceSnapshot`、`Artifact`、`ResourceLock`、`Lease`、`Failure`、`Blocker`。

新增 Command：`CreatePlanningWorkItem`、`CreateExecutionWorkItems`、`ClaimWorkItem`、`StartRun`、`HeartbeatRun`、`CompleteRun`、`FailRun`、`CancelRun`、`RecordSourceSnapshot`、`RecordArtifact`、`ReclaimExpiredLease`。

不变量：Work Item 固定 Contract/Plan/Task/权限/预算/停止条件；重试创建新 Run；授权边界变化创建新 Work Item；Runtime 不能改 Change；一个 Change 一个隔离 worktree；Artifact digest 不可变。

## 2. Tasks

### Task 1：M2 Schema 与命令
**Files:** Create `packages/protocol/src/m2/{domain,commands,results}.ts`; modify protocol exports/tests/artifacts。
1. 写非法 lease、digest、capability、run transition、secret 字段的红灯测试。
2. 定义严格 schemas 和 Command Result union。
3. 确保 manifest 只含引用/digest/摘要，禁止 secret value。
4. Run `pnpm schema:export && pnpm test`。
5. Commit `feat(protocol): define M2 execution schemas`。

### Task 2：Store、Migration 与共享契约
**Files:** Modify Store Port/migrations/shared contract; create `packages/store-sqlite/test/m2-migration.test.ts`。
1. 红灯覆盖 Work Item/Run/Context/Binding/Snapshot/Artifact/Lease/Lock 原子读写。
2. Migration v3 新建表、唯一约束和 lease/ready 索引。
3. 两连接竞争 claim 只允许一个 owner；过期后可 reclaim。
4. M0/M1→M2 无损升级、重复打开幂等。
5. Commit `feat(store): persist M2 execution facts`。

### Task 3：Ready Rule、Work Item 与 Scheduler
**Files:** Create `packages/kernel/src/{ready-rules,work-item,scheduler}.ts` and tests。
1. 红灯：Planned、依赖满足、范围/输入/权限/预算/停止条件明确且无 blocker 才 ready。
2. Planning Work Item 由 IntentReady 事件产生；M1 已完成 Plan 可直接使用手工 plan，不重复创建。
3. Execution Work Item 精确绑定 Plan/Task/Policy snapshot。
4. Lease/lock 冲突返回稳定错误，不做业务自动重试。
5. Commit `feat(kernel): schedule bounded M2 work items`。

### Task 4：Context Builder 与 Capability Resolver
**Files:** Create `packages/context/src/{ports,builder,resolver,index}.ts`, package/config/tests; modify workspace。
1. 红灯：按 role 选择最小来源；不存在能力产生 Blocker；权限取 actor/work-item/provider 三者交集。
2. Context Pack 不可变，记录 source revision/digest/freshness/authority。
3. Capability Binding 固定 runtime/model/tool/skill/adapter 的精确版本摘要。
4. Contract/Policy/permission 关键变化把 manifest 标为 Invalid；相关普通变化为 Stale。
5. Commit `feat(context): build immutable role-scoped context packs`。

### Task 5：Git Workspace Port 与隔离 Worktree
**Files:** Create `packages/workspace-git/src/{port,git-worktree,snapshot}.ts`, tests。
1. 用临时 Git repo 写红灯：创建/复用/拒绝脏路径、路径越界、删除保护。
2. worktree 名称基于 Change ID；验证 resolved path 位于配置根。
3. Source Snapshot 固定 commit/tree/diff status；有未提交内容时使用显式 snapshot manifest，不伪称 Git commit。
4. 禁止 destructive checkout/reset；cleanup 只作用于已验证 worktree。
5. Commit `feat(workspace): isolate changes in verified git worktrees`。

### Task 6：Runtime Port 与 Claude Code Adapter
**Files:** Create `packages/runtime/src/{port,types}.ts`; create `packages/runtime-claude-code/src/{adapter,process,parser}.ts`; tests。
1. 使用 fake executable 写 contract tests：start/heartbeat/cancel/timeout/exit/signal/invalid output。
2. Adapter 输入只含 Work Item、Context manifest 路径、worktree 与 capability binding。
3. stdout/stderr 写 Local Files 并记录 digest/reference；不进入 Event payload。
4. secret 只通过受控环境注入，日志和 manifest 必须脱敏。
5. 未知进程结果生成 Failure/Blocker，不把 exit 0 当作业务成功。
6. Commit `feat(runtime): add bounded Claude Code adapter`。

### Task 7：Run Orchestrator 与恢复
**Files:** Create `packages/orchestrator/src/{runner,recovery}.ts`, tests; modify composition roots。
1. 红灯覆盖 claim→context→binding→run→result command 的提交前/后故障。
2. 一次 Work Item 重试创建新 Run；授权变化产生新 Work Item。
3. 重启核对 lease/process reference；不重复启动已知仍运行进程。
4. Runtime Result 只能记录事实/建议，不能直接完成 Task 或迁移 Change。
5. Commit `feat(orchestrator): run and recover authorized agent attempts`。

### Task 8：Source Snapshot 与 Artifact
**Files:** Create `packages/kernel/src/{source-snapshot,artifact}.ts` and tests。
1. 红灯：Artifact 必须绑定 Run、Work Item、Context、Binding、Source Snapshot 和 SHA-256 digest。
2. 相同内容可共享 digest 但保留不同 provenance；同 Artifact ID 不得换 digest。
3. Run complete 不自动产生 Artifact；显式 record command 校验文件/reference。
4. Artifact 变化使旧 candidate 标为 Superseded，但 M3 Evidence 规则尚不实现。
5. Commit `feat(kernel): record immutable source snapshots and artifacts`。

### Task 9：CLI/Workbench 与场景
**Files:** Modify CLI/workbench; create `tests/scenarios/m2*.test.ts`, `scripts/demo-m2.ps1`。
1. 增加 work-item list/show/claim、run list/show、artifact show、scheduler tick。
2. Workbench 展示 task DAG、ready/blocker、run detail 技术入口。
3. 场景：Planned→Work Item→Run→Snapshot→Artifact；capability missing；lease crash/reclaim；retry new Run。
4. 全部 JSON 输出过 Schema，技术日志仅通过安全 local reference 访问。
5. Commit `feat: expose and verify the M2 execution slice`。

### Task 10：M2 冻结
**Files:** Create `docs/implementation/2026-09-20-cimiloop-m2实施架构-v0.1.md`; update README。
1. 运行 schema drift、Node 24 全测、demo、diff check。
2. 验证 Runtime 只能在授权 worktree/capability 内执行。
3. 验证 Artifact 可追溯到 Snapshot/Run/Context/Binding。
4. Commit `docs: freeze M2 execution architecture`。

## 3. Exit Gate

- Kernel 自动为 ready task 创建 Work Item；
- Runtime 无法越过 worktree/能力/权限边界；
- retry 新建 Run，授权变化新建 Work Item；
- Artifact provenance 完整且 digest 不可变；
- 重启、lease 过期、进程结果未知不会重复副作用；
- M0/M1 回归全部通过。
