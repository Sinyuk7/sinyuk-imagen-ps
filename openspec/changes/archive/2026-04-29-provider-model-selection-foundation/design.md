## Context

上一轮 change `provider-storage-discovery-foundation` 建立了 Provider Profile 基础设施：profile 持久化、secret 引用、profile-targeted dispatch。当前 mock provider 的 `invoke` 产出的 `raw` 中没有 model 信息；`provider-generate` workflow step input 不支持 `providerOptions` 透传；profile-aware dispatch adapter 不会将 profile 的 `defaultModel` 注入到 request 中。

本 change 要在这些基础上补全 model selection 语义，使之可被自动化测试完整验证。

当前代码关键位置：

- `packages/providers/src/providers/mock/provider.ts`：mock provider invoke，不读取 `providerOptions.model`。
- `packages/workflows/src/builtins/provider-generate.ts`：workflow step input 未绑定 `providerOptions`。
- `packages/shared-commands/src/runtime.ts`：`createProfileAwareDispatchAdapter` 透传 params 到下游 adapter，不注入 `defaultModel`。
- `packages/providers/src/bridge/create-dispatch-adapter.ts`：`extractRequestAndSignal` 只提取 `request` 和 `signal`，其余 params 被当做 request 整体。

## Goals / Non-Goals

**Goals:**

1. 定义并实现 model selection 三级优先级：`job input explicit model > profile defaultModel > provider fallback default`。
2. 增强 mock provider invoke，读取 `providerOptions.model`，fallback chain 生效后在 `raw.model` 回显实际使用的 model。
3. 让 `provider-generate` workflow step input 能够绑定 `providerOptions`（包含 `model`）。
4. 让 profile-aware dispatch adapter 在 dispatch 时将 profile `config.defaultModel` 注入 request `providerOptions`，且不覆盖 job input 已提供的 explicit model。
5. 新增自动化测试覆盖 model selection 完整矩阵（多 profile default model、job input override、profile 更新后立即生效）。

**Non-Goals:**

- 不修改 `openai-compatible` provider 的 HTTP 请求 body 构造逻辑。
- 不增加 CLI 新命令。
- 不涉及 UXP/UI 层。
- 不做 model listing 或 model validation（未来 change 范围）。

## Decisions

### D1: Model selection 三级优先级在哪一层实现

**决策**：model fallback chain 分两层协作完成。

- **profile-aware dispatch adapter 层**（`packages/shared-commands/src/runtime.ts`）：将 profile `config.defaultModel` 注入 request `providerOptions.model`，但仅在 job input 没有显式提供 `providerOptions.model` 时注入。
- **provider invoke 层**（每个 provider 的 `invoke` 实现）：从 `request.providerOptions.model` 读取 model；若缺失，fallback 到 `config.defaultModel`；若仍缺失，使用 provider implementation 自身的硬编码 fallback default。

**理由**：profile-aware dispatch adapter 是唯一能同时看到 profile config 和 request params 的地方，适合做"profile defaultModel 注入"。provider invoke 本身也保留 `config.defaultModel` fallback，确保非 profile-targeted dispatch（如直接 mock dispatch adapter）也能正常工作。

**备选**：
- 全部在 provider invoke 层处理 → profile-aware dispatch adapter 不知道 profile defaultModel，无法在跨 adapter 边界之前注入。
- 全部在 shared-commands submitJob 层处理 → submitJob 不应理解 provider 语义。

### D2: `providerOptions.model` 在 request schema 中已存在

`mockRequestSchema` 已定义 `providerOptions: z.record(z.string(), z.unknown()).optional()`。`providerOptions.model` 无需新增 schema 字段，自然通过 `providerOptions` 透传。

### D3: Mock provider fallback default model 硬编码值

**决策**：`mock-image-v1`。

这是一个 mock-only 值，仅用于测试验证链路中 model 回显是否正确，不代表任何真实 model。

### D4: `provider-generate` workflow step input 绑定 `providerOptions`

**决策**：在 `generateStep.input` 中增加 `providerOptions: '${providerOptions}'` 模板绑定。这与现有 `provider: '${provider}'`、`prompt: '${prompt}'` 模式一致。

**理由**：workflow step 只做 job input → step input 的模板绑定，不处理 model 语义。model 的优先级逻辑在 dispatch 层处理。

### D5: profile-aware dispatch adapter 注入 defaultModel 的位置

**决策**：在 `createProfileAwareDispatchAdapter` 的 `dispatch` 方法中，`resolve(profileId)` 后、调用下游 adapter 前，从 `resolvedConfig.providerConfig.defaultModel` 读取 defaultModel，注入到 params 中。

**数据源选择**：从 `resolvedConfig.providerConfig`（经 `provider.validateConfig()` 校验后的结果）中读取 `defaultModel`，而不是从原始 `profile.config` 读取。理由：(1) `createProfileAwareDispatchAdapter` 当前已调用 `getProviderConfigResolver().resolve(profileId)`，返回值中包含 `providerConfig`，对 mock provider 而言 `MockProviderConfig.defaultModel` 已通过 schema 校验；(2) 直接从 resolver 结果读取避免再次查询 profile repository。

**params 结构说明**：当前 `createProfileAwareDispatchAdapter` 将 params 直接透传给下游 `adapter.dispatch(params)`。下游 `create-dispatch-adapter.ts` 的 `extractRequestAndSignal` 会检查 params 是否包含 `request` key：若有则取 `params.request` 作为 request，否则整个 params（排除 `signal`）被视为 request。profile-aware adapter 在注入 defaultModel 时需遵循这两种结构：

具体合并策略：
```typescript
// 从 resolve 结果读取 defaultModel
const defaultModel = (providerConfig as Record<string, unknown>).defaultModel;

// 定位 request 对象（兼容两种 params 结构）
const rawRequest = (typeof params.request === 'object' && params.request !== null)
  ? params.request as Record<string, unknown>
  : params;  // 整个 params 即 request

// 读取已有 providerOptions
const existingOptions = (rawRequest.providerOptions as Record<string, unknown>) ?? {};

// 仅在 providerOptions.model 缺失时注入
if (defaultModel && !existingOptions.model) {
  // 浅复制 params 和 request，不 mutate 原对象
  const mergedOptions = { ...existingOptions, model: defaultModel };
  // ... 构造新 params
}
```

params 和 request 对象需要浅复制以避免 mutation。

## Risks / Trade-offs

### R1: `providerOptions` 透传字段可能与 provider-specific 语义冲突

[风险] `providerOptions` 是一个 open record，profile 注入 `model` 可能与其他 provider-specific 字段产生命名冲突。

→ 缓解：当前仅注入 `model` 一个字段，且只有在 job input 未提供时才注入。命名冲突在可控范围内。未来如果需要更多 profile-level 注入字段，应考虑 namespace 或 explicit merge policy。

### R2: 非 profile-targeted dispatch path 的 model 行为

[风险] 通过 `provider: 'mock'` 直接 dispatch（非 `provider: 'profile'`）时，profile defaultModel 不参与 fallback chain。

→ 缓解：这是设计意图。直接 dispatch 时只有 `config.defaultModel`（createDispatchAdapter 绑定时的 config）和 provider fallback default 生效。这在文档和测试中需要明确说明。

### R3: `raw` 形态变更对现有测试的影响

[风险] mock provider `raw` 新增 `model` 字段，可能影响现有 snapshot 或 assertion 测试。

→ 缓解：检查现有测试中对 `raw` 的 assertion，更新包含 `model` 字段的 expectation。这是向后兼容的（增加字段，不删除字段）。
