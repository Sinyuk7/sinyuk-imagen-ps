## ADDED Requirements

### Requirement: `apps/app` SHALL route feedback to a single semantic surface lane

`apps/app` MUST 在 `Toast`、inline `StatusNotice`、`FieldHelp` 与 `empty-state slot` 之间按反馈语义选择单一 lane。实现 MUST NOT 把显式用户动作结果、section 持续状态、以及 field/group 局部校验混入同一个 inline `StatusNotice` host。

#### Scenario: Explicit action failure uses `Toast`
- **WHEN** 用户触发 `refreshSuggestions`、selector save、save/delete/test 等显式动作，并收到失败、拒绝或不可提交结果
- **THEN** UI MUST 通过 `Toast` 展示该结果
- **AND** UI MUST NOT 把该结果插入页面 body 的 inline `StatusNotice` host

#### Scenario: Section state uses inline `StatusNotice`
- **WHEN** 某个 section 因 loading、unavailable data、stale data 或持续 warning 需要在内容区域内持续说明当前状态
- **THEN** UI MUST 在该 section 内展示 inline `StatusNotice`
- **AND** 该 notice MUST 与它解释的内容区域同层或作为该内容区域的替代块

#### Scenario: Local validation stays near the control
- **WHEN** 错误只约束单个 field 或单个 option group 的局部输入
- **THEN** UI MUST 使用 `FieldHelp` 或等价的 local validation surface
- **AND** UI MUST NOT 使用 page-level inline `StatusNotice` 代替该 local validation

#### Scenario: Compact action hosts reject inline `StatusNotice`
- **WHEN** 状态只出现在 `footer`、`toolbar`、`action row`、`heading row` 或 `list row` 这类 compact host 中
- **THEN** UI MUST NOT 在该 host 内渲染 inline `StatusNotice`
- **AND** 实现 MUST 将该反馈改为 `Toast` 或迁移到合法的 section status host

### Requirement: inline `StatusNotice` SHALL use explicit host-owned placement slots

inline `StatusNotice` MUST 只出现在 `section replacement status`、`section warning slot` 或 `empty-state slot` 这三种合法 host 中。外部 spacing 与相邻内容布局 MUST 由 host slot / wrapper 拥有，而不是由 `StatusNotice` 本体依赖隐式全局 margin 推断。

#### Scenario: Replacement status owns the content position
- **WHEN** 某个 section 的原始内容因为不可用、未加载完成或无法渲染而被替代
- **THEN** host MUST 把 inline `StatusNotice` 放在该 section 的内容位置
- **AND** 用户 MUST 能从 notice 直接理解它正在替代哪个内容区域

#### Scenario: Warning slot owns spacing around visible content
- **WHEN** 某个 section 仍然显示正文内容，但需要一个持续 warning / stale / blocking status
- **THEN** host MUST 通过明确的 warning slot / wrapper 放置 inline `StatusNotice`
- **AND** 该 slot MUST 负责与前后正文块之间的 spacing

#### Scenario: Empty-state slot owns explanation and CTA layout
- **WHEN** 某个 list、selector 或 panel body 没有内容，需要解释当前空态并提供 CTA 或下一步指引
- **THEN** host MUST 使用 dedicated `empty-state slot`
- **AND** 该 slot MUST 负责 explanatory copy、CTA 与 inline status block 的相对布局

#### Scenario: Existing wrapper spacing does not double-apply
- **WHEN** 某个合法 host 已经通过 wrapper 或 slot class 拥有 spacing
- **THEN** 渲染 inline `StatusNotice` 时 MUST NOT 再依赖组件级默认外边距制造第二层垂直间距
- **AND** call site MUST 在不增加页面局部补丁的前提下保持可读

### Requirement: `StatusNotice` content channels SHALL remain semantic

inline `StatusNotice` MUST 将 primary `message`、supporting prose 与 diagnostic `detail` 视为不同内容通道。只有 diagnostic `detail` 可以绑定 mono typography、copy affordance 与更接近 raw error 的呈现方式。

#### Scenario: Diagnostic detail renders as diagnostic content
- **WHEN** inline 状态包含 raw provider/runtime error、path 诊断或其他机器导向文本
- **THEN** UI MUST 把该内容渲染到 diagnostic `detail` 通道
- **AND** 若存在 copy affordance，复制 payload MUST 与 diagnostic `detail` 对齐

#### Scenario: Supporting prose does not use diagnostic detail
- **WHEN** inline 状态包含 empty-state 指引、helper prose 或 CTA 上下文
- **THEN** UI MUST 把该文案渲染到 supporting prose 通道
- **AND** UI MUST NOT 把该文案放入 mono diagnostic `detail` 通道

#### Scenario: Empty-state guidance stays readable
- **WHEN** 空状态需要展示“先创建 model configuration”或类似的下一步指引
- **THEN** 该指引 MUST 以普通说明文本呈现
- **AND** 用户 MUST NOT 看到它被当作 `<pre>` 风格的 diagnostic block 渲染

### Requirement: inline announcement behavior SHALL be explicit

inline `StatusNotice` MUST 默认保持非 announcement 状态。只有明确识别为需要 live region 的动态状态，才可以通过显式 opt-in 获得 `role` / `aria-live` announcement 行为。

#### Scenario: Default inline status stays silent
- **WHEN** caller 渲染一个普通的 persistent inline `StatusNotice`，且没有明确的 a11y announcement 需求
- **THEN** 该 notice MUST NOT 自动创建 live-region announcement

#### Scenario: Dynamic announcement requires explicit opt-in
- **WHEN** 某个 future host 需要让 screen reader 明确播报 inline 状态变化
- **THEN** 该 host MUST 通过语义化的显式参数请求 announcement
- **AND** 没有显式 opt-in 的其他 inline host MUST 保持默认静默
