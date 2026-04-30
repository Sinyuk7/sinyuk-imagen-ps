## Context

`provider-edit` workflow step definition（`packages/workflows/src/builtins/provider-edit.ts`）缺少 `providerProfileId` 和 `profileId` 模板绑定，而 `provider-generate` 在上一轮 change（`profile-dispatch-e2e`）中已经添加。

当用户通过 `submitJob({ workflow: 'provider-edit', input: { profileId: 'xxx', prompt: '...', inputAssets: [...] } })` 提交时：
1. `submit-job.ts` 检测 `profileId` → 注入 `provider: 'profile'` ✅
2. runner 解析后，`params` 中找不到 `profileId`（workflow step 未绑定）❌
3. `runtime.ts:resolveProfileId()` 返回 `undefined`
4. `createProfileAwareDispatchAdapter` 抛错

修复方式：**让 `provider-edit` 的 step definition 与 `provider-generate` 在 profile dispatch 相关字段上完全对齐**。`runtime.ts` 的 `resolveProfileId` + `createProfileAwareDispatchAdapter` 逻辑已经通用化，不需要改动。

## Goals / Non-Goals

**Goals:**
- `provider-edit` step definition 添加 `providerProfileId` / `profileId` 模板绑定
- `provider-edit` 支持通过 `profileId` 或 `providerProfileId` 提交 edit job
- 集成测试覆盖 edit + profile dispatch 的端到端路径
- 显式 `provider: 'mock'` 的用法不受影响

**Non-Goals:**
- 新增 provider edit 的 transport 实现（edit job 的 mock/real 生成逻辑，属于 `providers` 包已有范畴）
- provider-edit 的 `providerOptions` 透传（当前 `provider-edit` step 未绑定该字段，暂不纳入）
- `core-engine` / `shared-commands` 的 runtime 逻辑改动（复用既有链路）

## Decisions

### 决策 1：直接修改 `provider-edit` step definition，添加 `providerProfileId` 和 `profileId` 绑定
**理由**：`provider-generate` 已验证模式。`runtime.ts` 的 `resolveProfileId` 逻辑期望这两个字段存在，不添加则 edit workflow 无法复用 profile dispatch。

**替代方案**：在 `createProfileAwareDispatchAdapter` 中硬编码 fallback 逻辑（如根据 workflow name 推断）— 拒绝。这会引入 workflow-specific 逻辑到 adapter，破坏 `core-engine` / `shared-commands` 的 host-agnostic 边界。

### 决策 2: `provider-edit` 不绑定 `providerOptions`
**理由**：当前 edit 的 provider 实现（mock）未消耗 `providerOptions`。此字段需要 provider-side 支持后再绑定。保持最小变更原则。

## Risks / Trade-offs

- [低风险] 新增字段为可选模板绑定，不破坏显式 `provider: 'mock'` 的现有用法。`isTemplateLiteralPlaceholder` 已在 `runtime.ts` 中处理未提供字段时的字面量占位符问题。
- [KnightMove 风险] `provider-edit` 的 `providerOptions` 未来若需支持，需要再一轮 change 来绑定。

## Open Questions

无。
