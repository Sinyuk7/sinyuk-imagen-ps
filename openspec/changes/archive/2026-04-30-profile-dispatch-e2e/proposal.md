## Why

当前 `provider-generate` workflow 在 job submit 时因 provider 模板变量 `${provider}` 无法解析而失败，导致已打通的 profile → discovery → selection 链路无法到达 real image。本次 change 修复 profile dispatch 路径，打通端到端链路。

## What Changes

- 将 `provider-generate` workflow step 的 `provider` 绑定从模板变量 `${provider}` 改为 profile-aware adapter 标识 `profile`，使 `createProfileAwareDispatchAdapter` 能正确接管 dispatch
- 验证 profile-aware adapter 的 params 传递正确性（`providerProfileId` / `profileId` → `providerConfig` → `defaultModel` injection）
- 补充 profile dispatch 路径的集成测试覆盖
- 执行端到端 smoke 验证：real API 图片生成

**Non-goals:**
- 不做 UXP/UI 集成
- 不做 Edit workflow 的 profile dispatch
- 不做多 provider 并发 dispatch
- 不做 job history 持久化

## Capabilities

### New Capabilities
- `profile-dispatch-e2e`: profile-based job dispatch 端到端链路 — 打通 profile save → model discovery → set default model → job submit → real image

### Modified Capabilities
（无 spec-level 行为变更。workflow step 的 `${provider}` 模板绑定保持不变，profile dispatch 路径通过 command 层输入规范化实现。）

## Impact

- `packages/workflows/src/builtins/provider-generate.ts` — provider 绑定值修改
- `packages/shared-commands/src/runtime.ts` — 确认 `createProfileAwareDispatchAdapter` 已注册且参数传递正确
- `packages/core-engine/src/runner.ts` — 验证 resolveInput 对静态 provider 标识的处理
- CLI `job submit` 命令 — 确认 input schema 兼容
- 新增/修改集成测试文件
