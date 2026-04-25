## Why

`core-engine` 的约束要求“所有失败必须落到 `JobError` taxonomy，禁止 silent fallback”。当前类型层已定义了 `Job`、`Workflow`、`ProviderRef` 等契约，但尚未建立统一的错误模型。`Job.error` 字段目前为 `unknown`，store 的状态转换、runner 的执行路径、provider dispatch 的边界失败都缺乏可序列化、可分类的错误结构。必须在实现 `store.ts` 和 `runner.ts` 之前固化错误契约，否则各部件将各自发明错误表示，导致运行时行为不一致。

## What Changes

- 新增 `packages/core-engine/src/errors.ts`，定义 `JobError` 统一错误接口与分类枚举。
- 提供创建各类错误的辅助工厂函数（如 `createValidationError`、`createProviderError`、`createRuntimeError` 等），确保错误构造一致。
- 所有错误保持 serializable（无函数、无 DOM/UXP 类型），支持 `message`、`code`、`details` 等可消费字段。
- 更新 `packages/core-engine/src/index.ts`，导出所有公共错误类型与辅助函数。
- 保持与现有 `Job.error: unknown` 的向后兼容 —— 错误模型为运行时填充提供结构化值，不强制立即替换字段类型。

## Capabilities

### New Capabilities
- `error-taxonomy`: 定义 `JobError` 接口、`ErrorCategory` 分类枚举及创建辅助函数，为 store、runner、dispatch 提供统一可序列化错误契约。

### Modified Capabilities
- （无 —— 本 change 仅新增错误模型，不修改现有 spec 级行为。）

## Impact

- `packages/core-engine/src/errors.ts`（新增）
- `packages/core-engine/src/index.ts`（导出更新）
- 下游 `implement-state-infrastructure`、`implement-runner-and-runtime` 等 change 可直接消费此错误契约

## Non-goals

- 边界守卫（`invariants.ts`）的实现
- Store、runner、dispatch 的具体实现
- 错误恢复策略（retry、fallback、queue）
- 将 `Job.error` 字段类型从 `unknown` 收窄（留待后续 change 评估）
