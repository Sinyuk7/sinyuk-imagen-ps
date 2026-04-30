## Why

`docs/openapi/` 下的 OpenAPI 文档（`Create image.md`、`Create image edit.md`、`List models.md`）是本项目与上游 OpenAI-compatible 服务交互的唯一契约来源。当前 `@imagen-ps/providers` 中 OpenAI-compatible provider 的实现与该契约存在多处不一致：

- `openaiCompatibleDescriptor` 仍声明 `imageEdit: false`、`operations: ['generate']`，但 `invoke()` 与 `buildEditRequestBody()` 实际已支持 edit —— descriptor 与实现互相撒谎。
- `ProviderOutputOptions` 的 `qualityHint: 'speed' | 'balanced' | 'quality'` 是自造三档，与文档 `quality: 'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd'` 不可映射；`background` 以外的官方参数（`output_format`、`output_compression`、`moderation`、`input_fidelity`）没有在契约层 surface。
- `parseResponse()` 只消费 `data[].url` / `data[].b64_json`，丢弃 `created`、`usage`、`output_format`、`quality`、`size`、`background` 等全部元数据；`Asset.mimeType` 硬编码 `image/png`，与 `output_format` 不联动。
- Edit 请求 `images` / `mask` 只支持 `{ image_url }`，没有文档契约中的 `{ file_id }` 分支。

本变更把 provider contract、transport 映射、descriptor、Asset 模型对齐到 OpenAPI 文档的当前语义（不包含 streaming），让"文档即真相"。

## What Changes

- **BREAKING**: `ProviderOutputOptions` 重塑 —— 移除 `qualityHint`，新增 `quality`、`outputFormat`、`outputCompression`、`moderation`、`inputFidelity` 字段，字段枚举值与 OpenAPI 文档一一对齐；`count` 语义名保留（build-request 阶段映射到上游 `n`）。
- **BREAKING**: `ProviderInvokeResult` 新增可选顶层字段 `created?`、`usage?: ProviderInvokeUsage`、`metadata?: { background?, outputFormat?, quality?, size? }`；`raw` 仍保留为非稳定调试面。
- **BREAKING**: `Asset` 新增可选 `fileId?: string` 字段，使 `inputAssets` / `maskAsset` 可以表达"用 File API 已上传文件"的引用。
- 修正 `openaiCompatibleDescriptor` 与实现一致：`imageEdit: true`、`operations: ['generate', 'edit']`、`transparentBackground: true`。
- `buildRequestBody` / `buildEditRequestBody` 从 `request.output` 读取新字段并映射为官方 body 字段；`providerOptions` 保留为兜底透传通道，但不再承担 surface 主路径。
- Edit 的 `images[]` 与 `mask` 同时支持 `{ image_url }` 与 `{ file_id }`；`mask` 强制 exactly-one 校验。
- `parseResponse()` 返回结构从 `Asset[]` 改为 `{ assets, created?, usage?, metadata? }`；`Asset.mimeType` 与生成文件名后缀跟随响应 `output_format` 推断（`png` / `jpeg` / `webp`）。
- Request schema（`mockRequestSchema`）同步扩展：`output` 字段接受新枚举；`inputAssets[]` / `maskAsset` 接受 `fileId`；保留对未知键的严格拒绝（若现状如此）或明确放行策略。
- **Non-goals**: 不实现 streaming（`stream` / `partial_images` 不在契约层 surface，允许通过 `providerOptions` 透传但不消费 SSE 响应）；不实现 File API 上传端点（`fileId` 仅作为引用通道，上传路径不在本次变更范围）；不引入兼容层或 feature gate。

## Capabilities

### New Capabilities
无。

### Modified Capabilities
- `openai-compatible-provider`: descriptor 与实现对齐；edit body 支持 `file_id`；`output` 输入参数扩展至文档全量字段；response 归一化扩展至 `created` / `usage` / `metadata`；mimeType 随 `output_format` 推断。
- `provider-contract`: `ProviderOutputOptions` 字段集破坏性重塑；`ProviderInvokeResult` 新增可选 `created` / `usage` / `metadata`；`Asset` 新增可选 `fileId`。

## Impact

- `packages/providers/src/contract/request.ts` — `ProviderOutputOptions` 字段重塑。
- `packages/providers/src/contract/result.ts` — 新增 `ProviderInvokeUsage`、`ProviderInvokeMetadata`，扩展 `ProviderInvokeResult`。
- `packages/core-engine/src/types/asset.ts` — `Asset` 新增 `fileId?: string`。
- `packages/providers/src/providers/openai-compatible/descriptor.ts` — 修正 capabilities 与 operations。
- `packages/providers/src/providers/mock/request-schema.ts` — schema 扩展新字段。
- `packages/providers/src/transport/openai-compatible/build-request.ts` — 新增字段映射；edit 支持 `file_id`；`mask` exactly-one 校验。
- `packages/providers/src/transport/openai-compatible/parse-response.ts` — 返回结构扩展；mimeType 随 `output_format` 推断。
- `packages/providers/src/providers/openai-compatible/provider.ts` — `invoke()` 组装扩展后的 `ProviderInvokeResult`。
- `packages/providers/tests/openai-compatible-*.test.ts` — 覆盖新字段、file_id 分支、mimeType 联动、usage 传递。
- `packages/providers/src/contract/` 的类型导出面 —— surface re-export 更新。
- 不影响 `core-engine` runtime 逻辑、`shared-commands` 命令签名、`workflows` 声明式结构。
- 不影响现有 smoke 测试主路径；可选地补充覆盖 `output.quality` / `output.outputFormat` 的新用例。
