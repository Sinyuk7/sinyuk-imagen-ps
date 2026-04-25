## Why

`packages/core-engine` 已固化类型契约（`define-core-shared-types` ✓）与错误模型（`define-error-taxonomy` ✓）。PRD 的核心约束要求：所有跨包结果必须 serializable，workflow step handoff 必须视为 immutable。然而当前缺乏运行时校验机制——store 接收 `JobInput`、runner 传递 step output、dispatch 返回结果时，都无法在边界处验证数据是否满足这些约束。必须在实现 `store.ts` 和 `runner.ts` 之前提供边界守卫，否则违反约束的数据将在运行时被静默传递，导致下游难以调试的故障。

## What Changes

- 新增 `packages/core-engine/src/invariants.ts`，提供跨包边界校验辅助函数：
  - `assertSerializable(value)` —— 校验值是否为 serializable plain object / primitive / array
  - `assertImmutable(value)` —— 浅层冻结检查（或执行 `Object.freeze`）
  - `safeStringify(value)` —— 安全的 JSON 序列化辅助（非校验用途，仅用于日志/调试）
- 所有校验失败时抛出 `JobError`（`validation` category），而非 silent fallback 或返回 boolean
- 校验函数保持 host-agnostic，不引用 DOM / UXP / FileSystem 类型
- 更新 `packages/core-engine/src/index.ts`，导出所有守卫函数

## Capabilities

### New Capabilities
- `invariant-guards`: 提供 serializable / immutable 边界校验与不可变保护辅助函数，为跨包通信和 step handoff 提供运行时保护。

### Modified Capabilities
- （无 —— 本 change 仅新增边界守卫，不修改现有 spec 级行为。）

## Impact

- `packages/core-engine/src/invariants.ts`（新增）
- `packages/core-engine/src/index.ts`（导出更新）
- 下游 `implement-state-infrastructure`（store 输入校验）、`implement-runner-and-runtime`（step output handoff 校验）可直接消费

## Non-goals

- 深度递归校验完整图结构（当前仅保证单层/浅层约束，深度递归待需求明确后扩展）
- Store、runner、dispatch 的具体实现
- 性能优化到极致的校验（当前以实现正确性优先）
- 自定义校验规则注册机制
