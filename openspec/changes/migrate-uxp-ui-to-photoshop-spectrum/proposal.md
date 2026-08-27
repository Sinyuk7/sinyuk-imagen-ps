## Why

Photoshop 升级后，raw `button`、`input` 与 `textarea` 的宿主绘制覆盖了应用 CSS，出现黑色输入框、常驻 hover 背景及同类按钮形状不一致。当前共享 UI 仍以 Material token 和原生 HTML 控件为视觉基线，无法在声明支持的 Photoshop/UXP 组合中提供稳定、接近 Photoshop 原生的外观。

## What Changes

- 以 Photoshop Spectrum 取代 Material/品牌视觉，令通用控件的静态、hover、focus、selected、disabled 外观由 Spectrum 组件负责。
- 在 `apps/app` 引入受限的 Spectrum renderer：优先采用 SWC；SWC 缺失或未受 UXP 支持的变体采用 Spectrum UXP widget；两者皆不适用时才保留受控 custom UI。
- 将共享 `Button`、`ActionButton`、`TextField` 和图标 toolbar 迁移到 Spectrum 语义；`quiet` toolbar 在空闲态不得显示背景。
- 将多行输入视为独立兼容性切片：在替换现有 `UxpTextArea` 前，验证 `sp-textarea` 是否保留中文 IME、选择、删除、剪贴板和 popup-layer overlap 行为。
- 移除 Material token 生成和 raw-control 视觉依赖，保留页面布局、业务状态、路由和应用交互语义。
- 建立 Spectrum build/contract/Chrome visual harness 与用户拥有的真实 Photoshop 验收边界；不把 Chrome 或 UXP build 当作真实宿主外观证明。

## Capabilities

### New Capabilities

- `photoshop-spectrum-ui`: 在声明支持的 Photoshop UXP 版本上，以 Spectrum 控件提供稳定的共享 UI 外观、行为与验证契约。

### Modified Capabilities

- 无。

## Impact

- 影响 `apps/app` 的 manifest、UXP Vite 构建配置、共享 UI primitives、表单输入 seam、样式 token、面板 CSS、UI catalog 和 CSS contract harness。
- 新增并锁定与项目 UXP/SWC 版本兼容的 `@swc-uxp-wrappers/*` 依赖；不得按浏览器或最新版 Spectrum 2 假设兼容性。
- 保持 `packages/*`、Provider API、持久化数据、页面路由和 Chrome/UXP shell 分层不变。
