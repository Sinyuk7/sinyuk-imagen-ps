## 1. Mock Provider Model Echo

- [x] 1.1 修改 `packages/providers/src/providers/mock/provider.ts` 的 `invoke` 方法：从 `request.providerOptions?.model` 读取 model，fallback 到 `config.defaultModel`，再 fallback 到 `'mock-image-v1'`；将 selected model 写入 `raw.model`。
- [x] 1.2 更新 `packages/providers` 现有 mock provider 单元测试：验证 `raw.model` 存在且符合三级 fallback 行为（explicit model、config defaultModel、hardcoded fallback）。
- [x] 1.3 运行 `pnpm --filter @imagen-ps/providers test` 确认通过，修复因 `raw` 形态变更导致的 assertion 失败。

## 2. Workflow Step Input 扩展

- [x] 2.1 修改 `packages/workflows/src/builtins/provider-generate.ts`：在 `generateStep.input` 中增加 `providerOptions: '${providerOptions}'` 模板绑定。
- [x] 2.2 更新 `packages/workflows` 现有测试：验证 `provider-generate` workflow step input 包含 `providerOptions` 绑定。
- [x] 2.3 运行 `pnpm --filter @imagen-ps/workflows build && pnpm --filter @imagen-ps/workflows test` 确认通过。

## 3. Profile-Aware Dispatch Adapter Model Injection

- [x] 3.1 修改 `packages/shared-commands/src/runtime.ts` 中 `createProfileAwareDispatchAdapter` 的 `dispatch` 方法：resolve 后，从 `resolvedConfig.providerConfig` 中读取 `defaultModel`；兼容两种 params 结构（含 `request` key 和不含 `request` key），若 request 部分的 `providerOptions.model` 缺失，则注入 `defaultModel` 到新构造的 params 中（不 mutate 原 params）。
- [x] 3.2 确认 `createDefaultProviderConfigResolver` 每次 `resolve()` 都通过 `getProviderProfileRepository().get(profileId)` 读取最新 profile（无缓存），以支持 profile 更新后立即生效。通过 Task 4.2 的 profile 更新测试作为验证。

## 4. 自动化测试 — Model Selection 矩阵

- [x] 4.1 在 `packages/shared-commands` 测试中新增 model selection 测试文件，覆盖以下场景：
  - profile A `defaultModel = 'mock-a'`，dispatch profile A → 使用 `mock-a`
  - profile B `defaultModel = 'mock-b'`，dispatch profile B → 使用 `mock-b`
  - job input `providerOptions.model = 'override'` + profile A → 使用 `override`
  - profile 无 `defaultModel`，job input 无 explicit model → 使用 `mock-image-v1`
- [x] 4.2 新增 profile 更新后立即生效测试：更新 profile A `defaultModel` 从 `mock-a` 到 `mock-a-v2`，下一次 dispatch 使用 `mock-a-v2`。
- [x] 4.3 运行 `pnpm --filter @imagen-ps/shared-commands test` 确认全部通过。

## 5. 全链路构建验证

- [x] 5.1 运行全链路构建和测试：
  ```
  pnpm --filter @imagen-ps/providers build
  pnpm --filter @imagen-ps/workflows build
  pnpm --filter @imagen-ps/shared-commands build
  pnpm --filter @imagen-ps/shared-commands test
  pnpm --filter @imagen-ps/cli build
  pnpm --filter @imagen-ps/cli test
  ```
- [x] 5.2 确认无回归：所有包的现有测试全部通过，无 TypeScript 编译错误。
