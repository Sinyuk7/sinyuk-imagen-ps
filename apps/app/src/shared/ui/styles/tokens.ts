/**
 * 设计 token 三层模型。
 *
 * Layer A — 宿主与环境输入：应用语义 token 的中性颜色（背景、文字、边框、
 * Hover）优先从 Photoshop UXP 官方 `--uxp-host-*` 变量派生，并在不存在时
 * 回退到固定暗色值（Chrome runtime 与未注入宿主变量的环境共用此 fallback）。
 * Accent / Positive / Notice / Negative 继续使用应用语义值，不从宿主派生。
 *
 * Layer B — 应用语义 token：页面与自定义组件只消费 `--app-*` 命名，不直接
 * 读取缩写 token 或 raw color。亮色主题通过 UXP 官方
 * `@media (prefers-color-scheme: light|lightest)` 切换 —— 自定义 UI 完全
 * 纯 CSS 自动跟随宿主主题，不需要 JavaScript 重新写入 token 或挂 class。
 * Chrome harness 用 `?theme=light|dark` 显式覆盖，仅用于同步 `<sp-theme color>`。
 *
 * Layer C — Spectrum bridge：`sp-theme.app-theme` 只做少量应用语义 token 到
 * SWC 0.37.0 公开 token 的映射，见本文件底部 `SPECTRUM_BRIDGE_CSS`。
 *
 * 不使用 transition / animation / transform / box-shadow / grid / gap /
 * margin 简写 / font 简写 / 相邻兄弟选择器 —— 这些在 Photoshop UXP host
 * renderer 中不可靠，由 `uxp-css-compat.test.ts` 强制。
 */

/* === Layer A + B：暗色默认（同时也是 Chrome fallback） ===
 * 中性 token 通过 `var(--uxp-host-*, <fallback>)` 链路从宿主派生；
 * Accent / 语义状态色保持应用自有值，不映射到宿主。 */
export const TOKENS_CSS = `
:root{
  /* 背景层级 —— 收敛为 Base / Layer-1 / Layer-2 / Elevated 四档 */
  --app-color-background-base:var(--uxp-host-background-color, #0D1117);
  --app-color-background-layer-1:#151A22;
  --app-color-background-layer-2:#1C2330;
  --app-color-background-elevated:#242C3B;

  /* 边框 */
  --app-color-border-default:var(--uxp-host-border-color, #2E3748);
  --app-color-border-strong:#3A4457;

  /* 文字 —— primary / secondary / muted / on-accent */
  --app-color-text-primary:var(--uxp-host-text-color, #E9EDF4);
  --app-color-text-secondary:var(--uxp-host-text-color-secondary, #A6B0BF);
  --app-color-text-muted:#738093;
  --app-color-text-on-accent:#0D1117;
  --app-color-link:var(--uxp-host-link-text-color, var(--app-color-informative));

  /* 品牌 Accent（Mint）—— 仅用于 CTA / 选中强调 / focus / 品牌识别 */
  --app-color-accent-default:#78E7C0;
  --app-color-accent-hover:#8AF0CC;
  --app-color-accent-down:#58D9AF;
  --app-color-accent-subtle:rgba(120,231,192,.14);

  /* 语义状态色 —— 与 Accent 区分，不共用绿色 */
  --app-color-positive:#63D48F;
  --app-color-positive-subtle:rgba(99,212,143,.14);
  --app-color-informative:#67B7FF;
  --app-color-informative-subtle:rgba(103,183,255,.14);
  --app-color-notice:#F2B84B;
  --app-color-notice-subtle:rgba(242,184,75,.14);
  --app-color-negative:#F26D6D;
  --app-color-negative-subtle:rgba(242,109,109,.14);

  /* 交互叠层 —— Hover 从宿主派生 */
  --app-color-hover-overlay:var(--uxp-host-widget-hover-background-color, rgba(255,255,255,.05));
  --app-color-active-overlay:rgba(255,255,255,.09);
  --app-color-focus-ring:var(--app-color-accent-default);

  /* 圆角 */
  --app-radius-small:8px;
  --app-radius-medium:12px;
  --app-radius-large:20px;
  --app-radius-pill:9999px;

  /* 间距尺度（用于需要语义间距处，非全局强制） */
  --app-space-1:4px;
  --app-space-2:8px;
  --app-space-3:12px;
  --app-space-4:16px;

  /* 字体 —— --fD 与 --fB 原值完全相同，合并为单一 base family */
  --app-font-family-base:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --app-font-family-mono:'SF Mono','Menlo',monospace;

  /* 满屏底色（html/body），略深于 panel base 以产生面板浮起感 */
  --app-color-canvas:#060A0F;
}
`;

/* === 亮色主题：覆盖中性 token，Accent 调暗保证浅底对比 ===
 * 使用 UXP 官方 `@media (prefers-color-scheme: light|lightest)` —— 自定义 UI
 * 纯 CSS 自动跟随 Photoshop 四主题，不需要 JavaScript state 或 class。
 * UXP 自 4.1 起支持四值 prefers-color-scheme（lightest/light/dark/darkest）。
 * Chrome 同样支持标准 prefers-color-scheme media query。 */
export const LIGHT_THEME_CSS = `
@media (prefers-color-scheme: light),
       (prefers-color-scheme: lightest){
  :root{
    --app-color-background-base:#F5F6F8;
    --app-color-background-layer-1:#FFFFFF;
    --app-color-background-layer-2:#EBEDEF;
    --app-color-background-elevated:#E0E3E8;

    --app-color-border-default:#D2D6DC;
    --app-color-border-strong:#B8BEC7;

    --app-color-text-primary:#1F232A;
    --app-color-text-secondary:#5A6470;
    --app-color-text-muted:#8B94A0;
    --app-color-text-on-accent:#0D1117;
    --app-color-link:#2E7DD6;

    --app-color-accent-default:#2DB89A;
    --app-color-accent-hover:#25A68A;
    --app-color-accent-down:#1F8E76;
    --app-color-accent-subtle:rgba(45,184,154,.14);

    --app-color-positive:#2E9F5C;
    --app-color-positive-subtle:rgba(46,159,92,.14);
    --app-color-informative:#2E7DD6;
    --app-color-informative-subtle:rgba(46,125,214,.14);
    --app-color-notice:#C77E1F;
    --app-color-notice-subtle:rgba(199,126,31,.14);
    --app-color-negative:#D14545;
    --app-color-negative-subtle:rgba(209,69,69,.14);

    --app-color-hover-overlay:rgba(0,0,0,.04);
    --app-color-active-overlay:rgba(0,0,0,.08);

    --app-color-canvas:#ECEEF1;
  }
}
`;

/* === CSS theme probe（ResizeObserver fallback 用） ===
 * 仅当 `window.matchMedia` change listener 在 UXP 实机中不可靠时启用。
 * Dark/Darkest 下 width:1px，Light/Lightest 下 width:2px。
 * `useAppTheme()` 用 ResizeObserver 监听此元素尺寸变化，
 * 将结果桥接到必须由 JavaScript 设置的 `<sp-theme color>` property。
 * 元素不可见、不参与布局、不接收事件。 */
export const THEME_PROBE_CSS = `
.uxp-theme-probe{
  position:absolute;
  width:1px;
  height:1px;
  overflow:hidden;
  opacity:0;
  pointer-events:none;
}
@media (prefers-color-scheme: light),
       (prefers-color-scheme: lightest){
  .uxp-theme-probe{
    width:2px;
  }
}
`;

/* === Layer C：Spectrum bridge ===
 * 只保留经审核确认在 SWC 0.37.0 公开 token 中生效的映射项。
 * 所有映射指向 `--app-*` 语义 token，因此亮色主题切换时 SWC 表面背景
 * 会跟随应用层翻转。删除了原文件中重复、过宽或依赖内部实现的 override。
 */
export const SPECTRUM_BRIDGE_CSS = `
sp-theme.app-theme{
  display:contents;
  /* Accent 映射到 SWC accent 公开 token */
  --spectrum-accent-background-color-default:var(--app-color-accent-default);
  --spectrum-accent-background-color-hover:var(--app-color-accent-hover);
  --spectrum-accent-background-color-down:var(--app-color-accent-down);
  --spectrum-accent-background-color-key-focus:var(--app-color-accent-hover);
  /* accent 内容色固定深色，保证 mint 底上文字可读 */
  --spectrum-accent-content-color-default:var(--app-color-text-on-accent);
  --spectrum-accent-content-color-hover:var(--app-color-text-on-accent);
  --spectrum-accent-content-color-down:var(--app-color-text-on-accent);
  --spectrum-accent-content-color-focus:var(--app-color-text-on-accent);
  /* SWC 控件基础底色跟随应用层背景，使主题切换时表面一致 */
  --spectrum-background-base-color:var(--app-color-background-base);
  --spectrum-neutral-background-color-default:var(--app-color-background-layer-2);
}
/* SWC 输入控件表面对齐到 Layer-2，边框对齐到 default border */
sp-action-button,
.swc-field sp-textfield,
sp-textfield{
  --spectrum-textfield-background-color:var(--app-color-background-layer-2);
  --spectrum-textfield-border-color:var(--app-color-border-default);
}
.swc-field{
  display:flex;
  width:100%;
  --spectrum-textfield-width:100%;
  --mod-textfield-width:100%;
  --spectrum-textfield-background-color:var(--app-color-background-layer-2);
  --spectrum-textfield-border-color:var(--app-color-border-default);
}
.swc-field sp-textfield,
.field-input.mono{
  font-family:var(--app-font-family-mono);
}
.swc-button{
  width:100%;
  display:flex;
  align-items:center;
  justify-content:center;
}
sp-divider{
  --spectrum-divider-background-color:var(--app-color-border-default);
}
/* Workaround: SWC 0.37.0 menu surface 不会继承 sp-theme 的 background，
 * 在 UXP host 中默认透明会导致菜单叠在内容上不可读。显式给菜单容器
 * （.cmp-select-menu / .model-menu / .attach-picker / .layer-list-wrap）
 * 在各自规则里设置背景，不在此处依赖 shadow DOM 内部 token。 */
`;
