## Why

当前 `Generation Settings` 是全局 app 偏好，UI 选择的 `outputSizePreset`、`aspectRatio`、`outputFormat` 会在 provider transport 中继续被推导或降级，导致“界面所选”不等于“实际发送”。本变更将模型输出参数收敛为 catalog 单一数据源，让 MainPage 与 Settings 页展示、保存、发送同一份当前模型参数。

## What Changes

- **BREAKING**：官方 image model catalog 从“未知模型 fallback”改为“明确模型白名单”，未命中官方 catalog 或用户模型配置的模型不可执行。
- **BREAKING**：清理官方 catalog，只保留本轮可确认参数矩阵的 GPT 与 Gemini 模型；移除 `gpt-image-1`、`dall-e-3`、`grok`、`doubao`、`qwen` 以及所有 hidden default fallback 规则。
- **BREAKING**：删除旧 `AppGenerationSettings` 输出字段、旧 `UserModelConfig.output` 聚合结构和相关 storage 读取路径；本项目当前 0 用户，不做兼容、迁移或 best-effort 旧数据恢复。
- 新增 model output matrix：按 `apiFormat`、`modelId`、`operation` 声明 `imageSize`、`ratio`、`outputFormat` 选项，以及每个组合对应的 exact `requestOutput`。
- GPT 类模型在 UI 中仍展示 `1K`、`2K`、`4K` 与 ratio，但 catalog cell 解析为 exact pixel `size`，例如 `4K + 16:9 -> size: "3840x2160"`，`auto -> size: "auto"`。
- Gemini 类模型使用同一 UI 概念，但 catalog cell 解析为 Gemini 真实字段，例如 `imageSize: "4K"` 与 `aspectRatio: "16:9"`。
- `UserModelConfig` 删除旧的 `aspectRatios/sizes/outputFormats` 聚合列表，替换为 output matrix 派生配置；用户只能基于 official preset 减少 matrix cells / formats，不能增加 official preset 未声明的能力。
- `Generation Settings` 从全局输出偏好改为当前 selected model 的参数偏好；切换模型时加载该模型已保存偏好，缺失或失效时使用 catalog 默认值。
- MainPage 的 output size 快捷入口与 Settings 页使用同一公共 controller / resolver，不再各自维护静态选项。
- `providerInputSizePreset` 保持 app-local 输入图片预处理概念，不进入 provider catalog。

## Capabilities

### New Capabilities
- `model-output-matrix-generation-settings`: 定义官方 catalog 输出参数矩阵、模型级 generation preference、MainPage/Settings 共享参数选择，以及 Send 使用 exact resolved output 的行为。

### Modified Capabilities
- 无。

## Impact

- `packages/providers`: image model catalog、request/output contract、transport request builders、catalog validation tests。
- `packages/application`: profile model listing、model config resolution、model generation settings commands、dispatch 前 request output 解析。
- `apps/app`: generation settings store 替换、MainPage output controls、GlobalGenerationSettingsPage、ModelConfigurationPage、共享 generation settings controller、Chrome/UXP storage adapters。
- Tests: provider request body tests、application profile/model tests、app settings/MainPage/useConversation tests 需要更新为“model output matrix exact send”语义，并覆盖多 profile/model 切换时 Settings 页同步切换。
