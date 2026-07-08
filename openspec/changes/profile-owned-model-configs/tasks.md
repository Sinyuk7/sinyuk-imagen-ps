## 1. 持久化与命令契约

- [ ] 1.1 把 `UserModelConfig` 与 `UserModelConfigRepository` 改成以 `profileId + modelId` 为 canonical identity，并移除 `list(apiFormat)` / `get(apiFormat, modelId)` 这类全局 ownership API。
- [ ] 1.2 从 `ProviderProfile` 合约与写回路径中删除 `selectedModelIds`，只保留 `defaultModelId` 作为 owned `configured model` 引用。
- [ ] 1.3 更新 `saveUserModelConfig`、delete 命令与相关校验，使保存后立即获得 ownership，删除当前默认模型时直接清空 `defaultModelId`。
- [ ] 1.4 在 `saveUserModelConfig` 中增加 `profileId` 存在性校验；若 `ProviderProfile` 不存在则返回 `profile not found` 错误，禁止写入 orphan config。
- [ ] 1.5 在 `deleteProviderProfile` 中增加级联删除：删除 `profile` 时同步删除该 `profileId` 下的所有 `UserModelConfig`。
- [ ] 1.6 重写 `resolveConfiguredModel`、runtime dispatch、draft connection/discovery 命令与相关校验，使它们按当前 `profileId + modelId` 解析 owned config，而不是按 `apiFormat` 全局查找。
- [ ] 1.7 更新 `model-generation-preference-resolution` / `model-generation-preferences`，确保同名 `modelId` 在不同 `profile` 下分别解析各自的 output matrix、偏好设置与校验结果。
- [ ] 1.8 更新 UXP / Chrome / in-memory `UserModelConfigRepository`、测试 fake 与 fixture，把落盘 key 与内存 key 从 `apiFormat + modelId` 迁移为 `profileId + modelId`。

## 2. Settings 信息架构重组

- [ ] 2.1 从 settings root 删除 standalone global `model ownership` 入口与对应 view state。
- [ ] 2.2 保留 `Profile Detail` 主结构，但把 `model` 区块改成“模型列表”快速入口，删除 inline `+` 按钮。
- [ ] 2.3 在 `Profile Detail` 的 `model` selector 中加入固定动作项 `添加新模型`，并把它导航到当前 `Profile Detail -> Models`；空状态与快捷动作同样只跳转到该页面，不再直接打开 editor。

## 3. 页面拆分与导航收敛

- [ ] 3.1 把当前 `ModelConfigurationPage` 的列表模式拆出为新的 `ProfileModelsPage`，让当前 `profile` 的 canonical ownership list 与 editor 彻底分页。
- [ ] 3.2 保留现有 `Create/Edit Model Config` editor 结构，但把 `ModelConfigurationPage` 收窄为 editor-only child flow。
- [ ] 3.3 重写 `AppShell` 的 `model` 相关导航，引入显式 `ProfileModelsPage` view/state，并删除全局列表返回链路与 `source: 'settings-list' | 'profile-add' | 'profile-detail'` 这些旧分支。
- [ ] 3.4 在 `ModelConfigurationPage` 的 editor 入口与返回逻辑中只保留 `ProfileModelsPage` 上下文：create / edit / suggestion 都从当前 `profile` 的 `ProfileModelsPage` 进入，并始终返回该页。

## 4. Profile 创建边界

- [ ] 4.1 让 `SettingsAddPage` 只负责创建 `profile`，删除创建阶段的 `model configuration` 入口与 `selectedModelIds/defaultModelId` 组装逻辑。
- [ ] 4.2 让新建 `profile` 后的后续 `model` 配置只能从 `Profile Detail -> Models` 进入。
- [ ] 4.3 清理所有 `profile-add -> model configuration` 的 UI、command 与返回导航分支。

## 5. Discovery runtime-only 边界

- [ ] 5.1 把 `discovery` 从 persisted product state 中移除，使 `suggestion` 只存在于当前 `ProfileModelsPage` 的 runtime state，并停止在 product flow 中读写 `ModelDiscoveryCacheRepository`。
- [ ] 5.2 让 `ProfileModelsPage` 先展示 owned `configured model`，再展示 runtime-only `suggestion`，并阻止 `suggestion` 进入主页面 selector、summary 与 quick selector。
- [ ] 5.3 让选择 `discovery suggestion` 只预填 `ModelConfigurationPage` 的 `modelId` / `wireModelId`，并要求显式保存后才生成 `UserModelConfig`。
- [ ] 5.4 实现 `discovery suggestion` 的排序与错误处理：保持 provider 原始顺序、去重已配置项、失败时保留既有列表并禁用重复触发。

## 6. 选择与摘要 surface 收敛

- [ ] 6.1 重写 `listProfileModels()` 及相关 UI mapper，使主页面 selector、`Profile Detail` quick selector 与 settings summary 只消费当前 active `profile` 的 owned `configured model`，并继续复用既有 configuration-instance / capability-preset label helper。
- [ ] 6.2 为 `defaultModelId` 为空的情况增加显式 `no-default-model state`，覆盖主页面 selector、`Profile Detail` quick selector 与 settings summary；禁止静默自动提升其他模型，保存首个 `configured model` 时同样不自动提升为默认。
- [ ] 6.3 更新 `AppShell` 的本地 `selectedModelId` 协调与相关 dispatch 前置条件，使当前 `profile` 无默认模型时保持显式空选择，直到用户显式选择当前轮次模型。
- [ ] 6.4 清理所有仍然把 `official preset`、全局 config 或 persisted `discovery cache` 当作外部可选 `model` 的旧链路。

## 7. 验证

- [ ] 7.1 增加 `UserModelConfig` profile ownership、`defaultModelId` 清空行为、`selectedModelIds` 删除后的 command 测试；覆盖 `saveUserModelConfig` parent 存在性校验、`deleteProviderProfile` 级联删除，以及同名 `modelId` 跨 `profile` 的 generation-preference / output-matrix 隔离。
- [ ] 7.2 增加 settings root 移除全局入口、`Profile Detail -> Models` 快速入口、`SettingsAddPage` 创建后路径、`ProfileModelsPage` create/edit/suggestion 流，以及 `ModelConfigurationPage` 仅返回 `ProfileModelsPage` 的导航与职责测试。
- [ ] 7.3 增加 `discovery` runtime-only 行为、排序规则、editor 预填与主页面排除规则的验证。
- [ ] 7.4 增加 main-page `no-default-model state` 验证，确保 selector 不再自动回退到当前 owned 列表第一项。
