## Why

`provider-model-discovery-foundation` 已在 `Provider` 接口上定义了 `discoverModels?(config)` OPTIONAL 方法，`shared-commands` 的 `refreshProfileModels` 也已完整实现调用链路，但 `openai-compatible` provider 尚未实现该方法。当前 `profile save → refresh-models → set-default-model → job submit` 端到端链路在真实 provider 上无法走通——`refresh-models` 会返回 "does not support model discovery" 错误。本次变更在不动 contract、不动 shared-commands、不动 CLI 的前提下，仅补齐 `openai-compatible` provider 的 `discoverModels()` 实现，打通真实 provider 端到端链路。

## What Changes

- **新增** `packages/providers/src/transport/openai-compatible/models.ts`：定义 `OpenAIModelObject` / `OpenAIModelsResponse` 类型（OpenAI wire format 专用，内部使用），实现 `parseModelsResponse()` 解析与多关键词过滤逻辑（`dall-e-*`、`*image*`、`gpt-image-*`），实现 `formatDisplayName()` 格式化。
- **修改** `packages/providers/src/providers/openai-compatible/provider.ts`：实现 `discoverModels(config)` 方法，通过 `httpRequest()` 调用 `GET {baseURL}/v1/models`，调用 `parseModelsResponse()` 解析响应。
- **新增** 单元测试：`parseModelsResponse()` 的各种输入场景（成功、空数据、无效响应、过滤逻辑，含中转站模型如 `gpt-image-1`、`grok-2-image`、`qwen-image-max`）。
- **扩展** 已有 provider 单元测试：`discoverModels()` 的 mock HTTP 场景（成功、401、timeout、空结果）。
- **扩展** shared-commands 集成测试：`refreshProfileModels()` + openai-compatible 的 mock `discoverModels` 场景。
- **更新** `openspec/specs/openai-compatible-provider/spec.md`：新增 `discoverModels` requirement 与 scenarios。

## Capabilities

### New Capabilities

（无新增 capability。本次变更全部落在已有 capability 的 spec delta 上。）

### Modified Capabilities

- `openai-compatible-provider`：新增 `discoverModels` requirement，定义 `/v1/models` 调用、响应解析、模型过滤、displayName 格式化、错误映射等行为契约。

## Impact

- **代码**
  - `packages/providers/src/transport/openai-compatible/models.ts`（新建）：OpenAI wire format 类型定义 + 解析/过滤/格式化逻辑。
  - `packages/providers/src/providers/openai-compatible/provider.ts`（修改）：新增 `discoverModels()` 方法。
- **测试**
  - `packages/providers/tests/openai-compatible-models.test.ts`（新建）：`parseModelsResponse()` 单元测试。
  - `packages/providers/tests/openai-compatible-provider.test.ts`（扩展）：`discoverModels()` mock HTTP 测试。
  - `packages/shared-commands/tests/profile-models.test.ts`（扩展）：openai-compatible + `refreshProfileModels` 集成测试。
- **公共契约**
  - `Provider` 接口不变（`discoverModels` 已是 OPTIONAL）。
  - `ProviderDescriptor.capabilities` 不变（不新增 capability 字段）。
  - `shared-commands` 的 `refreshProfileModels` 不变。
  - CLI 层不变。
- **不影响的范围**
  - `model-selection` 三级优先级、`builtin-workflow-contract`、`runtime-assembly` dispatch path。
  - `provider-contract`、`provider-profile-discovery`、`mock-provider` 等已有 spec。
  - UXP/UI surface、CLI 命令注册。

## Non-goals

- 不做 UXP/UI 集成。
- 不做 model discovery 缓存策略（TTL、后台刷新）。
- 不做跨 provider model 统一。
- 不做 `provider-edit` workflow 的 providerOptions 绑定。
- 不做真实 API 自动化 CI 测试（需外网，仅手动 smoke）。
- 不在 `ProviderCapabilities` 中新增 `modelDiscovery` 字段——当前通过 `discoverModels` 方法是否存在即可判断能力，无需额外 capability flag。
