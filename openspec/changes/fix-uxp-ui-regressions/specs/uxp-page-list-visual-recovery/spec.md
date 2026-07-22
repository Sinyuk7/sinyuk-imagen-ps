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

### Requirement: Page, notice, and list states are distinct
非列表页面的 replacement state SHALL 使用 `PageState`；有正常页面内容时的局部反馈 SHALL 使用 `StatusNotice`；列表首次 loading、error、empty SHALL 渲染所属列表的完整 `ListStateItem`，而不是 `PageState` 或 `StatusNotice`。`List` SHALL 只拥有子项布局，`ListItemShell` SHALL 只拥有 row geometry；一个 `List` SHALL 只包含 Real、Loading、Empty 或 Error ListItem。状态行与领域行 SHALL 共享外层宽度、padding、border/background、icon 区域、主标题/描述区域、trailing action 区域、hover/disabled 规则、最小高度和项目间 gap。状态行只可改变 icon、title、description、loading indicator、可选操作按钮和 `default`/`muted`/`danger` tone；empty 或 error SHALL NOT 使用独立的全页面居中或通知卡片布局。状态行本身 SHALL NOT 绑定 row navigation 或 `onPress`。

#### Scenario: Non-list page empty state
- **WHEN** 非列表页面没有可显示的内容
- **THEN** `PageState` SHALL 显示空态文本和操作而不使用 neutral notice card background

#### Scenario: A list initially loads without domain rows
- **WHEN** 列表正在首次加载且没有可显示的领域 items
- **THEN** 页面 SHALL 在所属列表中渲染 loading `ListStateItem`，其高度和 leading/text/trailing 轨道 SHALL 与该列表的领域行保持一致

#### Scenario: A list initially fails without domain rows
- **WHEN** 列表首次加载失败且没有可显示的领域 items
- **THEN** 页面 SHALL 在所属列表中渲染 error `ListStateItem`；存在 retry 或其他页面动作 callback 时 SHALL 只显示该 direct action

#### Scenario: Provider list is empty
- **WHEN** Provider 列表没有已配置 Provider
- **THEN** 页面 SHALL 渲染一个 Provider-style empty `ListStateItem`，使用 `empty` icon、当前空态文本、无 navigation chevron，并且不显示与 Header `+` 重复的添加按钮

#### Scenario: Model configuration list is empty
- **WHEN** 某个 Provider 没有模型配置
- **THEN** 页面 SHALL 渲染一个 model configuration-style empty `ListStateItem`，使用 `empty` icon、当前空态文本和保存提示，且不显示 navigation chevron

#### Scenario: History list is empty
- **WHEN** 当前 History filter 没有匹配记录
- **THEN** 页面 SHALL 渲染一个 History task-row-style empty `ListStateItem`，使用 `empty` icon 和当前空态文本，保留 History task-row visual structure，且不提供任务操作

#### Scenario: Refreshing a list with domain rows
- **WHEN** 列表刷新期间已经有可显示的领域 items
- **THEN** 页面 SHALL 保留既有领域 rows；refreshing 只可在 list header 或轻量 loading `ListStateItem` 中表达，且 SHALL NOT 将既有 rows 替换为初始 loading state

#### Scenario: A refresh fails with domain rows
- **WHEN** 列表刷新失败但仍有可显示的领域 items
- **THEN** 页面 SHALL 保留既有领域 rows，并以局部 error feedback 或轻量 error `ListStateItem` 表达失败

### Requirement: Inert list state items are noninteractive
没有 direct action 的 `ListStateItem` SHALL 移出键盘 tab 顺序、设置 `aria-disabled="true"`、阻断 pointer 和 keyboard activation，并移除导航 affordance。状态行的 direct action SHALL 只由提供的 callback 表达；页面不得为 retry、创建或打开设置再定义 capability boolean。

#### Scenario: An inert state item receives activation input
- **WHEN** 用户点击或按 Enter/Space 作用于没有 direct action 的列表状态行
- **THEN** 页面 SHALL NOT 触发打开、创建或导航行为

### Requirement: List state rendering does not own domain data
页面 SHALL 保留现有 Store/Hook 对领域数据与 lifecycle 的所有权，并根据 `items`、`loading` 和 `error` 直接决定领域 rows 或 `ListStateItem`。共享 UI SHALL NOT 提供数据请求层、缓存、自动 retry 或万能 `ListStateBoundary`；业务数组 SHALL 只包含领域对象，不得混入 loading、empty 或 error 项。

#### Scenario: A future virtualized list creates render items
- **WHEN** 某个列表在独立性能变更中采用虚拟化
- **THEN** 仅虚拟化 adapter MAY 从页面最终渲染计划创建 `RenderItem`；Store/Hook 的领域数组 SHALL 保持纯净，初始替代态与 refresh 保留 rows 语义 SHALL 保持不变

### Requirement: All independent lists adopt the shared list-state contract
独立领域列表是页面、弹层或可复用 feature surface 中呈现同一领域集合 peer rows，且拥有初始 loading、empty、error 或 refresh 表达的集合。所有现有独立领域列表 SHALL 使用 `List`、所属领域 shell 与 `ListStateItem`：Settings Provider/static navigation、ComfyUI workflow picker、Profile Models/discovered suggestions、Prompt presets、History、Main profile chooser 和 layer picker。新建独立领域列表 SHALL 同样遵守该 contract；不得以静态 `.map()` 搜索代替语义验收。

#### Scenario: An existing independent list is migrated
- **WHEN** 本 change 迁移任一现有独立领域列表
- **THEN** 该列表 SHALL 保留其领域 renderer、领域 actions 与可访问性语义，并在适用时以同壳 `ListStateItem` 表达 initial loading/error/empty 和 refresh retention

#### Scenario: A future independent list is introduced
- **WHEN** 后续 change 新增独立领域列表
- **THEN** 该 change SHALL 提供初始 loading/error/empty、refresh retention 与 inert state ARIA 的 focused evidence，以及对应 initial replacement state 的 Chrome visual case，并运行 `pnpm check:policy` 和相关 focused/visual suites

#### Scenario: Main conversation transcript remains excluded
- **WHEN** Main 渲染 `conversation.rounds`
- **THEN** 它 SHALL 保留 transcript-specific chronology、scroll anchoring、round media/action layout 与 empty-state contract，且 SHALL NOT 被要求使用 `List`、`ListItemShell` 或 `ListStateItem`

#### Scenario: A control collection is not an independent list
- **WHEN** 页面渲染 `TextSelect` options、表单字段矩阵、endpoint 编辑行或 model capability grid
- **THEN** 它 SHALL 保留其 control/form/grid semantics，且 SHALL NOT 因本 contract 被错误改造为领域列表
