## ADDED Requirements

### Requirement: Shared page navigation affordances
`PageHeader` SHALL 在存在返回动作时渲染项目 icon-only back affordance，且 Header SHALL 使用对称的左右轨道和稳定的中心区域。`SegmentedTabs` SHALL 以 `aria-selected` 驱动 active、focus 和 disabled 的可见状态。

#### Scenario: Settings root shows an icon back control
- **WHEN** 用户打开 Settings root
- **THEN** 返回控件 SHALL 显示 chevron icon，不显示 `Back` 文本，且保留可访问名称和原有返回行为

#### Scenario: A selected tab is visually distinguishable
- **WHEN** Settings、History 或 UI Catalog 中一个 tab 的 `aria-selected` 为 `true`
- **THEN** 该 tab SHALL 显示 active visual state，其他 tab SHALL 显示 inactive state，键盘焦点和 disabled 状态 SHALL 可见

### Requirement: Page animation responds only to page identity
`PageFrame` SHALL 只在页面身份变化时播放 page-level motion。tab、filter、列表数量、generation mode 或其他页内状态 SHALL NOT 重播 Header、tab bar 或完整页面的 crossfade。

#### Scenario: Switching Settings tabs
- **WHEN** 用户在 Settings root 切换 Provider、ComfyUI 或 Configuration tab
- **THEN** 内容 SHALL 切换，Header 和 tab bar SHALL 保持可见且完整页面 SHALL NOT 从透明状态重新淡入

#### Scenario: Updating Main or History content
- **WHEN** Main 新增 generation round 或 History filter/结果数量变化
- **THEN** 页面内容 SHALL 更新，完整页面 SHALL NOT 重播 page-level crossfade

### Requirement: Page, notice, and list empty states are distinct
非列表页面的 replacement state SHALL 使用 `PageState`；有正常页面内容时的局部反馈 SHALL 使用 `StatusNotice`；列表无项目时 SHALL 渲染所属列表的完整 empty item，而不是 `PageState` 或 `StatusNotice`。

#### Scenario: Non-list page empty state
- **WHEN** 非列表页面没有可显示的内容
- **THEN** `PageState` SHALL 显示空态文本和操作而不使用 neutral notice card background

#### Scenario: Provider list is empty
- **WHEN** Provider 列表没有已配置 Provider
- **THEN** 页面 SHALL 渲染一个 disabled Provider-style empty item，使用 `empty` icon、当前空态文本、无 navigation chevron，并且不显示与 Header `+` 重复的添加按钮

#### Scenario: Model configuration list is empty
- **WHEN** 某个 Provider 没有模型配置
- **THEN** 页面 SHALL 渲染一个 disabled model configuration-style empty item，使用 `empty` icon、当前空态文本和保存提示，且不显示 navigation chevron

#### Scenario: History list is empty
- **WHEN** 当前 History filter 没有匹配记录
- **THEN** 页面 SHALL 渲染一个 disabled History task-row-style empty item，使用 `empty` icon 和当前空态文本，且不提供任务操作

### Requirement: Disabled list items are noninteractive
共享 list row 的 disabled state SHALL 移出键盘 tab 顺序、设置 `aria-disabled="true"`、阻断 pointer 和 keyboard activation，并移除导航 affordance。已有创建入口时 empty item SHALL 使用 disabled state；不存在创建入口时 empty item 才可明确绑定唯一的创建动作。

#### Scenario: Disabled empty item receives activation input
- **WHEN** 用户点击或按 Enter/Space 作用于 disabled empty item
- **THEN** 页面 SHALL NOT 触发打开、创建或导航行为

### Requirement: List lifecycle uses a shared view model boundary
共享 UI SHALL 提供 loading、error、empty、ready 的 `ListViewState` 判定边界。页面 SHALL 使用该边界决定列表 lifecycle，但 SHALL 保留各领域的 item renderer 和业务数据映射。

#### Scenario: A page maps domain items into a list state
- **WHEN** 页面同时提供 items、loading 和 error
- **THEN** 它 SHALL 通过 shared `ListViewState` 判定 replacement state 或 item rendering，而不在页面内重新定义 empty precedence
