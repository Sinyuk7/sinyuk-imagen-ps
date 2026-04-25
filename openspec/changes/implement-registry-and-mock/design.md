## Context

`stabilize-package-contract` 已落地 `packages/providers` 的全部 contract 类型层：
- `src/contract/provider.ts`：`Provider` 接口、`ProviderDescriptor`、`ProviderDispatchBridge`
- `src/contract/config.ts`、`request.ts`、`result.ts`、`diagnostics.ts`、`capability.ts`：配套契约
- `src/index.ts`：已导出所有稳定类型
- `core-engine` 已完成 `ProviderDispatchAdapter`、`ProviderDispatcher`、`Asset` 等 runtime 边界

当前最大的阻塞是：模块拥有完整类型契约，但没有任何可运行实现。registry 不存在，mock provider 不存在，bridge 适配逻辑也未落地。这导致 `core-engine` 无法装配任何真实或模拟的 provider adapter，runtime 链路在 provider 层断掉。

## Goals / Non-Goals

**Goals:**
- 实现内存级 provider registry，支持 `register / get / list`
- 实现 mock provider，覆盖 `describe / validateConfig / validateRequest / invoke` 全契约
- mock provider 支持延迟模拟与可控失败模式（固定失败、概率失败）
- 实现 `Provider` → `ProviderDispatchAdapter` 的最小适配逻辑，可被 `core-engine` 消费
- 更新 `src/index.ts`，暴露 registry 与 mock 的稳定公开面

**Non-Goals:**
- 真实 HTTP transport（留待 `implement-openai-compatible-provider`）
- config / settings 持久化（属 facade + adapter）
- provider auto-discovery、plugin loading、动态卸载
- 端到端集成测试（留待 `add-provider-verification-harness`）
- UI-facing provider view model
- cross-provider 参数统一

## Decisions

### 1. Registry 为纯内存 Map，不持有 runtime state
- **决策**：`ProviderRegistry` 内部使用 `Map<string, Provider>` 存储实例，生命周期由调用方管理。
- **理由**：registry 的职责只是"按 id 路由到 provider 实例"，不应该承担 config 持久化、runtime state 或 lifecycle 管理。这与 PRD 第 12 节一致，也避免与 `core-engine` 的 job store 职责重叠。
- **替代方案**：让 registry 同时管理 config → 被拒绝，因为 config persistence 属 facade 层。

### 2. Mock provider 使用 Zod 做 config / request 校验
- **决策**：mock provider 的 `validateConfig` 与 `validateRequest` 使用 Zod schema，与真实 provider 保持同一校验模式。
- **理由**：mock 不只是"返回假数据"，还要验证 caller 是否按契约传入参数。如果 mock 跳过校验，caller 会在切换到真实 provider 时才暴露参数错误，降低 mock 价值。
- **替代方案**：mock 只做类型断言 → 被拒绝，因为无法提供字段级错误信息。

### 3. Mock provider 的 `invoke` 返回合成 `Asset`，不依赖文件系统或网络
- **决策**：mock `invoke` 通过 `setTimeout` 模拟延迟后，返回带有 `data: Uint8Array` 或占位 `url` 的合成 `Asset[]`。
- **理由**：mock 必须能在无网络、无 FS 的测试环境中运行（包括 UXP 环境）。合成数据足够验证 runtime 链路。
- **替代方案**：从本地文件读取图片 → 被拒绝，因为引入 FS 依赖，违背 host-agnostic 原则。

### 4. Bridge 适配逻辑保持为独立函数而非 provider 实例方法
- **决策**：`createDispatchAdapter(provider, config)` 实现为独立函数/工厂，不内嵌到 mock provider 类中。
- **理由**：`ProviderDispatchBridge` 已在 contract 层定义为显式接口。保持独立工厂使 provider 实现不感知 engine dispatch 细节，也便于后续为 `openai-compatible` 复用同一适配逻辑。
- **替代方案**：让每个 provider 自己实现 bridge → 被拒绝，因为会增加 provider 实现复杂度，且 engine 细节不应泄漏到 provider。

### 5. Shared 辅助模块暂定最小集合
- **决策**：仅引入 `src/shared/id.ts`（轻量 ID 生成）与 `src/shared/asset-normalizer.ts`（将合成结果转为标准 `Asset[]`）。
- **理由**：PRD 建议了 `shared/` 目录，但 SPEC 未明确 shared 职责。当前只放确实被 registry 和 mock 共用的辅助；若后续发现不需要，可在 refine 时移除。
- **替代方案**：把所有辅助内联到各自文件 → 被拒绝，因为 `Asset[]` 归一化逻辑可能被多个 provider 复用。

### 6. Built-ins 在模块加载时自动注册
- **决策**：`src/registry/builtins.ts` 提供 `registerBuiltins(registry)` 函数，由应用层在初始化时调用，mock provider 作为第一个 built-in 被注册。
- **理由**：避免模块顶层副作用（import 时自动执行注册），保持纯逻辑包的可测试性；同时给应用层控制注册时机的灵活性。
- **替代方案**：模块加载时自动注册 → 被拒绝，因为会增加全局状态，干扰测试隔离。

## Risks / Trade-offs

- **[Risk]** `ProviderDispatchBridge` 最终是否保持独立工厂接口，还是下沉为 provider 实例方法，仍待后续实现验证。当前按 contract 层已定义的显式接口实现，若发现不顺手，可在 `implement-openai-compatible-provider` 阶段调整。
  - **Mitigation**：bridge 逻辑尽量薄，只负责参数转换与错误映射，不涉及 transport 或 retry。
- **[Risk]** mock provider 的合成 `Asset` 数据（如占位图片 bytes）可能在后续被误认为真实图片。若 runtime 或 UI 层直接渲染这些 bytes，会显示为损坏图像。
  - **Mitigation**：mock `Asset` 使用明确可识别的占位数据（如 1x1 PNG 或标记 bytes），并在 `name` 或 `mimeType` 中标注 `"mock"`。
- **[Risk]** registry 目前为内存实现，进程重启后注册信息丢失。
  - **Mitigation**：符合当前设计意图——持久化由 facade + adapter 负责，registry 只承担运行时路由。
- **[Trade-off]** mock provider 的校验 schema 与真实 provider 不完全一致（mock config 只要求最少字段）。这可能导致"mock 能过但真实 provider 不过"的偏差。
  - **Mitigation**：mock config schema 尽量复用真实 schema 的公共字段；在 `implement-openai-compatible-provider` 阶段对齐。

## Migration Plan

本 change 为新增实现，无迁移步骤。实施后只需在 `app` 或 facade 初始化时调用 `registerBuiltins(registry)` 即可使 mock provider 可用。

## Open Questions

- `src/shared/` 的具体文件名单是否会在实现过程中进一步收敛？当前标记为"暂定"。
- mock provider 是否需要支持"故意返回 schema-invalid payload"以验证边界守卫？PRD 第 14 节建议了此能力，但当前阶段是否必须仍待确认。
