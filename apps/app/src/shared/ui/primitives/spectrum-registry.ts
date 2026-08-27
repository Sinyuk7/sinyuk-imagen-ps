import { ActionButton } from '@spectrum-web-components/action-button';
import { Button } from '@spectrum-web-components/button';
import { Textfield } from '@spectrum-web-components/textfield';
import '@spectrum-web-components/theme/sp-theme.js';
import '@spectrum-web-components/theme/theme-dark.js';
import '@spectrum-web-components/theme/theme-light.js';
import '@spectrum-web-components/theme/scale-medium.js';

/** 注册当前 UXP 锁定版本可用的最小 Spectrum 控件集合。 */
export function registerSpectrumControls(): void {
  if (typeof customElements === 'undefined') {
    return;
  }
  if (!customElements.get('sp-button')) {
    customElements.define('sp-button', Button);
  }
  if (!customElements.get('sp-action-button')) {
    customElements.define('sp-action-button', ActionButton);
  }
  if (!customElements.get('sp-textfield')) {
    customElements.define('sp-textfield', Textfield);
  }
}

/** theme 使用 side-effect 入口注册，此调用点保留 bootstrap 语义。 */
export function registerSpectrumTheme(): void {
  registerSpectrumControls();
}
