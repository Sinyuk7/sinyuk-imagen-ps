## ADDED Requirements

### Requirement: Discovery suggestions SHALL remain runtime-only page state
如果保留 `discovery`，系统 SHALL 把 discovery 结果视为当前 `ProfileModelsPage` 的 runtime-only `suggestion state`。`discovery suggestion` MUST NOT 被持久化为 `UserModelConfig`、`ProviderProfile` 字段，或任何产品真相缓存。

#### Scenario: discovery 结果不写入持久化存储
- **WHEN** 用户在某个 `ProfileModelsPage` 触发一次 `discovery`
- **THEN** 系统只在当前页面持有返回的 `suggestion`
- **AND** 系统不会把这些 `suggestion` 写入持久化 `discovery cache`

#### Scenario: 离开页面后 suggestion 可以丢失
- **WHEN** 用户离开当前 `ProfileModelsPage`，随后重新进入
- **THEN** 系统可以不保留之前的 `suggestion`
- **AND** 这不会影响任何已保存 `configured model` 的 ownership 或 availability

### Requirement: Discovery suggestions SHALL render below configured models and stay non-selectable
`discovery suggestion` SHALL 始终排在 owned `configured model` 列表之后，并 MUST NOT 被当成当前 `profile` 已可直接使用的 `model`。

#### Scenario: suggestion 排在 configured model 下方
- **WHEN** 当前 `profile` 同时拥有已保存的 `configured model` 与新发现的 `suggestion`
- **THEN** 页面先展示 owned `configured model`
- **AND** 页面再展示 runtime-only `suggestion`

#### Scenario: suggestion 按发现结果原始顺序展示
- **WHEN** `ProfileModelsPage` 展示多个 `discovery suggestion`
- **THEN** 系统保持 provider 返回的原始顺序
- **AND** 不因 `modelId` 字母顺序或预设模板名称重新排序

#### Scenario: 已配置的 suggestion 不再重复出现
- **WHEN** 某个 `discovery suggestion` 的 `id` 与当前 `profile` 已拥有的某个 `configured model` 的 `modelId` 相同
- **THEN** 该 suggestion 不会再次出现在 suggestion 列表中
- **AND** 只有 owned `configured model` 被展示

#### Scenario: suggestion 不进入外部 selector
- **WHEN** 当前页面存在尚未保存的 `discovery suggestion`
- **THEN** 主页面 selector、settings summary 与 `Profile Detail` quick selector 都不会把它视为可选 `model`
- **AND** 它不会获得默认模型身份

### Requirement: Discovery failure SHALL leave page state unchanged
当 `discovery` 调用失败时，系统 MUST NOT 覆盖已有的 owned `configured model` 列表，也 MUST NOT 把错误结果当作有效 suggestion 展示。

#### Scenario: discovery 失败时显示错误状态
- **WHEN** `ProfileModelsPage` 触发 `discovery` 但调用失败
- **THEN** 系统保留当前页面已展示的 owned `configured model`
- **AND** 系统向用户展示失败状态或错误信息
- **AND** 系统不会把旧 suggestion 或错误数据混入列表

#### Scenario: discovery 加载期间禁止重复触发
- **WHEN** 一次 `discovery` 调用尚未完成
- **THEN** 系统禁用再次触发 `discovery` 的控件
- **AND** 已展示列表保持不变

### Requirement: Choosing a discovery suggestion SHALL only prefill the editor draft
当用户选择某个 `discovery suggestion` 时，系统 SHALL 只用它预填 `ModelConfigurationPage` 草稿，而不是直接生成外部可用 `model`。用户仍 MUST 显式完成 editor 并保存，才能得到新的 `UserModelConfig`。

#### Scenario: suggestion 预填 modelId 与 wireModelId
- **WHEN** 用户从 `ProfileModelsPage` 选择一个 `discovery suggestion`
- **THEN** 系统用该 suggestion 的 `id` 预填 editor 的 `modelId` 与 `wireModelId`
- **AND** 用户仍然需要在 editor 中确认或选择 `official preset`

#### Scenario: 保存前 suggestion 不会变成 configured model
- **WHEN** 用户打开了由 suggestion 预填的 editor，但没有保存就离开
- **THEN** 系统不会创建新的 `UserModelConfig`
- **AND** 该 suggestion 不会出现在任何 owned `configured model` 列表或外部 surface 中
