## ADDED Requirements

### Requirement: Spectrum renderer ownership
共享 UI 系统 SHALL 通过 owner-local Spectrum renderer 渲染通用交互控件。renderer MUST 优先使用已由项目锁定 wrapper 与目标 UXP 版本支持的 SWC；仅当该控件或变体未受 SWC 支持时，MUST 使用对应 Spectrum UXP widget；两者皆不可用时才可使用受控 custom UI。页面组件 MUST NOT 直接渲染 raw `button`、`input`、`textarea` 或 `sp-*` 控件。

#### Scenario: 支持的通用控件进入页面
- **WHEN** 页面请求共享按钮、toolbar action 或单行字段
- **THEN** UI 系统 SHALL 经 Spectrum renderer 提供相应控件，且页面不拥有宿主控件视觉实现

#### Scenario: SWC 缺少所需控件变体
- **WHEN** 锁定的 UXP SWC 支持矩阵将所需控件或变体标为未支持
- **THEN** renderer SHALL 使用对应 Spectrum UXP widget，或将该产品特有控件保留为受控 custom UI

### Requirement: Photoshop-native Spectrum control states
通用控件 SHALL 呈现 Spectrum 的静态、hover、focus、pressed、selected 与 disabled 状态。应用 MUST NOT 使用 Material palette、品牌强调色或 raw-control CSS 复刻这些状态。`quiet` toolbar action 在未 hover、focus、pressed 或 selected 时 MUST 呈现透明背景。

#### Scenario: 空闲 toolbar action
- **WHEN** `quiet` toolbar action 未处于交互状态且未被选中
- **THEN** 控件 SHALL 呈现无背景的 Spectrum 静态态，而不显示 hover 背景

#### Scenario: 发送操作
- **WHEN** 用户可提交当前 composer
- **THEN** 发送操作 SHALL 使用 Spectrum command button 外观，并保留既有忙碌和 validation 行为

### Requirement: 输入 seam 兼容性
单行字段 SHALL 使用受支持的 Spectrum `sp-textfield` 并保留 controlled value、类型、disabled 与 popup-layer overlap 契约。多行字段 SHALL 使用 Spectrum UXP `sp-textarea`，且在完成迁移前 MUST 证明中文 IME、选择、Backspace/Delete、paste/cut、事件同步、send shortcut 和 popup-layer overlap 行为不回归。

#### Scenario: 单行字段被浮层遮挡
- **WHEN** popup-layer 覆盖一个可编辑单行字段
- **THEN** 字段 SHALL 遵循既有 editor suspension 与命中规则，且不得抢占浮层交互

#### Scenario: 多行输入迁移验收
- **WHEN** `UxpTextArea` renderer 改为 `sp-textarea`
- **THEN** deterministic seam harness SHALL 覆盖既有编辑事件与快捷键契约，且真实 Photoshop 验收 SHALL 由用户显式提供证据

### Requirement: UXP version compatibility boundary
Spectrum renderer SHALL 以 manifest 支持范围、锁定 wrapper 版本、组件加载能力和共同 harness 定义兼容性。renderer MUST NOT 以 Photoshop 版本号、user agent 或页面级 CSS fork 改变控件视觉。UXP build、deterministic contract 与 Chrome visual baseline MUST NOT 被表述为真实 Photoshop 外观验收。

#### Scenario: 新 Photoshop 版本进入支持矩阵
- **WHEN** 项目要声明一个新的 Photoshop/UXP 版本受支持
- **THEN** 该版本 SHALL 先通过同一 renderer harness，并由用户显式完成真实 Photoshop 视觉复核

#### Scenario: 自动验证通过
- **WHEN** `build:uxp`、deterministic tests 和 Chrome visual baseline 均通过
- **THEN** 验证结果 SHALL 仅证明各自的 build、共享行为和 Chrome surface，不得代替真实 Photoshop 证据
