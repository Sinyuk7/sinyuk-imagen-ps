## Context

当前 `apps/app` 已将主要 Button、ActionButton、TextField 和 `UxpTextArea` 接入受限 Spectrum renderer，但 `Checkbox`、`Radio`、`SegmentedTabs`、selector trigger/menu 仍混用 raw HTML 与自绘 CSS。用户截图暴露两类可复现问题：图标与文字不在同一基线，选项行没有稳定间距且圆角过大，导致相邻项目像一个连续胶囊。

问题清单还包括：`cmp-select-option` 在 compact 变体没有统一的 row gap；`cmp-chip-overlay-value-*` 通过 `top:1px` 修正基线，说明 icon/text layout 没有单一对齐模型；selector trigger/menu 依赖 sibling overlay 和绝对定位，容易出现图标与文字重影或错位；`color-mix()` 在多个 composer/conversation 状态中大量出现，但当前没有 UXP capability contract；`border-radius:999px` 被用于多个小型 action control，容易把选择项渲染成过度胶囊。上述项目先进入 inventory 和 harness，再决定删除、简化或保留。

Photoshop UXP 不是完整浏览器。Adobe 官方资料同时提供内置 Spectrum UXP widgets 和可调试的 SWC；SWC 需要逐组件安装、import，并在 React 中通过 ref 绑定原生事件。UXP 还存在文字编辑器覆盖浮层、dropdown 方向键缺失、按钮键盘 focus 不明显等已知限制。因此本变更以 host capability、确定性 harness 和用户拥有的 Photoshop 验收为边界，不把截图美化当成唯一目标。

## Goals / Non-Goals

**Goals:**

- 让 Checkbox/Radio 进入共享 renderer，优先采用已经证明可加载且行为稳定的 Spectrum 实现。
- 建立极简控件视觉契约：明确间距、有限圆角、稳定尺寸、单一 selected 高亮；图标默认不显示。
- 保留 `SegmentedTabs` 的 ARIA、键盘循环、selected/disabled 语义；只有在 Spectrum 控件等价时才迁移。
- 记录 selector trigger/menu 的兼容性边界，为后续独立 spike 提供可执行入口。
- 清理或统一无消费者的 `UxpTextInput`，避免 raw input 双轨回流。
- 让 shared-control policy 能识别生产 raw control，同时豁免 clipboard fallback 和故障对照 harness。

**Non-Goals:**

- 不改 Provider、任务、持久化、路由、业务状态、文案或页面信息架构。
- 不强制把 `FieldLabel`、`HelpText`、`Divider`、Toast、Dialog 改成 Spectrum；它们当前稳定收益不足。
- 不在没有 host 证据时替换 `ComposerSelectMenu`、`OverlayTriggerButton`，不直接引入 `sp-picker`、SWC multiline textarea、Slider 或 Progress。
- 不使用 Photoshop 版本号、user agent 或页面 CSS fork 解决宿主差异。

## Decisions

### 1. Renderer 继续作为唯一控件入口

页面只使用 `ui-system.ts` 暴露的语义 primitive。新增 Checkbox/Radio 先进入 owner-local renderer，再由 capability probe 选择：已安装且通过 bundle/geometry/event 检查的 SWC；否则使用对应 Spectrum UXP widget；两者都不满足时保留受控 custom UI。`.d.ts` 声明不视为 runtime 能力。

备选方案是页面直接写 `sp-checkbox` 或继续扩张 raw primitive；前者绕过 host 适配边界，后者保留宿主绘制风险，均不采纳。

### 2. 视觉规则优先减少 CSS 状态面

选择项采用 block/flex 行布局，固定 `min-height`、水平 padding、相邻 `gap` 和不超过小半径的 `border-radius`。selected 只改变背景/文字或一条稳定的 leading accent，不强制渲染 check icon；icon 只有提供识别信息时才出现，并与文字共用显式 grid/flex 列，不使用 top 偏移或绝对定位修正基线。

备选方案是继续通过更大圆角、阴影和多个 hover/open/selected 覆盖层“做出设计感”；该方案状态组合多、在 UXP 宿主中更易错位，稳定性更差。

### 3. Checkbox/Radio 采用原生事件适配

renderer 集中处理 Web Component 的 boolean attribute（未选中传 `undefined`）、ref、`change`/`input`/`click` 原生监听、controlled value、disabled/invalid 和 focus。先为 Checkbox 建立生产路径，Radio 与其共用适配器；若 Radio 继续无调用者，任务允许删除 dead API。

### 4. SegmentedTabs 保留语义，先验证再迁移

不假设 `sp-button-group` 等于 tabs。先使用现有 `role=tablist/tab`、Home/End/Arrow 行为建立 contract；仅当 Spectrum-backed button/action-button 能保持语义、首帧几何、selected/disabled 和键盘 focus，才替换 raw button。否则保留受控 custom UI，并只收敛 CSS。

### 5. Selector menu/trigger 先做 spike

`ComposerSelectMenu` 和 `OverlayTriggerButton` 依赖 portal placement、active popup、underlay hit-test、editor suspension、icon/badge 和 focus return。新变更只记录兼容性探针与安全回退，不把 `sp-menu`/`sp-dropdown` 直接换入生产。若 probe 失败，custom UI 是允许的稳定结果。

### 6. 验证分层

每个控件先通过 deterministic contract、bundle/registry 检查和 Chrome visual baseline，再由用户在目标 Photoshop/UXP 中检查首帧、dark/light、键盘、disabled、selected、popup 命中和输入交互。Chrome 结果不得表述为 Photoshop 外观验收。

## Risks / Trade-offs

- [新增 wrapper 导致 classic-script bundle、dynamic import 或 `import.meta` 回流] -> 只允许单组件 import，运行产物扫描并保留最小 registry。
- [React 不派发 Web Component 事件或 boolean 属性误判] -> 统一 ref/native listener adapter，增加 checked/unchecked 和事件 contract。
- [极简 CSS 与 Photoshop host skin 冲突] -> 不复刻复杂 Spectrum state；固定尺寸、间距、显式布局，真实宿主失败时回退 custom renderer。
- [`color-mix()` 或复杂 overlay 在 UXP 中表现不同] -> 增加 CSS capability probe；关键状态提供不依赖混色和绝对定位的 fallback，不能用 Chrome snapshot 单独放行。
- [去掉 check icon 造成可见选中线索不足] -> 保留 `aria-selected`/`aria-checked`，selected 使用稳定高亮或 leading accent，并在视觉 harness 覆盖对比度。
- [SegmentedTabs 迁移破坏键盘语义] -> 先 contract，再迁移；不等价则只做 CSS 收敛。
- [selector 替换破坏 popup 命中或文字编辑器层] -> 保留现实现，独立 spike，失败不进入生产。

## Migration Plan

1. 建立 Checkbox/Radio capability fixture、renderer adapter 和 shared-control policy inventory。
2. 以最小依赖注册并验证 Checkbox；通过行为、geometry、Chrome 和用户 Photoshop gate 后迁移生产调用点。
3. 处理 Radio dead API 与 `UxpTextInput`：删除或统一到 `TextField`，不保留第二套 raw input。
4. 对 `SegmentedTabs` 做语义等价性 spike；通过才迁移，否则只替换状态 CSS。
5. 对 selector trigger/menu 记录 capability 结果；失败时保持 custom UI，不增加版本 CSS fork。
6. 任一宿主 gate 失败，回退到本变更前一已验证 renderer；不得以隐藏错误、扩大圆角或增加 overlay 作为修复。

## Open Questions

- 目标 Photoshop `26.1.0+` 的实际 UXP runtime 中，`sp-checkbox`/`sp-radio` 哪一实现首帧几何最稳定？
- `sp-button-group` 或 `sp-action-button` 能否无语义回归地承载 tabs？
- selector 的自定义 icon/badge 是否有足够产品价值，值得承担 Spectrum menu 的迁移成本？
- 用户 Photoshop 验收后，是否需要把真实 host 观察补写入 `docs/ENGINEERING_CONTEXT.md`？

## External Research

- Adobe Spectrum UXP Reference（2026-08-28）：https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-spectrum/
- Adobe UXP Known Issues（2026-08-28）：https://developer.adobe.com/photoshop/uxp/2022/uxp-api/known-issues/
- 本地镜像 `Spectrum to SWC Mapping`：Checkbox/Radio/Menu/Popover/Switch 可用；Picker/Overlay/Slider/Progress/Meter/multiline Textarea 存在 UXP 支持限制。
- 本地镜像 `Spectrum UXP Widgets/Using with React`：Web Component 需要 `class`、完整闭合标签、boolean `undefined` 和 ref/native event listener。
