## Context

当前共享 UI pattern 将页面空态直接包装为 `StatusNotice`，将列表空态、页面替代状态和局部反馈混为一类；`SegmentedTabs` 只有语义状态而没有视觉状态；部分 `PageFrame.watch` 使用页内数据，因而播放整页动画。Settings 的 Header 还依赖文本 fallback，输入区的余额和 mask/capture actions 则在真实 UXP 中暴露了宿主相关布局问题。

修复必须只触及 presentational shell。Provider、ComfyUI、Mask/Edit Region、持久化和执行路径保持不变。Chrome 是回归快速 gate，真实 Photoshop UXP 是宿主敏感视觉的最终验收边界。

## Goals / Non-Goals

**Goals:**

- 建立可复用、可测试的页面状态与列表 view model/state 边界。
- 让 Header、tab、空态、禁用项和页面动画在 Chrome 与 UXP 中具有同一视觉和交互契约。
- 让 composer 的余额、mask 和 capture actions 在窄面板中保持确定性位置和可辨识状态。
- 以 focused contract、visual baseline 和真实 UXP 截图验证回归修复。

**Non-Goals:**

- 不修改 Provider/ComfyUI 网络请求、模型选择、Mask/Edit Region 数据、任务队列或持久化语义。
- 不重做所有领域列表为同一 DOM 行；History、Provider、模型配置保留各自的领域 item 渲染。
- 不引入新的外部 UI、动画或图标依赖。

## Decisions

### 受限 `ListViewState`，而非万能数据列表组件

共享层定义 loading、error、empty、ready 的列表状态判定和 empty item 的交互规则；页面继续将领域数据映射为 Provider row、model configuration row 或 history task row。这样统一生命周期和无数据语义，不把不同领域的行结构、预览资源和操作混入泛型组件。

替代方案是让每页自行判断数组长度，或把所有列表强制映射成 `SettingsListRow`。前者已造成回归，后者会破坏 History 的缩略图和任务操作。

### 页面状态、局部通知和列表空态分层

`PageState` 仅用于非列表的页面替代状态，并提供透明的 empty variant；`StatusNotice` 用于仍有页面内容时的保存、字段和诊断反馈；列表 empty 必须以所属列表的完整 item 渲染。empty item 使用项目内 `empty` Icon、当前空文本、无导航 chevron，并在已有 Header 创建入口时真实禁用。

替代方案是通过 CSS 取消所有 neutral notice 背景。它会削弱 loading/error/diagnostic 的可见性，且无法解决列表结构和重复 CTA。

### Header 和 tab 由共享 pattern 拥有状态表达

`PageHeader` 的默认返回 affordance 使用项目 `IconButton` 与 chevron；`SegmentedTabs` 以 `aria-selected` 为唯一状态源，并由 pattern CSS 输出 active、focus、disabled 视觉。页面不得再手写相同状态样式。

替代方案是在 Settings、History 各自补 CSS。它会重新分散共享视觉语言，无法覆盖 UI Catalog 或后续消费者。

### 动画只响应页面身份

路由级 `AppShell` 继续拥有页面导航淡入。内层 `PageFrame` 的 watch 仅可包含稳定页面身份；tab、filter、round count、generation mode 等页内状态不得触发 page crossfade。若某个内容区域确实需要过渡，只对该区域使用 content-level motion。

替代方案是缩短或删除所有动画。它不能修复错误的动画所有权，也会改变正常导航反馈。

### Composer action row 使用确定性 CSS 与宿主安全图标

余额数值与单位使用 CSS 间距，不依赖 JSX whitespace。mask toggle 与 capture 同属右侧 capture action group，mask 位于 capture 左侧，二者共享尺寸/圆形轨道；mask 图标使用明确的 selected/unselected 图形，避免 13px 虚线 selection 图标在 UXP 退化为空框。

替代方案是保留原 action group 并调大虚线图标。它无法表达 selected state，且继续让左右 action 轨道不一致。

## Risks / Trade-offs

- [共享 pattern CSS 改动影响多个页面] → 使用 ARIA、focused component test、Chrome visual baseline 和 UXP 代表页面截图覆盖。
- [禁用 list row 的 API 变化影响已有可点击行] → 默认保持可点击，仅在 `disabled` 时阻断 pointer/keyboard、移出 tab 顺序并隐藏 trail。
- [清理动态 watch 影响预期内容动画] → 保留路由淡入；仅对明确需要过渡的内容区添加局部 motion，并验证不会重播 Header/tab bar。
- [mask 图标在 UXP 与 Chrome 有差异] → 使用项目 inline SVG、固定 viewBox 和真实 UXP 截图检查 selected/unselected 两态。

## Migration Plan

1. 先新增/修正 shared pattern、list state、Icon 和 CSS contract，再迁移各页面调用点。
2. 更新 focused unit/ARIA tests 和 Chrome visual baselines；不通过更新 baseline 掩盖失败。
3. 构建 UXP bundle，在 Photoshop 中验证 Main、History、Settings、Provider 空态、模型空态及 mask 两态。
4. 若出现宿主特有回归，回退对应 presentational commit；业务数据和执行路径无需迁移或回滚。

## Open Questions

无。Header `+` 是 Provider 与模型配置列表唯一创建入口；History empty item 不提供创建动作。
