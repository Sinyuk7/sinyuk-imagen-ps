## Why

`packages/workflows` 已在 `stabilize-builtin-request-contract` 中稳定了 `provider-generate` 与 `provider-edit` 的最小输入输出契约，并验证了与 `core-engine` runtime 及 mock provider bridge adapter 的 happy path。然而，根级 `OPEN_ITEMS.md` 与 `packages/core-engine/OPEN_ITEMS.md` 均将 `providers` / `workflows` 真实集成标记为验证缺口。当前测试未覆盖序列化边界、类型不匹配、deep-freeze 兼容性、错误路径以及真实 provider 场景，导致跨包集成问题可能在后续 surface 接入时才暴露。

本次 change 旨在补充更完整的跨包兼容性验证，尽早暴露 provider bridge 与 workflow shape 的真实边界问题。

## What Changes

- 在 `packages/workflows/tests/` 内新增跨包兼容性测试套件，覆盖：
  - `provider-generate` 与 `provider-edit` 在多种边界输入下的 shape 正确性（缺失可选字段、空数组、额外字段透传等）
  - workflow spec 经 `core-engine` runtime 装配后的 deep-freeze / immutability 兼容性
  - mock provider bridge adapter 的错误路径（dispatch 失败、返回异常 shape、provider 未注册等）
  - 真实 provider bridge adapter（如 `openai-compatible`）与 builtin workflow 的最小 `generate` happy path；`edit` 仅作为当前边界拒绝的验证，不作为兼容性成功目标
- 必要时在 `packages/workflows/tests/` 内补充测试夹具（fixture）与辅助构造器，避免测试代码重复
- 必要时在 `packages/workflows` 内补充 package-local Vitest 配置，使 workspace 包名解析到源码入口而非 `dist`
- **不修改** `packages/providers` 的实现细节，不扩展新的 provider 功能

## Non-goals

- 不修改 `packages/providers` 的源码或接口
- 不扩展新的 provider family 或 adapter
- 不引入端到端（E2E）harness 或 UI 测试
- 不修改 `core-engine` 的 runtime 实现
- 不把 `openai-compatible` 的 `edit` 支持提升为本 change 的成功目标

## Capabilities

### New Capabilities
<!-- 本次 change 为测试补充，不引入新的功能规格。 -->
（无新功能规格）

### Modified Capabilities
<!-- 本次 change 不修改现有 spec 的行为需求，仅补充验证。 -->
（无需求变更）

## Impact

- **测试范围**：`packages/workflows/tests/` 将新增跨包兼容性测试文件与夹具
- **依赖关系**：测试将依赖 `packages/core-engine` 的 runtime 与 `packages/providers` 的 registry / mock / openai-compatible adapter
- **构建与 CI**：可能需要在 `packages/workflows` 的 test 配置中确保跨包依赖可解析，并显式指向源码入口而非 `dist`
- **风险**：若测试暴露出现有契约与真实 provider 不兼容的问题，需记录到 `STATUS.md` 或 `OPEN_ITEMS.md`，但不阻塞本 change 完成
