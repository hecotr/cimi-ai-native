# CimiLoop M5 Product Closure、Portability 与 Release Hardening Implementation Plan

> **For development Agent:** REQUIRED SUB-SKILL: Use `executing-plans` after M4 gate passes.

**Goal:** 完成 Workbench/Change Room、关闭与知识闭环、Portable Export/Import、故障注入、安全审计和 V1 发布验收。

**Architecture:** M5 不改变前四阶段权威关系，只补齐产品投影、终态语义和可移植性。Export 从一致性 snapshot 生成签名外的 digest manifest；Import 先 staging/校验/报告，再原子激活，且默认不激活 Runtime ownership。

**Tech Stack:** M4 stack、Node local HTTP Workbench、SQLite backup/read transaction、JSON manifest、SHA-256、PowerShell acceptance scripts。

---

## 1. Objects and invariants

新增：`LearningCandidate`、`KnowledgeUpdateEvidence`、`ClosureEvaluation`、`ExportManifest`、`ImportReport`、`PortableObjectEntry`、`AttentionItem`、`ArchiveRecord`、`CancellationRecord`、`SupersessionRecord`。

不变量：Close/Archive/Cancel/Supersede 是向前事实，不删除历史；Mandatory Knowledge Task 未完成不能 close；Export 保留原 ID/version/digest/event；Import 拒绝分叉历史；导入项目默认 dormant；Read Model 可完全重建。

## 2. Tasks

### Task 1：M5 Protocol
**Files:** Create `packages/protocol/src/m5/{domain,commands,results,portable}.ts`; modify exports/tests/artifacts。
1. 红灯覆盖 closure disposition、manifest version/digest、duplicate IDs、runtime ownership。
2. Commands：RecordKnowledgeUpdate/ProposeClose/CloseChange/CancelChange/SupersedeChange/ArchiveChange/CreateLearningCandidate/ExportProject/StageImport/CommitImport。
3. Export/Import schema 独立 version；entries 按 object type/schema version 保留。
4. Commit `feat(protocol): define M5 closure and portability contracts`。

### Task 2：Store、Migration v6 与一致性 Snapshot
**Files:** Modify Store/migrations/contracts; create m5 migration/backup tests。
1. 新建 learning/knowledge/closure/terminal records/import staging/read-model checkpoint。
2. Export 在 SQLite read transaction/backup snapshot 上读取，避免混合 revision。
3. Local object files按 digest 枚举；缺失对象使 export fail，不生成残缺成功包。
4. M0–M4 无损升级和重复打开幂等。
5. Commit `feat(store): persist M5 closure and portable state`。

### Task 3：Knowledge Closure
**Files:** Create `packages/kernel/src/closure/{knowledge,gate}.ts`, tests。
1. 每个 mandatory Knowledge Task 必须对应版本化 External Reference + Evidence，或有效 Exception。
2. Create/Update/Deprecate/Verify/NoImpact 各有确定完成规则。
3. stale/unavailable reference 不自动视为完成；需要 verify/blocker/decision。
4. Closure Gate 输出可解释缺口清单。
5. Commit `feat(kernel): enforce knowledge closure obligations`。

### Task 4：Close、Cancel、Supersede、Archive
**Files:** Create `packages/kernel/src/closure/{terminal-actions,learning}.ts`, tests。
1. Close 需要 ReleaseVerified 或 Profile 合法终点、closure gate ALLOW、残余风险/known issues 分类。
2. Cancel 保留未交付结论、外部副作用核对、cleanup/后续责任。
3. Supersede 精确引用替代 Change；不能删除原 Change。
4. Archive 只改变可见性/活跃性，不改写 lifecycle history。
5. Learning Candidate 来自 failure/exception/decision/recovery，未经批准不晋升 Project Knowledge。
6. Commit `feat(kernel): add auditable terminal change actions`。

### Task 5：Portable Export
**Files:** Create `packages/portability/src/{exporter,manifest,digest}.ts`, tests。
1. Export 包含 Protocol facts、Events、Outbox状态摘要、object manifests、schema metadata，不含 secret/cache/raw runtime transcript。
2. entry canonical digest + whole-manifest digest；顺序确定，重复导出相同事实得到相同内容 digest。
3. 同时支持 completed/in-progress project；记录 ownership state。
4. tampered/missing object 测试必须失败。
5. Commit `feat(portability): export deterministic project bundles`。

### Task 6：Staged Import 与分叉保护
**Files:** Create `packages/portability/src/{importer,validator,report}.ts`, tests。
1. 解包只进 staging；防 path traversal、symlink escape、zip bomb/size limits。
2. 校验 manifest/schema/digest/ID/reference/event sequence/revision/current-state consistency。
3. 空目标可 import；相同历史幂等；本地同 project ID 不同历史拒绝 `DIVERGENT_HISTORY`。
4. commit import 原子切换；失败不污染现有 project。
5. 导入 ownership 默认 dormant，需显式 activation command（V1 可只报告，不实现运行）。
6. Commit `feat(portability): validate and stage safe project imports`。

### Task 7：完整 Workbench 与 Change Room
**Files:** Modify `apps/workbench/src/**`; create UI integration/accessibility tests。
1. Project Workbench：Attention Queue、Decision Inbox、Change list、Active Runs、Environment/Release overview。
2. Change Room：Current Focus、六阶段导航、Contract、Plan/Task、Run、Evidence、Delivery、Activity。
3. 双层 timeline：默认 lifecycle，Run detail 再显示技术日志引用。
4. 所有 mutation 走 Kernel Command；stale revision 可恢复提示；无聊天/自由写 Store。
5. 键盘/语义 HTML/基本可访问性和 XSS tests。
6. Commit `feat(workbench): complete the V1 operator experience`。

### Task 8：Read Model 重建与 Attention
**Files:** Create `packages/kernel/src/read-model/{builder,attention}.ts`, tests; modify Store。
1. 删除全部 read model 后从 facts/events 重建，结果与重建前等价。
2. Attention 来自 blocker/failure/stale evidence/decision/unknown deployment/knowledge gap。
3. notification delivered/read 不等于 Decision。
4. checkpoint 可优化但不能影响权威结果。
5. Commit `feat: rebuild V1 workbench projections from facts`。

### Task 9：故障注入、安全与审计
**Files:** Create `tests/faults/**`, `tests/security/**`, `scripts/audit-v1.ps1`。
1. 注入 SQLite commit、process crash、outbox lease、runtime loss、deploy unknown、object corruption、import interruption。
2. 扫描错误/JSON/Event/Export/日志，断言无 token、secret、SQL、stack、敏感绝对路径。
3. 测 path traversal、command injection、HTML injection、malformed schemas、oversized import。
4. 验证所有 authority-changing actions 有 actor/acting role/policy snapshot/command/event。
5. Commit `test: harden V1 fault security and audit paths`。

### Task 10：北极星与全部异常验收
**Files:** Create `tests/acceptance/v1*.test.ts`, `scripts/demo-v1.ps1`, acceptance fixtures。
1. 自动化 Feature 全闭环和 M1–M5 每个 demo。
2. 自动化 evaluator fail、digest change、stale decision、unknown deploy、prod recovery、restart、policy revoke、export/import、knowledge closure。
3. 每场景输出 facts/IDs/digests/gate reasons，不只断言 exit code。
4. 使用真实 Git worktree、Runtime fake/contract adapter及 M4 real acceptance environment；不得用纯内存替代外部副作用场景。
5. Commit `test: certify the V1 north-star and failure scenarios`。

### Task 11：文档、示例与发布加固
**Files:** Create M5 implementation doc、operator guide、adapter guide、example project、release checklist；modify README/docs index。
1. 文档列出安装、Node/pnpm baseline、init、Workbench、完整 lifecycle、recovery、backup/export/import。
2. 所有“已支持”声明链接到测试或 demo；未实现能力明确列出。
3. 清理临时 TODO、debug endpoints、fixtures 泄漏；检查 package exports/dependency boundaries。
4. Commit `docs: prepare CimiLoop V1 release candidate`。

### Task 12：V1 Freeze
**Files:** Modify version/changelog as repository policy permits。
1. `pnpm schema:export` + zero diff；Node 24 全量 test；五个 demo；audit；diff check。
2. 从干净 clone 执行 install/build/test/demo-v1。
3. Export 后在隔离目录 Import，再查询完整 timeline/digests。
4. 输出 V1 acceptance report 与所有测试数量。
5. Commit `chore: freeze CimiLoop V1 release candidate`。

## 3. Exit Gate

- 北极星和全部异常场景通过；
- Workbench 可解释状态、失败、决定、证据、知识义务和下一动作；
- Export/Import 保留 ID/version/digest/event 且拒绝分叉；
- 重启/outbox/reconcile 不重复副作用；
- secret/path/command/import 安全测试通过；
- UI/文档不声称未实现能力；
- M0–M4 全回归通过。
