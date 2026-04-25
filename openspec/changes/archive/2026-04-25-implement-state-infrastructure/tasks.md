## 1. Store 实现

- [x] 1.1 创建 `src/store.ts`：实现 `createJobStore()`，返回 `{ store: JobStore, controller: JobStoreController }`
- [x] 1.2 实现 `store.submitJob(input)`：校验 `assertSerializable`、生成 id（优先 `crypto.randomUUID()`，fallback 为 timestamp + counter + random suffix）、创建 `status: 'created'` 的 job，返回 immutable snapshot
- [x] 1.3 实现 `store.getJob(id)`：按 id 查询内部 `Map`，不存在返回 `undefined`，存在则经 `toSnapshot` 返回 immutable snapshot
- [x] 1.4 实现 `store.retryJob(id)`：仅接受 `status === 'failed'` 的 job，复制 `input`，设置 `originJobId` 与 `retryAttempt`，创建新 job 并返回 snapshot；非法状态或不存在时抛出 `JobError`（`category: 'validation'`）
- [x] 1.5 实现 `controller.markRunning(id)`：校验 `created → running` 合法，更新 `status` 与 `updatedAt`，返回 snapshot
- [x] 1.6 实现 `controller.markCompleted(id, output)`：校验 `running → completed` 合法，设置 `output` 与 `updatedAt`，返回 snapshot
- [x] 1.7 实现 `controller.markFailed(id, error)`：校验 `running → failed` 合法，设置 `error` 与 `updatedAt`，返回 snapshot
- [x] 1.8 实现内部 transition table 与 `assertTransition(from, to)`：terminal state（`completed`、`failed`）不可再迁移，非法迁移抛出 `JobError`（`category: 'runtime'`）
- [x] 1.9 实现 `toSnapshot(internalRecord)`：浅 clone 内部 record 并 `assertImmutable`，确保对外返回值与内部 mutable record 隔离

## 2. Event Bus 实现

- [x] 2.1 创建 `src/events.ts`：实现 `createJobEventBus()`
- [x] 2.2 定义 `JobEventType` string literal union（`'created' | 'running' | 'completed' | 'failed'`）
- [x] 2.3 定义 discriminated union `JobEvent`（含 `type` 与 `job` 字段）
- [x] 2.4 实现 `on(type, handler, filter?)`：注册事件处理器，支持按 `jobId` 过滤，返回 `unsubscribe` 函数
- [x] 2.5 实现 `onAny(handler)`：注册接收所有 `JobEvent` 的处理器，返回 `unsubscribe` 函数
- [x] 2.6 实现内部 `emit(event)`：同步按注册顺序调用所有匹配处理器，每个处理器单独 try/catch，异常不污染 engine 主流程、不跳过后续处理器
- [x] 2.7 实现 `off(type, handler)`：精确移除处理器，保留为低阶 API

## 3. 入口与导出

- [x] 3.1 更新 `src/index.ts`：追加 `export * from './store.js'` 与 `export * from './events.js'`
- [x] 3.2 移除 `src/index.ts` 中的 `__PLACEHOLDER__CORE_ENGINE_VERSION` 与 `__PLACEHOLDER__`
- [x] 3.3 运行 `pnpm --filter @imagen-ps/core-engine build` 验证编译通过
- [x] 3.4 运行 `pnpm --filter @imagen-ps/core-engine test` 验证现有测试未破坏（如有）
