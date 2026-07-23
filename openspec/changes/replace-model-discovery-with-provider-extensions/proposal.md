## Why

当前通用 `/models` discovery 只能返回裸 `wireModelId`，UI 再把它们暴露为不可直接使用的 suggestion；这条链既没有形成完整 Model Config，也无法可靠表达不同中转服务的模型映射和扩展能力。需要把具体中转差异收敛为比通用 Provider 更小的 `ProviderExtension`，让已注册中转直接提供完整模型定义，未注册 Profile 保持手动配置路径。

## What Changes

- 新增注册式 `ProviderExtension`：通用 Provider 继续拥有 `apiFormat` 协议、请求、响应和错误语义；每个具体中转 extension 独立拥有 Profile 命中规则、内置模型映射和未来可选扩展能力。
- 每个 Profile 最多命中一个 extension；无命中返回空模型数据，多重命中作为 registry 配置错误拒绝处理。
- extension 返回可 exact 解析到 Official Model Preset 的完整模型 seed；Application 将其物化为 `UserModelConfig`，本地同 `modelId` 配置优先，只持久化缺失模型，不覆盖、更新或删除已有配置。
- 中转模型配置与匹配逻辑收敛在对应 extension 目录；新增中转只需注册新的独立 extension，例如 `grsai` 或未来的 `xxx-new`。
- **BREAKING** 删除通用远端 `/models` discovery contract、provider 实现和 parser，以及 draft discovery、discovery cache、runtime suggestion、相关 UI/port/harness/test 路径。
- 删除 Profile Models 的 suggestion 区域；模型加载结果只包含已经持久化、可直接显示和使用的本地模型，或空数据。
- 为 `ProviderExtension` 定义可选 dormant `checkModelStatus()` 契约；当前不新增实现、调用点、UI、缓存、持久化或生成行为。未来接入必须作为生成旁路提示，不能参与 admission、阻塞生成或改变 Job 状态。

## Capabilities

### New Capabilities

- `provider-extension-model-catalog`: 定义 `ProviderExtension` 注册、唯一命中、extension 内模型目录、Application 本地优先物化与持久化，以及旧 discovery/suggestion 的移除合同。
- `provider-extension-model-status-contract`: 定义 extension 可选的统一模型状态结果和 dormant `checkModelStatus()` 边界，确保当前零调用且未来只能作为非阻塞提示能力。

### Modified Capabilities

无。

## Impact

- `packages/providers`: 新增 extension contract、registry、builtin 注册与中转局部目录；移除 `Provider.discoverModels`、`DiscoveredModel`、三类 `/models` transport parser 和实现。
- `packages/application`: 新增 extension 解析、model seed 物化和本地优先持久化 command；移除 draft/profile discovery command、discovery cache runtime/repository 和旧 reconciliation 字段。
- `apps/app`: Profile Models 只展示本地 owned models；移除 suggestion state、刷新发现分支、相关 i18n、CommandsPort、Chrome/UXP wiring、storage adapter 和 harness fake。
- Profile/Model Config ownership 不变：Profile 仍拥有连接、认证和 endpoint；`UserModelConfig` 仍是模型身份与 capability 配置的唯一持久化事实。
- 相关 provider/application contract tests、shared UI tests、adapter persistence tests、policy checks、canonical engineering/testing documentation，以及 `pnpm validate`。
