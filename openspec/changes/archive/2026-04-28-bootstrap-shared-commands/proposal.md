## Why

`app/docs/CODE_CONVENTIONS.md` 已显式禁止 UI 直接调用 `createRuntime` 与 `mockProvider.invoke`，要求通过 `shared/commands` 桥接——但桥接层本身尚不存在。当前 UI 处于"想调 runtime 但没有合规通路"的悬空状态。三个共享包的 OPEN_ITEMS 已全部收敛（resolved 或 deferred），契约层面已具备支撑上层调用的条件，是时候建立这条通路。

## What Changes

- 在 `app/src/shared/` 下新建 **runtime 单例**（`runtime.ts`）与 **commands 模块**（`commands/`），作为 UI ↔ runtime 的唯一合规调用通路
- 首版三个命令（B1 拍板）：
  - `submitJob(input)` — 提交 workflow 执行并等待结果
  - `getJob(jobId)` — 同步查询 job 当前快照
  - `subscribeJobEvents(handler)` — 订阅 lifecycle 事件流
- 引入 `CommandResult<T>` 薄包装类型（复用 `JobError`，不造新错误类型）
- 引入 `SubmitJobInput` 类型（`workflow` 字段用 union 约束 v1 builtin workflow 名称）

### Non-goals

- 不新建共享包（落点在 `app/src/shared/commands/`，A1 拍板）
- 不实现 `provider.list / describe`（二期，UI 出现 provider 选择器需求时再立项）
- 不实现 `provider.config.get / save`（依赖 storage adapter，单独 change）
- 不实现 `job.retry / cancel`（core-engine 当前不支持 retry/cancel 语义）
- 不引入 CLI surface（Phase 4 范围）
- 不做 UI 页面接线（由后续 change 消费 commands 实现）

## Capabilities

### New Capabilities

- `shared-commands`: UI ↔ runtime 的共享命令桥接层，含 runtime 单例管理、三个 v1 命令（submitJob / getJob / subscribeJobEvents）、CommandResult 包装类型、错误归一化

### Modified Capabilities

（无——本 change 不修改任何已有 spec 的 requirements）

## Impact

- **新增文件**：`app/src/shared/runtime.ts`、`app/src/shared/commands/{index,types,submit-job,get-job,subscribe-job-events}.ts`
- **依赖消费**：`@imagen-ps/core-engine`（Runtime / Job / JobInput / JobEvent / JobError / Unsubscribe）、`@imagen-ps/workflows`（builtinWorkflows）、`@imagen-ps/providers`（bridge adapter — 实现阶段确认具体接法）
- **架构影响**：确立 `ui → commands → runtime → packages/*` 单向依赖方向，UI 层不再有任何直接 runtime / provider 调用的合规路径
- **测试影响**：需要 `_resetForTesting()` 机制避免 runtime 单例污染测试
