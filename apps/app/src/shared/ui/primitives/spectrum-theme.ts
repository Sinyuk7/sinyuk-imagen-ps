/**
 * 根级 Spectrum theme 注册。
 *
 * SWC 0.37.0 的 theme 通过 side-effect 模块注册：
 *  - `sp-theme.js`        定义 `<sp-theme>` 元素
 *  - `theme-dark.js`      注册 `dark` color theme fragment
 *  - `theme-light.js`     注册 `light` color theme fragment
 *  - `scale-medium.js`    注册 `medium` scale fragment
 *
 * 不使用主入口 `index.js`：0.37.0 里它只 `export * from "./Theme.js"`，既不定义元素，
 * 也不注册 color / scale token。这与 SWC 1.x 的 API 不同，因此这里显式按 0.37.0 的
 * side-effect 入口加载。
 *
 * 同时加载 dark 和 light fragment，使 `<sp-theme color="dark|light">` 可在
 * 运行时切换，保证 SWC 控件与应用层主题一致。
 *
 * `<sp-theme color="dark" scale="medium">` 会把 Spectrum token 以 CSS 变量形式应用到
 * 自身 host，并下发给所有 SWC 子组件，作为它们的基础 token 来源。
 *
 * UXP 端 `@spectrum-web-components/theme` 没有对应 wrapper（不在 `@swc-uxp-wrappers/utils`
 * 的 aliases 表中），因此两端都以官方 SWC 包加载；其传递依赖 `@spectrum-web-components/shared`
 * 中的 `import("focus-visible")` 动态加载由 `vite.uxp.config.ts` 的 focus-visible compat
 * 插件兜底，避免重新出现 import.meta 启动问题。
 */
import '@spectrum-web-components/theme/sp-theme.js';
import '@spectrum-web-components/theme/theme-dark.js';
import '@spectrum-web-components/theme/theme-light.js';
import '@spectrum-web-components/theme/scale-medium.js';

let themeRegistered = false;

/**
 * 确保根级 Spectrum theme 只注册一次。导入本模块本身已触发 side-effect 注册；
 * 本函数提供一个显式、幂等的调用点供 AppShell 启动时使用。
 */
export function registerSpectrumTheme(): void {
  if (themeRegistered || typeof customElements === 'undefined') {
    return;
  }
  themeRegistered = true;
}
