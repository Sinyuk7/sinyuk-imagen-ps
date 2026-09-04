## 1. 能力盘点与安全边界

- [x] 1.1 盘点 `apps/app/src/shared/ui` 生产 raw `button`/`input`/`textarea`/`select`，区分 Checkbox/Radio、SegmentedTabs、selector、clipboard fallback 和 harness fixture。
- [x] 1.2 根据目标 Photoshop `26.1.0+`、UXP runtime、锁定 SWC `0.37.0` 和实际 wrapper 源码建立控件 capability matrix。
- [x] 1.3 为 shared-control policy 增加 owner 级 raw-control inventory，允许显式登记的 host seam 与 harness fixture，并输出稳定文件/行号。
- [x] 1.4 为 renderer 增加组件加载、custom-element definition、首帧与 50ms geometry、bundle dynamic import/`import.meta` 检查。

## 2. Checkbox / Radio renderer

- [x] 2.1 在 owner-local renderer 内实现 `Checkbox` adapter，集中 ref、原生 `change`/`input` 监听、controlled state、disabled/invalid 和 boolean attribute。
- [x] 2.2 以同一 adapter 实现或清理 `Radio`；若无生产调用者，删除 dead API 和对应类型/样式，不保留第二套 raw input。
- [x] 2.3 仅引入通过 capability spike 的 `@swc-uxp-wrappers/*`，否则使用可证明稳定的 Spectrum UXP widget；更新 registry 和 JSX 类型。
- [x] 2.4 更新 settings workflow boolean 字段调用点，保持 persistence、validation、busy 和 toast 语义不变。
- [x] 2.5 增加 Checkbox/Radio deterministic tests：checked/unchecked、disabled/invalid、事件同步、键盘 focus、中文标签和 controlled rerender。
- [x] 2.6 增加 Chrome visual cases 与用户-owned Photoshop gate；未通过时回退到变更前 renderer。

## 3. 极简选择项 CSS

- [x] 3.1 收敛 `cmp-select-option` 为 block/flex 稳定行：固定 min-height、padding、非零 `gap`、有限小圆角和单一 selected 高亮。
- [x] 3.2 去除默认 option icon 和 check icon 依赖；仅当 option 提供识别价值时渲染 icon，并用显式列对齐文字基线。
- [x] 3.3 修复 compact/regular/model/output-size 变体的间距、选中态、disabled 态和 overflow，禁止相邻选项视觉相接或形成连续胶囊。
- [x] 3.4 为图标+文字、无图标文字、长文本、selected/disabled 和窄面板增加 visual/contract cases。
- [x] 3.5 盘点 `color-mix()`、`top:1px` 基线补偿、绝对定位 overlay 和 `border-radius:999px`，为 UXP 不支持或表现不稳定的规则提供简化 fallback。

## 4. SegmentedTabs 与遗留文本输入

- [x] 4.1 为 `SegmentedTabs` 固化 `role=tablist/tab`、`aria-selected`、Home/End/Arrow、disabled 和 focus return contract。
- [x] 4.2 评估 Spectrum `ActionButton`/`sp-button-group` 等价性；只有语义、键盘、selected/disabled 和 geometry 全通过才迁移 raw button。
- [x] 4.3 若 Spectrum 不等价，保留受控 custom tab UI，仅删除重复状态 CSS 和不稳定视觉覆盖。
- [x] 4.4 确认 `UxpTextInput` 无生产调用后删除或统一到 `TextField`，补充 policy/test 防止 raw input 双轨回流。

## 5. Selector capability spike

- [x] 5.1 为 `OverlayTriggerButton` 与 `ComposerSelectMenu` 记录 popup placement、underlay hit-test、focus return、disabled predicate、icon/badge 和 editor suspension 现状。
- [x] 5.2 以 `sp-menu`/`sp-menu-item`/`sp-popover` 做隔离 spike，验证键盘循环、选中态、portal geometry 和 UXP 首帧，不直接改生产页面。
- [x] 5.3 若 spike 失败，保留 custom selector 并记录 capability 缺口；不得引入 `sp-picker` 或版本 CSS fork。

## 6. 完整验证与交付

- [x] 6.1 运行 `pnpm --filter @imagen-ps/app test:ui`、`pnpm --filter @imagen-ps/app test:visual`、`pnpm --filter @imagen-ps/app build:uxp` 和 `pnpm check:policy`。
- [x] 6.2 运行 `pnpm validate`，确认 shared behavior、Chrome surface、policy 和 UXP build 通过；结果不得表述为 Photoshop 外观证据。
- [ ] 6.3 由用户在目标 Photoshop/UXP 检查 Checkbox/Radio、选择项间距、图标基线、tabs 键盘、dark/light、disabled/selected 和 popup hit-test，提供截图或 DevTools 证据。
  - 用户-owned gate：当前环境未启动 Photoshop/UXP Developer Tool；自动化结果不替代真实宿主证据。
- [x] 6.4 记录宿主失败的 renderer/wrapper/capability 原因与回退结果，必要时将稳定事实写入 `docs/ENGINEERING_CONTEXT.md`。
