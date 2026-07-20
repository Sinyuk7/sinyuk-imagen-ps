## Why

`standardize-dual-runtime-ui-system` 的迁移在真实 Photoshop UXP 中暴露出一组共享视觉回归：Header 的返回控件退化为文本、tab 没有选中态、页内状态触发整页淡入、空状态被错误渲染为通知卡片，以及列表空态与真实列表项不一致。输入区还存在余额单位黏连与 mask toggle 图标、位置、状态表达不符合 UXP 宿主视觉约束的问题。

这些问题影响首页、历史、Provider、模型配置和设置页面的基本可辨识性与操作效率，且现有静态/语义测试没有覆盖对应的视觉和过渡契约。

## What Changes

- 恢复统一的 `PageHeader` 返回图标、中心轨道和 `SegmentedTabs` 选中/焦点/禁用视觉状态。
- 将 `PageFrame` 动画限制为页面身份变化，避免 tab、筛选、生成模式和列表数量变化触发整页淡入。
- 区分 `PageState` 的页面替代状态与 `StatusNotice` 的局部反馈；为非列表空态提供无通知背景的表达。
- 新增受限的 `List` / `ListItemShell` / `ListStateItem` pattern：loading、empty、error 与领域行共享所属列表的外壳；页面继续拥有 lifecycle 条件判断，shared pattern 不拥有数据请求、缓存或自动重试。
- 将所有现有独立领域列表迁移到该 pattern：Settings Provider、ComfyUI workflow picker、Profile Models/建议、Prompt presets、History、首页 profile chooser 与 layer picker。首页 `conversation.rounds` chat transcript 是唯一例外；刷新时保留已有领域行。
- 修复余额数值与单位的确定性间距；将 mask toggle 移到捕获按钮左侧，使用 UXP 稳定图标并清晰表达选中/未选中状态。
- 补足 Chrome/UXP visual、ARIA 和交互测试，覆盖 Header、tab、列表状态行、刷新保留内容、动画边界与 composer action row。

## Capabilities

### New Capabilities
- `uxp-page-list-visual-recovery`: 恢复 Photoshop UXP 页面 header、tab、状态、列表空态和动画边界的共享视觉与交互契约。
- `uxp-composer-action-affordances`: 恢复输入区余额与 mask/capture action 的宿主安全布局、图标和状态表达。

### Modified Capabilities

无。

## Impact

- 影响 `apps/app/src/shared/ui` 的 patterns、Header、tabs、list row、页面状态和 motion 边界。
- 影响 Main、History、Settings、Profile Models、Prompt Settings 与 ComfyUI workflow picker 的 presentational shell；History 保留任务行、缩略图和任务操作结构，不改变 Provider、ComfyUI、Mask/Edit Region、持久化或任务执行业务契约。
- 后续新增独立领域列表必须遵守 shared list-state contract，并附 focused lifecycle/ARIA 与 Chrome visual 证据；这不适用于首页 `conversation.rounds` transcript、select/options、表单矩阵或 capability grids。
- 不引入 `useAsyncList`、通用请求层、缓存、自动 retry 或虚拟化列表；虚拟化须以独立的性能证据和 change 决定。
- 影响 UI 视觉、ARIA、focused interaction、Chrome visual 和真实 Photoshop UXP 验收测试。
