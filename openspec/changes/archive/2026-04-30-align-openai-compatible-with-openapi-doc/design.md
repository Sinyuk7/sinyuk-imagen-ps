## Context

`docs/openapi/` 三份文档（`Create image.md` / `Create image edit.md` / `List models.md`）是项目与上游 OpenAI-compatible 服务的唯一契约来源。当前 `@imagen-ps/providers` 的 OpenAI-compatible 实现是在 `profile-dispatch-real-api` 变更中快速补齐的，其中：

- `descriptor.ts` 仍保留 edit 未支持时期的 `capabilities` 声明。
- `contract/request.ts` 的 `ProviderOutputOptions` 是早期以"领域抽象"思路设计的，`qualityHint` 三档与文档 `quality` 六档不可映射。
- `transport/parse-response.ts` 的返回类型是 `Asset[]`，丢弃了文档中 `ImagesResponse` 的全部元数据（`created` / `usage` / `background` / `output_format` / `quality` / `size`）。
- Edit body 只支持 `{ image_url }`，不支持文档允许的 `{ file_id }` 替代。
- `Asset.mimeType` 硬编码 `image/png`，与 `output_format` 不联动。

根据 AGENTS.md 的 zero-user invariant，本项目允许 breaking change。本设计以"文档即真相"为最高原则，直接重塑 `ProviderOutputOptions` 与 `ProviderInvokeResult`，而不保留 `qualityHint` 等历史语义。

Streaming（`stream` / `partial_images` / SSE）明确排除在本次变更之外：中转站不一定支持，且不影响正常使用。

## Goals / Non-Goals

**Goals:**

- `@imagen-ps/providers` 对外声明的 capability、contract 字段、transport 映射、response 归一化四条路径全部对齐 `docs/openapi/` 文档。
- `ProviderOutputOptions` 的字段与枚举值与 OpenAPI body parameters 一一对应（`count` 是唯一的语义名例外，在 build-request 阶段映射到 `n`）。
- `ProviderInvokeResult` 在不破坏 `assets` 主数据通道的前提下，结构化暴露文档返回的 `created` / `usage` / 元数据。
- `Asset` 通过新增 `fileId` 字段，使 engine/workflow/provider 三层统一用 `Asset` 表达"外部 URL / 内联 base64 / File API 引用"三种素材来源。
- Edit 的 `images` 与 `mask` 同时支持 `{ image_url }` 与 `{ file_id }`，符合文档 "Provide exactly one of `image_url` or `file_id`" 的约束。
- descriptor 与实现保持一致，不再出现 `imageEdit: false` 但实现已支持 edit 的撒谎状态。

**Non-Goals:**

- 不实现 streaming：`stream` / `partial_images` 不进入契约层 surface；允许通过 `providerOptions` 透传，但 transport 不消费 SSE。
- 不实现 File API 上传端点（POST /files）；`fileId` 仅作为引用通道，具体上传路径、File API 的 provider 契约不在本变更范围。
- 不引入兼容层、feature gate、迁移路径；旧字段（`qualityHint`）直接删除。
- 不改动 `core-engine` runtime 逻辑（dispatch、runner、JobStore、JobEvent）；不改动 `shared-commands` 命令签名；不改动 `workflows` 声明式结构。
- 不改动 `Models` 过滤规则（`isImageModel` 已覆盖 `gpt-image-1.5` 等）。

## Decisions

### D1：`count` 字段名保留语义名，不改成 `n`

`ProviderOutputOptions.count` 维持现状，不重命名为 OpenAPI 原生的 `n`。理由：

- Contract 层表达领域语义（"期望输出张数"），transport 层负责到上游字段名的映射，是健康的分层方向。
- 与 `width` / `height` / `aspectRatio` 等语义名保持一致；若 `count` → `n` 会出现语义名与缩写名混用。
- `build-request.ts` 已经在做这类映射（`output.width` + `output.height` → `size`），增加 `output.count` → `n` 不构成新成本。

**Alternatives considered**：全盘用 OpenAPI 字段名（`n` / `output_format` / `output_compression`）。拒绝，因为会让 `ProviderOutputOptions` 变成 OpenAI 专属的 DTO，未来接入其他 family 会出现命名冲突。

### D2：`fileId` 放在 `Asset` 上，而不是在 provider 层新增 `AssetRef`

在 `packages/core-engine/src/types/asset.ts` 的 `Asset` 接口上新增 `fileId?: string`，而不是在 `packages/providers/src/contract/request.ts` 里定义 `AssetRef = Asset | { fileId: string }`。理由：

- `Asset` 已经是 "url | data" 的联合表达，新增 "fileId" 属于同维度扩展，不破坏 host-agnostic 语义（`fileId` 是一个 opaque string）。
- 保持 engine / workflow / provider 三层共用同一个 `Asset` 类型，避免在 provider 边界做一次形变。
- `packages/providers/src/contract/request.ts` 的 `AssetRef = Asset` 别名保持不变。

**Alternatives considered**：在 provider 层新定义 `AssetRef`。拒绝，因为会让 workflow 在提交 `inputAssets` 时需要额外了解 provider 层的扩展类型，违反依赖方向。

### D3：`usage` 作为 `ProviderInvokeResult` 顶层可选字段，而不是塞进 `diagnostics`

新增 `ProviderInvokeResult.usage?: ProviderInvokeUsage`，定义：

```ts
export interface ProviderInvokeUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly inputTokensDetails?: { readonly imageTokens: number; readonly textTokens: number };
  readonly outputTokensDetails?: { readonly imageTokens: number; readonly textTokens: number };
}
```

理由：

- `usage` 是结构化业务数据（用于计费显示、token 监控），不是"可忽略的诊断"。
- `ProviderDiagnostics` 目前是 `readonly ProviderDiagnosticEntry[]` 的非阻塞提示通道，塞入强类型 usage 会破坏其单一职责。
- 保持可选：文档明确 `usage` 仅 `gpt-image-1` 等返回；上游不返回时**省略字段**（不写 `undefined`），与 `diagnostics` 现有缺省约定一致。
- 字段名转为 camelCase（`inputTokens` 而非 `input_tokens`），与 contract 层其他字段一致；transport 层负责 snake_case ↔ camelCase 映射。

### D4：`metadata` 聚合归一化后的响应元数据

新增 `ProviderInvokeResult.metadata?: ProviderInvokeMetadata`：

```ts
export interface ProviderInvokeMetadata {
  readonly background?: 'transparent' | 'opaque';
  readonly outputFormat?: 'png' | 'jpeg' | 'webp';
  readonly quality?: 'low' | 'medium' | 'high';
  readonly size?: string; // e.g. '1024x1024'
}
```

理由：

- 比 "把 background / outputFormat / quality / size 四个字段平铺到 `ProviderInvokeResult` 顶层" 更清晰，表明这些是"上游回声"而非 provider 主产出。
- 可选整体省略：上游不返回任何元数据时，整个字段省略。
- `size` 用 string 而不是 `{ width, height }` 结构体，因为 OpenAPI 响应就是 `"1024x1024"` 字符串；`Asset` 若要再结构化拆分由消费方决定。

### D5：`Asset.mimeType` 跟随 `output_format` 推断

`parse-response.ts` 读取响应顶层 `output_format` 字段；对每个 `data[i]` 生成的 `Asset`：

- `mimeType`：`png` → `image/png`，`jpeg` → `image/jpeg`，`webp` → `image/webp`；响应未提供 `output_format` 时回退 `image/png`（保留当前兜底）。
- `name`：`generated-{i+1}.{ext}`，扩展名跟随 `output_format`（`png` / `jpg` / `webp`）。

**Alternatives considered**：从 `Content-Type` 或图片 magic bytes 推断。拒绝，前者对 base64 响应无意义，后者增加不必要的二进制处理；文档已提供明确字段。

### D6：`mask` 的 exactly-one 校验放在 transport 层

`buildEditRequestBody()` 在构造 `mask` 对象时强制 `image_url` 与 `file_id` 恰好提供其一：

- 0 个：已经是 `maskAsset === undefined` 的场景，不进入 mask 分支。
- 2 个：构造阶段抛 `ProviderValidationError`（不走远到 HTTP）。

理由：这是 transport 层的数据完整性约束，不属于 contract 层；contract 层的 `Asset` 仍允许同时携带 `url` / `data` / `fileId`，由 transport 决定如何降级（优先级：`fileId` > `url` > `data`）。

### D7：`parseResponse` 返回结构改变（breaking）

从 `Asset[]` 改为：

```ts
export interface ParsedImagesResponse {
  readonly assets: readonly Asset[];
  readonly created?: number;
  readonly usage?: ProviderInvokeUsage;
  readonly metadata?: ProviderInvokeMetadata;
}
```

`provider.ts` 的 `invoke()` 读取该结构并组装 `ProviderInvokeResult`。parse-response 单元测试全部更新。

### D8：`providerOptions` 仍保留兜底透传，但显式排除已 surface 的字段

`applyProviderOptions()` 的 handled keys 集合扩展为 `[
  'model', 'response_format',
  // 新增 surface 字段在 output 路径映射，不允许 providerOptions 二次覆盖
  'quality', 'background', 'output_format', 'output_compression',
  'moderation', 'input_fidelity', 'n', 'size', 'user',
]`。

**Alternatives considered**：完全移除 `providerOptions` 透传通道。拒绝，因为 `style`（dall-e-3 专用）、`partial_images`（streaming 相关但不消费）等长尾字段仍需要透传通道，且中转站可能有扩展字段。

### D9：`mockRequestSchema` 的扩展方向

`mockRequestSchema` 当前是 "canonical request 的最小意图 schema"，被 `openai-compatible` provider 的 `validateRequest` 复用。本变更在该 schema 上：

- `output` 子对象新增 `quality` / `outputFormat` / `outputCompression` / `moderation` / `inputFidelity` 枚举或数值校验。
- 移除 `qualityHint`。
- `inputAssets[]` 与 `maskAsset` 新增 `fileId?: string` 字段。
- `providerOptions` 透传行为保持不变。

**Alternatives considered**：把 schema 拆分成 `mockRequestSchema` 和 `openaiCompatibleRequestSchema` 两份。暂拒，因为两者字段集仍完全一致；若未来 mock 需要独立演进再拆分。

## Risks / Trade-offs

- **Risk**：`ProviderOutputOptions` 字段重塑属于 breaking change，所有下游引用点（build-request、测试、workflow 文档示例）必须同步更新。
  → **Mitigation**：通过 grep `qualityHint` / `count` 全仓库定位引用点；`tasks.md` 列出所有修改文件，CI 的 TypeScript 编译会捕获遗漏。

- **Risk**：`parseResponse` 返回结构从 `Asset[]` 改为对象，如果 `invoke()` 以外还有直接调用者会坏。
  → **Mitigation**：`parseResponse` 只在 `provider.ts` 内部被调用（grep 确认）；其他测试也是 `parseResponse` 的 self-contained 单元测试，同步更新即可。

- **Risk**：`Asset.fileId` 在 core-engine 上新增字段后，engine / workflow / adapter 层的序列化边界需要能透传；若 host adapter 曾用 `JSON.stringify` + 白名单过滤，可能丢字段。
  → **Mitigation**：`Asset` 当前采用的是"字段拷贝"的 adapter 契约（未白名单过滤），新增 optional 字段不影响现有 adapter；测试加一条 round-trip 断言覆盖。

- **Risk**：`file_id` 字段虽然在 contract / transport 层落地，但没有配套的 File API 上传端点，使用者可能期望 provider 能一键上传。
  → **Mitigation**：proposal.md 明确声明 Non-goals；后续若需要上传能力再新开 change。

- **Risk**：`usage` / `metadata` 的可选语义边界如果实现时用 `undefined` 代替省略，会造成 JSON 序列化跨包歧义。
  → **Mitigation**：沿用 `contract/result.ts` 已有的约定（无值时**省略字段**），在新字段的 JSDoc 注释中明确复述，并在单元测试断言 `'usage' in result === false` 的缺省行为。

- **Trade-off**：transport `applyProviderOptions` 把 surface 字段加入 handled keys 黑名单，等同于在 contract 层限制了 `providerOptions` 的表达能力（不能覆盖已 surface 字段）。
  → **接受**：让"文档一等公民字段"只有一条唯一来源（`request.output`），避免 surface 与 providerOptions 冲突时的不确定性。
