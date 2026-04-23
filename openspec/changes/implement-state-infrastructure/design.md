## Context

`core-engine` 已完成类型契约（`Job`、`JobStore`、`JobStatus`）、错误模型（`JobError`）与边界守卫（`assertSerializable`、`assertImmutable`）。runner 与 runtime 需要两样东西才能启动：
1. **状态真相（store）**：保存 job 的当前状态，支持查询与重试。
2. **观察机制（event bus）**：让 host 层订阅 lifecycle 变化，而不直接访问 store。

本 change 在已有类型之上实现这两个模块，保持 host-agnostic、serializable、immutable 的约束。

## Goals / Non-Goals

**Goals:**
- 实现 `src/store.ts`：最小 in-memory `JobStore` + `JobStoreController`，覆盖创建、查询、重试、状态推进；状态机严格为 `created → running → completed / failed`。
- 实现 `src/events.ts`：lifecycle event bus，支持订阅、按 jobId 过滤、通用订阅，事件 payload 使用 discriminated union `JobEvent`。
- `src/index.ts` 更新导出，移除 bootstrap placeholder。
- 所有状态转换显式、可校验，失败落到 `JobError`。

**Non-Goals:**
- 持久化、磁盘、网络、队列、调度、cancel、abandon。
- `zustand` 的具体绑定（保留为候选，暂不引入）。
- event bus 的跨窗口 / 跨线程广播。
- store 的并发控制（当前为单线程 host 场景，不做锁）。

## Decisions

1. **Store 读写权限拆分：`JobStore` + `JobStoreController`**
   - `JobStore`：对外暴露 `submitJob`、`getJob`、`retryJob`，供 runtime / host 读取与创建。
   - `JobStoreController`：暴露 `markRunning`、`markCompleted`、`markFailed`，仅由 runner / runtime 内部装配使用。
   - `createJobStore()` 返回 `{ store, controller }`。
   - Rationale：防止 host 直接篡改状态真相，同时给 runner 提供合法写通道，避免“私有但又要跨模块调用”的尴尬。

2. **Store 实现：纯函数 + 内部 `Map`，不引入 zustand**
   - `Map<string, InternalJobRecord>` 保存 mutable internal record。
   - 所有对外返回值统一经 `toSnapshot(record)`：浅 clone + `assertImmutable`，返回 `Readonly<Job>`。
   - Rationale：`JobStore` 接口已定义，当前只需要最小 in-memory 实现。zustand 的 reactivity 对 engine 内部并非必需，event bus 已提供观察通道。
   - Alternative considered：使用 zustand 的 `createStore` —— 过早引入订阅机制，且会多一个内部状态同步层。

3. **状态转换：显式 transition table**
   - ```ts
     const ALLOWED: Record<JobStatus, JobStatus[]> = {
       created: ['running'],
       running: ['completed', 'failed'],
       completed: [],
       failed: [],
     }
     ```
   - 统一经 `assertTransition(from, to)` 校验，非法迁移抛出 `JobError`（`category: 'runtime'`）。
   - Rationale：防止 runner 把状态机逻辑散落在多个函数里；later 加 `cancelled` / `abandoned` 时扩展成本低。

4. **id 生成策略：优先 `crypto.randomUUID()`，fallback 到 timestamp + counter + random suffix**
   - Rationale：现代 JS 运行时普遍支持 `crypto.randomUUID()`，比自己拼“uuid-like”更清晰。本模块为 host-agnostic runtime，优先原生能力，减少兼容歧义。
   - 明确约束：id 目标是唯一性，不承诺排序，不承诺分布式全局严格无碰撞。

5. **`retryJob` 语义：复制 `input`，生成新 `id`，记录 lineage**
   - 新 job 的 `originJobId` 指向原 failed job 的 `id`。
   - 新 job 的 `retryAttempt` 为原 job `retryAttempt + 1`（原 job 无则为 `1`）。
   - 仅对 `status === 'failed'` 的 job 生效，否则抛出 `JobError`（`category: 'validation'`）。
   - Rationale：重试视为新执行单元，保留失败历史以便调试；lineage 让 host/debug 面板可追溯来源。

6. **Event bus：轻量 typed pub/sub，事件 payload 为 `JobEvent` discriminated union**
   - ```ts
     type JobEvent =
       | { type: 'created'; job: Job }
       | { type: 'running'; job: Job }
       | { type: 'completed'; job: Job }
       | { type: 'failed'; job: Job }
     ```
   - `on(type, handler, filter?)` 返回 `unsubscribe` 函数；`onAny(handler)` 同样返回 `unsubscribe`。
   - `off` 保留为低阶 API，但公共推荐用法为返回的 `unsubscribe`。
   - `emit(event)` 同步按注册顺序调用，但每个 listener 单独 try/catch，异常不污染 engine 主流程。
   - Rationale：`JobEvent` envelope 让 `onAny` 能区分事件类型；返回 `unsubscribe` 避免 handler identity + filter wrapper 导致的卸载不可靠问题；同步调用保持事件顺序，但异常隔离保证 event bus 不会成为故障注入点。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| store 为 process-local in-memory state，runtime 重启后 job state 与 lookup 不保留 | `JobStore` 仅提供 runtime-lifetime state，不提供 durable history / recovery；如需持久化，另起 change 引入 storage adapter |
| retryJob 不复制执行上下文 | lineage（`originJobId`、`retryAttempt`）由 engine 内部维护；不依赖 host 或 input 注入 |
| event bus 为同步通知机制，不提供背压或异步调度能力 | listener 同步执行且应保持轻量；listener 异常不会影响 engine 主流程；如需异步或跨线程分发，另起 change 引入 adapter |
| `JobStoreController` 理论上可能被误用 | controller 不对外导出，仅在 runtime 内部持有；host 仅访问只读 `JobStore` |
