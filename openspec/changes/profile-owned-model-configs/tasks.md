## 1. 持久化与命令契约

- [x] 1.1 把 `UserModelConfig` 与 `UserModelConfigRepository` 改成以 `profileId + modelId` 为 canonical identity，并移除 `list(apiFormat)` / `get(apiFormat, modelId)` 这类全局 ownership API。
- [x] 1.2 从 `ProviderProfile` 合约与写回路径中删除 `selectedModelIds/defaultModelId`，禁止 profile-level persisted membership/default state。
- [x] 1.3 更新 `saveUserModelConfig`、delete 命令与相关校验，使保存后立即获得 ownership、删除后立即失去 ownership，并确保命令层不再读写 profile-level default state。
- [x] 1.4 在 `saveUserModelConfig` 中增加 `profileId` 存在性校验；若 `ProviderProfile` 不存在则返回 `profile not found` 错误，禁止写入 orphan config。
- [x] 1.5 在 `deleteProviderProfile` 中增加级联删除：删除 `profile` 时同步删除该 `profileId` 下的所有 `UserModelConfig`。
- [x] 1.6 重写 `resolveConfiguredModel`、runtime dispatch、draft connection/discovery 命令与相关校验，使它们按当前 `profileId + effective modelId` 解析 owned config，而不是按 `apiFormat` 全局查找或读取 `defaultModelId`。
- [x] 1.7 更新 `model-generation-preference-resolution` / `model-generation-preferences`，确保同名 `modelId` 在不同 `profile` 下分别解析各自的 output matrix、偏好设置与校验结果。
- [x] 1.8 更新 UXP / Chrome / in-memory `UserModelConfigRepository`、测试 fake 与 fixture，把落盘 key 与内存 key 从 `apiFormat + modelId` 迁移为 `profileId + modelId`。

## 2. Settings 信息架构重组

- [x] 2.1 从 settings root 删除 standalone global `model ownership` 入口与对应 view state。
- [x] 2.2 保留 `Profile Detail` 主结构，但把 `model` 区块改成“模型列表”快速入口，删除 inline `+` 按钮。
- [x] 2.3 在 `Profile Detail` 的 `model` selector 中加入固定动作项 `添加新模型`，并让 selector 展示当前/effective selection；空状态与快捷动作同样只跳转到该页面，不再直接打开 editor。

## 3. 页面拆分与导航收敛

- [x] 3.1 把当前 `ModelConfigurationPage` 的列表模式拆出为新的 `ProfileModelsPage`，让当前 `profile` 的 canonical ownership list 与 editor 彻底分页。
- [x] 3.2 保留现有 `Create/Edit Model Config` editor 结构，但把 `ModelConfigurationPage` 收窄为 editor-only child flow。
- [x] 3.3 重写 `AppShell` 的 `model` 相关导航，引入显式 `ProfileModelsPage` view/state，并删除全局列表返回链路与 `source: 'settings-list' | 'profile-add' | 'profile-detail'` 这些旧分支。
- [x] 3.4 在 `ModelConfigurationPage` 的 editor 入口与返回逻辑中只保留 `ProfileModelsPage` 上下文：create / edit / suggestion 都从当前 `profile` 的 `ProfileModelsPage` 进入，并始终返回该页。
- [x] 3.5 从 `ProfileModelsPage`、detail quick selector 与相关 view state 中删除 `默认` badge、`设置为默认` 按钮、set-default mutation、`defaultModelId` 写回路径，以及 `ProviderDefaultModelSection` 这类 default 命名残留。

## 4. Profile 创建边界

- [x] 4.1 让 `SettingsAddPage` 只负责创建 `profile`，删除创建阶段的 `model configuration` 入口与 `selectedModelIds/defaultModelId` 组装逻辑。
- [x] 4.2 让新建 `profile` 后的后续 `model` 配置只能从 `Profile Detail -> Models` 进入。
- [x] 4.3 清理所有 `profile-add -> model configuration` 的 UI、command 与返回导航分支。

## 5. Discovery runtime-only 边界

- [x] 5.1 把 `discovery` 从 persisted product state 中移除，使 `suggestion` 只存在于当前 `ProfileModelsPage` 的 runtime state，并停止在 product flow 中读写 `ModelDiscoveryCacheRepository`。
- [x] 5.2 让 `ProfileModelsPage` 先展示 owned `configured model`，再展示 runtime-only `suggestion`，并阻止 `suggestion` 进入主页面 selector、summary 与 quick selector。
- [x] 5.3 让选择 `discovery suggestion` 只预填 `ModelConfigurationPage` 的 `modelId` / `wireModelId`，并要求显式保存后才生成 `UserModelConfig`。
- [x] 5.4 实现 `discovery suggestion` 的排序与错误处理：保持 provider 原始顺序、去重已配置项、失败时保留既有列表并禁用重复触发。

## 6. 选择与摘要 surface 收敛

- [x] 6.1 重写 `listProfileModels()` 及相关 UI mapper，使主页面 selector、`Profile Detail` quick selector 与 settings summary 只消费当前 active `profile` 的 owned `configured model`，并确保 `selected/default` 不参与 availability 过滤。
- [x] 6.2 实现 `selectedModelId ?? first owned configured model` 的 effective selection 规则，覆盖主页面 selector、`Profile Detail` quick selector 与 settings summary；只有 owned list 为空时才显示无可选模型状态。
- [x] 6.3 更新 `AppShell` 的本地 `selectedModelId` 协调与相关 dispatch 前置条件，使 `selectedModelId` 缺失、无效或跨 profile 时回退到当前 active profile owned list 的第一项。
- [x] 6.4 清理所有仍然把 `official preset`、全局 config 或 persisted `discovery cache` 当作外部可选 `model` 的旧链路。

## 7. 验证

- [x] 7.1 增加 `UserModelConfig` profile ownership、`selectedModelIds/defaultModelId` 删除后的 command 测试；覆盖 `saveUserModelConfig` parent 存在性校验、`deleteProviderProfile` 级联删除，以及同名 `modelId` 跨 `profile` 的 generation-preference / output-matrix 隔离。
- [x] 7.2 增加 settings root 移除全局入口、`Profile Detail -> Models` 快速入口、`SettingsAddPage` 创建后路径、`ProfileModelsPage` create/edit/suggestion 流，以及 `ModelConfigurationPage` 仅返回 `ProfileModelsPage` 的导航与职责测试。
- [x] 7.3 增加 `discovery` runtime-only 行为、排序规则、editor 预填与主页面排除规则的验证。
- [x] 7.4 增加 main-page effective selection 验证，确保 selector 显示全部 owned configured models，并在 `selectedModelId` 缺失或无效时回退到当前 owned 列表第一项。
- [x] 7.5 增加 `Profile Detail -> Models` 与 detail quick selector 验证，确保 UI 不再出现 `默认` / `设置为默认` copy，不再调用 `saveProviderProfile({ defaultModelId })`。
