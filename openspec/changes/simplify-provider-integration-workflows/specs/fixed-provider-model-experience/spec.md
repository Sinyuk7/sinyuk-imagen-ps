## ADDED Requirements

### Requirement: builtin Provider SHALL 声明固定本地模型目录
模型可用性 SHALL 由 Provider descriptor 的 `defaultModelTemplates` 与 Official Model Catalog 决定，不得通过远端 `/models` discovery 或用户输入扩展。GRSAI SHALL 保留已定义的 12 个本地模型模板；Gemini SHALL 只提供 `gemini-3.1-flash-image`、`gemini-3-pro-image` 和 `gemini-3.1-flash-lite-image`；OpenAI Images SHALL 只提供 `gpt-image-2`。

#### Scenario: 创建 Gemini Profile
- **WHEN** Gemini Profile 首次初始化模型
- **THEN** 系统 SHALL 原子写入三个 Gemini 官方模型对应的完整 `UserModelConfig`
- **AND** 系统 SHALL NOT 写入 GRSAI alias `nano-banana-fast`

#### Scenario: 创建 OpenAI Images Profile
- **WHEN** OpenAI Images Profile 首次初始化模型
- **THEN** 系统 SHALL 只写入 `gpt-image-2` 对应的完整 `UserModelConfig`

#### Scenario: 创建 GRSAI Profile
- **WHEN** GRSAI Profile 首次初始化模型
- **THEN** 系统 SHALL 原子写入 GRSAI descriptor 已定义的 12 个完整模型模板

### Requirement: 用户 SHALL 只能选择静态模型而不能配置模型
主生成 surface SHALL 从当前 Profile 的已初始化 `UserModelConfig` 投影模型选项。用户 SHALL 能切换多模型 Provider 的模型，但 SHALL NOT 能新增、编辑、删除、重命名或修改模型的 `wireModelId`、`baseModelId`、`requestStrategyId`、output exposure 或 capability matrix。

#### Scenario: 使用 GRSAI Profile
- **WHEN** 用户在主生成 surface 选择一个 GRSAI Profile
- **THEN** 模型选择器 SHALL 显示该 Profile 的 12 个静态模型
- **AND** Settings SHALL 不提供管理这些模型的入口

#### Scenario: 使用 OpenAI Images Profile
- **WHEN** 用户选择一个只有 `gpt-image-2` 的 OpenAI Images Profile
- **THEN** 系统 SHALL 显示 `gpt-image-2` 为当前模型且 SHALL NOT 要求用户打开单选项菜单完成额外选择

### Requirement: UI SHALL 建立显式默认模型选择
当用户选择 ready Profile 且当前 UI state 没有该 Profile 的有效模型时，UI SHALL 显式选择 Provider 产品定义的默认模型：GRSAI 使用 `nano-banana-fast`，Gemini 使用 `gemini-3.1-flash-image`，OpenAI Images 使用 `gpt-image-2`。该行为 SHALL 只更新 UI state；Provider admission SHALL 继续接收显式 `modelId`，不得恢复 backend 首项推断。

#### Scenario: 首次选择新建 Gemini Profile
- **WHEN** 新建 Gemini Profile 已 ready 且 UI 尚无其模型选择
- **THEN** UI SHALL 将 `gemini-3.1-flash-image` 写入当前 selection 并允许 Composer readiness 继续

#### Scenario: 已选模型仍有效
- **WHEN** 用户返回一个 Profile 且 UI state 中的模型仍属于该 Profile
- **THEN** 系统 SHALL 保留该显式选择而不覆盖为默认模型

#### Scenario: admission 缺少模型
- **WHEN** Provider generation command 未携带显式 `modelId`
- **THEN** Provider admission SHALL 继续返回 validation error，且 SHALL NOT 从 repository 选择第一项

### Requirement: 生成输出偏好 SHALL 保持可用
系统 SHALL 保留按 `{profileId, apiFormat, modelId, operation}` 持久化的 `ModelGenerationPreference`。用户在 Composer 选择的尺寸、比例与输出格式 SHALL 继续受静态模型 capability 约束；删除模型配置 surface SHALL NOT 删除这些生成偏好能力。

#### Scenario: 切换模型后恢复输出偏好
- **WHEN** 用户返回先前配置过输出选择的 Profile 与模型
- **THEN** 系统 SHALL 恢复仍在该静态 capability matrix 内的 `ModelGenerationPreference`

#### Scenario: 偏好不再有效
- **WHEN** 保存的输出选择不属于当前静态模型 capability matrix
- **THEN** 系统 SHALL 回退到该模型的 catalog 默认 output cell，且 SHALL NOT 向 Provider 发送无效输出参数

