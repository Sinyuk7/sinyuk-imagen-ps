# app 状态

- 状态：`shared/commands` 层已落地首版三命令，作为 UI ↔ runtime 的唯一合规通路
- 更新时间：2026-04-28

## 当前已确认存在

- `package.json`
- `AGENTS.md`
- `README.md`
- `SPEC.md`
- `STATUS.md`
- `vitest.config.ts`
- `src/index.tsx`
- `src/ui/app-shell.tsx`
- `src/host/create-plugin-host-shell.ts`
- `src/shared/plugin-app-model.ts`
- `src/shared/runtime.ts` — Runtime 单例管理
- `src/shared/commands/` — UI ↔ runtime 命令层
  - `index.ts` — barrel 导出
  - `types.ts` — 公开类型（`CommandResult<T>`, `SubmitJobInput`, `JobEventHandler`）
  - `submit-job.ts` — `submitJob` 命令
  - `get-job.ts` — `getJob` 命令
  - `subscribe-job-events.ts` — `subscribeJobEvents` 命令
- `tests/commands.test.ts` — 命令层单元测试

## shared/commands 公开 API

| 命令 | 签名 | 用途 |
|------|------|------|
| `submitJob` | `(input: SubmitJobInput) → Promise<CommandResult<Job>>` | 提交 workflow 执行 |
| `getJob` | `(jobId: string) → Job \| undefined` | 查询 job 快照 |
| `subscribeJobEvents` | `(handler: JobEventHandler) → Unsubscribe` | 订阅 lifecycle 事件 |

## 边界约束

- UI 层只能通过 `shared/commands` 与 runtime 交互
- 禁止 UI 层直接 import `runtime` / `getRuntime` / `store` / `dispatcher`
- v1 workflow 限制：`'provider-generate' | 'provider-edit'`

## 当前已知偏差

- 旧文档和旧记忆仍可能保留 `ps-uxp` 或多应用口径
- `host/` 与 adapter 边界仍未完全稳定

## 当前仍未稳定

- host / adapter 的最终边界
- 何时进入真正的 UI / writeback 实现阶段

## 测试状态

- `tests/commands.test.ts` 包含 8 个测试用例，覆盖 happy path、error path、事件订阅
- 使用 vitest 作为测试框架
