## Why

`provider-edit` workflow 缺少 `providerProfileId` 和 `profileId` 模板绑定，导致无法复用已为 `provider-generate` 建立的 profile dispatch 链路。当用户通过 `submitJob({ workflow: 'provider-edit', input: { profileId: 'xxx', ... } })` 提交 edit job 时，`runtime.ts:resolveProfileId()` 找不到 profile 标识，dispatch 失败。本变更让 edit 与 generate 在 profile dispatch 字段上保持一致，修复端到端 submit 路径。

## What Changes

1. `provider-edit` workflow step definition 添加 `providerProfileId: '${providerProfileId}'` 和 `profileId: '${profileId}'` 模板绑定，使其与 `provider-generate` 对齐。
2. 更新 `provider-edit` 的 JSDoc contract 说明，新增 `providerProfileId` / `profileId` 字段。
3. `shared-commands/tests/commands.test.ts` 增加 `provider-edit` 的 profile dispatch 集成测试（auto-route + explicit providerProfileId + fallback profileId）。
4. `workflows/tests/fixtures.ts` 的 `generateValidEditInput` 增加 `providerOptions` 支持（未来 model selection 预留）。

## Capabilities

### New Capabilities
- `provider-edit-profile-dispatch`: `provider-edit` workflow 支持通过 `profileId` / `providerProfileId` 提交 edit job，复用 `provider-generate` 已建立的 profile dispatch 链路。

### Modified Capabilities
- `builtin-workflow-contract`（openspec/specs/builtin-workflow-contract/spec.md）: `provider-edit` step definition 的输入字段增加 `providerProfileId` 和 `profileId` 绑定，与 `provider-generate` 的 profile dispatch 字段对齐。

## Impact

- `packages/workflows/src/builtins/provider-edit.ts` — step definition 变更
- `packages/shared-commands/tests/commands.test.ts` — 新增 3 个集成测试用例
- `packages/workflows/tests/fixtures.ts` — `generateValidEditInput` 扩展
- 无 API breaking change（新增可选字段，显式 `provider: 'mock'` 用法不受影响）
- 不影响 `core-engine` / `providers` / `shared-commands` 的 runtime 逻辑（复用既有 `resolveProfileId` + `createProfileAwareDispatchAdapter`）
