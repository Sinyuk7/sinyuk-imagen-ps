## ADDED Requirements

### Requirement: Billing summary uses deterministic spacing
Composer billing summary SHALL 使用 CSS 定义数值、单位和可选 secondary text 的间距，且 SHALL NOT 依赖 JSX whitespace。

#### Scenario: Billing primary value has a unit
- **WHEN** billing summary 同时包含数值和单位
- **THEN** 数值与单位 SHALL 在 Chrome 和 Photoshop UXP 中保持可见间距，例如 `734.6K credits`

### Requirement: Mask and capture actions share a UXP-safe action group
Composer SHALL 将 mask toggle 放在 capture action 左侧；二者 SHALL 使用一致的 icon button 尺寸、圆形轨道和右侧 action group 对齐。mask toggle SHALL 使用在 UXP 中可辨识的 selected/unselected 图形，不得依赖会退化为空框的微小虚线 selection glyph。

#### Scenario: Mask toggle is disabled or unselected
- **WHEN** mask 不可用或用户未启用 mask
- **THEN** toggle SHALL 显示 unselected affordance，保持在 capture 左侧，并保留禁用原因或 tooltip

#### Scenario: Mask toggle is selected
- **WHEN** 用户启用可用 mask
- **THEN** toggle SHALL 显示 selected affordance，`aria-pressed` SHALL 表示选中状态，capture action 的位置 SHALL 不变化
