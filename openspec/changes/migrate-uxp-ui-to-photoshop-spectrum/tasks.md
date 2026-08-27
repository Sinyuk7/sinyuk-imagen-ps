## 1. SWC runtime spike

- [x] 1.1 盘点当前 manifest、UXP 版本、历史 wrapper/alias、Vite classic-script 产物和 `focus-visible` 路径，定义最小锁定 wrapper 集合。
- [x] 1.2 启用 `enableSWCSupport`，加入锁定的 `@swc-uxp-wrappers/*` 依赖及单一 component registry；更新 JSX 类型而不让页面直接 import `sp-*`。
- [x] 1.3 为 registry 恢复且仅保留必需的 UXP classic-script bundle 兼容处理，阻止 `import.meta` 或未内联 dynamic import 进入产物。
- [x] 1.4 扩展 `uxp-css-contract` harness，以 `sp-theme`、`sp-action-button`、`sp-button`、`sp-textfield` 检查组件定义、shadow root、首帧与 50ms 后的几何状态。
- [x] 1.5 为 registry、manifest feature flag、bundle 兼容性和首帧 harness 增加 deterministic contract tests；运行 `pnpm --filter @imagen-ps/app build:uxp`。

## 2. Spectrum renderer 与通用控件

- [x] 2.1 在 shared UI owner 内实现 Spectrum renderer，集中 React custom-element 属性、ref、native event、controlled value 和 fallback 选择；维持现有 `ui-system.ts` 页面 API。
- [x] 2.2 将 `Button`、`ActionButton`、`IconButton` 和 page header back action 映射到 Spectrum button/action-button 语义，保留 busy、validation、ARIA 和 tooltip 行为。
- [x] 2.3 将 `TextField` 映射到 `sp-textfield`，并接入现有 popup-layer editor suspension、secret/search 类型与 disabled 行为。
- [x] 2.4 更新 shared UI、main page、settings 和 harness 的 deterministic tests，覆盖发送按钮、quiet toolbar 空闲态、selected/disabled state 与单行输入 seam。
- [x] 2.5 更新 `ui-catalog` 与 Chrome visual baseline，审查常规和 compact panel 视口的 Spectrum 控件外观。

## 3. 移除 Material/raw-control 视觉层

- [x] 3.1 以 Spectrum theme/host color 适配替换 Material `theme-source`、生成 token 和 panel theme wiring；保留仅用于布局、排版、容器及产品特有画布的 CSS token。
- [x] 3.2 删除无消费者的 raw-control state CSS、Material/品牌强调色和历史 SWC removal residual guard；新增 guard 阻止通用页面重新直接依赖 raw form control 或 Material token。
- [x] 3.3 更新 `panel-css`、UXP CSS contract、policy checker、相关测试和 `docs/ENGINEERING_CONTEXT.md`，令 Spectrum renderer 成为共享 theme 的权威。
- [x] 3.4 运行 `pnpm --filter @imagen-ps/app test:ui`、`pnpm --filter @imagen-ps/app test:visual`、`pnpm --filter @imagen-ps/app build:uxp` 和 `pnpm check:policy`。

## 4. 多行输入迁移

- [x] 4.1 在 renderer 内实现 `sp-textarea` adapter，保留 `UxpTextArea` 的受控值、选择、delete、paste/cut、IME、send shortcut 和 popup-layer seam API。
- [x] 4.2 迁移 composer 与设置页面的多行字段，并删除仅服务 raw textarea 外观的样式，不改变提交、草稿或设置持久化语义。
- [x] 4.3 扩展 `text-area-seam` 与 `popup-layer-overlap` deterministic harness，覆盖中文输入事件、Backspace/Delete、paste/cut、selection、popup overlap 和 editor suspension。
- [x] 4.4 更新多行输入 Chrome visual baseline，并运行 `pnpm --filter @imagen-ps/app test:ui`、`pnpm --filter @imagen-ps/app test:visual`、`pnpm --filter @imagen-ps/app build:uxp` 和 `pnpm check:policy`。

## 5. 完整验证与用户拥有的 Photoshop gate

- [x] 5.1 运行 `pnpm validate`，确认 packages、共享 UI、Chrome harness、policy 与 UXP build 均通过；记录其不是 Photoshop 外观证据。
- [ ] 5.2 在用户显式发起时，由用户在目标 Photoshop/UXP 版本加载构建并检查 SWC 首帧、首页发送按钮、单行/多行输入、二级页 quiet toolbar 与 dark/light host theme；提供截图或 DevTools 证据。
- [ ] 5.3 若真实宿主证据失败，定位 renderer/wrapper 或 host capability 原因，回退到上一已验证的 renderer 切片；不得增加 Photoshop 版本 CSS fork。
