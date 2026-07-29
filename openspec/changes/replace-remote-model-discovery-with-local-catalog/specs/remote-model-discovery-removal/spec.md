## ADDED Requirements

### Requirement: Generic remote model discovery is not a product path
系统 SHALL NOT 通过 `Provider.discoverModels()`、通用远端 `/models` discovery、`ModelDiscoveryCache` 或 runtime suggestion 生成 Profile 模型候选。系统 SHALL NOT 持久化、读取或向 UI 投影 discovery cache。Provider 内部未来可采用本地 authored data 或 Provider-specific remote source 解析完整默认模板，但 Application 与 UI SHALL 只接收完整模板数组或空数组，且 SHALL NOT 消费裸 discovered ID。

#### Scenario: 用户查看 Profile Models
- **WHEN** UI 请求 Profile 的模型列表
- **THEN** 系统 SHALL 只返回持久化 owned `UserModelConfig`，且 SHALL NOT 发起通用远端模型 discovery 请求

#### Scenario: Provider endpoint 不支持模型列表
- **WHEN** Provider endpoint 不支持 `/models` 或任何模型列举接口
- **THEN** Profile 配置保存和手动模型配置流程 SHALL 不因 discovery 缺失而失败

#### Scenario: 旧 host discovery cache 存在
- **WHEN** Chrome 或 UXP host storage 包含遗留 `ModelDiscoveryCache` 数据
- **THEN** 系统 SHALL 忽略该数据，且 SHALL NOT 将其显示、迁移或用于初始化 `UserModelConfig`

### Requirement: Endpoint preset routing is only an empty-template fallback
系统 SHALL 仅在 canonical Provider 的默认模板数组为空时使用现有 endpoint hint 的 exact Official Model Preset 路由。该路由 SHALL NOT 请求远端模型目录；Provider 有非空默认模板时，系统 SHALL 忽略 endpoint hint 的自动模型创建语义，并以完整默认模板初始化。

#### Scenario: 默认模板为空且 endpoint hint 匹配已知 preset
- **WHEN** setup 输入匹配现有 exact Official Model Preset 路径，且 Provider 默认模板数组为空
- **THEN** 系统 SHALL 保持既有本地 preset 路由，不发起 discovery

#### Scenario: Provider 有默认模板且 endpoint hint 匹配
- **WHEN** setup 输入匹配现有 exact Official Model Preset 路径，且 Provider 返回非空默认模板数组
- **THEN** 系统 SHALL 以完整默认模板初始化 Profile，且 SHALL NOT 仅以 endpoint hint 创建模型

#### Scenario: 默认模板为空且 endpoint hint 无法匹配
- **WHEN** setup 输入不匹配任何 exact preset，且 Provider 默认模板数组为空
- **THEN** 系统 SHALL 使用既有手动模型配置路径，且 SHALL NOT 以远端 discovery 作为 fallback
