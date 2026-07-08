/**
 * Panel CSS 单一注入入口。源码按职责拆分到 `styles/` 下多个模块，此处
 * 聚合后由 `ensurePanelCss()` 同步注入为单个 `<style id="imagen-ps-panel-styles">`。
 *
 * 拆分边界：
 *  - theme-source/    6 个网站导出的 Material Design 3 源主题 CSS
 *  - generated/       由 theme-source 自动生成的 md-sys + 应用语义 token
 *  - native-controls.ts  Layer C native controls
 *  - base.ts          reset
 *  - shell.ts         panel / page / header / scroll 布局
 *  - conversation.ts  会话气泡 / provider card / loading / error / empty
 *  - composer.ts      底部输入区 / chip / select 菜单 / 附件 / 图层
 *  - overlays.ts      toast / back-to-bottom
 *  - pages.ts         history / settings 共享 / provider row / status notice
 *  - responsive.ts    Panel 级 media query
 *
 * 保持 UXP 与 Chrome 共享同一套样式语义；不复制两套 CSS。
 */
import { GENERATED_THEME_CSS } from './styles/generated/theme-css';
import { NATIVE_CONTROLS_CSS } from './styles/native-controls';
import { BASE_CSS } from './styles/base';
import { SHELL_CSS } from './styles/shell';
import { IMAGE_FALLBACK_CSS } from './styles/image-fallback';
import { CONVERSATION_CSS } from './styles/conversation';
import { COMPOSER_CSS } from './styles/composer';
import { OVERLAYS_CSS } from './styles/overlays';
import { PAGES_CSS } from './styles/pages';
import { RESPONSIVE_CSS } from './styles/responsive';

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

export const PANEL_CSS = stripCssComments([
  GENERATED_THEME_CSS,
  NATIVE_CONTROLS_CSS,
  BASE_CSS,
  SHELL_CSS,
  IMAGE_FALLBACK_CSS,
  CONVERSATION_CSS,
  COMPOSER_CSS,
  OVERLAYS_CSS,
  PAGES_CSS,
  RESPONSIVE_CSS,
].join('\n'));
