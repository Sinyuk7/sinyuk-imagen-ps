## Why

`stabilize-package-contract` 已完成并归档，`packages/providers` 已拥有稳定的 contract 类型层与桥接签名，但模块仍停留在"有类型、无运行面"的状态。没有 registry，就无法验证 provider 的注册/列出/获取路径；没有 mock provider，就无法在不接入真实网络的前提下验证 `Provider` contract、`ProviderDispatchBridge` 与 `core-engine` `ProviderDispatchAdapter` 的装配是否成立。相比直接进入 `openai-compatible` 真实接入，先做 registry + mock 能更快暴露 contract 是否足够、bridge 设计是否顺手、错误行为是否可被 runtime 消费。

## What Changes

- 新增 `src/registry/provider-registry.ts`：实现内存级 provider registry，支持 `register`、`get`、`list`
- 新增 `src/registry/builtins.ts`：提供内置 provider（mock）的预注册逻辑
- 新增 `src/providers/mock/descriptor.ts`：mock provider 的 descriptor 定义
- 新增 `src/providers/mock/provider.ts`：实现完整 `Provider` 契约的 mock 实例，支持延迟模拟与可控失败模式
- 新增 `src/shared/id.ts`（暂定）：轻量 ID 生成辅助
- 新增 `src/shared/asset-normalizer.ts`（暂定）：将 mock 结果归一化为 `Asset[]` 的辅助
- 追加 `src/index.ts` 导出：暴露 registry 与 mock provider 公开面
- **不触及** `openai-compatible` provider、真实 HTTP transport、端到端集成测试

## Capabilities

### New Capabilities
- `provider-registry`: provider 的内存注册表，支持 `register / get / list`，不持有 runtime state 或 config 持久化
- `mock-provider`: 可 `describe`、`validateConfig`、`validateRequest`、`invoke` 的 mock provider，支持延迟模拟与固定/概率失败模式，输出标准 `Asset[]`
- `provider-dispatch-bridge-adapter`: 将 `Provider` 实例收敛为 `core-engine` `ProviderDispatchAdapter` 的最小适配逻辑，验证 bridge 契约可被 runtime 消费

### Modified Capabilities
- （无。本 change 只新增实现，不修改现有 `provider-contract` 的 requirement。）

## Impact

- 影响 `packages/providers` 的 `src/registry/`、`src/providers/mock/`、`src/shared/`（暂定）与 `src/index.ts`
- 为 `core-engine` 的 `ProviderDispatchAdapter` 提供第一个可消费的 adapter 实例
- 为后续 `implement-openai-compatible-provider` 与 `add-provider-verification-harness` 提供运行基座
- 不改变 `core-engine` 契约或 `app` 层代码
