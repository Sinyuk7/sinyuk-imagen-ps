## 1. 准备测试基础设施

- [x] 1.1 检查并补齐 `packages/workflows` 的 `vitest.config.ts` 与 `tsconfig.json`，将跨包依赖（`@imagen-ps/core-engine`、`@imagen-ps/providers`）解析到 workspace 源码入口，而不是 `dist`
- [x] 1.2 在 `packages/workflows/tests/` 下创建 `fixtures.ts`（或 `test-utils.ts`），提供可复用的辅助函数：
  - `createMockBridgeAdapter(options?)`：基于 `mock provider` 构造 `ProviderDispatchAdapter`
  - `createOpenAICompatibleBridgeAdapter(options?)`：基于 `openai-compatible` provider 构造 `ProviderDispatchAdapter`
  - `createRuntimeWithBuiltins(adapters?)`：预置 `builtinWorkflows` 与给定 adapters 的 `createRuntime` 快捷构造器
  - `generateValidGenerateInput(overrides?)` / `generateValidEditInput(overrides?)`：生成合法/边界 job input 的辅助函数
- [x] 1.3 运行 `pnpm --filter @imagen-ps/workflows test`，确认现有 `builtins.test.ts` 仍全部通过

## 2. 边界输入与 deep-freeze 兼容性测试

- [x] 2.1 在 `packages/workflows/tests/` 下创建 `cross-package-compat.test.ts`
- [x] 2.2 编写 `provider-generate` 边界输入测试：
  - 缺失可选字段（`providerOptions`、`output` 未提供）时，workflow shape 仍合法
  - job input 包含额外字段时，验证是否被正确透传或忽略
- [x] 2.3 编写 `provider-edit` 边界输入测试：
  - 空 `inputAssets` 数组
  - 缺失可选字段时，workflow shape 仍合法
- [x] 2.4 编写 deep-freeze / immutability 跨包测试：
  - workflow spec 经 `createRuntime({ initialWorkflows: builtinWorkflows })` 装配后，builtin workflows 仍保持冻结状态
  - runtime 执行完成后，workflow registry 中注册的 workflow 对象未被修改

## 3. mock provider bridge 错误路径测试

- [x] 3.1 编写 dispatch 失败场景：
  - `mock provider` `failMode: { type: 'always' }` 时，`provider-generate` 执行失败并返回结构化错误
  - 错误 category 为 `'provider'`，且 message 保留原始信息
- [x] 3.2 编写 validation 失败场景：
  - job input 缺少必需字段（如 `prompt`）时，runtime 执行失败并返回 `'validation'` category 错误
  - `provider-edit` 缺少 `inputAssets` 时，同样触发 validation 错误
- [x] 3.3 编写 provider 未注册场景：
  - runtime 未注册 `mock` adapter 时，执行 `provider-generate` 应返回明确的未找到 provider 错误
- [x] 3.4 编写 bridge 返回异常 shape 场景：
  - 自定义 stub adapter 返回不符合 `ProviderInvokeResult` 的 shape 时，验证 runtime 的处理行为（至少不崩溃，并记录到结果中）

## 4. 真实 provider bridge 集成 happy path 测试

- [x] 4.1 使用 `openai-compatible` provider 构造 `ProviderDispatchAdapter`
- [x] 4.2 编写 `provider-generate` 与 `openai-compatible` adapter 的最小 happy path 测试：
  - 验证 workflow 发出的 `params` 能被 `openai-compatible` bridge 正确消费（调用 `validateRequest` 并通过）
  - 由于不触发真实 HTTP，使用 `mock` transport 或 stub 化 `fetch` 来断言 request shape
- [x] 4.3 编写 `provider-edit` 与 `openai-compatible` adapter 的边界拒绝测试：
  - 验证当前 `openai-compatible` provider 会在 transport 前拒绝 `edit` 调用
  - 将其记录为当前兼容性边界，而不是成功路径

## 5. 验证、记录与收尾

- [x] 5.1 运行完整测试套件 `pnpm --filter @imagen-ps/workflows test`，确认所有新增与既有测试通过
- [x] 5.2 若测试暴露出现有契约与真实 provider 不兼容的问题，记录到 `packages/workflows/STATUS.md` 或 `packages/workflows/OPEN_ITEMS.md`
- [x] 5.3 更新 `packages/workflows/STATUS.md` 中 §2 Open Questions / Risks 的验证缺口状态
- [x] 5.4 检查新增测试代码的 JSDoc 与注释，确保关键 helper 与构造器有简短说明
