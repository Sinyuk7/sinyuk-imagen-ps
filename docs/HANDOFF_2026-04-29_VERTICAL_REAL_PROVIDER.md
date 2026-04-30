# Handoff: 纵向深入 — 真实 OpenAI-Compatible Provider 端到端链路

日期：2026-04-29

## 1. 当前上下文摘要

### 1.1 已完成并归档的 Change

本轮共归档三个 OpenSpec change：

| Change | 归档位置 | 核心交付 |
|--------|----------|---------|
| `openai-compatible-cli-smoke` | `openspec/changes/archive/2026-04-29-openai-compatible-cli-smoke/` | CLI smoke 测试框架 |
| `cli-surface` | `openspec/changes/archive/2026-04-29-cli-surface/` | CLI 7 条 automation 命令 + 交互式 shortcut |
| `provider-model-discovery-foundation` | `openspec/changes/archive/2026-04-29-provider-model-discovery-foundation/` | Model discovery 基础设施（contract、profile、shared-commands） |

最终验证已通过：

```bash
pnpm --filter @imagen-ps/providers build && test        # 9 passed
pnpm --filter @imagen-ps/workflows build && test         # 23 passed
pnpm --filter @imagen-ps/shared-commands build && test   # 31 passed
pnpm --filter @imagen-ps/cli build && test               # 32 passed
```

### 1.2 当前架构全景

```
┌─────────────────────────────────┐
│ Surface Apps                     │
├──────────┬──────────────────────┤
│ apps/cli │ apps/app (scaffold)  │  ← CLI 完整，UXP 占位
├──────────┴──────────────────────┤
│ @imagen-ps/shared-commands      │  ← Profile lifecycle + Model selection + Dispatch
├──────────────────────────────────┤
│ @imagen-ps/core-engine          │  ← Job lifecycle, runtime, dispatch bridge
│ @imagen-ps/providers            │  ← mock (完整) + openai-compatible (缺 discoverModels)
│ @imagen-ps/workflows            │  ← provider-generate (stable) + provider-edit (deferred)
└──────────────────────────────────┘
```

### 1.3 已完成 vs 未完成

| 已完成（横向） | 未完成（纵向） |
|---|---|
| CLI 命令框架（7 条 + 1 shortcut） | OpenAI-compatible 的 `discoverModels()` |
| Profile CRUD + Secret 引用 | 真实端到端图片生成验证 |
| Mock provider 全链路 | Edit 操作的 provider 实现 |
| Model 三级优先级选择 | UXP/Photoshop surface |
| HTTP transport + retry + error mapping | 真实 API smoke test |
| 95+ 测试覆盖 | Model 过滤策略验证 |

## 2. 为什么选择纵向深入

### 2.1 横向发展的风险

如果继续横向发展（加更多命令、加 web surface、加更多 workflow），存在以下风险：

1. **架构债务累积**：Provider contract、dispatch 链路、error handling 等核心抽象尚未经过真实场景验证。如果后续发现设计问题，横向扩展越多，返工成本越大。
2. **Mock 验证盲区**：当前所有测试基于 mock provider，无法暴露真实网络场景下的问题（如 API 响应格式变化、超时边界、限流策略）。
3. **Provider 契约未闭环**：`discoverModels` 在 contract 中已定义，但 openai-compatible 未实现，导致 `refreshProfileModels` → `listProfileModels` → `setProfileDefaultModel` → `job submit` 完整链路在真实 provider 上无法走通。

### 2.2 纵向深入的价值

打通一条 **真实 provider 端到端链路** 可以：

1. **验证架构**：确认 provider contract、dispatch adapter、model selection、error taxonomy 在真实场景下合理
2. **发现并修复问题**：在架构稳定前修正设计缺陷，避免后续大规模返工
3. **建立信心**：有一条可演示的真实链路作为基准，后续横向扩展有据可依
4. **降低历史负担**：架构稳定后再加功能，每个新功能只需关注自身逻辑

## 3. 纵向深入路径分析

### 3.1 目标链路

```
Profile Save → Model Discovery → Set Default Model → Job Submit → Real Image
     ✅              ❌                  ✅               ✅            ❌
```

当前缺口：
- **Step 2 (Model Discovery)**：OpenAI-compatible provider 未实现 `discoverModels()`
- **Step 5 (Real Image)**：缺少真实 API 端到端验证

### 3.2 缺口详解：OpenAI `/v1/models` Endpoint

OpenAI-compatible API 的标准模型列表端点：

```http
GET /v1/models HTTP/1.1
Host: api.openai.com
Authorization: Bearer sk-...
```

**响应格式：**
```json
{
  "object": "list",
  "data": [
    {
      "id": "dall-e-3",
      "object": "model",
      "created": 1699809600,
      "owned_by": "openai-dev"
    },
    {
      "id": "gpt-4-vision-preview",
      "object": "model",
      ...
    }
  ]
}
```

**映射策略：** OpenAI model object → `ProviderModelInfo`

```ts
// 过滤：仅保留 image generation 相关模型
// 策略：ID 前缀匹配（dall-e-*、*image*）
// 映射：{ id: model.id, displayName: formatDisplayName(model.id) }
```

**关键设计决策：**

| 决策点 | 方案 | 理由 |
|--------|------|------|
| 模型过滤 | ID 前缀匹配（`dall-e-*`、`*image*`） | 宽松兼容社区 API，无需外部配置 |
| displayName | 格式化（`dall-e-3` → `Dall E 3`） | 用户友好，UI 直接可用 |
| 空结果 | 返回 `[]`（不抛错） | 合法场景：API 无 image 模型 |
| 错误处理 | 复用现有 error taxonomy | 与 invoke 路径一致 |

### 3.3 逐层变更分析

#### Layer 1: Transport 层（新增）

**文件：** `packages/providers/src/transport/openai-compatible/models.ts`（新建）

**职责：**
- 定义 `OpenAIModelObject`、`OpenAIModelsResponse` 类型
- 实现 `parseModelsResponse(raw: unknown): ProviderModelInfo[]`
- 模型过滤逻辑（ID 前缀匹配）
- displayName 格式化

**伪代码：**
```ts
export function parseModelsResponse(raw: unknown): ProviderModelInfo[] {
  // 1. 基础验证：object、object='list'、data 是数组
  // 2. 遍历 data，过滤非 image generation 模型
  // 3. 映射为 ProviderModelInfo[]
  // 4. 返回（空数组合法）
}
```

#### Layer 2: Provider 层（修改）

**文件：** `packages/providers/src/providers/openai-compatible/provider.ts`（修改）

**变更：**
- 实现 `discoverModels(config)` 方法
- 构造 `GET {baseURL}/v1/models` 请求
- 调用 `httpRequest()` 发起请求（复用现有 transport）
- 调用 `parseModelsResponse()` 解析响应
- 错误由 `httpRequest()` 的 error-map 自动处理

**伪代码：**
```ts
async discoverModels(config: OpenAICompatibleProviderConfig) {
  const url = new URL('/v1/models', config.baseURL).toString();
  const response = await httpRequest({
    url, method: 'GET',
    headers: { Authorization: `Bearer ${config.apiKey}`, ...config.extraHeaders },
    timeoutMs: config.timeoutMs,
  });
  return parseModelsResponse(response.response.data);
}
```

#### Layer 3: Shared Commands 层（无需修改）

**文件：** `packages/shared-commands/src/commands/profile-models.ts`

**状态：** ✅ 已完整实现

`refreshProfileModels()` 已包含完整的错误处理：
- Provider 未实现 `discoverModels` → `validation` error
- `discoverModels` 抛错 → `provider` error
- 成功 → 持久化 `profile.models`

**无需修改原因：** 该层通过 `Provider` 接口调用，不感知具体实现。只要 openai-compatible 实现了 `discoverModels()`，链路自动打通。

#### Layer 4: CLI 层（无需修改）

**文件：** `apps/cli/src/commands/profile/refresh-models.ts`

**状态：** ✅ 已完整实现

直接调用 `refreshProfileModels(profileId)`，无需任何变更。

### 3.4 端到端流程（目标态）

```bash
# Step 1: 保存 profile
$ imagen profile save openai-compatible '{
  "providerId": "openai-compatible",
  "displayName": "OpenAI API",
  "family": "openai-compatible",
  "baseURL": "https://api.openai.com",
  "apiKey": "sk-..."
}'
# → { profileId: "profile-1", ... }

# Step 2: 发现模型（本次实现）
$ imagen profile refresh-models profile-1
# → { models: [{ id: "dall-e-3", displayName: "Dall E 3" }, ...] }

# Step 3: 设置默认模型
$ imagen profile set-default-model profile-1 dall-e-3
# → { profileId: "profile-1", config: { defaultModel: "dall-e-3" }, ... }

# Step 4: 提交 job
$ imagen job submit provider-generate '{
  "profileId": "profile-1",
  "prompt": "A serene landscape with mountains and a lake"
}'
# → { jobId: "job-1", status: "completed", result: { assets: [...] } }
```

### 3.5 错误场景矩阵

| 场景 | HTTP | Transport Error | Provider Error | Shared-Commands | CLI 输出 |
|------|------|-----------------|----------------|-----------------|---------|
| 认证失败 | 401 | `auth_failed` | 抛错 | `provider` error | `error: "..."` → exit 1 |
| 网络断开 | ECONNRESET | `network_error` | 抛错 | `provider` error | `error: "..."` → exit 1 |
| 服务不可用 | 503 | 重试 3 次后 `upstream_unavailable` | 抛错 | `provider` error | `error: "..."` → exit 1 |
| Timeout | AbortSignal | `timeout` | 抛错 | `provider` error | `error: "..."` → exit 1 |
| 无效响应 | 200 + 缺 data | — | `invalid_response` | `provider` error | `error: "..."` → exit 1 |
| 无 image 模型 | 200 + 无匹配 | — | 返回 `[]` | 成功，`models: []` | `{ models: [] }` |
| 不支持 discovery | N/A | N/A | N/A | `validation` error | `error: "..."` → exit 1 |
| Profile 不存在 | N/A | N/A | N/A | `validation` error | `error: "..."` → exit 1 |

## 4. 实施计划

### 4.1 Change 概览

建议创建一个 OpenSpec change：**`openai-compatible-model-discovery`**

**Scope：**
- Transport 层：新增 `models.ts`（解析 + 过滤 + 映射）
- Provider 层：实现 `discoverModels()` 方法
- 测试：单元测试 + 集成测试
- 文档：更新 spec

**Explicit Non-Goals：**
- 不做 UXP/UI 集成
- 不做 model discovery 缓存策略（TTL、后台刷新）
- 不做跨 provider model 统一
- 不做 `provider-edit` workflow 的 providerOptions 绑定
- 不做真实 API 自动化 CI 测试（需外网，仅手动 smoke）

### 4.2 任务分解

#### Phase 1: Transport 层 — Model 响应解析

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 1.1 | 定义 `OpenAIModelObject`、`OpenAIModelsResponse` 类型 | `packages/providers/src/transport/openai-compatible/models.ts` | 0.5h |
| 1.2 | 实现 `parseModelsResponse()` — 基础验证 | 同上 | 0.5h |
| 1.3 | 实现模型过滤逻辑（ID 前缀匹配） | 同上 | 0.5h |
| 1.4 | 实现 `formatDisplayName()` | 同上 | 0.5h |
| 1.5 | 编写单元测试（成功、空数据、无效响应、过滤） | `packages/providers/tests/openai-compatible-models.test.ts` | 1.5h |

#### Phase 2: Provider 层 — discoverModels 实现

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 2.1 | 实现 `discoverModels(config)` 方法 | `packages/providers/src/providers/openai-compatible/provider.ts` | 1h |
| 2.2 | 编写单元测试（成功、401、timeout、空结果） | `packages/providers/tests/openai-compatible-provider.test.ts`（扩展） | 1.5h |
| 2.3 | 确保 `describe()` 中 capabilities 声明 model discovery | `packages/providers/src/providers/openai-compatible/provider.ts` | 0.5h |

#### Phase 3: 集成验证

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 3.1 | 扩展 shared-commands 集成测试（openai-compatible + refreshProfileModels） | `packages/shared-commands/tests/profile-models.test.ts`（扩展） | 1.5h |
| 3.2 | 全量回归测试 | 所有包 | 0.5h |

#### Phase 4: 文档与 Spec

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 4.1 | 更新 `openai-compatible-provider` spec（增加 discoverModels requirement） | `openspec/specs/openai-compatible-provider/spec.md` | 1h |
| 4.2 | 更新 CLI README（增加真实 provider 示例） | `apps/cli/README.md` | 0.5h |

**总预估：8-10 人时**

### 4.3 测试策略

| 层级 | 类型 | 内容 | 网络依赖 |
|------|------|------|---------|
| Transport | 单元测试 | `parseModelsResponse()` 各种输入 | 无 |
| Provider | 单元测试 | `discoverModels()` mock HTTP | 无（mock `httpRequest`） |
| Shared-Commands | 集成测试 | `refreshProfileModels()` + openai-compatible | 无（mock `discoverModels`） |
| CLI | 手动 smoke | 真实 API 端到端 | 需要 API key |

**原则：** 所有自动化测试不依赖外网。真实 API 验证通过手动 smoke 完成。

## 5. 关键文档入口

建议实现前先阅读：

- `AGENTS.md` — 架构边界与依赖规则
- `ARCHITECTURE.md` — 完整架构说明
- `STATUS.md` — 项目阶段
- `docs/HANDOFF_2026-04-29_PROVIDER_MODEL_CLI.md` — 上一轮交付上下文
- `openspec/specs/provider-contract/spec.md` — Provider 接口契约（含 `discoverModels`）
- `openspec/specs/openai-compatible-provider/spec.md` — OpenAI-compatible provider spec
- `openspec/specs/provider-profile-discovery/spec.md` — Profile discovery 语义
- `openspec/specs/model-selection/spec.md` — Model 三级优先级
- `packages/providers/src/transport/openai-compatible/http.ts` — HTTP transport 实现
- `packages/providers/src/providers/openai-compatible/provider.ts` — Provider 实现
- `packages/shared-commands/src/commands/profile-models.ts` — refreshProfileModels 实现

## 6. 暂不建议做的事情

### 6.1 暂不建议做 Model Discovery 缓存策略

当前 `refreshProfileModels()` 是用户主动触发，`listProfileModels()` 从 `profile.models` 读取。暂不引入 TTL、后台自动刷新、过期检测等缓存策略。等真实使用场景明确后再设计。

### 6.2 暂不建议做跨 Provider Model 统一

不同 provider 的 model 列表格式各异（OpenAI `/v1/models`、Anthropic `/v1/models`、自定义 API），暂不做统一抽象。先在 openai-compatible 上验证模式，后续 provider 参照实现。

### 6.3 暂不建议做真实 API 自动化 CI

真实 API 调用依赖外网和 API key，不适合作为 CI 的一部分。手动 smoke 验证即可。

### 6.4 暂不建议做 UXP/UI

当前阶段聚焦 CLI 端纵向打通。UXP adapter（`secureStorage`、`localFileSystem`）和 React UI 留到架构稳定后再做。

## 7. 后续展望

本次纵向打通后，项目将具备：

1. **一条完整的真实 provider 链路**：profile → discovery → selection → submit → real image
2. **经过验证的架构**：provider contract、dispatch、error handling 在真实场景下确认合理
3. **可复制的模式**：后续新增 provider（如 Anthropic、Stability AI）可参照 openai-compatible 的实现模式

之后可以考虑：
- **横向扩展**：新增 provider（Anthropic、Stability AI 等）
- **Edit 操作**：实现 `provider-edit` workflow 的完整链路
- **UXP Surface**：在架构稳定后开发 Photoshop 插件 UI
- **Model 管理增强**：缓存策略、模型能力声明、跨 provider 模型对比

## 8. 下个 Session 的建议开场指令

可以直接说：

```text
请基于 docs/HANDOFF_2026-04-29_VERTICAL_REAL_PROVIDER.md，创建 OpenSpec change: openai-compatible-model-discovery。
目标是实现 OpenAI-compatible provider 的 discoverModels() 方法，打通真实 provider 端到端链路。
```
