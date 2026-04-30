## MODIFIED Requirements

### Requirement: Canonical request SHALL encode only minimal provider-owned intent
provider request contract MUST 只表达 provider 层拥有的最小意图，不得把 host IO、任务准备结果或 vendor 原始字段直接写入稳定 contract。

`ProviderOutputOptions` 的字段集合 SHALL 与 `docs/openapi/` 中 `Create image` 与 `Create image edit` 两份文档的 body parameters 对齐，具体包括：

- `count?: number` — 语义名，对应上游 `n`；由 transport 层映射。
- `width?: number` / `height?: number` / `aspectRatio?: string` — 保留现有领域抽象。
- `background?: 'auto' | 'transparent' | 'opaque'`
- `quality?: 'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd'`
- `outputFormat?: 'png' | 'jpeg' | 'webp'`
- `outputCompression?: number` — 0 至 100 的整数；仅对 `jpeg` / `webp` 有意义。
- `moderation?: 'auto' | 'low'`
- `inputFidelity?: 'high' | 'low'` — 仅对 edit 调用有意义。

`ProviderOutputOptions` SHALL NOT 保留 `qualityHint: 'speed' | 'balanced' | 'quality'` 三档语义；其功能已被文档原生 `quality` 六档取代。

#### Scenario: Canonical image request is validated
- **WHEN** 一个 image job request 进入 provider contract
- **THEN** 它 MUST 至少支持 `operation`、`prompt`、可选的 `inputAssets`、`maskAsset`、`output`、`providerOptions`
- **AND** 它 MUST 将 `generate` 与 `edit` 视为稳定操作类型
- **AND** 它 MUST NOT 要求 `prepared_reference_image_path`、`debug_mode` 或 raw HTTP payload snapshot

#### Scenario: Output options enumerate documented fields
- **WHEN** 调用方构造 `request.output`
- **THEN** `output` MUST 接受 `count / width / height / aspectRatio / background / quality / outputFormat / outputCompression / moderation / inputFidelity` 字段
- **AND** `quality` 的取值 MUST 限定为 `'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd'`
- **AND** `outputFormat` 的取值 MUST 限定为 `'png' | 'jpeg' | 'webp'`
- **AND** `background` 的取值 MUST 限定为 `'auto' | 'transparent' | 'opaque'`

#### Scenario: qualityHint is not accepted
- **WHEN** 调用方在 `request.output` 中传入 `qualityHint: 'balanced'`
- **THEN** provider 层 request 校验 MUST 将其视为未知字段
- **AND** 该字段 MUST NOT 被 transport 层映射到任何上游参数

### Requirement: Provider invoke SHALL return normalized result and structured diagnostics
provider 调用结果 MUST 被归一化为稳定 result shape，并允许附带结构化 diagnostics，而不是直接暴露上游原始响应结构。

`ProviderInvokeResult` SHALL 至少包含：

- `assets: readonly Asset[]` — 必须字段，主数据通道。
- `diagnostics?: ProviderDiagnostics` — 无诊断时**省略字段**（不写 `undefined`）。
- `raw?: unknown` — 调试开口，非 SemVer 稳定面；生产代码不得消费。
- `created?: number` — 上游返回的 Unix 秒级时间戳；上游未返回时省略。
- `usage?: ProviderInvokeUsage` — 上游返回的 token 消耗统计；未返回时省略。
- `metadata?: ProviderInvokeMetadata` — 上游对 `background / outputFormat / quality / size` 的回声；未返回时省略。

`ProviderInvokeUsage` SHALL 定义为：

```ts
readonly inputTokens: number;
readonly outputTokens: number;
readonly totalTokens: number;
readonly inputTokensDetails?: { readonly imageTokens: number; readonly textTokens: number };
readonly outputTokensDetails?: { readonly imageTokens: number; readonly textTokens: number };
```

`ProviderInvokeMetadata` SHALL 定义为：

```ts
readonly background?: 'transparent' | 'opaque';
readonly outputFormat?: 'png' | 'jpeg' | 'webp';
readonly quality?: 'low' | 'medium' | 'high';
readonly size?: string;
```

`usage` 与 `metadata` 的字段命名 SHALL 为 camelCase；上游 snake_case（`input_tokens`、`output_format` 等）映射由 transport 层负责。

#### Scenario: Provider invocation completes successfully
- **WHEN** 一个 provider 完成调用
- **THEN** 它 MUST 返回标准化的 `assets` 集合
- **AND** 它 MUST 可以返回结构化 `diagnostics`
- **AND** 它 MAY 包含调试用途的 `raw` 字段
- **AND** runtime-facing 调用方 MUST 不依赖 vendor-specific response shape

#### Scenario: Result exposes usage when upstream provides it
- **WHEN** 上游响应体包含 `usage.total_tokens / input_tokens / output_tokens` 字段
- **THEN** `ProviderInvokeResult.usage` MUST 为 camelCase 结构化对象
- **AND** `totalTokens / inputTokens / outputTokens` 字段 MUST 为 number
- **AND** 上游未提供 `usage` 时，结果 MUST 省略该字段（`'usage' in result === false`）

#### Scenario: Result exposes metadata when upstream provides it
- **WHEN** 上游响应体包含 `background` / `output_format` / `quality` / `size` 中任意字段
- **THEN** `ProviderInvokeResult.metadata` MUST 承载这些字段的 camelCase 形态
- **AND** 上游未提供任何元数据字段时，结果 MUST 省略整个 `metadata` 字段

### Requirement: Asset references SHALL remain compatible with core-engine asset boundary
provider contract 中的 asset reference MUST 与 `@imagen-ps/core-engine` 的 `Asset` 边界兼容，不得制造无必要的平行资源模型。

`AssetRef` SHALL 继续作为 `core-engine` `Asset` 的类型别名（不引入新的 union 或 wrapper 类型）。`Asset` 扩展出的 `fileId?: string` 通道 SHALL 自动通过 `AssetRef` 暴露给 provider 层。

#### Scenario: Provider contract accepts input assets
- **WHEN** provider request 使用 asset 引用
- **THEN** 该引用 MUST 与 `packages/core-engine/src/types/asset.ts` 中的 `Asset` shape 等价或可直接映射
- **AND** 它 MUST 保持 serializable 与 host-agnostic
- **AND** 它 MUST NOT 引入 DOM、UXP、Photoshop 或 filesystem-specific 类型

#### Scenario: Asset reference supports fileId channel
- **WHEN** 调用方构造 `inputAssets[0] = { type: 'image', fileId: 'file-abc123' }`
- **THEN** provider contract MUST 接受该引用而不要求同时提供 `url` 或 `data`
- **AND** transport 层 MUST 能够将该引用映射为上游所需的 `file_id` 字段
