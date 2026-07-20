## ADDED Requirements

### Requirement: Chrome 与 Photoshop UXP SHALL consume one shared UI system
系统 SHALL 由 `apps/app/src/shared/ui` 提供 Chrome 与 Photoshop UXP 唯一共享的 React UI system。正常 production route SHALL 渲染同一 page、pattern、component 与 primitive tree；host 差异 SHALL 保持在 shell、adapter 或 approved host-safe primitive seam，不得复制第二套 runtime-specific page。

#### Scenario: Render a production page in both runtimes
- **WHEN** Chrome shell 与 Photoshop UXP shell 打开同一个 production route
- **THEN** 两端 SHALL 使用同一 page component 与 public UI system，且不得选择 runtime-specific page implementation

#### Scenario: Isolate a host-only workaround
- **WHEN** Photoshop UXP 需要 native editor、Icon geometry 或 popup hit-test workaround
- **THEN** workaround SHALL 位于 approved primitive/component/host seam，Chrome 与 UXP page SHALL 保持同一装配结构

### Requirement: Existing visible color system SHALL be preserved
本变更 SHALL 保留现有 `theme-source` palette、generated theme color values、Photoshop host color fallback 与 public `--app-color-*` 视觉结果。新 pattern 与迁移后的 page SHALL 仅消费现有 app semantic/component token；page 不得直接消费 `--md-sys-*` 或声明 color literal。

#### Scenario: Migrate a page to shared patterns
- **WHEN** implementation 将现有 page JSX/CSS 迁移到 public pattern
- **THEN** accepted visual baseline 中的 background、foreground、border、accent 与 status color SHALL 保持不变，除非独立 change 显式批准 palette 修改

#### Scenario: Add a component-specific visual token
- **WHEN** 新 pattern 需要 page header、section 或 state surface token
- **THEN** 新 token SHALL alias 现有 `--app-*` token，且不得引入新的 `#hex`、`rgb()`、`hsl()` 或直接 `--md-sys-*` dependency

#### Scenario: Page declares a raw color
- **WHEN** page source 新增 color literal 或直接引用 `--md-sys-*`
- **THEN** `pnpm check:policy` SHALL fail 并报告 file、line 与 approved replacement boundary

### Requirement: Shared UI SHALL expose bounded composition layers
共享 UI SHALL 定义 token/style authority、primitive、component、pattern 与 page 五类 owner。Page SHALL 只从 page-facing public barrel 导入公共 UI；public barrel SHALL 暴露 approved primitive、component 与 pattern，且跨模块 public export SHALL 有简洁中文 JSDoc。

#### Scenario: Page imports an approved control
- **WHEN** page 需要 Button、TextField、TextSelect、StatusNotice 或 PageHeader
- **THEN** page SHALL 从 public barrel 导入该 symbol，且 SHALL 不依赖其 internal file path

#### Scenario: Page imports an internal primitive path
- **WHEN** page 直接 import `primitives/`、internal `components/` 或 private style module
- **THEN** UI composition policy SHALL fail 并指出应使用的 public export

#### Scenario: Internal component composes another internal seam
- **WHEN** approved component 或 pattern 为实现 host-safe behavior 需要 direct internal import
- **THEN** policy MAY允许该 owner-local import，且不得把相同例外扩展给 page

### Requirement: Pages SHALL compose registered page patterns
系统 SHALL 为重复页面结构提供具名、bounded page pattern，至少覆盖 page root、header、segmented tabs、primary scroll、list section、form section、field group、loading/empty/error state 与 footer actions。Pattern SHALL 通过有限 variant 与 slot 表达已批准差异，不得把任意 color、padding、radius、font 或 raw style decision 重新暴露给 page。

#### Scenario: Build a settings list page
- **WHEN** page 展示 section label 与一个或多个 navigation row
- **THEN** page SHALL 使用 registered list-section 与 list-row pattern，且 SHALL 不复制 `sec-lbl`、row shell 或 chevron geometry

#### Scenario: Build a settings form page
- **WHEN** page 展示 heading、field、help/error 与 action
- **THEN** page SHALL 使用 registered form-section、field-group 与 footer/action pattern，且 SHALL 不创建新的 section spacing system

#### Scenario: Render loading, empty, or error content
- **WHEN** page 需要 loading、empty 或 error replacement state
- **THEN** page SHALL 使用 shared PageState/StatusNotice ownership，且同一语义 SHALL 不在不同 page 中产生新的视觉结构

#### Scenario: Product need cannot fit an existing pattern
- **WHEN** implementation 发现现有 pattern 无法表达真实 product requirement
- **THEN** implementation SHALL 先扩展或新增具名 pattern、catalog state 与 contract test，再允许 page 使用该能力

### Requirement: Page source SHALL not bypass host-safe primitives
Page SHALL 不得直接输出 raw `<button>`、`<input>`、`<textarea>` 或 `<select>`，不得创建 `<style>`，不得写 visual inline style，也不得在 page 内实现 native input/change synchronization。受控 native element、CSS custom property 和 motion DOM write 只允许存在于明确 approved seam。

#### Scenario: Add a raw button to a page
- **WHEN** page JSX 新增 `<button>` 以实现 menu option、retry、toggle 或 action
- **THEN** AST policy SHALL fail，并要求使用或扩展 shared Button、ActionButton、IconButton 或 registered component

#### Scenario: Add page-local inline visual style
- **WHEN** page JSX 新增 `style={{ color, padding, margin, fontSize, borderRadius }}` 或等价 visual property
- **THEN** AST policy SHALL fail，并要求把视觉合同移动到 token-owning style 或 registered pattern

#### Scenario: Approved primitive sets a CSS custom property
- **WHEN** primitive 需要通过 inline style 设置 bounded `--ui-*` size/geometry custom property
- **THEN** policy MAY允许该 approved file，且 value SHALL 不包含 page-selected color 或任意 visual override

### Requirement: UI composition policy SHALL be structural and monotonic
`pnpm check:policy` SHALL 使用 TypeScript AST 检查 TSX element、import、style object 与 token reference，并与现有 UXP CSS contract 分工。迁移期间 existing violation SHALL 记录在只减不增的 manifest；新 violation、扩大 allowlist 或增加 manifest entry SHALL fail。

#### Scenario: Existing legacy page remains before its migration slice
- **WHEN** legacy page violation 已存在于 migration manifest 且本次 diff 未扩大该 violation
- **THEN** policy MAY通过，同时报告 remaining debt count

#### Scenario: New change copies a legacy violation
- **WHEN** 新增或修改代码产生新的 raw control、internal import、inline visual style 或 raw color
- **THEN** policy SHALL fail，且不得通过增加 manifest entry 使其通过

#### Scenario: Complete the final page migration
- **WHEN** 所有 page violation 已清除
- **THEN** implementation SHALL 删除 migration manifest 并启用 zero-tolerance policy

### Requirement: UI migration SHALL preserve application behavior and ownership
Page/pattern migration SHALL 保持现有 controller、view model、event path、i18n、accessibility name、test selector、HostPort 与 task semantics。若完成视觉迁移需要修改 Provider、ComfyUI、Mask/Edit Region、placement、persistence 或 execution ownership，implementation SHALL stop 并将该行为变更移到独立 contract slice。

#### Scenario: Migrate Settings route structure
- **WHEN** Settings page 改用 PageHeader、SegmentedTabs、PageScroll 与 section pattern
- **THEN** provider/general/comfyui route selection、save/test/connect、model selection 与 back navigation behavior SHALL 保持现有 contract

#### Scenario: Encounter MainPage domain overlap
- **WHEN** MainPage presentational migration 与 `unify-photoshop-mask-edit-region` 的 state/event 修改重叠
- **THEN** implementation SHALL 保留当前 worktree 的 domain behavior，只迁移 approved visual shell，并运行双方 focused contract tests

#### Scenario: Pattern adoption requires a business API change
- **WHEN** page 无法采用 pattern，除非修改 shared package API 或 host behavior
- **THEN** 当前 slice SHALL stop and re-scope，不得把 cross-boundary behavior change 隐藏在 UI refactor 中
