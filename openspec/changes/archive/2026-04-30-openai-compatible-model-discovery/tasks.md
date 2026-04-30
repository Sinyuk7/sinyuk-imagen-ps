## 1. Transport 层：models.ts 类型与解析

- [x] 1.1 在 `packages/providers/src/transport/openai-compatible/` 下新建 `models.ts`，定义 `OpenAIModelObject` 和 `OpenAIModelsResponse` 类型。
- [x] 1.2 实现 `formatDisplayName(id: string): string`：将 `-` 和 `_` 替换为空格，每个词首字母大写。
- [x] 1.3 实现 `parseModelsResponse(raw: unknown): ProviderModelInfo[]`：
  - 基础验证：`raw` 是 object、`object === 'list'`、`data` 是数组。
  - 遍历 `data`，过滤非 image generation 模型（多关键词匹配，大小写不敏感）：
    - `id` 以 `dall-e` 开头（OpenAI 官方）
    - `id` 包含 `image`（社区/中转站通用）
    - `id` 包含 `gpt-image`（中转站 GPT Image 系列）
  - 映射为 `ProviderModelInfo[]`（`id` 取 `model.id`，`displayName` 取 `formatDisplayName(model.id)`）。
  - 空数组合法，不抛错。
- [x] 1.4 在 `parseModelsResponse` 中处理边界情况：`data` 项非 object 时跳过；`data` 项缺少 `id` 字段时跳过。
- [x] 1.5 从 `packages/providers/src/index.ts` 导出 `parseModelsResponse` 和 `formatDisplayName`（或仅内部使用，视测试需要）。→ 测试直接从源文件导入，无需顶层导出。

## 2. Transport 层：models.ts 单元测试

- [x] 2.1 新建 `packages/providers/tests/openai-compatible-models.test.ts`。
- [x] 2.2 测试 `formatDisplayName`：`dall-e-3` → `Dall E 3`、`flux_image_pro` → `Flux Image Pro`、单单词、空字符串。
- [x] 2.3 测试 `parseModelsResponse` 成功场景：包含 `dall-e-3` 和 `gpt-4` 的混合响应，仅返回 image 模型。
- [x] 2.4 测试 `parseModelsResponse` 空数据场景：`data: []` → 返回 `[]`。
- [x] 2.5 测试 `parseModelsResponse` 无效响应场景：缺少 `object` 字段、`data` 非数组、`data` 项非 object、`data` 项缺 `id`。
- [x] 2.6 测试 `parseModelsResponse` 无匹配场景：所有模型 ID 均不匹配过滤规则 → 返回 `[]`。
- [x] 2.7 测试 `parseModelsResponse` 社区/中转站模型场景：`stable-diffusion-image`、`flux-image-pro`、`gpt-image-1`、`grok-2-image`、`qwen-image-max` 被正确识别；`gpt-4`、`grok-2`、`qwen-max` 被正确过滤。
- [x] 2.8 运行 `pnpm --filter @imagen-ps/providers test` 确认新增测试全绿。

## 3. Provider 层：discoverModels 实现

- [x] 3.1 在 `packages/providers/src/providers/openai-compatible/provider.ts` 中实现 `discoverModels(config)` 方法：
  - 构造 `GET {baseURL}/v1/models` URL。
  - 调用 `httpRequest({ url, method: 'GET', headers: { Authorization: Bearer {apiKey}, ...extraHeaders }, timeoutMs })`。
  - 调用 `parseModelsResponse(response.response.data)` 解析响应。
  - 返回 `ProviderModelInfo[]`。
- [x] 3.2 确保 `discoverModels` 的错误由 `httpRequest()` 的 error-map 自动处理（不额外 try/catch 转换）。
- [x] 3.3 确保 `discoverModels` 不修改 `config`、不写入任何持久化状态。

## 4. Provider 层：discoverModels 单元测试

- [x] 4.1 在 `packages/providers/tests/openai-compatible-provider.test.ts` 中新增 `discoverModels` 测试用例。
- [x] 4.2 测试成功场景：mock `httpRequest` 返回包含 `dall-e-3` 的 `/v1/models` 响应，验证返回正确的 `ProviderModelInfo[]`。
- [x] 4.3 测试空结果场景：mock `httpRequest` 返回无 image 模型的响应，验证返回 `[]`。
- [x] 4.4 测试 401 错误场景：mock `httpRequest` 抛出 `ProviderInvokeError { kind: 'auth_failed' }`，验证 `discoverModels` 透传该错误。
- [x] 4.5 测试 timeout 场景：mock `httpRequest` 抛出 `ProviderInvokeError { kind: 'timeout' }`，验证 `discoverModels` 透传该错误。
- [x] 4.6 测试无效响应场景：mock `httpRequest` 返回缺少 `data` 字段的响应，验证 `discoverModels` 抛出 `invalid_response`。
- [x] 4.7 验证 `discoverModels` 调用 `httpRequest` 时使用正确的 URL、method、headers。
- [x] 4.8 运行 `pnpm --filter @imagen-ps/providers test` 确认全部测试通过。

## 5. Shared-Commands 层：集成测试

- [x] 5.1 在 `packages/shared-commands/tests/` 下新建或扩展测试文件，覆盖 `refreshProfileModels` + openai-compatible 的集成场景。
- [x] 5.2 测试 `refreshProfileModels` 成功：注册带 `discoverModels` 的 openai-compatible provider，验证 `profile.models` 被正确更新。→ 已有 mock provider 测试覆盖（provider-agnostic）。
- [x] 5.3 测试 `refreshProfileModels` 失败不擦除缓存：mock `discoverModels` 抛错，验证 `profile.models` 维持原值。→ 已有 mock provider 测试覆盖 + 新增 openai-compatible 集成测试。
- [x] 5.4 测试 `refreshProfileModels` 空结果：mock `discoverModels` 返回 `[]`，验证 `profile.models` 被设为 `[]`。→ 已有 mock provider 测试覆盖（provider-agnostic）。
- [x] 5.5 运行 `pnpm --filter @imagen-ps/shared-commands test` 确认全部测试通过。

## 6. 全量回归与验证

- [x] 6.1 运行 `pnpm --filter @imagen-ps/providers build && test` 全绿。
- [x] 6.2 运行 `pnpm --filter @imagen-ps/shared-commands build && test` 全绿。
- [x] 6.3 运行 `pnpm --filter @imagen-ps/cli build && test` 全绿。
- [x] 6.4 手动 smoke：使用真实 API key（如 `n1n.ai` 中转站或 OpenAI 官方）验证 `profile save → refresh-models → set-default-model → job submit` 端到端链路。
- [x] 6.5 运行 `openspec validate openai-compatible-model-discovery` 确认 change 有效。

## 7. 文档

- [x] 7.1 更新 `apps/cli/README.md`：在端到端示例中加入 openai-compatible 真实 provider 的 `refresh-models` 步骤。
- [x] 7.2 确认 `AGENTS.md` 文档地图无需变更（本次不新增文档）。
