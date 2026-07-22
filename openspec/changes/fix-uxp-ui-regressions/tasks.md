## 1. Shared list row and state foundations

- [x] 1.1 新增 compositional `List`、`ListItemShell` 与 render-only `ListStateItem`，实现 design 中的完整 props contract：Real/Loading/Empty/Error items 共享宽度、padding、border/background、leading、title/description、trailing、hover/disabled、最小高度和 gap；状态行只改变 icon/title/description/indicator/action/tone，不绑定 row navigation，且三者都不拥有请求、缓存、自动 retry 或数据 state。
- [x] 1.2 为 `PageState` 增加非列表 transparent empty variant，并将局部保存/诊断反馈保留为 `StatusNotice`。
- [x] 1.3 新增主题安全的 `empty` Icon，并让 `SettingsListRow` 的 disabled state 真实阻断 pointer/keyboard、移出 tab 顺序、设置 `aria-disabled` 且隐藏 navigation trail。
- [x] 1.4 在 `apps/app/AGENTS.md` 写入 independent-list 定义、Main transcript 唯一例外、control/form 排除项与后续 change 的 focused/visual evidence 要求。

## 2. Shared page navigation and motion

- [x] 2.1 修复 `PageHeader` 返回 affordance 和中心轨道，使 Settings 使用 icon-only back control 并与其他 Header 保持一致的 geometry。
- [x] 2.2 为 `SegmentedTabs` 增加 active、focus、disabled CSS state，保持 `aria-selected` 为唯一状态源。
- [x] 2.3 将 Main、History、Settings 的 `PageFrame.watch` 收紧为稳定页面身份，避免页内状态重播 page crossfade。

## 3. All independent-list adoption

- [x] 3.1 迁移 Settings Provider/static navigation rows：Provider-style 初始 loading/error/empty state item、Header `+` 唯一创建入口、refresh 保留既有 Provider rows；无状态静态 rows 也进入 `List` layout。
- [x] 3.2 迁移 ComfyUI workflow picker：grouped workflow rows 与 loading/error/zero-search-result state item 共用 Settings list shell，保持选择后关闭 picker 行为。
- [x] 3.3 迁移 Profile Models 与 discovered suggestions：owned models 初始 loading/error/empty 使用 model configuration-style state item；refresh 成功追加 suggestions，失败保留既有 rows 与 suggestions。
- [x] 3.4 迁移 Prompt presets：保留 listbox/option selected semantics 与 edit/delete actions，以 prompt-preset shell 表达初始 loading/error/empty state item。
- [x] 3.5 迁移 History：初始 loading/error 与 filter empty 使用 task-row-style state item，保留缩略图、任务操作和正常 task-row renderer；empty 不提供任务操作。
- [x] 3.6 迁移 Main profile chooser 与 layer picker：初始 loading/error/empty 与 refresh retention 使用各自 popup row shell；`conversation.rounds` transcript 保持不变。

## 4. Composer action affordances

- [x] 4.1 使用 CSS 间距修复 billing primary value 与 unit 的黏连，保持 secondary text 截断行为。
- [x] 4.2 将 mask toggle 移到 capture 左侧的同一 action group，采用 UXP-safe selected/unselected icon，并保持 disabled、tooltip 与 `aria-pressed` 行为。

## 5. Verification

- [ ] 5.1 更新 shared pattern 和全部迁移 independent lists 的 focused behavior/ARIA tests，覆盖初始 loading/error/empty、refresh 保留 rows、唯一 CTA、inert state item、领域 renderer/可访问性语义、tab active 和不重播整页动画；覆盖 Main transcript 未改造的例外。
- [ ] 5.2 更新或新增 Chrome visual baselines，覆盖每个迁移列表的 initial replacement state 与 representative ready state，以及 Header/tab、billing 和 mask 两态的窄面板布局。
- [ ] 5.3 运行 focused tests、`pnpm --filter @imagen-ps/app build`、`pnpm check:policy` 与相关 visual suite。
- [ ] 5.4 在真实 Photoshop UXP 中验证 Settings、ComfyUI picker、Profile Models、Prompt presets、History、Main popup lists、Main transcript、billing 和 mask toggle 的 dark/light representative screenshots。
- [ ] 5.5 验证 future-list governance：`apps/app/AGENTS.md` 规则可由后续 change 的 focused lifecycle/ARIA test、Chrome visual case、`pnpm check:policy` 与相关 focused/visual suites 执行；不新增脆弱的 `.map()` AST 检查器。
