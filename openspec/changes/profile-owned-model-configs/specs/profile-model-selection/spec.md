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

### Requirement: Profile selection surfaces SHALL not depend on selectedModelIds
所有 `profile-owned selection surface` 的 availability SHALL 只由 ownership 决定。系统 MUST NOT 再依赖 `selectedModelIds` 这类独立 persisted membership list。

#### Scenario: 保存后直接出现在 selection surface
- **WHEN** 用户在当前 `profile` 下保存一个 `configured model`
- **THEN** 该 `model` 会直接出现在当前 `profile` 的 selector 与 summary surface 中
- **AND** 不需要额外的 `selectedModelIds` 写入步骤

#### Scenario: 删除后直接从 selection surface 消失
- **WHEN** 用户删除一个由当前 `profile` 拥有的 `configured model`
- **THEN** 该 `model` 会直接从当前 `profile` 的 selector 与 summary surface 中消失
- **AND** 不需要额外的 deselection 动作

### Requirement: Switching profiles SHALL switch the entire model universe
当 active `profile` 发生变化时，系统 SHALL 把所有 `model-selection surface`、summary surface 与默认模型引用切换到新 active `profile` 的 owned `configured model` 集合。

#### Scenario: 切换 profile 时切换 selector 宇宙
- **WHEN** 用户从 profile A 切换到 profile B
- **THEN** `main-page model selector` 只刷新展示 profile B 的 owned `configured model`
- **AND** profile A 独有的 `model` 不再作为 profile B 的可选项

#### Scenario: 相同 apiFormat 的两个 profile 仍可拥有不同 model set
- **WHEN** profile A 与 profile B 具有相同 `apiFormat`，但分别保存了不同的 `configured model`
- **THEN** 系统分别展示两套不同的 selector 结果
- **AND** 不会因为 `apiFormat` 相同而自动共享 `model` 集合

### Requirement: No-default-model state SHALL be explicit
当某个 `profile` 拥有 `configured model` 但没有 `defaultModelId` 时，系统 SHALL 在主页面 selector、`profile detail`、settings summary 与相关 selector 上呈现显式 `no-default-model state`，而不是静默自动选择其他 `model`。

#### Scenario: 删除默认模型后显示 no-default-model state
- **WHEN** 用户删除当前 `defaultModelId` 指向的 `configured model`，且该 `profile` 仍然拥有其他 `configured model`
- **THEN** `profile detail`、settings summary 与相关 selector 呈现显式 `no-default-model state`
- **AND** 系统不会自动提升另一个 `model` 成为默认模型

#### Scenario: summary 只从 owned default 派生
- **WHEN** 某个 `profile` 拥有 `configured model`，但 `defaultModelId` 为空
- **THEN** settings summary 不会伪造一个默认模型展示
- **AND** 用户仍然可以看到该 `profile` 拥有的模型列表或空默认状态

#### Scenario: main-page selector 保持显式空选择
- **WHEN** 某个 active `profile` 拥有一个或多个 `configured model`，但 `defaultModelId` 为空
- **THEN** `main-page model selector` 保持 placeholder 或显式空选择状态
- **AND** 系统不会自动高亮当前 owned 列表中的第一个 `model`
