## ADDED Requirements

### Requirement: Main-page model selection SHALL derive only from the active profile's owned configured models
系统 SHALL 只用当前 active `profile` 拥有的 `configured model` 填充 `main-page model selector`。该 selector MUST NOT 包含 `official preset`、`discovery suggestion`，或其他 `profile` 拥有的 `model`。

#### Scenario: 主页面只显示当前 profile 的 owned models
- **WHEN** profile A 是当前 active `profile`，且 profile A 拥有两个 `configured model`
- **THEN** `main-page model selector` 只显示这两个 `configured model`
- **AND** 不显示其他 `profile` 的任何 `model`

#### Scenario: 主页面排除非 owned entry
- **WHEN** 当前 `profile` 只有 `official preset` 或 `discovery suggestion`，但尚未保存任何 `configured model`
- **THEN** `main-page model selector` 不会把这些 entry 当成可选 `model`

### Requirement: Profile selection surfaces SHALL not depend on persisted selection state
所有 `profile-owned selection surface` 的 availability SHALL 只由 ownership 决定。系统 MUST NOT 再依赖 `selectedModelIds`、`defaultModelId`，或任何独立 persisted membership/default state。

#### Scenario: 保存后直接出现在 selection surface
- **WHEN** 用户在当前 `profile` 下保存一个 `configured model`
- **THEN** 该 `model` 会直接出现在当前 `profile` 的 selector 与 summary surface 中
- **AND** 不需要额外的 `selectedModelIds`、`defaultModelId` 或等价 profile 写入步骤

#### Scenario: 删除后直接从 selection surface 消失
- **WHEN** 用户删除一个由当前 `profile` 拥有的 `configured model`
- **THEN** 该 `model` 会直接从当前 `profile` 的 selector 与 summary surface 中消失
- **AND** 不需要额外的 deselection 动作

### Requirement: Switching profiles SHALL switch the entire model universe
当 active `profile` 发生变化时，系统 SHALL 把所有 `model-selection surface`、summary surface 与 effective selection 切换到新 active `profile` 的 owned `configured model` 集合。

#### Scenario: 切换 profile 时切换 selector 宇宙
- **WHEN** 用户从 profile A 切换到 profile B
- **THEN** `main-page model selector` 只刷新展示 profile B 的 owned `configured model`
- **AND** profile A 独有的 `model` 不再作为 profile B 的可选项

#### Scenario: 相同 apiFormat 的两个 profile 仍可拥有不同 model set
- **WHEN** profile A 与 profile B 具有相同 `apiFormat`，但分别保存了不同的 `configured model`
- **THEN** 系统分别展示两套不同的 selector 结果
- **AND** 不会因为 `apiFormat` 相同而自动共享 `model` 集合

### Requirement: Effective model selection SHALL use selectedModelId with first-configured fallback
当某个 `profile` 拥有一个或多个 `configured model` 时，系统 SHALL 先使用当前 UI/runtime `selectedModelId`。如果 `selectedModelId` 为空、无效，或不属于当前 active `profile` 的 owned `configured model` 列表，系统 SHALL 使用该列表的第一项作为 effective model。

#### Scenario: 有合法 selectedModelId 时高亮当前选择
- **WHEN** 当前 active `profile` 拥有多个 `configured model`
- **AND** UI/runtime `selectedModelId` 指向其中一个 model
- **THEN** 主页面 selector、`profile detail` quick selector 与 settings summary 都把该 model 作为 effective selection
- **AND** 其他 owned `configured model` 仍然保留在可选列表中

#### Scenario: 没有 selectedModelId 时回退第一项
- **WHEN** 当前 active `profile` 拥有一个或多个 `configured model`
- **AND** UI/runtime 尚未记录 `selectedModelId`
- **THEN** 主页面 selector、`profile detail` quick selector 与 settings summary 都使用 owned list 的第一项作为 effective selection
- **AND** 系统不会写入 `defaultModelId` 或等价 profile-level default state

#### Scenario: selectedModelId 失效时回退第一项
- **WHEN** 当前 UI/runtime `selectedModelId` 指向一个不存在、已删除，或属于其他 `profile` 的 model
- **AND** 当前 active `profile` 仍然拥有一个或多个 `configured model`
- **THEN** 系统忽略该失效选择
- **AND** 使用当前 active `profile` owned list 的第一项作为 effective selection

#### Scenario: 没有 configured model 时显示无可选模型状态
- **WHEN** 当前 active `profile` 不拥有任何 `configured model`
- **THEN** 主页面 selector、`profile detail` quick selector 与 settings summary 都显示无可选模型状态
- **AND** 系统不会把 `official preset` 或 `discovery suggestion` 当作 fallback model

#### Scenario: selected 标注不参与 availability 过滤
- **WHEN** `listProfileModels()` 返回当前 active `profile` 的 owned `configured model`
- **THEN** 主页面 selector 使用完整 owned list 作为可选项
- **AND** `selected` 只可作为 UI surface-local 高亮标注
- **AND** 系统 MUST NOT 用 `selected === true` 过滤 selector options
