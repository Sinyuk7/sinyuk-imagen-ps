## ADDED Requirements

### Requirement: ProviderExtension SHALL 可选声明统一 model-status method
`ProviderExtension` contract SHALL 允许实现可选 `checkModelStatus()`。该方法 SHALL 接收当前 extension 的 provider config、实际 `wireModelId`、可选 cancellation signal 和 logger，并 SHALL 返回归一化的 model-status result。

#### Scenario: extension 不实现状态能力
- **WHEN** `ProviderExtension` 没有实现 `checkModelStatus()`
- **THEN** extension SHALL 仍是合法实现，且当前系统行为 SHALL 与没有 model-status contract 时一致

#### Scenario: extension 实现状态能力
- **WHEN** 未来 extension 实现 `checkModelStatus()`
- **THEN** extension SHALL 在内部拥有该中转特有的 URL、auth、request 和 response normalization，且 SHALL 只向调用方返回通用结果

### Requirement: Model-status result SHALL 区分证据状态
统一结果 SHALL 使用 `available`、`unavailable` 和 `unknown` 三态；只有上游协议明确报告不可用时才能返回 `unavailable`。未实现、协议不支持、鉴权失败、限流、网络失败、服务失败或响应无法解析 SHALL NOT 被表达为 `available`。

#### Scenario: 上游明确可用
- **WHEN** 状态协议成功且明确报告目标 `wireModelId` 可用
- **THEN** method SHALL 返回 `available`

#### Scenario: 上游明确不可用
- **WHEN** 状态协议成功且明确报告目标 `wireModelId` 不可用
- **THEN** method SHALL 返回 `unavailable`

#### Scenario: 无可靠状态证据
- **WHEN** 状态能力不支持或未来检查遇到 transport/protocol failure
- **THEN** method 或未来归一化 caller SHALL 使用 `unknown`，且 SHALL NOT 伪造 `available`

### Requirement: 本变更 SHALL 保持 model-status 零调用
本变更 SHALL 只增加 dormant type/method contract。系统 SHALL NOT 新增 status implementation、Application command、generation/admission caller、UI、cache、repository 或持久化字段，生产代码 SHALL 不调用 `.checkModelStatus()`。

#### Scenario: 当前 extension registry 初始化
- **WHEN** builtin extension registry 被初始化
- **THEN** 本变更 SHALL 不注册实现 `checkModelStatus()` 的生产 extension

#### Scenario: 当前生成执行
- **WHEN** Provider generation 执行 admission、dispatch 和 invoke
- **THEN** 执行路径 SHALL 不调用 `checkModelStatus()`，且现有生成行为 SHALL 不改变

#### Scenario: 静态零调用验收
- **WHEN** acceptance gate 搜索生产 packages 和 apps
- **THEN** `.checkModelStatus(` 调用点 SHALL 为零，仅 contract 声明和测试类型引用可存在

### Requirement: 未来 model-status 接入 SHALL 永不阻塞生成
任何未来调用 `checkModelStatus()` 的 change SHALL 将其作为 generation dispatch 的 advisory sidecar。状态结果或失败 SHALL NOT 参与 readiness/admission、延迟或阻止 invoke、取消 Job、改变 Job status、改变 endpoint health 或替换生成错误语义。

#### Scenario: sidecar 与生成同时启动
- **WHEN** 未来生成路径启动 model-status 检查
- **THEN** 正常 Provider invoke SHALL 独立继续，SHALL NOT 等待 status result 才 dispatch

#### Scenario: 状态明确不可用
- **WHEN** 未来 sidecar 返回 `unavailable`
- **THEN** 系统 MAY 显示 advisory 提示，但 SHALL NOT 拒绝、取消或失败当前生成

#### Scenario: 状态检查失败
- **WHEN** 未来 sidecar 抛错或返回 `unknown`
- **THEN** 系统 SHALL 保持当前生成结果和 Job lifecycle 不变
