## Why

当前 Chrome 与 Photoshop UXP 已共享同一套 React UI 和主题颜色，但页面仍可绕过共享控件与布局模式，直接创建 button、header、section、empty state、间距和 inline style；现有测试主要验证行为、UXP CSS 兼容性与无溢出，无法阻止新页面产生新的视觉写法。现在需要把现有 UI 基础收敛为可执行、可强制、可在双宿主验证的组件装配合同，同时保持用户认可的现有颜色系统不变。

## What Changes

- 将 `apps/app/src/shared/ui` 收敛为 Chrome 与 Photoshop UXP 唯一共享的 UI system，明确 token、primitive、pattern 与 page 四层所有权。
- 保留现有 `theme-source`、生成主题和 `--app-color-*` 颜色结果；本变更不重新配色、不替换现有主题方案。
- 建立页面装配白名单：page 只能组合公开 primitive、pattern 与 domain component，禁止在 page 内新增 raw native control、视觉 inline style、颜色字面量和未登记的重复页面结构。
- 增加共享 page patterns，统一 page shell、header、segmented tabs、scroll region、section、field、list row、empty/loading/error state 与 footer action 的结构和状态语义。
- 增加双宿主 `ui-catalog` harness，以确定性 fixture 展示组件和 pattern 的主题、尺寸、交互及状态矩阵；Chrome 与 Photoshop UXP 使用同一 catalog 内容。
- 将 Chrome screenshot 从仅保存 artifact 升级为稳定环境下的 baseline comparison，并增加 stable-ready、reduced-motion 和 ARIA contract。
- 建立 Photoshop UXP real-host visual smoke：验证关键 selector 的非零 geometry、可见性、主题状态与 console health；明确该证据不能由 Chrome baseline 替代。
- 更新 repo policy 与 canonical docs，使新 session 在修改 app UI 前能发现强制 import、禁止项、harness 和 acceptance gate。
- Storybook/Chromatic、React Spectrum、SWC 全量替换、品牌重设计和颜色系统迁移不在本变更范围。

## Capabilities

### New Capabilities

- `shared-ui-composition-system`: 定义共享 UI 的 token/primitive/pattern/page 分层、公开装配边界、颜色保持合同、页面 archetype 与机械 policy。
- `dual-runtime-ui-visual-harness`: 定义 Chrome/Photoshop UXP 共用的 UI catalog、确定性视觉状态、Chrome baseline comparison、ARIA proof 与 UXP real-host smoke。

### Modified Capabilities

无。

## Impact

- `apps/app/src/shared/ui`: primitives、components、page patterns、styles、motion-ready contract 与现有 pages 的渐进迁移。
- `apps/app/src/harness`、Chrome shell、UXP panel runtime：新增共享 `ui-catalog` 入口与 deterministic fixture。
- `apps/app/tests/chrome-e2e`、`apps/app/tests/shared/ui`、`apps/app/tests/ui`: visual baseline、ARIA、component composition 与 policy coverage。
- `scripts/policy`、`pnpm check:policy`: 页面 import、raw control、inline visual style、颜色字面量与 token 使用规则。
- `apps/app/AGENTS.md`、`docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md`: UI authority、装配规则与验证入口。
- 不改变 Provider、ComfyUI、HostPort、Photoshop placement、持久化或执行后端行为；不改变现有用户可见颜色值。
