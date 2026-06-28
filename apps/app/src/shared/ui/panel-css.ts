/**
 * Panel CSS 单一注入入口。源码按职责拆分到 `styles/` 下多个模块，此处
 * 聚合后由 `usePanelCss()` 注入为单个 `<style id="imagen-ps-panel-styles">`。
 *
 * 拆分边界：
 *  - tokens.ts        Layer A 宿主默认 + Layer B 应用语义 token + Layer C Spectrum bridge + theme probe
 *  - base.ts          reset
 *  - shell.ts         panel / page / header / scroll 布局
 *  - conversation.ts  会话气泡 / provider card / loading / error / empty
 *  - composer.ts      底部输入区 / chip / select 菜单 / 附件 / 图层
 *  - overlays.ts      lightbox / toast / back-to-bottom
 *  - pages.ts         history / settings 共享 / provider row / status notice
 *  - responsive.ts    Panel 级 media query
 *
 * 保持 UXP 与 Chrome 共享同一套样式语义；不复制两套 CSS。
 */
import { TOKENS_CSS, LIGHT_THEME_CSS, THEME_PROBE_CSS, SPECTRUM_BRIDGE_CSS } from './styles/tokens';
import { EXTRA_THEMES_CSS } from './styles/extra-themes';
import { BASE_CSS } from './styles/base';
import { SHELL_CSS } from './styles/shell';
import { CONVERSATION_CSS } from './styles/conversation';
import { COMPOSER_CSS } from './styles/composer';
import { OVERLAYS_CSS } from './styles/overlays';
import { PAGES_CSS } from './styles/pages';
import { RESPONSIVE_CSS } from './styles/responsive';

export const PANEL_CSS = [
  TOKENS_CSS,
  LIGHT_THEME_CSS,
  EXTRA_THEMES_CSS,
  THEME_PROBE_CSS,
  SPECTRUM_BRIDGE_CSS,
  BASE_CSS,
  SHELL_CSS,
  CONVERSATION_CSS,
  COMPOSER_CSS,
  OVERLAYS_CSS,
  PAGES_CSS,
  RESPONSIVE_CSS,
].join('\n');
