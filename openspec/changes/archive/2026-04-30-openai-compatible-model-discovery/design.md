## Context

`provider-model-discovery-foundation` 已在 `Provider` 接口上定义了 `discoverModels?(config): Promise<readonly ProviderModelInfo[]>` OPTIONAL 方法，`shared-commands` 的 `refreshProfileModels` 已完整实现调用链路（解析 config → 取 provider → 检查 `discoverModels` 是否存在 → 调用 → 持久化 `profile.models`）。`openai-compatible` provider 的 `invoke()` 已通过 `httpRequest()` 打通 HTTP transport（retry、error mapping、response parsing），但 `discoverModels()` 尚未实现。

OpenAI-compatible API 的标准模型列表端点为 `GET /v1/models`，返回 `{ object: "list", data: [{ id, object, created, owned_by }, ...] }`。需要将原始响应解析为 `ProviderModelInfo[]`，并过滤出 image generation 相关模型。

约束：
- 必须遵守 `AGENTS.md` 的依赖方向：`providers` 不依赖 `shared-commands` / `apps/*`。
- Transport 层（`models.ts`）负责解析与过滤，Provider 层（`provider.ts`）负责编排调用。
- 复用现有 `httpRequest()` transport，不引入新的 HTTP 调用路径。
- 复用现有 error taxonomy（`ProviderInvokeError`），不新增错误分类。
- 所有自动化测试不依赖外网。

## Goals / Non-Goals

**Goals:**

- 实现 `openai-compatible` provider 的 `discoverModels(config)` 方法。
- 新增 `models.ts` transport 模块：类型定义、响应解析、模型过滤、displayName 格式化。
- 编写完整的单元测试（transport 层）与集成测试（provider 层 + shared-commands 层）。
- 更新 `openai-compatible-provider` spec，新增 `discoverModels` requirement。

**Non-Goals:**

- 不在 `ProviderCapabilities` 中新增 `modelDiscovery` 字段——`discoverModels` 方法存在即表示支持。
- 不做 model discovery 缓存策略（TTL、后台刷新）。
- 不做跨 provider model 统一抽象。
- 不做真实 API 自动化 CI 测试。
- 不修改 `shared-commands` 或 CLI 层代码。
- 不修改 `Provider` 接口或 `ProviderDescriptor` 类型。

### D0：类型分层 — Wire Format vs Contract Type

**决策**：`OpenAIModelObject` / `OpenAIModelsResponse` 是 OpenAI `/v1/models` 端点特有的 **wire format 类型**，仅在 `transport/openai-compatible/models.ts` 内部使用，不暴露给上层。所有 provider 的 `discoverModels()` 统一返回 contract 层的通用类型 `ProviderModelInfo`。

**分层关系**：

```
Contract 层 (packages/providers/src/contract/model.ts)
  └── ProviderModelInfo  ← 通用，所有 provider 共用，已存在

Transport 层 (packages/providers/src/transport/openai-compatible/models.ts)
  └── OpenAIModelObject / OpenAIModelsResponse  ← OpenAI wire format 专用，内部使用
  └── parseModelsResponse(raw) → ProviderModelInfo[]  ← 映射函数
```

**理由**：

- `ProviderModelInfo` 已是极简通用类型（`{ id, displayName? }`），无需也不应改为 provider-specific。
- 未来 non-OpenAI provider（如 Anthropic）会有自己的 wire format 类型（如 `AnthropicModelObject`），但最终都映射到同一个 `ProviderModelInfo`。
- `OpenAI*` 前缀明确表达"这是 OpenAI 协议格式"，避免与通用 contract 类型混淆。
- 与现有 `parse-response.ts` 中的 `OpenAIImageData` / `OpenAIImagesResponse` 命名模式一致。

**替代方案**：

- 使用通用名（如 `ModelObject` / `ModelsResponse`）→ 否决：会误导为 contract 类型，且与 `ProviderModelInfo` 产生概念重叠。
- 将 wire format 类型提升到 contract 层 → 否决：违反分层，contract 不应感知 OpenAI 协议细节。

### D1：模型过滤策略 — 多关键词匹配

**决策**：使用多关键词匹配过滤 image generation 模型，匹配规则（大小写不敏感）：

1. `id` 以 `dall-e` 开头（OpenAI 官方）
2. `id` 包含 `image`（社区/中转站通用，如 `gpt-image-1`、`grok-image`、`qwen-image-max`、`stable-diffusion-image`、`flux-image`）
3. `id` 包含 `gpt-image`（中转站 GPT Image 系列，如 `n1n.ai` 的 `gpt-image-1`）

**理由**：

- 中转站（如 `n1n.ai`）代理多种 image generation 模型，model ID 命名各异：`gpt-image-1`、`grok-2-image`、`qwen-image-max` 等。
- `*image*` 子串匹配已覆盖绝大多数场景，但 `gpt-image-*` 作为显式规则可提高可读性和可测试性。
- 多关键词匹配是零配置方案，无需外部配置文件或 capability hints。
- 宽松匹配兼容社区 API 和中转站，避免遗漏合法模型。

**替代方案**：

- 不过滤，返回全部模型 → 否决：`/v1/models` 返回大量 LLM/embedding/tts 模型，对 image generation 用户无意义，且会污染 CLI/UI 候选列表。
- 通过 config 字段声明过滤规则 → 否决：增加配置复杂度，当前无真实需求。
- 通过 `capabilityHints` 过滤 → 否决：`capabilityHints` 是用户声明的能力提示，不应驱动 provider 内部过滤逻辑。

### D2：displayName 格式化策略

**决策**：`formatDisplayName(id: string): string` 将 `-` 和 `_` 替换为空格，每个词首字母大写。

示例：
- `dall-e-3` → `Dall E 3`
- `stable-diffusion-xl` → `Stable Diffusion Xl`
- `flux_image_pro` → `Flux Image Pro`

**理由**：

- 简单、确定性、无外部依赖。
- 用户友好，UI 可直接使用。
- 不尝试"智能"映射（如 `dall-e-3` → `DALL·E 3`），避免引入品牌名称数据库。

**替代方案**：

- 不提供 displayName，留空 → 否决：UI 端需要展示名，留空会增加 UI 层负担。
- 使用原始 ID 作为 displayName → 否决：`dall-e-3` 不如 `Dall E 3` 友好。
- 通过 API 返回的 `owned_by` 字段推断 → 否决：社区 API 的 `owned_by` 不可靠。

### D3：空结果处理 — 返回 `[]`，不抛错

**决策**：当 `/v1/models` 返回成功但过滤后无 image generation 模型时，`discoverModels()` 返回 `[]`（空数组），不抛出错误。

**理由**：

- 合法场景：某些中转站只代理 LLM 模型，不代理 image 模型。
- 空数组会被 `refreshProfileModels` 正常持久化到 `profile.models`。
- 用户可通过 `listProfileModels` 的 fallback chain 回退到 `descriptor.defaultModels`。
- 抛错会让用户误以为是网络/认证问题，而非"该 API 无 image 模型"。

**替代方案**：

- 抛 `invalid_response` 错误 → 否决：响应本身是合法的，只是过滤后无匹配。
- 返回 `undefined` → 否决：与 `ProviderModelInfo[]` 返回类型不一致。

### D4：错误处理 — 复用现有 error taxonomy

**决策**：`discoverModels()` 不引入新的错误分类。所有 HTTP/网络错误由 `httpRequest()` 内部的 `mapHttpError` / `mapNetworkError` 自动映射为 `ProviderInvokeError`（`auth_failed`、`network_error`、`timeout` 等）。响应解析失败（如缺少 `data` 字段）映射为 `invalid_response`。

**理由**：

- `httpRequest()` 已包含完整的 retry + error mapping 逻辑。
- `discoverModels` 的 HTTP 调用模式与 `invoke()` 一致（GET 而非 POST），错误场景完全重叠。
- 不引入新错误分类保持 error taxonomy 稳定。

**替代方案**：

- 为 discovery 单独定义错误分类 → 否决：过度设计，无实际价值。

### D5：不在 `ProviderCapabilities` 中新增 `modelDiscovery` 字段

**决策**：通过 `provider.discoverModels` 是否为 function 判断 discovery 能力，不在 `ProviderCapabilities` 中新增 flag。

**理由**：

- `shared-commands` 的 `refreshProfileModels` 已使用 `typeof provider.discoverModels !== 'function'` 判断。
- 新增 capability flag 会引入"flag 与方法存在性不一致"的维护风险。
- `ProviderCapabilities` 当前描述的是 image 操作能力（generate/edit/size/background），与 discovery 不属于同一语义层。

**替代方案**：

- 新增 `modelDiscovery: true` → 否决：冗余，增加维护负担。

### D6：Transport 层文件组织 — 新建 `models.ts`

**决策**：在 `packages/providers/src/transport/openai-compatible/` 下新建 `models.ts`，与 `http.ts`、`build-request.ts`、`parse-response.ts` 并列。

**理由**：

- `models.ts` 是 transport 层的响应解析模块，与 `parse-response.ts`（invoke 响应解析）职责平行。
- 放在 transport 层而非 provider 层，保持"provider 只做编排，transport 做协议细节"的分层。
- 与现有文件组织一致。

**替代方案**：

- 放在 `provider.ts` 内部 → 否决：违反分层，provider 文件会膨胀。
- 放在 `packages/providers/src/providers/openai-compatible/models.ts` → 否决：解析逻辑属于 transport 层。

## Risks / Trade-offs

- **风险**：前缀匹配可能遗漏某些 image generation 模型（如未来 OpenAI 推出非 `dall-e-*` 命名的 image 模型）。
  → 缓解：前缀列表易于扩展；后续可通过 config 字段或 capability hints 补充过滤规则。
- **风险**：`formatDisplayName` 的简单规则可能产生不理想的展示名（如 `Dall E 3` 而非 `DALL·E 3`）。
  → 缓解：`displayName` 是 OPTIONAL 字段，UI 层可自行覆盖；后续可引入 provider-specific 的 displayName 映射表。
- **风险**：`discoverModels` 与 `invoke` 共用 `httpRequest()`，但 `invoke` 使用 POST + body，`discoverModels` 使用 GET + 无 body。`httpRequest` 的 `body` 参数已是 optional，GET 请求传 `undefined` body 是安全的。
  → 缓解：已验证 `httpRequest` 的 `HttpRequest.body` 为 optional，`fetchOnce` 中 `body !== undefined ? JSON.stringify(body) : undefined` 正确处理了 `undefined` 情况。
- **Trade-off**：本次不引入 model discovery 缓存策略。用户需手动执行 `refresh-models` 来更新模型列表。
  → 这是有意识的延迟决策：等真实使用场景明确后再设计 TTL/后台刷新策略。

## Migration Plan

无迁移需求。本次变更仅新增代码，不修改任何公共契约或已有接口。

1. 新增 `models.ts` 及其单元测试。
2. 修改 `provider.ts`，新增 `discoverModels()` 方法。
3. 扩展已有测试文件。
4. 全量跑 `pnpm --filter @imagen-ps/providers build && test` 和 `pnpm --filter @imagen-ps/shared-commands build && test`。
5. 手动 smoke：使用真实 API key 验证 `profile save → refresh-models → set-default-model → job submit` 端到端链路。

无 rollback 流程：开发期项目，发现问题直接前向修复。

## Open Questions

无。所有设计决策已在 handoff 文档与 explore 阶段闭环。
