## 1. Transport Layer

- [x] 1.1 创建 `src/transport/openai-compatible/error-map.ts`：定义 provider 错误类型与标准 failure taxonomy 映射（`auth_failed`、`rate_limited`、`upstream_unavailable`、`timeout`、`network_error`、`invalid_response`、`unknown_provider_error`）
- [x] 1.2 创建 `src/transport/openai-compatible/retry.ts`：实现有限指数退避 retry（`maxRetries=3`、`baseDelayMs=1000`、`factor=2`、支持 `AbortSignal`）
- [x] 1.3 创建 `src/transport/openai-compatible/http.ts`：统一 HTTP fetch 封装，注入 headers（`Authorization` + `extraHeaders`）、处理 timeout（`AbortSignal.timeout`）、集成 retry 与 error-map
- [x] 1.4 创建 `src/transport/openai-compatible/build-request.ts`：将 `CanonicalImageJobRequest` 转换为 OpenAI-compatible HTTP body（`model`、`prompt`、`n`、`size`、`response_format`、`providerOptions` 透传）
- [x] 1.5 创建 `src/transport/openai-compatible/parse-response.ts`：解析上游 JSON 响应，提取 `data[].url` 或 `data[].b64_json`，归一化为 `Asset[]`
- [x] 1.6 为 transport 补充 retry diagnostics：记录 retry attempt、delay、statusCode / kind，并由 provider 透传到 `ProviderInvokeResult.diagnostics`

## 2. Provider Implementation

- [x] 2.1 创建 `src/providers/openai-compatible/config-schema.ts`：Zod schema 定义 `OpenAICompatibleProviderConfig`，与 contract 层类型对齐
- [x] 2.2 创建 `src/providers/openai-compatible/descriptor.ts`：静态 `ProviderDescriptor`，`id='openai-compatible'`，capabilities 与 operations 声明
- [x] 2.3 创建 `src/providers/openai-compatible/provider.ts`：实现 `Provider` 接口（`describe`、`validateConfig`、`validateRequest`、`invoke`），`invoke` 内调用 transport 层并归一化结果
- [x] 2.4 创建 `src/providers/openai-compatible/index.ts`：集中导出 config-schema、descriptor、provider 类型与工厂函数

## 3. Registry & Exports

- [x] 3.1 更新 `src/registry/builtins.ts`：在 `registerBuiltins` 中追加 `createOpenAICompatibleProvider()` 注册
- [x] 3.2 更新 `src/index.ts`：追加 openai-compatible provider 相关稳定导出（`createOpenAICompatibleProvider`、`openaiCompatibleDescriptor`、`openaiCompatibleConfigSchema` 及对应类型）

## 4. Build Verification

- [x] 4.1 运行 `pnpm --filter @imagen-ps/providers build`，确保新增文件编译通过
- [x] 4.2 运行 `pnpm --filter @imagen-ps/providers test`，确认新增与现有测试均可通过
