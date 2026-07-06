## 1. Contract 重构

- [x] 1.1 将 `packages/providers/src/contract/provider.ts` 中的 provider 级连接测试 contract 收敛为公共层可编排的 `safeProbe` 能力与三态结果模型。
- [x] 1.2 将 `packages/application/src/commands/types.ts` 中的 `ProviderProfileConnectionTestResult` 与相关 `connectivity` 类型改为 `verified` / `partial` / `failed` 语义。
- [x] 1.3 更新 `packages/application/src/commands/provider-profiles.ts` 与相关注释，去除“connect = discoverModels”的旧定义。

## 2. Command 与 Provider 实现

- [x] 2.1 重写 `packages/application/src/commands/profile-connection-test.ts`，实现“本地校验 -> provider safeProbe -> 公共层归一化”的统一流程。
- [x] 2.2 将 `discoverModels` 从连接测试判定链路中完全移除，并保持模型发现命令独立。
- [x] 2.3 为 `packages/providers/src/providers/gemini-generate-content/provider.ts` 实现基于 `POST /models/{model}:countTokens` 的无生成 `safeProbe`。
- [x] 2.4 为暂无安全探针的 provider 明确定义 `partial` 或 unsupported 映射，避免回退到生成接口。

## 3. UI 与验证

- [x] 3.1 更新 `apps/app/src/shared/ui/provider-status.ts` 与设置页调用链，改为三态 notice 呈现。
- [x] 3.2 更新 Chrome harness、command fake、provider 测试和设置页测试，使其覆盖 `verified`、`partial`、`failed` 与 `discoverModels` 独立行为。
- [x] 3.3 运行与本变更相关的 command/provider/UI 验证，确认 `测试连接` 不再依赖 `discoverModels`，且不会触发真实生成。
