## Design: profile-dispatch-real-api

### Overview

本 change 在现有 `openai-compatible` provider 和 smoke 测试框架基础上，补齐 edit 操作支持，并通过 n1n.ai 真实 API 验证 generate + edit 端到端链路。

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Provider invoke() 路由                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  invoke({ config, request, signal })                             │
│    │                                                             │
│    ├── request.operation === 'generate'                          │
│    │   ├── buildRequestBody(request, config.defaultModel)        │
│    │   ├── POST {baseURL}/v1/images/generations                  │
│    │   └── parseResponse(response.data)                          │
│    │                                                             │
│    └── request.operation === 'edit'                              │
│        ├── buildEditRequestBody(request, config.defaultModel)    │
│        ├── POST {baseURL}/v1/images/edits                        │
│        └── parseResponse(response.data)  ← 复用同一解析器        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Edit Request Body 构造

```
CanonicalImageJobRequest                    OpenAIImageEditBody
──────────────────────                      ────────────────────
operation: 'edit'                           model: "gpt-image-1.5"
prompt: "make it green"                     prompt: "make it green"
inputAssets: [                              images: [
  { url: "https://..." },        ──►          { image_url: "https://..." },
  { data: "iVBORw0KGgo...",                  { image_url: "data:image/png;base64,iVBORw0KGgo..." }
    mimeType: "image/png" }                 ]
  }                                         n: 1
output: { count: 1 }                        size: "1024x1024"
providerOptions: { ... }                    ... (透传)
```

**映射规则**：
- `inputAssets[].url` 存在 → `image_url` 直接使用
- `inputAssets[].data` 存在 → 构造 `data:{mimeType};base64,{data}` 作为 `image_url`
- `maskAsset` 存在 → 映射到 `mask: { image_url }`（同规则）
- `providerOptions` 透传（排除已显式处理的字段）

### Content-Type 决策：JSON Only

```
┌─────────────────────────────────────────────────────────────────┐
│  决策: 只支持 JSON Content-Type                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  新版 OpenAI Images API edit 端点同时支持:                       │
│  • application/json (通过 image_url 引用)                       │
│  • multipart/form-data (通过文件上传)                           │
│                                                                 │
│  选择 JSON-only 的理由:                                         │
│  1. 与 generate 路径完全一致，复用 httpRequest() + parseResponse│
│  2. Asset 类型已有 url 和 data 字段，映射简单                   │
│  3. 本地图片可通过 base64 data URL 传入，无需 multipart         │
│  4. 最小改动原则                                                │
│                                                                 │
│  不实现 Multipart，因为本地图片可通过 base64 data URL 传入，     │
│  JSON 路径已满足当前 product 需求。                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Smoke 测试设计

```
┌─────────────────────────────────────────────────────────────────┐
│              Smoke 测试: n1n.ai 真实 API 端到端                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  环境变量:                                                      │
│    IMAGEN_SMOKE_N1N_API_KEY  — n1n.ai API key                  │
│    IMAGEN_SMOKE_N1N_BASE_URL — n1n.ai base URL                 │
│    (默认: https://api.n1n.ai)                                   │
│                                                                 │
│  测试用例:                                                      │
│                                                                 │
│  1. Generate: 有效凭证 → submitJob 返回 completed               │
│     profileId: 'smoke-n1n-test'                                 │
│     workflow: 'provider-generate'                               │
│     prompt: 'a simple red circle on white background'           │
│     → output.image 存在，包含 Asset[]                           │
│                                                                 │
│  2. Edit: generate 产出 → 构造 data URL → edit 消费             │
│     Step 1: generate "a red apple" → 拿到 b64_json              │
│     Step 2: edit { images: [{ image_url: "data:..." }],         │
│                    prompt: "make it green" }                    │
│     → output.image 存在，包含编辑后的 Asset[]                   │
│                                                                 │
│  3. 无效 API key → job status failed, error category provider   │
│                                                                 │
│  触发方式:                                                      │
│    IMAGEN_RUN_SMOKE=1 \                                        │
│    IMAGEN_SMOKE_N1N_API_KEY=sk-xxx \                           │
│    IMAGEN_SMOKE_N1N_BASE_URL=https://api.n1n.ai \              │
│    npx vitest run apps/cli/tests/smoke/                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 与现有 IMAGEN_SMOKE_OPENAI_* 的关系

```
OpenAI 变量:
  IMAGEN_SMOKE_OPENAI_API_KEY   → 通用 OpenAI 官方 API smoke 测试
  IMAGEN_SMOKE_OPENAI_BASE_URL  → 默认 https://api.openai.com

新增变量:
  IMAGEN_SMOKE_N1N_API_KEY      → n1n.ai 中转站 smoke 测试
  IMAGEN_SMOKE_N1N_BASE_URL     → 默认 https://api.n1n.ai

两者独立，互不干扰。n1n.ai 测试用例使用 getN1nSmokeCredentials()，
OpenAI 测试用例继续使用 getSmokeCredentials()。
```

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/providers/src/transport/openai-compatible/build-request.ts` | 修改 | 新增 `buildEditRequestBody()` + `OpenAIImageEditBody` 类型 |
| `packages/providers/src/providers/openai-compatible/provider.ts` | 修改 | `invoke()` 移除 edit 拒绝，按 operation 路由 |
| `apps/cli/tests/smoke/setup.ts` | 修改 | 新增 `getN1nSmokeCredentials()` 等 helper |
| `apps/cli/tests/smoke/end-to-end.test.ts` | 修改 | 新增 n1n.ai generate + edit smoke 测试用例 |
| `openspec/specs/openai-compatible-provider/spec.md` | 修改 | 移除 edit 拒绝场景，新增 edit requirement |

### 不变更的部分

- `CanonicalImageJobRequest` 契约 — `inputAssets` 已有 `url` 和 `data` 字段，无需修改
- `provider-edit` workflow 定义 — 已在 `provider-edit-profile-dispatch` change 中添加 `profileId`/`providerProfileId` 绑定
- `core-engine` runner — `executeProviderStep` 不感知 operation 类型
- `shared-commands` runtime — `createProfileAwareDispatchAdapter` 不感知 operation 类型
- HTTP transport 层 — `httpRequest()` 和 `parseResponse()` 无需修改
