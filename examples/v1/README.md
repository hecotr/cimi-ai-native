# CimiLoop V1 示例项目

本目录只放可复现北极星与恢复路径的固定输入。权威状态仍由 Kernel + SQLite 产生，不要把这些 JSON 当成已导入的 Project。

## 文件

| 文件 | 用途 | 覆盖 |
|---|---|---|
| `recovery-prod.json` | Production verify 失败后的 Recovery Strategy 草稿 | `scripts/demo-v1.ps1`、`packages/kernel/test/delivery-recovery.test.ts` |

Feature Contract / Plan 复用：

- `examples/m1/feature-contract.json`
- `examples/m1/feature-plan.json`
- `examples/m2/fake-runtime.mjs`
- `examples/acceptance-target/`（M4 真实验收 HTTP + 文件系统目标）

## 如何跑

```text
npx --yes --package node@24.15.0 --package pnpm@12.4.2 -c "pnpm test -- tests/acceptance"
powershell -NoProfile -File scripts/demo-v1.ps1
```

未实现：本目录不是可自动 import 的 Portable Bundle，也不激活 Runtime ownership。
