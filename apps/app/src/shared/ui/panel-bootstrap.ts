import { PANEL_CSS } from './panel-css';
import { registerSpectrumControls } from './primitives/spectrum-controls';
import { registerSpectrumTheme } from './primitives/spectrum-theme';

const PANEL_STYLE_ID = 'imagen-ps-panel-styles';

/**
 * 在首帧前同步注入 panel 样式，避免 UXP 首次挂载先看到未增强的默认外观。
 */
export function ensurePanelCss(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (!doc || doc.getElementById(PANEL_STYLE_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = PANEL_STYLE_ID;
  style.textContent = PANEL_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}

/**
 * 把 shared UI 依赖的 SWC 注册和样式注入前移到 shell bootstrap。
 */
export function primeSharedUi(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  registerSpectrumTheme();
  registerSpectrumControls();
  ensurePanelCss(doc);
}
