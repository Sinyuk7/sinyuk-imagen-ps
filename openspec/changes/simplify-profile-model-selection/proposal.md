## Why

当前 `Profile` 页面把 `official catalog preset`、`discovered remote model`、`saved user model config`、`selected/default model` 混在同一个 `Model` 区里，导致用户需要理解多套内部概念才能完成“这个 profile 用哪个模型”这一件本应简单的事。现在需要把 `Profile` 页收敛为单一职责界面，只暴露当前 profile 的模型选择，并把模型配置资产编辑与 profile 选择明确分离。

## What Changes

- **BREAKING** 移除 `apps/app` 中所有面向用户的 `discovery` 概念、提示和模型来源分支；`provider` / `application` 层保留相关命令与 contract，但标记为废弃并退出 UI 主路径。
- 将 `Profile` 页的 `Default model` 改为 `Selected model for this profile`，语义改为“当前 profile 使用的模型”。
- 将 `Profile` 页的模型区收敛为单一下拉菜单；候选仅来自“用户自己配置过且适用于当前 `apiFormat` 的 `UserModelConfig`”。
- 当当前 profile 没有任何可用模型时，`Profile` 页显示 `StatusNotice` 空态，并提供进入 `Model Configuration` 创建页的入口。
- 从空页面进入 `Model Configuration` 与从 `Profile` 页进入时区分入口语义：从 `Profile` 页进入时，创建页带入当前 profile 的上下文预填选项，并在保存后返回该 profile 页。
- 收紧 `Model Configuration` 页文案与导航语义，明确它是“用户配置资产编辑器”，而不是 profile 内部的第二块模型选择区。

## Capabilities

### New Capabilities
- `profile-model-selection-ui`: 约束 `Profile` 页面只暴露当前 profile 的模型选择、空态与跳转创建流程。

### Modified Capabilities
- `user-model-output-subsets`: 调整 `ModelConfigurationPage` 的入口与回跳语义，使其支持从 `Profile` 页带上下文进入并在保存后回到来源 profile。

## Impact

- 受影响代码主要位于 `apps/app/src/shared/ui/pages/settings-add-page.tsx`、`settings-detail-page.tsx`、`components/provider-settings-sections.tsx`、`app-shell.tsx` 与 `model-configuration-page.tsx`。
- `useProviderDraftModelCatalog`、`useProfileModels`、`listProfileModels`、`refreshDraftProfileModels`、`refreshProfileModels` 等命令与 hook 需要调整 UI 使用方式，但 `packages/application` / `packages/providers` 的基础 contract 可以保留。
- 文案、测试 harness、Chrome/UXP app tests 以及 profile-to-model-config 导航种子数据会同步变化。
