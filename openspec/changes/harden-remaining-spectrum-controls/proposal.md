## Why

当前 Spectrum 迁移已覆盖主要按钮和文本编辑器，但共享 UI 仍有 raw `input`/`button` 与自绘选择器状态。用户提供的 Photoshop 截图显示两个直接问题：图标与文字没有同一条对齐基线，选择项连续相接且过度圆角；这些问题来自宿主绘制、图标 overlay、固定高度、间距和状态 CSS 叠加，继续堆叠样式会损害稳定性。现在需要把剩余交互控件按“稳定优先、极简表达、行为不回归”重新收敛。

## What Changes

- 为 `Checkbox`、`Radio` 建立 owner-local Spectrum renderer；先验证内置 Spectrum UXP widget 与锁定 SWC wrapper，再选择依赖最少且行为稳定的实现。
- 统一共享控件的 React custom-element 适配：boolean attribute、ref、原生事件、controlled value、disabled/selected 状态和首帧几何。
- 重新定义选择项的极简视觉契约：使用清晰的行间距、有限圆角、单一高亮选中态；不强制图标，只有图标承载识别信息时才显示。
- 评估 `SegmentedTabs` 是否能使用已验证的 Spectrum button/action-button 语义，同时保留 `role=tablist/tab`、Home/End/Arrow 键盘行为。
- 盘点并删除或统一未使用的 `UxpTextInput` raw `<input>` seam，避免未来重新引入第二套文本输入实现。
- 为 selector trigger/menu 建立独立 capability spike，验证 popup placement、focus return、hit-test、disabled predicate、icon/badge 与键盘循环；未证明等价前保留当前 custom UI。
- 扩展 shared-control policy 与 harness，区分允许的 clipboard fallback / 对照样本和生产 raw control。

## Capabilities

### New Capabilities

- `minimal-spectrum-control-stability`: 以最少视觉规则和 Spectrum/UXP 能力探测，提供稳定的共享 Checkbox、Radio、选中态与选择项呈现，并为后续 tabs/select 迁移提供兼容性边界。

### Modified Capabilities

- 无

## Impact

- 影响 `apps/app/src/shared/ui/primitives/native-controls.tsx`、`patterns/index.tsx`、`components/uxp-form-controls.tsx`、`components/composer-select-menu.tsx`、`components/overlay-controls.tsx`、`styles/composer.ts` 与 `styles/patterns.ts`。
- 可能新增 `@swc-uxp-wrappers/*` 控件依赖；不得仅因 `swc-uxp-elements.d.ts` 存在声明就扩大 bundle。
- 影响 shared UI registry、React custom-element adapter、UXP CSS policy、deterministic UI tests 与 Chrome visual baseline；不改 Provider、业务状态、持久化、路由和页面信息架构。
- Photoshop UXP 仍是唯一产品 runtime；Chrome 只证明共享行为与结构。真实 Photoshop 外观和宿主 hit-test 证据仍由用户显式验收。
- 外部依据（访问 2026-08-28）：
  - Adobe Spectrum UXP Reference: https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-spectrum/
  - Adobe UXP Known Issues: https://developer.adobe.com/photoshop/uxp/2022/uxp-api/known-issues/
