## Context

`apps/app` 是唯一交付的 Photoshop UXP UI，Chrome 只承担共享 React 行为的快速 harness。当前 `native-controls.tsx` 直接渲染 raw `button`、`input`，`uxp-form-controls.tsx` 保留 raw `textarea`；Material token 生成层和页面 CSS 负责其外观。Photoshop 升级后，宿主原生控件绘制不再服从这套 CSS，造成静态态显示为圆形、圆角矩形、黑色输入框或常驻 hover。

官方路径为 SWC 优先、Spectrum UXP widget 次之、plain HTML 最后。项目曾引入 SWC，但真实 Photoshop UXP 出现已定义的 `sp-action-button` 首帧 `0x0` 几何，且 classic-script bundle 需要处理 wrapper、dynamic import 与 `focus-visible`。因此本变更不可原样恢复历史运行时，也不可依据浏览器或新版 Spectrum 2 假设兼容性。

## Goals / Non-Goals

**Goals:**

- 令通用 UI 呈现 Photoshop 原生 Spectrum 外观，不保留 Material 或品牌化控件视觉。
- 将宿主版本差异封装在一个 Spectrum renderer，页面继续使用共享语义 primitive。
- 以声明支持的 Photoshop/UXP 版本、锁定的 wrapper 源码、build、deterministic contract、Chrome visual baseline 和用户拥有的真实宿主证据共同定义兼容性。
- 保留当前输入、popup-layer、忙碌态和业务交互语义。

**Non-Goals:**

- 不改 Provider、任务、持久化、路由、文案或页面信息架构。
- 不把 Chrome harness 变为产品 runtime，也不以 Chrome/UXP build 宣称 Photoshop 已验收。
- 不引入按 Photoshop 版本选择 CSS 的视觉 fork。
- 不删除 Provider/model 的业务身份图标；移除的是应用控件的 Material/品牌化视觉。

## Decisions

### 1. 建立受限的 Spectrum renderer

共享 `Button`、`ActionButton`、`TextField` 等语义 primitive 保持页面 API，内部改由一个 owner-local renderer 选择控件实现：支持的通用控件使用 SWC；已知 SWC 缺口使用 Spectrum UXP widget；仅产品特有的图像、媒体、复杂弹层和无可用 Spectrum 对应物保留 custom UI。页面不得直接渲染 raw form control 或 `sp-*`。

选择此边界可防止页面通过 CSS 重新依赖宿主原生控件，也能把 React custom-element 属性、事件、ref 和 controlled value 规则集中处理。直接全量替换页面会扩大 React/UXP 兼容性风险；继续扩充 `native-controls.tsx` 只会重复本次故障。

### 2. 使用项目锁定的 UXP SWC wrapper，而非浏览器 SWC 或 Spectrum 2

manifest 启用 `enableSWCSupport`，并以官方 wrapper 的单组件 import 为唯一 SWC 加载边界。先检查项目锁定的 wrapper 源码、依赖图和 Vite classic-script 产物；只恢复经最小 spike 证明所需的 alias、`import.meta` 与 `focus-visible` 兼容处理。

旧方案一次性恢复广泛 alias 与完整 SWC 运行时，无法隔离首帧故障；直接使用浏览器包或最新版 Spectrum 2 与 UXP 锁定的 SWC `0.37.0` 不兼容。

### 3. 视觉由 Spectrum 状态机所有

root 采用 `sp-theme` 并映射 Photoshop 可用的 dark/light host 色彩。`sp-button` 承担发送和明确命令；`sp-action-button` 承担 toolbar、返回和图标动作。toolbar 的 `quiet` action 空闲态必须透明，仅由 Spectrum 渲染 hover、focus、pressed、selected 与 disabled。布局 CSS 只管理尺寸、间距、排版、容器和产品特有画布；Material palette、生成 token 和 raw-control state CSS 逐步删除。

自定义复刻 Spectrum 状态或将 hover 规则压回 raw control，均会重新引入宿主绘制覆盖风险。

### 4. 单行与多行输入分开迁移

`TextField` 使用支持矩阵中的 SWC `sp-textfield`，但必须经现有 popup-layer overlap harness 验证 controlled value、disabled、secret/search 类型和与弹层重叠时的命中行为。

官方矩阵将 multiline `sp-textfield` 标记为 UXP 未支持，故 `UxpTextArea` 的目标实现为 Spectrum UXP `sp-textarea`，而非 SWC multiline。迁移前后都必须覆盖中文 IME、选择、Backspace/Delete、paste/cut、`input`/`change` 同步、send shortcut 与 popup-layer overlap。若用户提供的真实 Photoshop 证据显示 widget 不满足这些行为，此切片不得宣告完成；保留适配器 seam 并记录受阻能力，而非以 CSS 掩盖问题。

### 5. 兼容性是矩阵与能力探测，不是版本 CSS

renderer 不得通过 Photoshop 版本号或 user agent 切换视觉 CSS。兼容范围由 manifest 最低版本、已安装 wrapper、可加载组件和控制面的 contract 共同决定。新增/升级一个支持版本时，先在 harness 运行相同语义与视觉案例，再由用户在真实 Photoshop 复核。

## Risks / Trade-offs

- [SWC 首帧 geometry 再现] → 首先在独立 UXP CSS harness 检查定义、shadow root、尺寸和 50ms 后稳定状态；不通过不得迁移页面。
- [React 19 custom element 属性或事件不一致] → renderer 集中 ref、native event listener、attribute 和 value 同步；添加 deterministic test。
- [`sp-textarea` 行为与现有 seam 不等价] → 分离 textarea 切片，保留完整回归 harness 和用户拥有的真实宿主验收。
- [新依赖使 classic-script bundle 引入 dynamic import 或 `import.meta`] → 为 wrapper registry 增加产物检查和 `build:uxp` gate。
- [视觉迁移掩盖业务回归] → semantic primitive API、busy/validation 重检、ARIA 与 popup-layer contract 保持不变，先测行为再更新视觉 baseline。
- [宿主证据不可由 agent 自动取得] → tasks 明确区分可自动完成的 build/test 与需用户显式执行的 Photoshop 验收，不以未执行的手动检查声明完成。

## Migration Plan

1. 增加 manifest、锁定 wrapper registry 与最小 SWC harness；证明 UXP bundle 可启动且首帧几何稳定。
2. 实现 renderer adapter，迁移 `Button`、`ActionButton`、`TextField`、图标 toolbar 及对应 contract/visual case。
3. 以 Spectrum token 替换 Material 生成层和 raw-control state CSS；删除已无消费者的 Material/品牌视觉资产与残留 guard。
4. 独立迁移 `UxpTextArea` 至 `sp-textarea`，通过输入 seam、overlap 和用户提供的真实 Photoshop 证据后完成。
5. 在用户显式发起的真实 Photoshop 验收中重载面板，确认主页面发送、输入框、二级页 toolbar、dark/light 和首帧；失败时回退到上一已验证 renderer 切片，而不是在页面增加版本 CSS。

## Open Questions

- `sp-textarea` 在目标 Photoshop/UXP 版本是否完整保留中文 IME 和 popup-layer overlap 行为，待用户提供真实宿主结果。
- React 19 是否可直接满足 wrapper custom event/value 契约，或需最小的本地 ref adapter，待最小 spike 用锁定 wrapper 源码与 deterministic test 确认。
- 旧的首帧 `0x0` 问题在当前 Photoshop `27.9.1` 是否仍出现，待用户显式执行隔离 harness 验收确认。
