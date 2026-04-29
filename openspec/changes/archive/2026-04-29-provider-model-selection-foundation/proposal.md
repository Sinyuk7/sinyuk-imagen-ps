## Why

当前 Provider Profile 基础已落地（profile 持久化、secret 引用、profile-targeted dispatch），但 model selection 语义尚未定义：mock provider 的 `invoke` 不读取 `providerOptions.model`，也不使用 `config.defaultModel` 做 fallback；`provider-generate` workflow 不支持绑定 `providerOptions.model`；因此无法验证"不同 profile 指向不同 default model"或"job input 覆盖 model"这一端到端链路。

本 change 的目标是：稳定 model selection 三级优先级语义，增强 mock provider 实现 model 回显，并通过自动化测试在 CLI 端完成无外部依赖的闭环验证。

## What Changes

- 定义 model selection 三级优先级规则：`job input explicit model > provider profile defaultModel > provider implementation fallback default`。
- 增强 `provider-generate` workflow step input，支持绑定 `providerOptions.model`。
- 增强 mock provider `invoke`：读取 `request.providerOptions.model`，fallback 到 `config.defaultModel`，再 fallback 到 mock 默认 model `mock-image-v1`；在 result `raw` 中回显 selected model。
- 增强 profile-aware dispatch adapter，将 profile 的 `defaultModel` 合并到 request `providerOptions` 中（低于 job input explicit model）。
- 新增自动化测试覆盖 model selection 完整矩阵。

## Non-goals

- 不涉及 UXP/UI 层。
- 不修改 `provider-edit` workflow 的 step input 绑定（`providerOptions` 绑定仅限 `provider-generate`，`provider-edit` 留给后续 change）。
- 不增加 CLI 新命令（`imagen provider profile models` 等留给后续 `cli-provider-profile-ops` change）。
- 不实现 `openai-compatible` provider 的真实 HTTP model 选择（留给后续 `openai-compatible-cli-smoke` change）。
- 不做旧 config migration。

## Capabilities

### New Capabilities

- `model-selection`: model selection 三级优先级语义定义，以及 profile-aware dispatch 中 defaultModel 到 providerOptions 的自动注入逻辑。

### Modified Capabilities

- `mock-provider`: 增强 mock provider invoke，读取 `providerOptions.model` 并在 result raw 中回显 selected model。
- `builtin-workflow-contract`: `provider-generate` workflow step input 支持绑定 `providerOptions`（含 model）。

## Impact

- `packages/providers`：mock provider `invoke` 实现变更，result `raw` 形态扩展。
- `packages/workflows`：`provider-generate` workflow step input 扩展 `providerOptions` 绑定。
- `packages/shared-commands`：profile-aware dispatch adapter 逻辑扩展，注入 profile defaultModel。
- `packages/shared-commands` tests：新增 model selection 矩阵测试。
- `packages/core-engine`：无变更。
- `apps/cli`、`apps/app`：无直接变更。
