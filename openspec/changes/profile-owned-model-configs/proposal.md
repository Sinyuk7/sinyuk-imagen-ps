## 背景

当前产品把 `model` 相关语义拆散在全局 `UserModelConfig`、`ProviderProfile.selectedModelIds/defaultModelId`、独立的全局 `ModelConfigurationPage`、`official preset`、以及 `discovery cache` 上。用户以为自己在做“给某个 `profile` 添加/删除模型”，但系统实际把这个动作拆成了多层隐藏状态，因此主页面、`profile detail`、settings root、editor 页面对同一个 `model` 的归属与可用性给出了互相冲突的信号。

本次 change 直接把产品语义改成强 `B`：`UserModelConfig` 以 `profile` 为唯一 ownership 维度，`Profile Detail -> Models` 成为唯一 canonical 管理入口，主页面与外部摘要只承认当前 `profile` 拥有的 `configured model`。这是一次 current-state 重构，不做 legacy 兼容、数据迁移或回滚设计。

## 变更内容

- **BREAKING** 把 `UserModelConfig` 改为 `profile-owned` 子资源，canonical identity 改为 `profileId + modelId`；`apiFormat` 不再作为 ownership、list、lookup 的主维度。
- **BREAKING** 删除 `selectedModelIds` 这层独立 membership 语义；`model availability` 只由当前 `profile` 拥有的 `configured model` 决定。
- **BREAKING** 保留 `defaultModelId`，但删除当前默认模型时直接清空 `defaultModelId`，进入显式 `no-default-model state`，不自动提升其他模型。
- **BREAKING** 删除 settings root 的 standalone global `model ownership` 入口，以及 `profile-add -> model configuration` 路径。
- 保留 `Profile Detail` 基本页面结构，但把“当前模型”语义改成“模型列表”语义，删除 detail 页 inline `+` 按钮，并通过 `Profile Detail -> Models` 进入当前 `profile` 的 canonical `models page`。
- 保留现有 `Create/Edit Model Config` editor 结构，但它不再承担全局列表职责，只作为当前 `profile models page` 的子 flow。
- 保留 `discovery` 作为可选辅助能力，但它只以 runtime-only `suggestion` 形式存在于当前 `profile models page` 内，不做任何持久化，不进入主页面 selector 或外部 summary。
- 规定 `discovery suggestion` 只能用于预填 editor 草稿，例如填入 `modelId` / `wireModelId`；只有显式保存后的 `UserModelConfig` 才能变成外部可用对象。

## 能力

### 新增能力
- `profile-model-management`：定义 `UserModelConfig` 的 `profile-owned` 身份、`defaultModelId` 约束、`official preset` 模板语义，以及保存/删除后的 ownership 行为。
- `profile-model-selection`：定义主页面 selector、`profile detail` 快速选择器、settings summary 与 `no-default-model state` 的可见/可选规则。
- `profile-model-ui-structure`：定义 settings root、`Profile Detail`、`ProfileModelsPage`、`ModelConfigurationPage`、`SettingsAddPage` 的页面职责、保留/修改/删除边界与导航关系。
- `profile-model-discovery-runtime`：定义 `discovery suggestion` 的 runtime-only 边界、排序规则、editor 预填规则，以及它与 persisted `UserModelConfig` 的分界。

### 修改的能力
- 无。

## 影响

- 受影响代码：`packages/application/src/commands/types.ts`、`packages/application/src/commands/model-configs.ts`、`packages/application/src/commands/profile-models.ts`、`packages/application/src/commands/provider-profiles.ts`、`packages/application/src/commands/model-generation-preference-resolution.ts`、`packages/application/src/commands/model-generation-preferences.ts`、`packages/application/src/runtime.ts`，以及 `apps/app/src/adapters/uxp/uxp-model-repositories.ts`、`apps/app/src/adapters/uxp/in-memory-host-storage.ts`、`apps/app/src/adapters/chrome/indexed-db-storage.ts`、`apps/app/src/shared/ui/app-shell.tsx`、`apps/app/src/shared/ui/hooks/use-provider-settings.ts`、`apps/app/src/shared/ui/pages/settings-page.tsx`、`apps/app/src/shared/ui/pages/settings-add-page.tsx`、`apps/app/src/shared/ui/pages/settings-detail-page.tsx`、`apps/app/src/shared/ui/pages/model-configuration-page.tsx` 与新增的 `ProfileModelsPage`。
- 受影响持久化：`ProviderProfile` 将不再承载 `selectedModelIds`；`UserModelConfigRepository` 的 canonical ownership API 将从 `apiFormat` 维度改为 `profileId` 维度；`discovery cache` 不再作为产品真相的一部分。
- 受影响 UI 结构：settings root 不再展示全局 `model ownership` 入口；`Profile Detail` 保留主体结构但改变 `model` 区块语义；`ModelConfigurationPage` 从“全局列表 + editor”混合页收窄为 editor 子 flow。
- 受影响 runtime 契约：`listProfileModels()` 不再把 `discovery`、全局 config、`official preset`、membership state 合并成同一个选择宇宙，而是只返回当前 `profile` 的 owned `configured model`，并由当前 `profile models page` 单独承载 runtime `suggestion`；`model generation preference` 与输出矩阵解析也必须按 `profileId + modelId` 解析当前 `profile` 的 owned config，避免同名 `modelId` 在不同 `profile` 间串用配置或校验结果。
- 受影响选择状态：当当前 `profile` 拥有 `configured model` 但 `defaultModelId` 为空时，主页面 selector、settings summary 与 detail 快速选择器保持显式空状态，直到用户显式设置默认模型或手动选择当前轮次模型；系统不再静默回退到 owned 列表第一项。
- 受影响本地数据：旧的全局 `UserModelConfig`、`selectedModelIds`、`discovery cache` 不提供兼容路径；开发与测试环境允许手动清空，或在新 UI 中直接忽略旧状态。
