## Why

`implement-registry-and-mock` 已完成并归档，registry 与 mock provider 已证明 contract、bridge 与 runtime 消费路径可用。当前模块的下一个阻塞点是真实 provider family 的接入。必须补齐 `openai-compatible` 的 HTTP transport、响应解析、retry 与错误映射，使 provider 层从“可验证”走向“可用”，满足 Phase 2 退出标准。

## What Changes

- 新增 `src/providers/openai-compatible/` 目录，包含 descriptor、config-schema、model-policy、provider 实现
- 新增 `src/transport/openai-compatible/` 目录，包含统一 HTTP 封装、请求构造、响应解析、retry 策略、错误映射
- 更新 `src/registry/builtins.ts`，将 openai-compatible provider 注册为内置 provider
- 更新 `src/index.ts`，追加 openai-compatible 相关稳定导出
- 保持现有 mock provider、contract、bridge 与 registry 不变

## Capabilities

### New Capabilities
- `openai-compatible-provider`: openai-compatible provider 的完整链路实现，包括 config/request 校验、HTTP 调用、响应归一化、错误映射与 retry

### Modified Capabilities
- （无。本 change 不修改现有 spec 的需求，只补充新实现。）

## Impact

- `packages/providers/src/providers/openai-compatible/*`：新增文件
- `packages/providers/src/transport/openai-compatible/*`：新增文件
- `packages/providers/src/registry/builtins.ts`：追加注册
- `packages/providers/src/index.ts`：追加导出
- 消费者可通过 registry 获取并使用 `openai-compatible` provider，通过 `createDispatchAdapter` 桥接至 `core-engine`
