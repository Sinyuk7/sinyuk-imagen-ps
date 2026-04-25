## Why

`packages/workflows` 已经导出 `provider-generate` 与 `provider-edit` 两个最小 builtin workflows，但当前 job input / output 契约仍停留在实现级示例，缺少可被 `shared commands`、CLI 和后续集成测试稳定复用的明确基线。现在先收敛这层 contract，可以在不扩大 `core-engine` 或 `providers` 责任边界的前提下，降低后续接入时的推断成本和返工风险。

## What Changes

- 为 builtin provider workflows 建立稳定的 request contract，明确 `provider-generate` 与 `provider-edit` 的最小输入字段、必要字段和输出 key
- 明确 builtin workflow 中哪些字段属于当前稳定范围，哪些字段继续保持 tentative 或留给后续 change 收敛
- 补充面向 contract 的 workflow 测试，覆盖导出 shape、一致性约束、最小 runtime 装配，以及一条使用 mock provider 的最小 bridge 兼容路径
- 保持 `workflows` 为 pure data package，不把 provider schema、host IO 或 runner 执行逻辑拉入本 change

## Non-goals

- 不修改 `packages/core-engine` 的 runner 执行语义
- 不修改 `packages/providers` 的 canonical request schema 或 provider capability model
- 不引入 DAG、branch / loop、visual editor、host writeback 或 surface-specific 参数格式
- 不扩展到 `web`、多 host 或 Photoshop UI 范围

## Capabilities

### New Capabilities
- `builtin-workflow-contract`: 定义并验证 builtin provider workflows 的稳定输入输出契约，包括最小字段集、输出 key 和兼容性基线

### Modified Capabilities
- （无。当前 change 主要补齐 `workflows` 层缺失的稳定 contract，不调整现有公开 spec 的 requirement。）

## Impact

- `openspec/changes/stabilize-builtin-request-contract/specs/builtin-workflow-contract/spec.md`：新增 capability spec
- `packages/workflows/src/builtins/*`：可能收敛 request binding shape 与注释
- `packages/workflows/tests/*`：补充 contract 与跨包兼容验证
- 依赖关系保持不变：`workflows` 继续只依赖 `@imagen-ps/core-engine` 共享类型，不引入新的运行时依赖
