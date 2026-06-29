/**
 * 设计 token 三层模型（Material Design 3 色彩体系）。
 *
 * Layer A — md-sys 原料层：6 套 Material Design 3 主题（dark / dark-hc /
 * dark-mc / light / light-hc / light-mc），每套 58 个 token（50 标准 +
 * 8 yellow/green 扩展）。4 套通过 `@media (prefers-color-scheme)` 接入
 * UXP 四主题映射，2 套 mc 通过 class 备用。
 *
 * UXP 四主题映射（方案 A：hc 两端 + 默认中间，mc 储备）：
 *   darkest  → dark-hc   @media (prefers-color-scheme: darkest)
 *   dark     → dark      :root 默认
 *   light    → light     @media (prefers-color-scheme: light)
 *   lightest → light-hc  @media (prefers-color-scheme: lightest)
 *
 * Layer B — 宿主派生 + 应用语义层：6 个中性 token 优先从 Photoshop UXP
 * `--uxp-host-*` 变量派生（实机跟随宿主四主题），fallback 到 md-sys 值
 * （Chrome 与未注入宿主变量的环境）。Accent 从 mint 绿切换为 md-sys
 * primary 蓝系。positive ← green 扩展色，notice ← yellow 扩展色，
 * informative ← primary，negative ← error。
 *
 * Layer C — Spectrum bridge：`sp-theme.app-theme` 只做少量应用语义 token
 * 到 SWC 0.37.0 公开 token 的映射，见本文件底部 `SPECTRUM_BRIDGE_CSS`。
 *
 * 不使用 transition / animation / transform / box-shadow / grid / gap /
 * margin 简写 / font 简写 / 相邻兄弟选择器 —— 这些在 Photoshop UXP host
 * renderer 中不可靠，由 `uxp-css-compat.test.ts` 强制。
 */

/* === Layer A + B：暗色默认（dark = UXP dark 主题 fallback） ===
 * 6 个中性 token 通过 `var(--uxp-host-*, var(--md-sys-color-*))` 链路从宿主
 * 派生；Accent / 语义状态色直接引用 md-sys token。
 * accent-hover / accent-down 从 primary 派生（±8% 明度），因 md-sys 无
 * hover/down 变体。subtle 变体为对应色 14% rgba，因 UXP 不支持 color-mix()。 */
export const TOKENS_CSS = `
:root{
  /* === md-sys dark 主题原料 === */
  --md-sys-color-primary:#ACC7FF;
  --md-sys-color-surface-tint:#ACC7FF;
  --md-sys-color-on-primary:#0E2F60;
  --md-sys-color-primary-container:#294677;
  --md-sys-color-on-primary-container:#D7E2FF;
  --md-sys-color-secondary:#BEC6DC;
  --md-sys-color-on-secondary:#283041;
  --md-sys-color-secondary-container:#3F4759;
  --md-sys-color-on-secondary-container:#DAE2F9;
  --md-sys-color-tertiary:#DDBCE0;
  --md-sys-color-on-tertiary:#3F2844;
  --md-sys-color-tertiary-container:#573E5B;
  --md-sys-color-on-tertiary-container:#FBD7FC;
  --md-sys-color-error:#FFB4AB;
  --md-sys-color-on-error:#690005;
  --md-sys-color-error-container:#93000A;
  --md-sys-color-on-error-container:#FFDAD6;
  --md-sys-color-background:#111318;
  --md-sys-color-on-background:#E2E2E9;
  --md-sys-color-surface:#111318;
  --md-sys-color-on-surface:#E2E2E9;
  --md-sys-color-surface-variant:#44474E;
  --md-sys-color-on-surface-variant:#C4C6D0;
  --md-sys-color-outline:#8E9099;
  --md-sys-color-outline-variant:#44474E;
  --md-sys-color-shadow:#000000;
  --md-sys-color-scrim:#000000;
  --md-sys-color-inverse-surface:#E2E2E9;
  --md-sys-color-inverse-on-surface:#2E3036;
  --md-sys-color-inverse-primary:#435E91;
  --md-sys-color-primary-fixed:#D7E2FF;
  --md-sys-color-on-primary-fixed:#001A40;
  --md-sys-color-primary-fixed-dim:#ACC7FF;
  --md-sys-color-on-primary-fixed-variant:#294677;
  --md-sys-color-secondary-fixed:#DAE2F9;
  --md-sys-color-on-secondary-fixed:#131C2C;
  --md-sys-color-secondary-fixed-dim:#BEC6DC;
  --md-sys-color-on-secondary-fixed-variant:#3F4759;
  --md-sys-color-tertiary-fixed:#FBD7FC;
  --md-sys-color-on-tertiary-fixed:#29132E;
  --md-sys-color-tertiary-fixed-dim:#DDBCE0;
  --md-sys-color-on-tertiary-fixed-variant:#573E5B;
  --md-sys-color-surface-dim:#111318;
  --md-sys-color-surface-bright:#37393E;
  --md-sys-color-surface-container-lowest:#0C0E13;
  --md-sys-color-surface-container-low:#1A1B20;
  --md-sys-color-surface-container:#1E2025;
  --md-sys-color-surface-container-high:#282A2F;
  --md-sys-color-surface-container-highest:#33353A;
  --md-extended-color-yellow-color:#C6CC79;
  --md-extended-color-yellow-on-color:#303300;
  --md-extended-color-yellow-color-container:#464A03;
  --md-extended-color-yellow-on-color-container:#E3E892;
  --md-extended-color-green-color:#9CD49F;
  --md-extended-color-green-on-color:#013913;
  --md-extended-color-green-color-container:#1D5128;
  --md-extended-color-green-on-color-container:#B8F1B9;

  /* === Layer B：应用语义 token === */
  /* 背景层级 —— 收敛为 Base / Layer-1 / Layer-2 / Elevated 四档 */
  --app-color-background-base:var(--uxp-host-background-color, var(--md-sys-color-surface));
  --app-color-background-layer-1:var(--md-sys-color-surface-container-low);
  --app-color-background-layer-2:var(--md-sys-color-surface-container);
  --app-color-background-elevated:var(--md-sys-color-surface-container-high);

  /* 边框 */
  --app-color-border-default:var(--uxp-host-border-color, var(--md-sys-color-outline-variant));
  --app-color-border-strong:var(--md-sys-color-outline);

  /* 文字 —— primary / secondary / muted / on-accent */
  --app-color-text-primary:var(--uxp-host-text-color, var(--md-sys-color-on-surface));
  --app-color-text-secondary:var(--uxp-host-text-color-secondary, var(--md-sys-color-on-surface-variant));
  --app-color-text-muted:var(--md-sys-color-outline);
  --app-color-text-on-accent:var(--md-sys-color-on-primary);
  --app-color-link:var(--uxp-host-link-text-color, var(--app-color-informative));

  /* 品牌 Accent（md-sys primary 蓝系）—— CTA / 选中强调 / focus / 品牌识别 */
  --app-color-accent-default:var(--md-sys-color-primary);
  --app-color-accent-hover:#B3CBFF;
  --app-color-accent-down:#9EB7EB;
  --app-color-accent-subtle:rgba(172,199,255,.14);

  /* 语义状态色 —— negative ← error，positive ← green，notice ← yellow，informative ← primary */
  --app-color-positive:var(--md-extended-color-green-color);
  --app-color-positive-subtle:rgba(156,212,159,.14);
  --app-color-informative:var(--md-sys-color-primary);
  --app-color-informative-subtle:rgba(172,199,255,.14);
  --app-color-notice:var(--md-extended-color-yellow-color);
  --app-color-notice-subtle:rgba(198,204,121,.14);
  --app-color-negative:var(--md-sys-color-error);
  --app-color-negative-subtle:rgba(255,180,171,.14);

  /* 交互叠层 —— Hover 从宿主派生，fallback 随主题切换 */
  --app-hover-overlay-fallback:rgba(255,255,255,.05);
  --app-color-hover-overlay:var(--uxp-host-widget-hover-background-color, var(--app-hover-overlay-fallback));
  --app-color-active-overlay:rgba(255,255,255,.09);
  --app-color-focus-ring:var(--app-color-accent-default);

  /* 圆角 */
  --app-radius-small:8px;
  --app-radius-medium:12px;
  --app-radius-large:20px;
  --app-radius-pill:var(--app-radius-medium);

  /* 间距尺度（用于需要语义间距处，非全局强制） */
  --app-space-1:4px;
  --app-space-2:8px;
  --app-space-3:12px;
  --app-space-4:16px;

  /* 字体 —— --fD 与 --fB 原值完全相同，合并为单一 base family */
  --app-font-family-base:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --app-font-family-mono:'SF Mono','Menlo',monospace;

  /* 满屏底色（html/body），md-sys surface-container-lowest 在暗色端最深 */
  --app-color-canvas:var(--md-sys-color-surface-container-lowest);
}

/* === UXP darkest 主题 → md-sys dark-hc === */
@media (prefers-color-scheme: darkest){
  :root{
    --md-sys-color-primary:#EBF0FF;
    --md-sys-color-surface-tint:#ACC7FF;
    --md-sys-color-on-primary:#000000;
    --md-sys-color-primary-container:#A7C3FC;
    --md-sys-color-on-primary-container:#000B21;
    --md-sys-color-secondary:#EBF0FF;
    --md-sys-color-on-secondary:#000000;
    --md-sys-color-secondary-container:#BAC2D8;
    --md-sys-color-on-secondary-container:#040B1A;
    --md-sys-color-tertiary:#FFEAFD;
    --md-sys-color-on-tertiary:#000000;
    --md-sys-color-tertiary-container:#D9B8DC;
    --md-sys-color-on-tertiary-container:#17031C;
    --md-sys-color-error:#FFECE9;
    --md-sys-color-on-error:#000000;
    --md-sys-color-error-container:#FFAEA4;
    --md-sys-color-on-error-container:#220001;
    --md-sys-color-background:#111318;
    --md-sys-color-on-background:#E2E2E9;
    --md-sys-color-surface:#111318;
    --md-sys-color-on-surface:#FFFFFF;
    --md-sys-color-surface-variant:#44474E;
    --md-sys-color-on-surface-variant:#FFFFFF;
    --md-sys-color-outline:#EEEFF9;
    --md-sys-color-outline-variant:#C0C2CC;
    --md-sys-color-shadow:#000000;
    --md-sys-color-scrim:#000000;
    --md-sys-color-inverse-surface:#E2E2E9;
    --md-sys-color-inverse-on-surface:#000000;
    --md-sys-color-inverse-primary:#2B4779;
    --md-sys-color-primary-fixed:#D7E2FF;
    --md-sys-color-on-primary-fixed:#000000;
    --md-sys-color-primary-fixed-dim:#ACC7FF;
    --md-sys-color-on-primary-fixed-variant:#00102C;
    --md-sys-color-secondary-fixed:#DAE2F9;
    --md-sys-color-on-secondary-fixed:#000000;
    --md-sys-color-secondary-fixed-dim:#BEC6DC;
    --md-sys-color-on-secondary-fixed-variant:#081121;
    --md-sys-color-tertiary-fixed:#FBD7FC;
    --md-sys-color-on-tertiary-fixed:#000000;
    --md-sys-color-tertiary-fixed-dim:#DDBCE0;
    --md-sys-color-on-tertiary-fixed-variant:#1D0823;
    --md-sys-color-surface-dim:#111318;
    --md-sys-color-surface-bright:#4E5056;
    --md-sys-color-surface-container-lowest:#000000;
    --md-sys-color-surface-container-low:#1E2025;
    --md-sys-color-surface-container:#2E3036;
    --md-sys-color-surface-container-high:#3A3B41;
    --md-sys-color-surface-container-highest:#45474C;
    --md-extended-color-yellow-color:#F0F69F;
    --md-extended-color-yellow-on-color:#000000;
    --md-extended-color-yellow-color-container:#C2C876;
    --md-extended-color-yellow-on-color-container:#0B0C00;
    --md-extended-color-green-color:#C5FEC6;
    --md-extended-color-green-on-color:#000000;
    --md-extended-color-green-color-container:#99D09B;
    --md-extended-color-green-on-color-container:#000F02;

    --app-color-accent-hover:#ECF1FF;
    --app-color-accent-down:#D8DDEB;
    --app-color-accent-subtle:rgba(235,240,255,.14);
    --app-color-positive-subtle:rgba(197,254,198,.14);
    --app-color-informative-subtle:rgba(235,240,255,.14);
    --app-color-notice-subtle:rgba(240,246,159,.14);
    --app-color-negative-subtle:rgba(255,236,233,.14);
  }
}
`;

/* === UXP light 主题 → md-sys light + UXP lightest → md-sys light-hc ===
 * 亮色通过 `@media (prefers-color-scheme)` 纯 CSS 自动跟随宿主主题。
 * 自定义 UI 无需 JavaScript state 或 class。 */
export const LIGHT_THEME_CSS = `
@media (prefers-color-scheme: light){
  :root{
    --md-sys-color-primary:#435E91;
    --md-sys-color-surface-tint:#435E91;
    --md-sys-color-on-primary:#FFFFFF;
    --md-sys-color-primary-container:#D7E2FF;
    --md-sys-color-on-primary-container:#294677;
    --md-sys-color-secondary:#565E71;
    --md-sys-color-on-secondary:#FFFFFF;
    --md-sys-color-secondary-container:#DAE2F9;
    --md-sys-color-on-secondary-container:#3F4759;
    --md-sys-color-tertiary:#705574;
    --md-sys-color-on-tertiary:#FFFFFF;
    --md-sys-color-tertiary-container:#FBD7FC;
    --md-sys-color-on-tertiary-container:#573E5B;
    --md-sys-color-error:#BA1A1A;
    --md-sys-color-on-error:#FFFFFF;
    --md-sys-color-error-container:#FFDAD6;
    --md-sys-color-on-error-container:#93000A;
    --md-sys-color-background:#F9F9FF;
    --md-sys-color-on-background:#1A1B20;
    --md-sys-color-surface:#F9F9FF;
    --md-sys-color-on-surface:#1A1B20;
    --md-sys-color-surface-variant:#E0E2EC;
    --md-sys-color-on-surface-variant:#44474E;
    --md-sys-color-outline:#74777F;
    --md-sys-color-outline-variant:#C4C6D0;
    --md-sys-color-shadow:#000000;
    --md-sys-color-scrim:#000000;
    --md-sys-color-inverse-surface:#2E3036;
    --md-sys-color-inverse-on-surface:#F0F0F7;
    --md-sys-color-inverse-primary:#ACC7FF;
    --md-sys-color-primary-fixed:#D7E2FF;
    --md-sys-color-on-primary-fixed:#001A40;
    --md-sys-color-primary-fixed-dim:#ACC7FF;
    --md-sys-color-on-primary-fixed-variant:#294677;
    --md-sys-color-secondary-fixed:#DAE2F9;
    --md-sys-color-on-secondary-fixed:#131C2C;
    --md-sys-color-secondary-fixed-dim:#BEC6DC;
    --md-sys-color-on-secondary-fixed-variant:#3F4759;
    --md-sys-color-tertiary-fixed:#FBD7FC;
    --md-sys-color-on-tertiary-fixed:#29132E;
    --md-sys-color-tertiary-fixed-dim:#DDBCE0;
    --md-sys-color-on-tertiary-fixed-variant:#573E5B;
    --md-sys-color-surface-dim:#D9D9E0;
    --md-sys-color-surface-bright:#F9F9FF;
    --md-sys-color-surface-container-lowest:#FFFFFF;
    --md-sys-color-surface-container-low:#F3F3FA;
    --md-sys-color-surface-container:#EDEDF4;
    --md-sys-color-surface-container-high:#E8E7EE;
    --md-sys-color-surface-container-highest:#E2E2E9;
    --md-extended-color-yellow-color:#5D621C;
    --md-extended-color-yellow-on-color:#FFFFFF;
    --md-extended-color-yellow-color-container:#E3E892;
    --md-extended-color-yellow-on-color-container:#464A03;
    --md-extended-color-green-color:#36693D;
    --md-extended-color-green-on-color:#FFFFFF;
    --md-extended-color-green-color-container:#B8F1B9;
    --md-extended-color-green-on-color-container:#1D5128;

    --app-color-accent-hover:#526B9A;
    --app-color-accent-down:#3E5685;
    --app-color-accent-subtle:rgba(67,94,145,.14);
    --app-color-positive-subtle:rgba(54,105,61,.14);
    --app-color-informative-subtle:rgba(67,94,145,.14);
    --app-color-notice-subtle:rgba(93,98,28,.14);
    --app-color-negative-subtle:rgba(186,26,26,.14);
    --app-hover-overlay-fallback:rgba(0,0,0,.04);
    --app-color-active-overlay:rgba(0,0,0,.08);
  }
}

@media (prefers-color-scheme: lightest){
  :root{
    --md-sys-color-primary:#072B5B;
    --md-sys-color-surface-tint:#435E91;
    --md-sys-color-on-primary:#FFFFFF;
    --md-sys-color-primary-container:#2C497A;
    --md-sys-color-on-primary-container:#FFFFFF;
    --md-sys-color-secondary:#242C3D;
    --md-sys-color-on-secondary:#FFFFFF;
    --md-sys-color-secondary-container:#41495B;
    --md-sys-color-on-secondary-container:#FFFFFF;
    --md-sys-color-tertiary:#3B243F;
    --md-sys-color-on-tertiary:#FFFFFF;
    --md-sys-color-tertiary-container:#5A405E;
    --md-sys-color-on-tertiary-container:#FFFFFF;
    --md-sys-color-error:#600004;
    --md-sys-color-on-error:#FFFFFF;
    --md-sys-color-error-container:#98000A;
    --md-sys-color-on-error-container:#FFFFFF;
    --md-sys-color-background:#F9F9FF;
    --md-sys-color-on-background:#1A1B20;
    --md-sys-color-surface:#F9F9FF;
    --md-sys-color-on-surface:#000000;
    --md-sys-color-surface-variant:#E0E2EC;
    --md-sys-color-on-surface-variant:#000000;
    --md-sys-color-outline:#292C33;
    --md-sys-color-outline-variant:#464951;
    --md-sys-color-shadow:#000000;
    --md-sys-color-scrim:#000000;
    --md-sys-color-inverse-surface:#2E3036;
    --md-sys-color-inverse-on-surface:#FFFFFF;
    --md-sys-color-inverse-primary:#ACC7FF;
    --md-sys-color-primary-fixed:#2C497A;
    --md-sys-color-on-primary-fixed:#FFFFFF;
    --md-sys-color-primary-fixed-dim:#113262;
    --md-sys-color-on-primary-fixed-variant:#FFFFFF;
    --md-sys-color-secondary-fixed:#41495B;
    --md-sys-color-on-secondary-fixed:#FFFFFF;
    --md-sys-color-secondary-fixed-dim:#2A3344;
    --md-sys-color-on-secondary-fixed-variant:#FFFFFF;
    --md-sys-color-tertiary-fixed:#5A405E;
    --md-sys-color-on-tertiary-fixed:#FFFFFF;
    --md-sys-color-tertiary-fixed-dim:#422A46;
    --md-sys-color-on-tertiary-fixed-variant:#FFFFFF;
    --md-sys-color-surface-dim:#B8B8BF;
    --md-sys-color-surface-bright:#F9F9FF;
    --md-sys-color-surface-container-lowest:#FFFFFF;
    --md-sys-color-surface-container-low:#F0F0F7;
    --md-sys-color-surface-container:#E2E2E9;
    --md-sys-color-surface-container-high:#D4D4DB;
    --md-sys-color-surface-container-highest:#C6C6CD;
    --md-extended-color-yellow-color:#2B2F00;
    --md-extended-color-yellow-on-color:#FFFFFF;
    --md-extended-color-yellow-color-container:#484D05;
    --md-extended-color-yellow-on-color-container:#FFFFFF;
    --md-extended-color-green-color:#003411;
    --md-extended-color-green-on-color:#FFFFFF;
    --md-extended-color-green-color-container:#20532A;
    --md-extended-color-green-on-color-container:#FFFFFF;

    --app-color-accent-hover:#1B3C68;
    --app-color-accent-down:#062854;
    --app-color-accent-subtle:rgba(7,43,91,.14);
    --app-color-positive-subtle:rgba(0,52,17,.14);
    --app-color-informative-subtle:rgba(7,43,91,.14);
    --app-color-notice-subtle:rgba(43,47,0,.14);
    --app-color-negative-subtle:rgba(96,0,4,.14);
  }
}
`;

 /* === CSS theme probe（初始化 / 恢复同步兜底） ===
 * 仅当 `window.matchMedia` change listener 未命中时，用一次性 DOM 读取兜底。
 * Dark/Darkest 下 width:1px，Light/Lightest 下 width:2px。
 * `useAppTheme()` 读取此元素尺寸，桥接到必须由 JavaScript 设置的
 * `<sp-theme color>` property。
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
 * 所有映射指向 `--app-*` 语义 token，因此主题切换时 SWC 表面背景
 * 会跟随应用层翻转。 */
export const SPECTRUM_BRIDGE_CSS = `
sp-theme.app-theme{
  display:block;
  width:100%;
  height:100%;
  min-width:0;
  min-height:0;
  /* Accent 映射到 SWC accent 公开 token */
  --spectrum-accent-background-color-default:var(--app-color-accent-default);
  --spectrum-accent-background-color-hover:var(--app-color-accent-hover);
  --spectrum-accent-background-color-down:var(--app-color-accent-down);
  --spectrum-accent-background-color-key-focus:var(--app-color-accent-hover);
  /* accent 内容色跟随 md-sys on-primary，亮色主题下自动翻转为白色 */
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
.swc-button::part(button){
  width:100%;
}
.ui-button-content{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:100%;
}
.ui-button-label{
  display:block;
}
.ui-icon-text{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  white-space:nowrap;
}
.ui-icon-text-icon{
  display:block;
  flex:0 0 auto;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.ui-icon-text-label{
  display:block;
  position:relative;
  top:1px;
}
sp-divider{
  --spectrum-divider-background-color:var(--app-color-border-default);
}
/* Workaround: SWC 0.37.0 menu surface 不会继承 sp-theme 的 background，
 * 在 UXP host 中默认透明会导致菜单叠在内容上不可读。显式给菜单容器
 * （.cmp-select-menu / .model-menu / .attach-picker / .layer-list-wrap）
 * 在各自规则里设置背景，不在此处依赖 shadow DOM 内部 token。 */
`;
