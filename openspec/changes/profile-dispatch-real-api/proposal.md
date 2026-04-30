## Why

`profile-dispatch-e2e` 已建立完整的 profile dispatch 链路（profile save → model discovery → set default model → job submit），但端到端验证仅使用了 mock provider。真实 API（n1n.ai openai-compatible 中转站）从未被验证过。

同时，`openai-compatible` provider 当前只支持 `generate` 操作，显式拒绝 `edit`。新版 OpenAI Images API 的 edit 端点已改为 JSON body（通过 `image_url` 引用输入图片），与 generate 共享相同的 transport 路径和响应结构，实现成本很低。

本变更补齐两个缺口：让 openai-compatible provider 支持 edit 操作，并通过 n1n.ai 真实 API smoke 测试验证 generate + edit 的完整端到端链路。

## What Changes

1. **OpenAI-compatible provider 支持 edit 操作**：新增 `buildEditRequestBody()`，将 `CanonicalImageJobRequest` 中的 `inputAssets` 映射为 `images: [{ image_url }]`；`invoke()` 移除 `operation !== 'generate'` 拒绝，按 operation 路由到 `/v1/images/generations` 或 `/v1/images/edits`。

2. **Smoke 测试扩展**：新增 n1n.ai 专用环境变量 `IMAGEN_SMOKE_N1N_API_KEY` + `IMAGEN_SMOKE_N1N_BASE_URL`；新增 `provider-edit` workflow 的 smoke 测试用例（generate 产出 base64 → 构造 data URL → edit 消费）。

3. **Spec 更新**：`openai-compatible-provider` spec 中移除 "Edit invocation is rejected" 场景，新增 edit 调用、edit request body 构造、inputAssets 映射等场景。

## Capabilities

### New Capabilities
- `openai-compatible-provider-edit`: `openai-compatible` provider 支持 `operation='edit'`，通过 `POST /v1/images/edits` (JSON body) 调用上游 API，复用现有 HTTP transport 和响应解析。

### Modified Capabilities
- `openai-compatible-provider`（openspec/specs/openai-compatible-provider/spec.md）: 移除 "Edit invocation is rejected in this phase" 场景，新增 edit 相关 requirement 和 scenario。

## Impact

- `packages/providers/src/providers/openai-compatible/provider.ts` — `invoke()` 移除 edit 拒绝，按 operation 路由
- `packages/providers/src/transport/openai-compatible/build-request.ts` — 新增 `buildEditRequestBody()`
- `apps/cli/tests/smoke/setup.ts` — 新增 `IMAGEN_SMOKE_N1N_*` 环境变量支持
- `apps/cli/tests/smoke/end-to-end.test.ts` — 新增 edit workflow smoke 测试用例
- 无 API breaking change（`CanonicalImageJobRequest` 契约不变，`inputAssets` 已有 `url` 和 `data` 字段）
- 不影响 `core-engine` / `shared-commands` / `workflows` 的 runtime 逻辑
