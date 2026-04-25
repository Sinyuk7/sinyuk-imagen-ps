## Why

`packages/providers` 当前只有空的 `src/index.ts` 与偏离 PRD 的 `package.json`，但后续 `mock provider`、`openai-compatible provider`、registry 和 transport 都依赖一个稳定的 package contract。若现在不先收敛公开类型、桥接边界与工具链基线，后续实现会在 `Provider`、`ProviderDispatchAdapter`、`AssetRef`、config/request/result shape 之间反复返工。

同时，当前项目明确要求 `core-engine` 不理解 provider 参数语义，IO 也不能进入 engine；这意味着 `providers` 必须先把“自己拥有的语义”与“对 engine 暴露的桥接面”区分清楚，再开始实现真实 provider。

## What Changes

- 对齐 `packages/providers/package.json` 的工具链与依赖基线，使其满足当前阶段文档约束：`zod`、`@types/node`、跨平台 `clean`、`TypeScript >= 5.9`、`Vitest >= 4.1`。
- 建立 `packages/providers` 的公开 contract 类型层，包括 capability、config、request、result、diagnostics、provider descriptor 与 provider interface。
- 明确 `Provider` 与 `@imagen-ps/core-engine` 的 `ProviderDispatchAdapter` 之间的桥接契约，避免后续 registry 或具体 provider 实现各自发明适配形状。
- 收敛 `AssetRef`、canonical request、`ProviderInvokeResult` 与 structured diagnostics 的最小稳定 shape，禁止将 host IO、文件路径、vendor SDK 响应直接带入公开 contract。
- 为后续 `openai-compatible` baseline 记录稳定的接入约束：实例配置以 `baseURL` / `apiKey` / `defaultModel` / `extraHeaders` 为主，transport、retry、error mapping 的具体实现留到后续 change。

## Capabilities

### New Capabilities
- `provider-contract`: 定义 `packages/providers` 的稳定公开契约，包括 provider descriptor、config/request/result/diagnostics 类型、canonical image request，以及到 `ProviderDispatchAdapter` 的桥接接口。

### Modified Capabilities
- （无 —— 当前仓库尚无 provider 相关既有 spec，本 change 以新增 capability 为主。）

## Impact

- `packages/providers/package.json`
- `packages/providers/src/index.ts`
- `packages/providers/src/contract/**/*.ts`
- 后续 `packages/providers/src/registry/**`、`src/providers/**`、`src/transport/**` 将以本 change 产出的 contract 为前提
- 与 `@imagen-ps/core-engine` 的接口对齐点：`packages/core-engine/src/types/provider.ts`、`packages/core-engine/src/types/asset.ts`

## Non-goals

- 不实现具体 provider、registry 或 transport
- 不引入官方 SDK，不落地 `openai-compatible` HTTP 调用
- 不处理 settings persistence、secret storage、host IO、文件物化
- 不扩展到 multi-host、web app 或 cross-provider 参数统一
