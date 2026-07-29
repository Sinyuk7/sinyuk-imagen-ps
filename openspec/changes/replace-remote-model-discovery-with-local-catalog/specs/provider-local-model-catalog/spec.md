## ADDED Requirements

### Requirement: Provider default model templates are complete initialization data
系统 SHALL 允许 canonical Provider 声明 readonly `ProviderDefaultModelTemplate` 数组，数组可以为空。每项模板 SHALL 具有唯一非空 `modelId`，并精确关联同一 `ApiFormat` 的 `wireModelId`、`baseModelId` 与 Official Model Preset capability source。每项模板 SHALL 足以初始化完整可执行的 `UserModelConfig`，包括唯一确定的 request strategy 与默认输出能力。Application SHALL NOT 从模板名称、endpoint 或其他 Provider 推断这些事实。

#### Scenario: 完整模板初始化一个模型配置
- **WHEN** Provider 声明与同一 `ApiFormat` Official Model Preset 精确匹配的默认模板
- **THEN** 系统 SHALL 以模板的 `modelId` 和 `wireModelId`、及其 `baseModelId` 的完整 Official Model Preset 配置初始化 `UserModelConfig`

#### Scenario: 多个模型复用同一能力模板
- **WHEN** 多个默认模板具有不同 `modelId` 或 `wireModelId`，但引用同一 `baseModelId`
- **THEN** 系统 SHALL 为每项创建独立 `UserModelConfig`，并以该 `baseModelId` 的同一完整能力配置作为默认值

#### Scenario: 模板不能映射到完整配置
- **WHEN** 任一默认模板不能精确解析到匹配的 Official Model Preset 或唯一 request strategy
- **THEN** 系统 SHALL 拒绝该次默认模型初始化，且 SHALL NOT 写入任何默认 `UserModelConfig`

#### Scenario: ApiFormat 解析唯一 canonical Provider
- **WHEN** 系统为一个新 Profile 的 `ApiFormat` 解析 Provider
- **THEN** 系统 SHALL 使用 Provider routing table 为该 `ApiFormat` 定义的唯一 canonical Provider implementation

### Requirement: Default templates initialize only a new Profile
系统 SHALL 只在新 Profile 的首次创建流程中读取当前 canonical Provider 的默认模板数组。非空数组 SHALL 在全部验证成功后原子初始化全部默认 `UserModelConfig`；全部初始化成功后，系统 SHALL 将 setup Profile promotion 为 ready。空数组 SHALL NOT 阻止 Profile 配置保存，并 SHALL 保留既有手动首模型流程。

#### Scenario: Provider 有完整默认模板
- **WHEN** 用户创建 Profile，且 canonical Provider 返回非空且有效的默认模板数组
- **THEN** 系统 SHALL 初始化全部默认 `UserModelConfig`，并在全部初始化成功后将 Profile promotion 为 ready

#### Scenario: Provider 默认模板为空
- **WHEN** 用户创建 Profile，且 canonical Provider 返回空默认模板数组
- **THEN** 系统 SHALL 保存 setup Profile、进入手动模型配置流程，且 SHALL NOT 因缺少默认模板而拒绝 Profile 配置

#### Scenario: 默认模型初始化写入失败
- **WHEN** 已验证的默认模板数组不能被原子写入
- **THEN** 系统 SHALL 不将 Profile promotion 为 ready，且 SHALL NOT 留下部分默认 `UserModelConfig`

#### Scenario: 非空默认模板无效
- **WHEN** 用户保存 Profile 配置，且 canonical Provider 返回非空但无效的默认模板数组
- **THEN** 系统 SHALL 保存 setup Profile、报告默认模型初始化失败且允许重试或取消；系统 SHALL NOT promotion 为 ready、写入部分默认模型或改用 endpoint hint 自动创建模型

### Requirement: Initialized models become only user-owned data
默认模板成功初始化后，系统 SHALL 只将产生的 `UserModelConfig` 作为该 Profile 的模型事实。系统 SHALL NOT 持久化或投影 template source、template version 或 catalog/user origin；系统 SHALL NOT 在启动、查看 Profile、保存编辑或之后的目录变化时自动读取、补写、同步或覆盖该 Profile 的模型配置。

#### Scenario: 用户编辑默认初始化模型
- **WHEN** 用户编辑由默认模板初始化的 `UserModelConfig`
- **THEN** 系统 SHALL 仅保存该 Profile 的编辑后配置，且 SHALL NOT 再读取模板或恢复默认值

#### Scenario: 新版本目录增加模型
- **WHEN** Provider 的默认模板在既有 Profile 创建完成后增加新模型
- **THEN** 系统 SHALL NOT 自动向该既有 Profile 写入或展示新模型

### Requirement: Profiles consume persisted owned models
Profile Models、主界面模型选择和生成 admission SHALL 只消费持久化 `UserModelConfig`。系统 SHALL 使用 Profile `ApiFormat` 的唯一 canonical Provider 决定初始默认模板，并 SHALL NOT 回退至另一 Provider 的模板或目录。手动模型配置在保存后与默认初始化模型具有相同的用户数据语义。

#### Scenario: 用户查看已有 Profile Models
- **WHEN** UI 请求已创建 Profile 的模型列表
- **THEN** 系统 SHALL 只返回持久化 `UserModelConfig`，且 SHALL NOT 读取默认模板或发起远端模型请求

#### Scenario: 同一 ApiFormat 注册多个 Provider
- **WHEN** 系统无法为 Profile 的 `ApiFormat` 解析唯一 canonical Provider
- **THEN** 系统 SHALL 拒绝 Profile 创建或执行前配置解析，且 SHALL NOT 使用注册顺序或跨 Provider fallback 选择模板
