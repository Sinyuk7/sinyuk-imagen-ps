## Tasks: profile-dispatch-real-api

### Phase 1: Provider Edit 支持

- [x] 1.1 新增 `OpenAIImageEditBody` 类型和 `buildEditRequestBody()` 函数
  - 文件: `packages/providers/src/transport/openai-compatible/build-request.ts`
  - 将 `inputAssets` 映射为 `images: [{ image_url }]`
  - `url` 直接使用，`data` 构造 `data:{mimeType};base64,{data}`
  - `maskAsset` 映射到 `mask: { image_url }`
  - `providerOptions` 透传

- [x] 1.2 修改 `provider.ts` 的 `invoke()` 方法
  - 文件: `packages/providers/src/providers/openai-compatible/provider.ts`
  - 移除 `operation !== 'generate'` 拒绝逻辑
  - 按 `request.operation` 路由:
    - `'generate'` → `POST /v1/images/generations` + `buildRequestBody()`
    - `'edit'` → `POST /v1/images/edits` + `buildEditRequestBody()`
  - 复用 `httpRequest()` 和 `parseResponse()`

- [x] 1.3 更新 provider 单元测试
  - 文件: `packages/providers/tests/` (如存在)
  - 新增 edit request body 构造测试
  - 新增 inputAssets 映射测试（url 模式 + data URL 模式）

### Phase 2: Smoke 测试扩展

- [x] 2.1 新增 n1n.ai 环境变量 helper
  - 文件: `apps/cli/tests/smoke/setup.ts`
  - 新增 `getN1nSmokeCredentials()`: 读取 `IMAGEN_SMOKE_N1N_API_KEY` + `IMAGEN_SMOKE_N1N_BASE_URL`
  - 新增 `hasN1nSmokeCredentials()`: 检查凭证完整性
  - 新增 `skipIfNoN1nCredentials`: vitest skip 条件

- [x] 2.2 新增 n1n.ai generate smoke 测试
  - 文件: `apps/cli/tests/smoke/end-to-end.test.ts`
  - 创建 n1n.ai profile（使用 `IMAGEN_SMOKE_N1N_*` 凭证）
  - `submitJob({ workflow: 'provider-generate', input: { profileId, prompt } })` → 验证 completed + output.image

- [x] 2.3 新增 n1n.ai edit smoke 测试
  - 文件: `apps/cli/tests/smoke/end-to-end.test.ts`
  - Step 1: generate "a red apple" → 拿到 `b64_json`
  - Step 2: 构造 `data:image/png;base64,{b64_json}` 作为 `inputAssets[0].data`
  - Step 3: `submitJob({ workflow: 'provider-edit', input: { profileId, prompt: 'make it green', inputAssets } })` → 验证 completed + output.image

- [x] 2.4 新增 n1n.ai 无效凭证 smoke 测试
  - 文件: `apps/cli/tests/smoke/end-to-end.test.ts`
  - 使用无效 API key → 验证 job status failed + error category provider

### Phase 3: Spec 更新

- [x] 3.1 更新 `openai-compatible-provider` spec
  - 文件: `openspec/specs/openai-compatible-provider/spec.md`
  - 移除 "Edit invocation is rejected in this phase" 场景
  - 新增 requirement: "OpenAI-compatible provider SHALL support edit operation via /v1/images/edits"
  - 新增 scenario: Successful edit invocation, Edit request body construction, inputAssets mapping (url + data URL), maskAsset mapping

### Phase 4: 验证

- [ ] 4.1 本地 smoke 测试验证（需要 n1n.ai API key）
  - 当前验证状态：未通过。
  - 失败位置：`provider-generate` 真实 n1n.ai 调用。
  - n1n.ai 返回：`Unknown parameter: 'response_format'`。
  - 判断：`gpt-image-1.5` generation 请求必须省略 `response_format`；当前运行链路仍有一处把该字段带入最终 HTTP body。
  - 已移除临时 debug 输出，未写入 API key。
  ```bash
  IMAGEN_RUN_SMOKE=1 \
  IMAGEN_SMOKE_N1N_API_KEY=<key> \
  IMAGEN_SMOKE_N1N_BASE_URL=https://api.n1n.ai \
  npx vitest run apps/cli/tests/smoke/
  ```

- [x] 4.2 确认现有单元测试全部通过
  ```bash
  npx vitest run
  ```
