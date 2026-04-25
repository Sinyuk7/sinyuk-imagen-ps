# providers Status

## 1. Confirmed Baseline

### Responsibilities
- provider contract 与 descriptor（`describe` / `validateConfig` / `validateRequest` / `invoke`）
- config / request 校验（Zod 4）
- provider registry 的 `list` / `get`
- mock provider（用于无网络验证）
- `openai-compatible` provider 的 HTTP 调用、响应归一化、错误映射
- transport 层的有限 retry（网络错误、429、5xx）与 error mapping
- **将 PRD 定义的 `Provider` 实例适配为 `core-engine` 的 `ProviderDispatchAdapter` 抽象边界**

### Boundaries
- 负责隔离 provider-specific 语义，禁止 provider 参数语义泄漏到 `core-engine`
- 不负责：runtime lifecycle、job store、facade 命令编排、settings / secret 持久化、host IO、UI model
- 不拥有：cancel / abandon / durable history
- `core-engine` 已完成高度实现并暴露 `ProviderDispatchAdapter` / `ProviderDispatcher` / `ProviderRef` / `Asset` 等契约；providers 层只需消费这些契约，无需等待 engine 建设

### Non-goals
- Gemini native、xAI native、ComfyUI provider
- auto-discovery、plugin loading
- streaming、callback、webhook、websocket、async polling
- cross-provider 参数统一
- UI-facing provider view model 或 model matrix

### Constraints
- 唯一 provider family：`openai-compatible`（按 profile 不按厂商）
- HTTP 层：Node 原生 `fetch`，禁止裸 fetch
- Schema：Zod 4（`core-engine` 已依赖 `zod ^4.3.6`，provider 层可直接复用）
- TypeScript：5.9（`package.json` 已对齐到 `^5.9.0`）
- 测试：Vitest 4（`package.json` 已对齐到 `^4.1.0`）
- Retry：最多 2~3 次，指数退避，支持 `AbortSignal`
- 不引入官方 SDK
- 不直接实现 `saveProviderConfig` / `getProviderConfig`（属 facade + adapter）

## 2. Open Questions / Risks
- [x] `AssetRef` 已在 `src/contract/request.ts` 中明确为 `@imagen-ps/core-engine` `Asset` 的 alias；当前阶段不再引入额外平行资源模型
- [x] `Provider` 与 `ProviderDispatchAdapter` 之间的桥接已在 `src/contract/provider.ts` 中收敛为显式 `ProviderDispatchBridge#createDispatchAdapter(args)` 契约，当前不让 registry 直接拥有该职责
- [x] `package.json` 依赖基线已对齐：加入 `zod`、`@types/node`、`rimraf`，并升级到 TypeScript 5.9 / Vitest 4
- [x] `src/index.ts` 已改为导出稳定 contract 与 bridge 相关公开面
- [x] `clean` 脚本已切换为 `rimraf dist`
- [x] `Provider` 的 `validateConfig` / `validateRequest` / `invoke` 失败行为已在 `spec.md` 与 `provider.ts` JSDoc 中约束：必须抛出可被映射为 `JobError` 的结构化错误
- [ ] `ProviderDescriptor.configSummary` 当前仅收敛为可选摘要对象；后续是否需要 schema summary 仍待在 refine 或实现阶段确认
- [x] `ProviderDispatchBridge` 已按独立工厂函数 `createDispatchAdapter()` 实现并验证可行；当前保持独立工厂模式
- [ ] `ProviderInvokeResult.raw` 当前保留为调试期开口；是否长期保留为稳定公开字段仍待后续 change 决定
- [ ] 真实 OpenAI-compatible provider 的接入环境（relay URL、apiKey、model name）尚未确定 → 移至 `implement-openai-compatible-provider` change 调研

## 3. Planned Changes (Ordered)

### Change 1: stabilize-package-contract
- goal: 修正 package.json 依赖基线并建立 provider contract 类型层，记录通用接入约束与错误行为映射，使模块拥有稳定的公开面
- scope: package.json、src/contract/、src/index.ts 的导出声明；收敛 `AssetRef`、`Provider→Adapter` 桥接 shape、验证/调用失败错误映射
- out_of_scope: 具体 provider 实现、registry 实现、transport 实现、Provider→Adapter 的完整适配逻辑、测试、真实 provider 实例调研
- why_now: 所有后续代码实现都依赖正确的工具链与类型契约；空 index.ts 导致模块无法被外部引用；`AssetRef` 与 `Provider→Adapter` 桥接 shape 必须先定义才能开始实现；错误行为若无约束，后续各 provider 实现将各自发明异常模式
- depends_on: none
- touches:
  - `package.json`
  - `src/contract/provider.ts`
  - `src/contract/capability.ts`
  - `src/contract/config.ts`
  - `src/contract/request.ts`
  - `src/contract/result.ts`
  - `src/contract/diagnostics.ts`
  - `src/index.ts`
- acceptance_criteria:
  - package.json 包含 zod、@types/node、rimraf，TypeScript >=5.9，Vitest >=4.1
  - `AssetRef` 类型已在 contract 层定义（或经文档确认等价于 `Asset`）
  - `Provider` 接口与 `ProviderDispatchAdapter` 桥接的签名已确定（至少以 interface 形式存在）
  - `src/index.ts` 导出所有 contract 类型与接口
  - build 命令可以成功编译（无实现代码时至少类型层通过）
  - `clean` 脚本跨平台可用
  - `openai-compatible` baseline 的通用接入约束（`baseURL`、`apiKey`、`defaultModel`、`extraHeaders`、`timeoutMs`）已记录在 contract 注释中；针对具体真实 provider 实例（relay URL、auth 方式、model 命名、字段差异）的调研留待 `implement-openai-compatible-provider` change 完成
- openspec_timing: now

### Change 2: implement-registry-and-mock
- goal: 实现 provider registry 与 mock provider，使模块支持注册、列出、无网络调用，并能以 `ProviderDispatchAdapter` 形式被 `core-engine` 消费
- scope: src/registry/、src/providers/mock/、src/shared/ 中的基础辅助、Provider→Adapter 的最小适配逻辑
- out_of_scope: openai-compatible provider、真实 HTTP transport、端到端集成测试
- why_now: mock provider 是 Phase 2 验收核心，也是验证 registry、contract shape 和 `ProviderDispatchAdapter` 桥接的最快方式
- depends_on: stabilize-package-contract
- status: **已实现**
- touches:
  - `src/registry/provider-registry.ts`
  - `src/registry/builtins.ts`
  - `src/registry/index.ts`
  - `src/providers/mock/descriptor.ts`
  - `src/providers/mock/config-schema.ts`
  - `src/providers/mock/request-schema.ts`
  - `src/providers/mock/provider.ts`
  - `src/providers/mock/index.ts`
  - `src/bridge/create-dispatch-adapter.ts`
  - `src/bridge/index.ts`
  - `src/shared/id.ts` (tentative)
  - `src/shared/asset-normalizer.ts` (tentative)
  - `src/index.ts`（追加 registry / mock / bridge 导出）
- acceptance_criteria:
  - [x] registry 支持 register / get / list
  - [x] mock provider 可被注册、describe、validateConfig、validateRequest、invoke
  - [x] mock provider 可配置延迟与失败模式
  - [x] mock provider 可通过适配逻辑生成符合 `core-engine` `ProviderDispatchAdapter` 契约的对象
- openspec_timing: now
- deviations:
  - `z.record()` 在 Zod 4 中需显式传入 keyType 与 valueType（`z.record(z.string(), z.string())`），与 Zod 3 的单参数用法不同
  - mock config schema 中 `displayName` 与 `family` 保持为 required，以确保 `MockProviderConfig` 可赋值给 `OpenAICompatibleProviderConfig`
  - 新增 `src/bridge/` 目录存放 `createDispatchAdapter`，比原计划（放在 `src/shared/` 或内联）更清晰
  - `src/shared/id.ts` 当前未被 `asset-normalizer.ts` 使用，但保留为后续 provider 复用准备

### Change 3: implement-openai-compatible-provider
- goal: 实现 openai-compatible provider 的完整链路，包括 config/request 校验、HTTP 调用、响应解析、错误映射与 retry，并能以 `ProviderDispatchAdapter` 形式被 `core-engine` 消费
- scope: src/providers/openai-compatible/、src/transport/openai-compatible/、对应的 ProviderDispatchAdapter 适配逻辑
- out_of_scope: runtime 集成测试、facade 命令实现、settings 持久化
- why_now: Phase 1 要求 openai-compatible provider 可完成 config/request 校验并具备 invoke 能力；这是当前唯一真实 provider family
- depends_on: stabilize-package-contract、implement-registry-and-mock（registry 提供注册机制，mock 提供对比验证）
- touches:
  - `src/providers/openai-compatible/descriptor.ts`
  - `src/providers/openai-compatible/config-schema.ts`
  - `src/providers/openai-compatible/model-policy.ts`
  - `src/providers/openai-compatible/provider.ts`
  - `src/transport/openai-compatible/http.ts`
  - `src/transport/openai-compatible/build-request.ts`
  - `src/transport/openai-compatible/parse-response.ts`
  - `src/transport/openai-compatible/retry.ts`
  - `src/transport/openai-compatible/error-map.ts`
  - `src/index.ts`（追加 openai-compatible 导出）
- acceptance_criteria:
  - openai-compatible provider 可通过 registry 注册与获取
  - config 与 request 校验使用 Zod 并返回结构化错误
  - HTTP 调用使用统一封装的 transport（非裸 fetch）
  - 对 429/5xx/网络错误执行有限指数退避 retry
  - 错误映射到标准 failure taxonomy
  - 响应被归一化为标准 result shape
  - 可通过适配逻辑生成符合 `core-engine` `ProviderDispatchAdapter` 契约的对象
- openspec_timing: now

### Change 4: add-provider-verification-harness
- goal: 为 contract、registry、mock、openai-compatible provider 建立测试覆盖
- scope: 当前模块内的测试代码
- out_of_scope: 跨模块 integration test（runtime/facade/CLI 端到端）
- why_now: PRD 第17节明确要求 contract tests、mock tests、openai-compatible tests；在实现完成后应立即补测试以锁定行为
- depends_on: implement-registry-and-mock、implement-openai-compatible-provider
- touches:
  - `src/**/*.test.ts` (tentative)
  - 或 `tests/` 目录 (tentative)
- acceptance_criteria:
  - contract tests 覆盖 config schema、request schema、capability descriptor shape
  - mock provider tests 覆盖 happy path、forced failure、diagnostics output
  - openai-compatible provider tests 覆盖 request build、auth header、timeout、retry on 429/5xx、error map、response parse（使用 mock fetch）
  - `npm test` 可以完整执行并通过
- openspec_timing: later

## 4. Execution Order
1. stabilize-package-contract → 修正工具链并定义类型契约（含 AssetRef 与 Provider→Adapter 桥接、错误行为映射），记录通用接入约束，解除“模块无公开面”的阻塞
2. **OpenSpec refine 阶段** → 基于 stabilize-package-contract 已建立的 contract 层和通用约束，更新 PRD / SPEC / STATUS，收敛错误 shape、config shape、error mapping、retry policy、model policy 等设计细节
3. **implement-registry-and-mock → ✅ 已完成** 建立可注册、可调用、可被 engine 消费的最小运行面
4. implement-openai-compatible-provider → 补充真实 provider 链路，完成 Phase 1 核心交付
5. add-provider-verification-harness → 锁定行为，为后续 runtime 集成提供信任基础

## 5. Suggested Next OpenSpec Change
- name: implement-registry-and-mock
- reason: `stabilize-package-contract` 已完成并归档，当前最大的阻塞不再是类型缺口，而是模块仍缺少可运行的最小执行面。没有 registry，就无法验证 provider 的注册/列出/获取路径；没有 mock provider，就无法在不接入真实网络的前提下验证 `Provider` contract、`ProviderDispatchBridge` 与 `core-engine` `ProviderDispatchAdapter` 的装配是否成立。相比直接进入 `openai-compatible` 真实接入，先做 registry + mock 能更快暴露 contract 是否足够、bridge 设计是否顺手、错误行为是否可被 runtime 消费。
- expected_outcome: `src/registry/` 提供稳定的 `register / get / list` 能力；`src/providers/mock/` 提供可 `describe`、`validateConfig`、`validateRequest`、`invoke` 的 mock provider，并支持延迟/失败模式；mock provider 可通过既定 bridge 生成符合 `core-engine` `ProviderDispatchAdapter` 契约的对象；`src/index.ts` 追加 registry / mock 的稳定导出，为后续 `implement-openai-compatible-provider` 与 verification harness 提供运行基座

## 6. Notes
- `core-engine` 已实现高度完整（7 个 change 全部完成），包括 `Asset`、`ProviderDispatchAdapter`、`ProviderDispatcher`、`ProviderRef` 等契约；provider 层可直接消费这些契约，无需等待 engine
- `core-engine` 的 `package.json` 同样存在 TS 5.7 / Vitest 3.0 的基线偏差，但已包含 `zod ^4.3.6` 和 `rimraf ^6.1.3`
- `stabilize-package-contract` 已落地 `src/contract/capability.ts`、`config.ts`、`request.ts`、`diagnostics.ts`、`result.ts`、`provider.ts` 与 `src/index.ts` 稳定导出，且 `pnpm --filter @imagen-ps/providers build` 已通过
- `spec.md` 已补充验证/调用失败的结构化错误 requirement；`provider.ts` 的 JSDoc 已同步约束错误映射行为
- PRD 建议目录结构包含 `src/shared/`，但 SPEC 未明确 shared 职责；shared 内容归入实现 change 时再定
- PRD 与 SPEC 在职责与阶段划分上无冲突，可视为同一意图的不同粒度表达
- 当前不创建 `CONTRACTS.md`、`TESTING.md`、`RUNBOOK.md`、`examples/`，符合 SPEC 的刻意省略决策
