## Why

当前 `测试连接` 将 provider 级连通性错误地绑定到 `discoverModels`。这会把“模型发现失败”误判成“Profile 不可连接”，并且无法正确支持只暴露真实调用面、但不提供 `GET /models` 的兼容中转。现在需要把“无生成验证”和“模型发现”解耦，收敛成一个稳定、可解释、且不隐藏消费的连接测试契约。

## What Changes

- 重定义 `测试连接` 语义：仅验证本地配置与 provider 调用面是否可在“不生成图片、不隐藏消费”的前提下完成安全验证。
- 将连接测试收敛到 application 公共层统一编排：本地校验、provider `safeProbe`、三态结果归一化。
- 将 provider 侧职责收敛为可选 `safeProbe` 能力，不再让各 provider 自己定义一整套 `testConnection` 业务语义。
- 将 `discoverModels` 调整为独立可选能力；模型发现失败不得再覆盖连接测试结果。
- 将连接测试结果从 `supported/reachable` 布尔语义收敛为 `verified` / `partial` / `failed` 三态。
- 为 `gemini-generate-content` 提供 `countTokens` 无生成探针，作为精确 model 路径的默认安全验证方式。

## Capabilities

### New Capabilities
- `provider-safe-connection-test`: 定义统一的 provider 无生成连接测试编排、provider 可插拔 `safeProbe`、以及三态结果语义。

### Modified Capabilities
- `provider-profiles`: provider profile 设置页中的 `测试连接` REQUIREMENT 从“依赖模型发现的连通性检查”修改为“独立于模型发现的无生成验证”。

## Impact

- `packages/application/src/commands/profile-connection-test.ts`
- `packages/application/src/commands/provider-profiles.ts`
- `packages/application/src/commands/types.ts`
- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/providers/gemini-generate-content/provider.ts`
- `apps/app/src/shared/ui/provider-status.ts`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- 相关 command/provider/UI 测试与 Chrome harness 假实现
