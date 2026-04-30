## 1. Core-engine Asset 扩展

- [x] 1.1 在 `packages/core-engine/src/types/asset.ts` 的 `Asset` 接口上新增 `readonly fileId?: string` 字段，更新 JSDoc 说明其为 opaque identifier、由 provider 层解释
- [x] 1.2 确认 `packages/core-engine/src/index.ts` 已 re-export `Asset`（无则补齐）；新增类型单元测试断言 `Asset` 可仅通过 `fileId` 构造

## 2. Provider contract 扩展

- [x] 2.1 更新 `packages/providers/src/contract/request.ts` 的 `ProviderOutputOptions`：
  - 移除 `qualityHint`
  - 新增 `quality?: 'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd'`
  - 新增 `outputFormat?: 'png' | 'jpeg' | 'webp'`
  - 新增 `outputCompression?: number`
  - 新增 `moderation?: 'auto' | 'low'`
  - 新增 `inputFidelity?: 'high' | 'low'`
  - 保留 `count / width / height / aspectRatio / background`
- [x] 2.2 在 `packages/providers/src/contract/result.ts` 新增：
  - `ProviderInvokeUsage` 接口（camelCase tokens 结构）
  - `ProviderInvokeMetadata` 接口（background / outputFormat / quality / size）
  - 扩展 `ProviderInvokeResult` 的可选字段：`created? / usage? / metadata?`
  - JSDoc 说明 "无值时省略字段，不写 undefined"
- [x] 2.3 在 `packages/providers/src/contract/index.ts` re-export 新类型
- [x] 2.4 在 `packages/providers/src/index.ts` 包根 re-export 新类型（对外 surface）

## 3. Request schema 对齐

- [x] 3.1 更新 `packages/providers/src/providers/mock/request-schema.ts`：
  - `output` 子 schema 移除 `qualityHint`
  - 新增 `quality / outputFormat / outputCompression / moderation / inputFidelity` 校验（对应枚举或数值范围）
  - `inputAssets[]` 与 `maskAsset` 新增可选 `fileId: z.string().optional()`
- [x] 3.2 本地确认 `mockRequestSchema` 推导的 `MockProviderRequest` 与 `CanonicalImageJobRequest` 仍一致（类型检查通过）

## 4. Descriptor 对齐实现

- [x] 4.1 修改 `packages/providers/src/providers/openai-compatible/descriptor.ts`：
  - `capabilities.imageEdit: true`
  - `capabilities.transparentBackground: true`
  - `operations: ['generate', 'edit']`
- [x] 4.2 若 `mock` descriptor 也在测试中断言了 capabilities，按需同步

## 5. Build-request 层映射

- [x] 5.1 在 `packages/providers/src/transport/openai-compatible/build-request.ts` 新增 `applyOutputToBody(body, output, options)` 辅助函数，负责 `request.output` → body 字段映射：
  - `count → n`、`quality → quality`、`background → background`、`outputFormat → output_format`、`outputCompression → output_compression`、`moderation → moderation`
  - 仅 edit 路径处理 `inputFidelity → input_fidelity`
- [x] 5.2 修改 `buildRequestBody()` 调用 `applyOutputToBody` 覆盖 generate 字段
- [x] 5.3 修改 `buildEditRequestBody()`：
  - 调用 `applyOutputToBody` 覆盖 edit 字段（含 input_fidelity）
  - `assetToImageRef(asset)`（重命名/重写 `assetToImageUrl`）：优先 `fileId` → `{ file_id }`，否则 `url` / `data` → `{ image_url }`，三者均空抛错
  - `mask` 构造后断言 `file_id` 与 `image_url` 恰好之一
- [x] 5.4 扩展 `applyProviderOptions` 的 handled keys 集合至 `['model', 'response_format', 'n', 'size', 'quality', 'background', 'output_format', 'output_compression', 'moderation', 'input_fidelity', 'user']`
- [x] 5.5 更新/新增 `packages/providers/tests/` 下的 build-request 单元测试：
  - `output` 字段映射（generate + edit）
  - `fileId` 优先级覆盖
  - `providerOptions` 无法覆盖已 surface 字段
  - `mask` exactly-one 校验失败用例

## 6. Parse-response 扩展

- [x] 6.1 修改 `packages/providers/src/transport/openai-compatible/parse-response.ts`：
  - 新增导出类型 `ParsedImagesResponse { assets; created?; usage?; metadata? }`
  - 顶层读取 `output_format` 并推断 `mimeType` 与文件名后缀；回退 `png`
  - 解析 `usage` snake_case → camelCase 的 `ProviderInvokeUsage`（含 `input_tokens_details` / `output_tokens_details`）
  - 解析 `background / output_format / quality / size` 到 `ProviderInvokeMetadata`；至少一个字段存在才构造该对象
  - `created?: number` 直接透传
- [x] 6.2 修改 `packages/providers/src/providers/openai-compatible/provider.ts` `invoke()`：消费 `ParsedImagesResponse`，展开到 `ProviderInvokeResult`（注意 `undefined` 字段必须省略而非写入）
- [x] 6.3 更新/新增 parse-response 单元测试：
  - `output_format` → mimeType 联动（png / jpeg / webp）
  - `usage` 完整与缺省两种上游响应
  - `metadata` 完整与缺省两种上游响应
  - `created` 有值与缺省

## 7. 现有代码引用清理

- [x] 7.1 全仓 grep `qualityHint`，确认无残留引用（spec 文本除外）
- [x] 7.2 全仓 grep `assetToImageUrl`，确认已被 `assetToImageRef` 取代；清理过期注释
- [x] 7.3 全仓 grep `OpenAIImageReference` / `OpenAIImageMaskReference` 的字段定义，确认已新增 `file_id?: string`
- [x] 7.4 `packages/providers/src/transport/openai-compatible/build-request.ts` 顶部 JSDoc 更新以反映 OpenAPI 对齐

## 8. Provider 集成测试

- [x] 8.1 更新 `packages/providers/tests/openai-compatible-provider.test.ts`：
  - 修正 descriptor 期望（`operations: ['generate', 'edit']`、`imageEdit: true`）
  - 新增 edit 路径端到端 mock 测试（http + parse）
  - 新增 `ProviderInvokeResult.usage` / `metadata` / `created` 传递断言
- [x] 8.2 本地运行 `pnpm --filter @imagen-ps/providers test`，确认全部通过

## 9. 上游 spec 归档同步准备

- [x] 9.1 确认本变更的 specs delta 正确描述了所有 breaking change（`qualityHint` 移除、`ProviderInvokeResult` 扩展、`Asset.fileId` 新增、descriptor 修正、edit rejected scenario REMOVED）
- [x] 9.2 运行 `openspec validate align-openai-compatible-with-openapi-doc --strict`，修复任何 schema 校验失败
- [x] 9.3 本地运行仓库级测试（`pnpm -r test`），确认下游 packages 未因 contract breaking change 出现未修复的编译/测试失败
