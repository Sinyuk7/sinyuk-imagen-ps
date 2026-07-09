## Why

图片生成通常需要 10-120 秒。当前 submit 路径更接近单 in-flight 工作流：用户在等待一个任务时，很难继续稳定地构建和发送新的图片任务，尤其是在多张图片并行编辑、或同一图片不同局部连续发起请求时。

本次变更要把“等待生成”与“继续编辑/继续提交”解耦，但不把问题扩大成完整的 durable background job system。先提供 session 内 FIFO 队列与有上限的并发执行，让用户能持续工作，同时保持 provider 扣费、Photoshop writeback、任务历史语义都清晰可控。

## What Changes

- 引入 session-only 的 task queue：submit 不再直接裸跑，而是先冻结任务快照并进入队列。
- 引入 FIFO 调度器：按提交顺序启动任务，不支持拖拽改优先级。
- 引入 bounded concurrency：
  - 全局最多同时运行 5 个任务。
  - 同一 profile 默认最多同时运行 2 个任务。
- 明确 queued task 可以在真正 dispatch 之前从队列移出。
- 明确 queued task 不做 durable 持久化；app reload / restart 后直接丢弃。
- 保持 running task 不承诺产品级 cancel：
  - 当前只保留底层 `AbortSignal` seam。
  - 不提供 fake cancel，不把用户看到的中断误写成可靠取消成功。
- 保持结果消费模式不变：任务完成后仍由用户手动决定 place / download；未处理结果不额外建模，不引入“待应用”状态。
- 将 queued 可见范围限定在 active session surface；durable history 仍只基于已 started 的 `TaskRecord`。
- 调整 app surface：解除全局 `conversation.running` 式的编辑/提交门禁，让用户在已有 queued / running task 时继续准备和提交新任务。

## Capabilities

### New Capabilities
- `session-task-queue`: 为图片生成与编辑请求提供 session 级 FIFO 队列、bounded concurrency 调度、queued task 移出队列、以及提交快照冻结语义。

### Modified Capabilities
None.

## Impact

- 主要影响 `packages/application` 的 session orchestration、submit 入口与 runtime 调度边界。
- 主要影响 `apps/app` 的 conversation / main page 交互模型与任务列表呈现。
- `HistoryPage` / durable history 只需维持“不显示 queued-only entry”的边界，不扩成 queue owner。
- 不要求本次修改 `packages/providers` contract；provider 仍只负责 invoke / retry / failover。
- 不要求本次把 queued task 写入 durable `TaskRecord`，也不要求新增 running-task cancel contract。
- 需要补充 application 与 app-surface 的 targeted tests，重点覆盖 FIFO、并发上限、queued remove、snapshot freeze、以及 UI 去全局锁后的行为。
