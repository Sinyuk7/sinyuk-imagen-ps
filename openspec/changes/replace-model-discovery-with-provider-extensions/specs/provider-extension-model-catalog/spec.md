## ADDED Requirements

### Requirement: ProviderExtension SHALL 表达具体中转的局部能力
系统 SHALL 保持 Provider 作为通用 `apiFormat` 协议实现，并 SHALL 以独立 `ProviderExtension` 表达具体中转的 Profile 匹配、本地模型目录和可选扩展能力。`ProviderExtension` SHALL 属于 providers 层，且 SHALL NOT 持久化 Profile 或 Model Config。

#### Scenario: 中转复用通用协议
- **WHEN** 一个中转使用已有 `apiFormat`，但拥有自己的 endpoint 和模型命名
- **THEN** 系统 SHALL 允许它注册 `ProviderExtension`，且 SHALL NOT 要求新增或复制通用 Provider

#### Scenario: extension 创建匹配上下文
- **WHEN** Application 为 Profile 解析 extension
- **THEN** Application SHALL 只向 providers 层传递 secret-free `apiFormat` 和 canonical connection/endpoint 匹配事实

### Requirement: ProviderExtension registry SHALL 解析唯一来源
系统 SHALL 通过显式初始化的 registry 注册 extension，且 SHALL 对每个 Profile 解析零个或一个 extension。注册顺序 SHALL NOT 成为冲突优先级。

#### Scenario: 没有 extension 命中
- **WHEN** 所有已注册 extension 均不匹配 Profile
- **THEN** registry SHALL 返回未命中，模型来源 SHALL 为空，系统 SHALL NOT 请求远端 `/models` 或执行 Official Catalog fallback

#### Scenario: 一个 extension 命中
- **WHEN** 恰好一个已注册 extension 匹配 Profile
- **THEN** registry SHALL 返回该 extension 作为唯一模型来源

#### Scenario: 多个 extension 命中
- **WHEN** 两个或更多 extension 匹配同一 Profile
- **THEN** registry SHALL 返回确定性配置错误，且 SHALL NOT 按注册顺序选择其中一个

#### Scenario: duplicate extension id
- **WHEN** registry 注册已存在的 extension `id`
- **THEN** registry SHALL 拒绝注册并返回结构化 duplicate-id error

### Requirement: Extension 模型目录 SHALL 可 exact 物化
每个 extension SHALL 在自己的目录维护 readonly 模型 mapping。每项 SHALL 包含非空 `modelId`、`wireModelId` 和 `baseModelId`；`baseModelId` SHALL exact 命中同 `apiFormat` 的 Official Model Preset。`requestStrategyId`、`outputExposure` 和 `outputMatrix` SHALL 从 preset 派生，SHALL NOT 在 extension 目录复制维护。

#### Scenario: 合法模型 seed
- **WHEN** extension 返回的 seed exact 命中兼容 Official Model Preset
- **THEN** Application SHALL 能物化完整 `UserModelConfig` 并复用现有 strategy、exposure 和 matrix validation

#### Scenario: 非法模型 seed
- **WHEN** seed 字段为空、`apiFormat` 不兼容或 `baseModelId` 未命中 preset
- **THEN** 系统 SHALL 在任何 repository write 前拒绝整个 source 结果

#### Scenario: 新增中转 extension
- **WHEN** 维护者注册新的中转 extension
- **THEN** 该中转的 match、模型目录和组装代码 SHALL 收敛在该 extension 的独立目录

### Requirement: Application SHALL 采用本地 modelId 优先
Application SHALL 以 `(profileId, modelId)` 作为 owned model identity，对唯一 extension source 与本地 `UserModelConfig` 执行本地优先补写。系统 SHALL 只保存本地缺失的 source `modelId`，并 SHALL NOT 覆盖、更新或删除任何已有配置。

#### Scenario: source 与本地同 modelId
- **WHEN** extension source 与本地配置拥有相同 `modelId`
- **THEN** 系统 SHALL 保留本地完整配置并跳过 source 项，即使二者的 `wireModelId` 或 `baseModelId` 不同

#### Scenario: source model 本地缺失
- **WHEN** extension source 的 `modelId` 不存在于本地
- **THEN** Application SHALL 物化并持久化该 Model Config

#### Scenario: local-only model
- **WHEN** 本地配置的 `modelId` 不存在于 extension source
- **THEN** 系统 SHALL 保留并返回该本地配置

#### Scenario: 重复加载
- **WHEN** 同一 Profile 对同一 extension 结果重复执行模型加载
- **THEN** 第二次执行 SHALL 不产生覆盖或重复写入，并 SHALL 返回相同 owned model 集合

#### Scenario: source 为空
- **WHEN** Profile 未命中 extension 或 extension 返回空模型目录
- **THEN** Application SHALL 不写入模型，并 SHALL 返回当前本地 owned model 列表

### Requirement: Profile Models SHALL 只公开持久化 owned models
Profile Models、Settings selector 和 Composer SHALL 只消费由 `UserModelConfigRepository` 支持的 owned model projection。加载 extension 后，command SHALL 返回持久化后的完整列表；UI SHALL NOT 维护或展示 runtime suggestion。

#### Scenario: extension 补写模型成功
- **WHEN** 用户在 Profile Models 触发模型加载且 Application 成功持久化缺失项
- **THEN** 页面 SHALL 直接显示返回的 owned model rows，且这些模型 SHALL 可进入既有编辑和选择路径

#### Scenario: 加载失败
- **WHEN** extension 解析、seed validation 或持久化失败
- **THEN** UI SHALL 保留当前 owned rows、显示 action failure，并 SHALL NOT 创建 suggestion row

#### Scenario: 无模型来源
- **WHEN** Profile 没有本地模型且没有 extension 命中
- **THEN** 页面 SHALL 显示既有 owned-model empty state，并 SHALL 允许用户手动创建 Model Config

### Requirement: 通用远端 model discovery SHALL 被移除
系统 SHALL 删除通用 Provider `/models` discovery、裸 `DiscoveredModel`、draft discovery、discovery cache 和 suggestion UI。Provider descriptor 的 model fallback 字段若仅服务该旧链且没有 execution consumer，也 SHALL 被删除。Official Model Preset 和 endpoint hint setup orchestration SHALL 保持独立存在。

#### Scenario: Provider 执行接口
- **WHEN** builtin Provider 被创建
- **THEN** 它 SHALL 不暴露 `discoverModels()`，且 SHALL 不包含通用 `/models` 请求或 parser

#### Scenario: host persistence 初始化
- **WHEN** Chrome 或 UXP host 初始化 model repositories
- **THEN** host SHALL 不创建、注册或读写 discovery cache repository/store/file

#### Scenario: Profile Models 渲染
- **WHEN** Profile Models 页面加载或刷新
- **THEN** 页面 SHALL 不包含 discovered suggestion section、suggestion route 或相关 i18n copy

#### Scenario: endpoint hint setup 路由
- **WHEN** Profile setup 收到显式 endpoint model hint
- **THEN** 既有 exact preset 路由 SHALL 保持可用，且 SHALL NOT 被实现为远端 `/models` discovery
