## 1. Shared state and list foundations

- [ ] 1.1 新增 shared `ListViewState` 判定，统一 loading、error、empty、ready 的 precedence，并从 page-facing barrel 导出。
- [ ] 1.2 为 `PageState` 增加非列表 transparent empty variant，并将局部保存/诊断反馈保留为 `StatusNotice`。
- [ ] 1.3 新增主题安全的 `empty` Icon，并让 `SettingsListRow` 的 disabled state 真实阻断 pointer/keyboard、移出 tab 顺序、设置 `aria-disabled` 且隐藏 navigation trail。

## 2. Shared page navigation and motion

- [ ] 2.1 修复 `PageHeader` 返回 affordance 和中心轨道，使 Settings 使用 icon-only back control 并与其他 Header 保持一致的 geometry。
- [ ] 2.2 为 `SegmentedTabs` 增加 active、focus、disabled CSS state，保持 `aria-selected` 为唯一状态源。
- [ ] 2.3 将 Main、History、Settings 的 `PageFrame.watch` 收紧为稳定页面身份，避免页内状态重播 page crossfade。

## 3. List page empty-item adoption

- [ ] 3.1 将 Provider 空态替换为 disabled Provider-style empty item，删除与 Header `+` 重复的添加按钮。
- [ ] 3.2 将 Profile Models 空态替换为 disabled model configuration-style empty item，并保留保存提示作为 item meta。
- [ ] 3.3 将 History filter 空态替换为 disabled task-row-style empty item，保留当前空态文本且不提供任务操作。

## 4. Composer action affordances

- [ ] 4.1 使用 CSS 间距修复 billing primary value 与 unit 的黏连，保持 secondary text 截断行为。
- [ ] 4.2 将 mask toggle 移到 capture 左侧的同一 action group，采用 UXP-safe selected/unselected icon，并保持 disabled、tooltip 与 `aria-pressed` 行为。

## 5. Verification

- [ ] 5.1 更新 shared pattern、list row、Settings、Profile Models、History 和 Main 的 focused behavior/ARIA tests，覆盖 empty item、唯一 CTA、禁用交互、tab active 和不重播整页动画。
- [ ] 5.2 更新或新增 Chrome visual baselines，覆盖 Header/tab、Provider/Models/History empty states、billing 和 mask 两态的窄面板布局。
- [ ] 5.3 运行 focused tests、`pnpm --filter @imagen-ps/app build`、`pnpm check:policy` 与相关 visual suite。
- [ ] 5.4 在真实 Photoshop UXP 中验证 Settings、History、Provider empty、Model empty、Main billing 和 mask toggle 的 dark/light representative screenshots。
