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
 * Layer C — Native controls：项目轻量原生控件消费 `--app-*` 语义 token。
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

/* === Layer C：Native controls ===
 * Photoshop UXP 直接消费上方 `@media (prefers-color-scheme)` 与
 * `--uxp-host-*` 链路；不要在 UXP 根节点写 `data-app-theme`，否则会
 * 固定 light/dark 覆盖宿主动态主题。下面两个 selector 只用于 Chrome
 * harness 的 `?theme=light|dark` 显式覆盖。 */
export const NATIVE_CONTROLS_CSS = `
.panel{
  display:block;
  width:100%;
  height:100%;
  min-width:0;
  min-height:0;
}
.panel[data-app-theme="dark"]{
  --app-color-background-base:#111318;
  --app-color-background-layer-1:#1A1B20;
  --app-color-background-layer-2:#1E2025;
  --app-color-background-elevated:#282A2F;
  --app-color-border-default:#44474E;
  --app-color-border-strong:#8E9099;
  --app-color-text-primary:#E2E2E9;
  --app-color-text-secondary:#C4C6D0;
  --app-color-text-muted:#8E9099;
  --app-color-text-on-accent:#0E2F60;
  --app-color-link:#ACC7FF;
  --app-color-accent-default:#ACC7FF;
  --app-color-accent-hover:#B3CBFF;
  --app-color-accent-down:#9EB7EB;
  --app-color-accent-subtle:rgba(172,199,255,.14);
  --app-color-positive:#9CD49F;
  --app-color-positive-subtle:rgba(156,212,159,.14);
  --app-color-informative:#ACC7FF;
  --app-color-informative-subtle:rgba(172,199,255,.14);
  --app-color-notice:#C6CC79;
  --app-color-notice-subtle:rgba(198,204,121,.14);
  --app-color-negative:#FFB4AB;
  --app-color-negative-subtle:rgba(255,180,171,.14);
  --app-hover-overlay-fallback:rgba(255,255,255,.05);
  --app-color-hover-overlay:rgba(255,255,255,.05);
  --app-color-active-overlay:rgba(255,255,255,.09);
  --app-color-focus-ring:#ACC7FF;
  --app-color-canvas:#0C0E13;
}
.panel[data-app-theme="light"]{
  --app-color-background-base:#F9F9FF;
  --app-color-background-layer-1:#F3F3FA;
  --app-color-background-layer-2:#EDEDF4;
  --app-color-background-elevated:#E8E7EE;
  --app-color-border-default:#C4C6D0;
  --app-color-border-strong:#74777F;
  --app-color-text-primary:#1A1B20;
  --app-color-text-secondary:#44474E;
  --app-color-text-muted:#74777F;
  --app-color-text-on-accent:#FFFFFF;
  --app-color-link:#435E91;
  --app-color-accent-default:#435E91;
  --app-color-accent-hover:#526B9A;
  --app-color-accent-down:#3E5685;
  --app-color-accent-subtle:rgba(67,94,145,.14);
  --app-color-positive:#36693D;
  --app-color-positive-subtle:rgba(54,105,61,.14);
  --app-color-informative:#435E91;
  --app-color-informative-subtle:rgba(67,94,145,.14);
  --app-color-notice:#5D621C;
  --app-color-notice-subtle:rgba(93,98,28,.14);
  --app-color-negative:#BA1A1A;
  --app-color-negative-subtle:rgba(186,26,26,.14);
  --app-hover-overlay-fallback:rgba(0,0,0,.04);
  --app-color-hover-overlay:rgba(0,0,0,.04);
  --app-color-active-overlay:rgba(0,0,0,.08);
  --app-color-focus-ring:#435E91;
  --app-color-canvas:#FFFFFF;
}
.ui-field-control{
  display:block;
  width:100%;
}
.ui-textfield{
  min-height:32px;
  padding:6px 10px;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-small);
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-primary);
  outline:none;
}
.ui-textfield::placeholder{ color:var(--app-color-text-muted); }
.ui-textfield:focus{
  border-color:var(--app-color-focus-ring);
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:-1px;
}
.ui-textfield:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.ui-textfield.mono,
.field-input.mono,
.mono{
  font-family:var(--app-font-family-mono);
}
.ui-field-label{
  display:block;
  margin-bottom:6px;
  font-size:11px;
  font-weight:600;
  color:var(--app-color-text-secondary);
}
.ui-field-label[data-disabled="true"]{ opacity:.45; }
.ui-field-label[data-required="true"] span::after{
  content:"*";
  margin-left:3px;
  color:var(--app-color-negative);
}
.ui-help-text{
  display:block;
  font-size:11px;
  line-height:15px;
  color:var(--app-color-text-muted);
}
.ui-help-text[data-variant="negative"]{ color:var(--app-color-negative); }
.ui-divider{
  display:block;
  width:100%;
  height:1px;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding:0;
  border:none;
  background:var(--app-color-border-default);
}
.ui-divider[data-orientation="vertical"]{
  width:1px;
  height:auto;
  align-self:stretch;
}
.ui-button-block{
  width:100%;
}
.ui-btn,
.ui-action-button{
  position:relative;
  min-height:32px;
  padding:6px 12px;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-medium);
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-primary);
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:0;
}
.ui-btn:hover,
.ui-action-button:hover{
  border-color:var(--app-color-border-strong);
  background:var(--app-color-background-elevated);
}
.ui-btn:active,
.ui-action-button:active{ background:var(--app-color-active-overlay); }
.ui-btn:focus-visible,
.ui-action-button:focus-visible{
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:1px;
}
.ui-btn:disabled,
.ui-action-button:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.ui-btn[data-variant="accent"]{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-default);
  color:var(--app-color-text-on-accent);
}
.ui-btn[data-variant="accent"]:hover{ background:var(--app-color-accent-hover); }
.ui-btn[data-variant="accent"]:active{ background:var(--app-color-accent-down); }
.ui-btn[data-variant="negative"]{
  border-color:var(--app-color-negative);
  color:var(--app-color-negative);
}
.ui-btn[data-variant="primary"]{
  border-color:var(--app-color-accent-default);
  color:var(--app-color-accent-default);
}
.ui-action-button[data-quiet="true"]{
  border-color:transparent;
  background:transparent;
}
.ui-action-button[data-quiet="true"]:hover{
  border-color:transparent;
  background:var(--app-color-hover-overlay);
}
.ui-action-button[data-selected="true"]{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-subtle);
  color:var(--app-color-accent-default);
}
.ui-action-button[data-emphasized="true"]{
  border-color:var(--app-color-accent-default);
  color:var(--app-color-accent-default);
}
.ui-overlay-icon-host{
  position:relative;
  display:inline-flex;
  min-width:0;
  flex:0 0 auto;
}
.ui-overlay-icon-button{
  position:relative;
  z-index:1;
}
.ui-overlay-icon-layer{
  position:absolute;
  top:0;
  left:0;
  right:0;
  bottom:0;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color:inherit;
  pointer-events:none;
  z-index:2;
}
.ui-overlay-icon-host[data-disabled="true"] > .ui-overlay-icon-layer{
  opacity:.45;
}

/* IconButton：统一图标按钮的 overlay 与占位布局。 */
.ui-icon-button{
  /* 外观由使用方的 className 负责；这里只保证内部 flex 居中。 */
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.ui-icon-button-host{
  color:inherit;
}
.ui-icon-button-host--compact-square{
  width:32px;
  min-width:32px;
  height:32px;
  min-height:32px;
}
.ui-icon-button-overlay{
  display:inline-flex;
  align-items:center;
  color:inherit;
}
.ui-icon-button-overlay--compact-square{
  width:32px;
  min-width:32px;
  height:32px;
  min-height:32px;
  justify-content:center;
}
.ui-icon-button-icon-slot{
  display:block;
  width:var(--ui-icon-button-size, 14px);
  min-width:var(--ui-icon-button-size, 14px);
  height:var(--ui-icon-button-size, 14px);
  flex:0 0 auto;
}
.ui-icon-button-label{
  display:block;
  margin-left:6px;
  font-size:10px;
  line-height:14px;
  white-space:nowrap;
}
.ui-icon-button--icon-only .ui-icon-button-overlay{
  justify-content:center;
  padding:0;
}
.ui-icon-button--compact-square{
  width:32px;
  min-width:32px;
  height:32px;
  min-height:32px;
  padding:0;
}
.ui-icon-button--labeled .ui-icon-button-overlay{
  justify-content:flex-start;
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
`;
