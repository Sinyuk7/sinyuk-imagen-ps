## ADDED Requirements

### Requirement: 固定 provider 账号
系统 MUST 只公开 `grsai` 和 `runninghub` 两个产品 provider，并且每个 provider MUST 只有一份当前 API Key。

#### Scenario: 更新 provider API Key
- **WHEN** 用户保存某个 provider 的新 API Key
- **THEN** 系统覆盖该 provider 的当前 Key，且不会创建新的 Profile 或账号记录

### Requirement: 本地 catalog authority
系统 MUST 通过 catalog resolver 加载模型和参数。resolver MUST 优先尝试远程 catalog source；远程不可用、超时或校验失败时 MUST 回退到随发布物提供的 `packages/providers/catalog/` 本地 catalog。当前实现可以只启用本地 source，但不得让 UI 或 Application 直接读取 JSON 文件。

#### Scenario: 加载有效 catalog
- **WHEN** 应用启动并加载 catalog
- **THEN** 系统校验模型 ID 唯一、默认值合法、参数选项非空，并向 UI 提供只读 projection

#### Scenario: 远程 catalog 回退
- **WHEN** 远程 catalog source 请求失败或返回未通过 schema 校验的内容
- **THEN** resolver 使用对应 provider 的本地 catalog，并返回来源诊断而不阻断应用启动

### Requirement: 动态基础参数
系统 MUST 根据当前 `providerId + modelId` 的 catalog 参数动态生成主页面的最小选择控件，并只保存该维度的参数偏好。UI MUST NOT 承担 provider-specific 参数组合检查。

#### Scenario: 切换模型
- **WHEN** 用户切换模型
- **THEN** UI 立即替换为该模型声明的参数选项，并读取该模型独立的偏好；不存在偏好时使用 catalog 默认值，旧模型的参数值不得直接复用

### Requirement: 独立 provider 编辑页
系统 MUST 为 `grsai` 和 `runninghub` 提供独立编辑页。页面 MAY 共享 API key/base URL 基类表单，但 provider-specific 字段、文案和保存校验 MUST 由对应 provider 页面决定。

#### Scenario: 打开 provider 设置
- **WHEN** 用户从 Provider Settings 选择 GRSAI 或 RunningHub
- **THEN** 系统进入对应 provider 的独立编辑页，保存只更新该 provider 的单条账号记录
