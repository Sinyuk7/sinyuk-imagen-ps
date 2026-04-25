## Why

`core-engine` 的类型契约、错误模型与边界守卫均已就位，但 runner 与 runtime 仍缺乏状态真相（state of truth）与外部观察机制。没有 job store，workflow 执行无法被追踪、重试或查询；没有 event bus，host 层无法响应 lifecycle 变化。本 change 建立这两项基础设施，使后续 runner 与 runtime 有稳定的状态底座。

## What Changes

- 新增 `src/store.ts`：实现最小 in-memory `JobStore` + `JobStoreController`。
  - `JobStore` 对外暴露 `submitJob`、`getJob`、`retryJob`。
  - `JobStoreController` 仅由 runner/runtime 内部使用，暴露 `markRunning`、`markCompleted`、`markFailed`。
  - 状态机严格为 `created → running → completed / failed`，terminal state 不可再迁移。
  - `retryJob` 复制 `input` 生成新 job，记录 `originJobId` 与 `retryAttempt`。
  - 所有对外返回值为 immutable snapshot，与内部 mutable record 隔离。
- 新增 `src/events.ts`：实现 `createJobEventBus()`，暴露 typed pub/sub。
  - 事件 payload 使用 discriminated union `JobEvent`（含 `type` 与 `job`）。
  - `on` / `onAny` 返回 `unsubscribe` 函数；支持按 `jobId` 过滤。
  - `emit` 同步调用，但每个 listener 异常隔离，不污染 engine 主流程。
- 更新 `src/index.ts`：追加 `store.ts` 与 `events.ts` 的 re-export，移除 bootstrap placeholder。

## Capabilities

### New Capabilities
- `job-store`: 内存级 job 状态管理，包括状态转换、id 生成、失败重试入口、读写权限拆分。
- `lifecycle-events`: job 生命周期事件总线，支持订阅与取消订阅，事件 payload 为 `JobEvent` discriminated union。

### Modified Capabilities
<!-- 本次 change 不涉及已有 spec 的 REQUIREMENTS 变更 -->

## Impact

- `packages/core-engine/src/store.ts`（新增）
- `packages/core-engine/src/events.ts`（新增）
- `packages/core-engine/src/index.ts`（更新导出）
- 不引入外部依赖（`zustand` 保留为候选，暂不绑定）
- 不影响 `providers`、`workflows`、`app` 模块
