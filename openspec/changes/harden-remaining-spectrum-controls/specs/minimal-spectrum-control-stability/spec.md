## ADDED Requirements

### Requirement: Shared Spectrum checkbox and radio renderer
共享 UI SHALL 通过 owner-local renderer 提供 Checkbox/Radio。renderer MUST 先检查锁定 wrapper 与目标 UXP 的实际能力，再选择 SWC、Spectrum UXP widget 或受控 custom fallback；页面 MUST NOT 直接渲染 raw checkbox/radio 或 `sp-*`。

#### Scenario: Checkbox controlled state
- **WHEN** 页面以 `checked` 和 `onChecked` 请求 Checkbox
- **THEN** renderer SHALL 保持 controlled state、disabled/invalid 属性和 `change`/`input` 同步，且未选中不得被错误 boolean attribute 解析为选中

#### Scenario: Radio without production callers
- **WHEN** Radio 没有生产调用者
- **THEN** implementation SHALL either keep it behind the same tested adapter or remove dead API，不得引入未验证的第二套实现

### Requirement: Minimal option visual contract
选择项 SHALL 使用稳定的 block/flex 布局、固定最小高度、明确相邻间距和有限圆角。selected SHALL 通过单一高亮背景、文字颜色或 leading accent 表达；icon MUST NOT 为默认必需元素。

#### Scenario: Consecutive options
- **WHEN** selector 显示两个或更多选项
- **THEN** 每个选项之间 SHALL 有可测量的非零间距，圆角不得让相邻选项视觉相接，选中态不得叠加第二个独立胶囊

#### Scenario: Option with icon
- **WHEN** 选项确实需要 icon 传达身份
- **THEN** icon 与文字 SHALL 通过显式 flex/grid 对齐，基线、垂直中心和文本起始位置在 compact/regular 宽度下保持一致

### Requirement: SegmentedTabs semantic preservation
`SegmentedTabs` SHALL 保留 `role=tablist/tab`、`aria-selected`、disabled、Home/End/Arrow 导航和选中焦点回传。Spectrum-backed button 只有在这些语义和首帧几何均通过 contract 后才可替换 raw button。

#### Scenario: Keyboard tab navigation
- **WHEN** 用户在 tablist 按 Home、End、ArrowLeft 或 ArrowRight
- **THEN** 组件 SHALL 选择并聚焦对应 enabled tab，且 selected state 与 `aria-selected` 同步

#### Scenario: Spectrum equivalence fails
- **WHEN** Spectrum button/group 无法保持 tabs 语义或 host geometry
- **THEN** renderer SHALL 保留受控 custom tab UI，并只采用稳定的布局/状态 CSS

### Requirement: Selector safety boundary
selector trigger/menu SHALL 在迁移前保留 popup placement、focus return、underlay hit-test、disabled predicate、icon/badge 和 editor suspension 契约。`sp-picker`、SWC multiline textarea 和未验证 dropdown 变体 MUST NOT 直接进入生产。

#### Scenario: Popup overlap
- **WHEN** selector 打开并覆盖文本编辑器
- **THEN** editor suspension、浮层命中和关闭后 focus return SHALL 与当前行为一致

#### Scenario: Capability probe fails
- **WHEN** Spectrum menu/dropdown 的键盘或几何行为无法满足 selector 契约
- **THEN** 系统 SHALL 保留 custom selector，并记录失败能力，不得用 Photoshop 版本 CSS fork 掩盖差异

### Requirement: Shared raw-control policy inventory
policy/harness SHALL 扫描 shared UI owner 内的 raw interactive controls，并明确允许 clipboard fallback、故障对照 fixture 和未进入产品 runtime 的测试样本。

#### Scenario: New raw production control
- **WHEN** shared primitive 新增 raw `button`、`input`、`textarea` 或 `select`
- **THEN** policy SHALL 报告 owner、文件和替代入口，除非该节点属于显式登记的 host seam 或 harness fixture

#### Scenario: Clipboard fallback
- **WHEN** `notice.tsx` 为 clipboard fallback 临时创建 textarea
- **THEN** policy SHALL 将其识别为非视觉 host seam，不要求迁移为 Spectrum 控件

### Requirement: UXP-safe CSS surface
共享控件和 selector CSS SHALL 通过 capability probe 验证 `color-mix()`、绝对定位 overlay、基线补偿和超大圆角等规则。关键交互状态 MUST 提供不依赖这些规则的简化 fallback。

#### Scenario: CSS capability unavailable
- **WHEN** UXP host 不支持某个 CSS 函数或其计算结果与 Chrome 不一致
- **THEN** 控件 SHALL 使用固定颜色、显式 flex/grid 对齐、稳定间距和有限圆角 fallback，且不得影响 click、focus、selected 或 disabled 行为

#### Scenario: Baseline compensation removed
- **WHEN** icon/text layout 使用统一 flex/grid 对齐模型
- **THEN** renderer SHALL 不再依赖 `top:1px` 等单元素位移补偿，图标与文字 SHALL 在 compact 和 regular 尺寸下保持同一视觉基线

### Requirement: Single-surface selector rendering
selector trigger、popup shell 与 option row SHALL 各自只有一个可见皮肤 owner。真实 UXP 中泄漏原生 button 或 Spectrum button 圆角、边框、背景的 renderer MUST 被替换，不得继续用外层 CSS 覆盖内部控件皮肤。

#### Scenario: Selected provider option
- **WHEN** 当前 Provider 出现在 header selector 中
- **THEN** option SHALL 只显示单一 selected 高亮，不得同时显示 check icon；组件仍 MUST 暴露 `aria-selected=true`

#### Scenario: Consecutive popup rows
- **WHEN** popup 显示两个或更多 option
- **THEN** popup SHALL 只有一个连续背景表面，option 间 SHALL 使用稳定非零间距，圆角外不得露出第二层黑色或宿主按钮背景

### Requirement: Native editor geometry ownership
Composer textarea 与 Profile secret field SHALL 使用单一几何和皮肤 owner。外层容器增长时，实际可编辑区域 MUST 同步增长或容器 MUST 按编辑器内容收缩。

#### Scenario: Composer at regular panel height
- **WHEN** Composer 获得超过 textarea 默认高度的可用空间
- **THEN** `sp-textarea` 可编辑表面 SHALL 填充 textarea shell，不得在编辑区下方留下由 flex 增长产生的大块空白

#### Scenario: Secret field with actions
- **WHEN** API Key field 同时显示 clear/remove 与 reveal action
- **THEN** 输入框与 action shell SHALL 只显示一套边框、背景和 focus ring，输入文本区域不得被重复圆角或内部背景压缩

### Requirement: Minimal Profile action hierarchy
Provider Profile 页面 SHALL 保持简洁且交互明确。页头返回 SHALL 负责放弃当前编辑；主 action area SHALL 只显示当前状态必要的 destructive、test 与 save 动作。

#### Scenario: Editing an unchanged profile
- **WHEN** display name、API Key action 均未变化
- **THEN** Save SHALL disabled，主 action area SHALL NOT 显示与页头返回重复的 Cancel

#### Scenario: Delete confirmation
- **WHEN** 用户请求删除 Profile
- **THEN** confirmation actions SHALL 临时替换主 action area，并提供 Cancel 与确认 Delete，不得同时显示两套 footer actions
