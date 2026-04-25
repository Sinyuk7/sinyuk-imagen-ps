# providers Status

## 1. 已确认的基线

### 职责
- provider contract 与 descriptor：`describe` / `validateConfig` / `validateRequest` / `invoke`
- config / request validation：Zod 4
- provider registry：`list` / `get`
- mock provider：用于无网络验证
- `openai-compatible` provider：HTTP 调用、响应归一化、错误映射、有限 retry
- `openai-compatible` provider：retry diagnostics 透传到 `ProviderInvokeResult.diagnostics`
- `Provider` 实例通过 `ProviderDispatchAdapter` 适配给 `core-engine`

### 边界
- 负责隔离 provider-specific 语义，禁止把 provider 参数语义泄漏到 `core-engine`
- 不负责 runtime lifecycle、job store、facade 命令编排、settings / secret 持久化、host IO、UI model
- 不持有 cancel / abandon / durable history
- `core-engine` 已暴露 `ProviderDispatchAdapter` / `ProviderDispatcher` / `ProviderRef` / `Asset`

### 非目标
- Gemini native、xAI native、ComfyUI provider
- auto-discovery、plugin loading
- streaming、callback、webhook、websocket、async polling
- cross-provider 参数统一
- UI-facing provider view model 或 model matrix

### 约束
- 唯一 provider family：`openai-compatible`
- HTTP 层：Node 原生 `fetch`，禁止裸 fetch 直连 provider
- Schema：Zod 4，可直接复用 `core-engine` 依赖
- TypeScript：5.9
- 测试：Vitest 4
- Retry：有限指数退避，支持 `AbortSignal`
- 不引入官方 SDK
- 不直接实现 `saveProviderConfig` / `getProviderConfig`

## 2. 当前状态

### 已完成
- `AssetRef` 已在 `src/contract/request.ts` 中明确为 `@imagen-ps/core-engine` `Asset` 的 alias
- `Provider` 与 `ProviderDispatchAdapter` 的 bridge 已在 `src/contract/provider.ts` 中收敛为显式契约
- `package.json` 已对齐依赖基线：`zod`、`@types/node`、`rimraf`，以及 TypeScript 5.9 / Vitest 4
- `src/index.ts` 已导出稳定的 contract 与 bridge 公共 API
- `clean` 脚本已切换为 `rimraf dist`
- `Provider` 的失败行为已在 `spec.md` 与 `provider.ts` JSDoc 中约束为可映射 `JobError` 的结构化错误
- `ProviderDispatchBridge` 已通过独立工厂函数 `createDispatchAdapter()` 实现并验证
- `implement-openai-compatible-provider` 已完成：HTTP transport、retry、error-map、request build、response parse、provider 实现、registry 注册
- `openai-compatible` 已补充 structured diagnostics，并通过测试验证

### 仍然保留的开放项
- `ProviderDescriptor.configSummary`：当前仍是可选摘要对象，是否需要 schema summary 仍待后续 refine 或实现确认
- `ProviderInvokeResult.raw`：当前仍保留为调试开口，是否长期作为稳定公开字段仍待后续 change 决定

## 3. 计划中的后续变更

### Change 1: stabilize-package-contract
- 目标：修正 package.json 依赖基线并建立 provider contract 类型层
- 当前状态：已完成

### Change 2: implement-registry-and-mock
- 目标：实现 provider registry 与 mock provider，支持注册、列举和无网络调用
- 当前状态：已完成

### Change 3: implement-openai-compatible-provider
- 目标：实现 openai-compatible provider 的完整链路，包括 config/request validation、HTTP 调用、响应归一化、错误映射、retry 与 diagnostics
- 当前状态：已完成

### Change 4: add-provider-verification-harness
- 目标：为 contract、registry、mock、openai-compatible provider 建立测试覆盖
- 当前状态：部分完成，已补充 openai-compatible 关键行为测试；其余 contract / registry / mock 测试可后续补齐

## 4. 备注

- `openai-compatible` 当前按 profile 而非厂商品牌理解
- `ProviderInvokeResult.raw` 与 `ProviderDescriptor.configSummary` 的长期形态暂定
- 当前未创建 `CONTRACTS.md`、`TESTING.md`、`RUNBOOK.md`、`examples/`
