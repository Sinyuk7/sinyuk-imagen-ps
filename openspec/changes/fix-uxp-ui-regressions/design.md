## Context

当前共享 UI pattern 将页面空态直接包装为 `StatusNotice`，将列表空态、页面替代状态和局部反馈混为一类；`SegmentedTabs` 只有语义状态而没有视觉状态；部分 `PageFrame.watch` 使用页内数据，因而播放整页动画。Settings 的 Header 还依赖文本 fallback，输入区的余额和 mask/capture actions 则在真实 UXP 中暴露了宿主相关布局问题。

修复必须只触及 presentational shell。Provider、ComfyUI、Mask/Edit Region、持久化和执行路径保持不变。Chrome 是回归快速 gate，真实 Photoshop UXP 是宿主敏感视觉的最终验收边界。

## Goals / Non-Goals

**Goals:**

- 建立可复用、可测试的页面状态与列表状态行视觉边界。
- 迁移所有现有独立领域列表；首页 `conversation.rounds` chat transcript 是唯一列表例外。
- 让 Header、tab、空态、禁用项和页面动画在 Chrome 与 UXP 中具有同一视觉和交互契约。
- 让 composer 的余额、mask 和 capture actions 在窄面板中保持确定性位置和可辨识状态。
- 以 focused contract、visual baseline 和真实 UXP 截图验证回归修复。

**Non-Goals:**

- 不修改 Provider/ComfyUI 网络请求、模型选择、Mask/Edit Region 数据、任务队列或持久化语义。
- 不重做所有领域列表为同一 DOM 行；History、Provider、模型配置保留各自的领域 item 渲染。
- 不引入新的外部 UI、动画或图标依赖。
- 不引入 `useAsyncList`、通用数据请求层、缓存、自动 retry 或虚拟化；虚拟化需要真实性能问题和独立 change。
- 不将 `TextSelect` options、表单字段矩阵、capability grids 或首页 chat transcript 伪装成独立领域列表；它们保留各自的交互与布局契约。

## Decisions

### 领域 `List`、`ListItemShell` 与 `ListStateItem`，而非万能 `ListStateBoundary`

共享层提供仅负责渲染的 `List`、`ListItemShell` 与 `ListStateItem`。`List` 只拥有 list gap 和子项布局，`ListItemShell` 只拥有 row geometry，二者都不拥有数据或 lifecycle。每个列表的 loading、empty、error 状态行与真实领域行共享所属列表的宽度、padding、border/background、leading、文本、trailing、最小高度和 gap；状态行只改变 icon、文案、indicator、tone 与可选 direct action。页面继续使用现有 Store/Hook 的 `items`、`loading`、`error` 和 `reload`，自行选择渲染领域行或状态行；shared pattern 不拥有请求、缓存、自动 retry 或列表 state machine。

```tsx
interface ListItemShellProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
  tone?: 'default' | 'muted' | 'danger';
  disabled?: boolean;
  onPress?: () => void;
}

interface ListStateItemProps {
  kind: 'loading' | 'empty' | 'error';
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: { label: string; onPress: () => void; disabled?: boolean };
}
```

`ListItemShell` 默认不可点击；只有领域行明确需要 card-style activation 时才传 `onPress`。`ListStateItem` 不传 `onPress`，只把 `action` 显示为 trailing button；不存在 callback 时不显示 action，也不引入 `supportsRetry`、`supportsRefresh` 一类 capability boolean。

列表结构固定为 `List -> Real ListItem | Loading ListItem | Empty ListItem | Error ListItem`。同一个 `ListItemShell` SHALL 统一外层宽度、padding、border/background、icon 区域、主标题/描述区域、trailing action 区域、hover/disabled 规则、最小高度和项目间 gap。状态行只能改变 icon、title、description、loading indicator、可选操作按钮和 `default`/`muted`/`danger` tone；不得为 empty 或 error 另建全页面居中/通知卡片布局。

首次加载且没有领域数据时，loading、error、empty 分别替代领域行。已有领域数据的刷新不得清空或替换 rows：refreshing 只在 list header 或轻量状态行表达；refresh error 保留 rows，并追加轻量 error feedback。业务数组始终只存 Provider、Model、Task 等领域对象，不得混入 placeholder 或状态项。只有未来确有虚拟化需求时，虚拟化 adapter 才可以从最终渲染计划生成 `RenderItem`。

`SettingsListRow` 可作为 Settings family 的 shell；History 必须保留 task-row 的缩略图、状态、任务操作和行高结构，其状态行使用同一 task-row shell，不得被强制替换为 Settings DOM。替代方案是通用 `ListStateBoundary`、把状态写入业务数组，或把所有行强制映射成 `SettingsListRow`；这些做法分别会隐藏 refresh 语义、污染领域数据或破坏 History 结构。

### 全量迁移范围与后续准入

独立领域列表是指页面、弹层或可复用 feature surface 中呈现同一领域集合 peer rows，且拥有其初始 loading、empty、error 或 refresh 表达的集合。所有现有独立领域列表都在本 change 迁移：

| Surface | 领域行与状态行 shell | 迁移要求 |
| --- | --- | --- |
| Settings Provider 与静态 Settings navigation rows | Settings list shell | Provider 初始三态、refresh retention；现有静态 rows 改由 `List` 布局承载 |
| ComfyUI workflow picker | Settings list shell | grouped workflow rows 与零搜索结果/加载/错误状态行 |
| Profile Models 与 discovered suggestions | Settings list shell | owned models 初始三态；suggestions refresh 成功追加、失败保留 |
| Prompt presets | prompt-preset listbox shell | 保留 listbox/option selected、edit/delete actions；补初始三态 |
| History | task-row shell | 保留缩略图、任务操作和 filter；初始三态与 filter empty 同壳 |
| Main profile chooser 与 layer picker | 各自 popup row shell | 初始三态与 refresh retention 同壳 |

首页 `conversation.rounds` 是聊天 transcript，不是独立领域列表：它保留时间顺序、scroll anchoring、round media/action layout 与自己的 empty-state 契约，不要求使用 `List`、`ListItemShell` 或 `ListStateItem`。`TextSelect` options、表单字段矩阵、endpoint 编辑行和 model capability grids 也不是独立领域列表。

此 contract 同样是未来准入门。新增独立领域列表必须使用 `List` 和 `ListStateItem` 语义，保留页面对 items、lifecycle、reload 与领域 actions 的所有权，并提供初始替代态、refresh retention、inert state ARIA 的 focused evidence 与一个 Chrome visual case。不得以 `.map()` 静态检查代替这项语义验收。

### 页面状态、局部通知和列表状态行分层

`PageState` 仅用于非列表的页面替代状态，并提供透明的 empty variant；`StatusNotice` 用于仍有页面内容时的保存、字段和诊断反馈；列表首次 loading、error、empty 必须以所属列表的完整状态行渲染，而不是 `PageState` 或 `StatusNotice`。状态行可选 action 直接由 callback 存在与否表达，不增加 `supportsRetry` 一类 capability boolean；没有 action 的状态行不可导航、不可点击。

Provider 和模型配置已有 Header `+` 时，其 empty 状态不传创建 action；History empty 不传任务 action。替代方案是通过 CSS 取消所有 neutral notice 背景。它会削弱 loading/error/diagnostic 的可见性，且无法解决列表结构、刷新保留内容和重复 CTA。

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
- [通用 shell 压平 History task row] → `ListItemShell` 保持 compositional；History 仅复用状态语义和 task-row visual grammar，不替换正常任务行结构。
- [刷新状态替换可用内容] → 初始替代态与 refresh 分开测试；刷新期间和 refresh error 始终保留既有领域 rows。
- [全量迁移误伤聊天或表单控制] → 以独立领域列表定义和明确 scope map 决定；chat transcript、select/options、表单矩阵与 capability grids 不迁移。
- [清理动态 watch 影响预期内容动画] → 保留路由淡入；仅对明确需要过渡的内容区添加局部 motion，并验证不会重播 Header/tab bar。
- [mask 图标在 UXP 与 Chrome 有差异] → 使用项目 inline SVG、固定 viewBox 和真实 UXP 截图检查 selected/unselected 两态。

## Migration Plan

1. 先新增/修正 `List`、`ListItemShell`、`ListStateItem`、Icon 和 CSS contract；以 ProviderRoot 作为最小迁移验证，不修改 Store/Hook。
2. 分批迁移 Settings/ComfyUI、Profile Models/Prompt presets、History、Main popup lists；History 保持 task-row renderer，chat transcript 不动。
3. 为每个独立领域列表补 focused lifecycle/ARIA test 与 Chrome visual case；不通过更新 baseline 掩盖失败。
4. 构建 UXP bundle，在 Photoshop 中验证全部迁移列表和 Main transcript 未回归，以及 composer 两态。
5. 将 future-list contract 写入 `apps/app/AGENTS.md`；后续 change 必须带语义验收 evidence。
6. 若出现宿主特有回归，回退对应 presentational commit；业务数据和执行路径无需迁移或回滚。

## Open Questions

无。Header `+` 是 Provider 与模型配置列表唯一创建入口；History empty item 不提供创建动作。
