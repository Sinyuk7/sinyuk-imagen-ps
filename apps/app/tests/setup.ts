globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Unit tests exercise page/state logic, not Lit shadow-DOM rendering (covered by
 * Chrome E2E). happy-dom fires `attributeChangedCallback` during `cloneNode`
 * before a custom element is upgraded, which trips Lit's
 * `this._$attributeToProperty is not a function` for elements whose templates
 * stamp *nested* Lit custom elements:
 *   - `sp-tooltip` (self-managed) stamps `<sp-overlay>` / `<sp-tooltip-openable>`
 *   - `sp-toast` stamps `<sp-close-button>` and alert/info/checkmark icons
 *
 * `sp-tooltip` and `sp-toast` are registered only via `registerSpectrumControls`
 * (their package indexes export the class, they do not auto-define the element),
 * so pre-registering plain HTMLElement stubs here wins in the test environment
 * and `registerSpectrumControls` skips them. The nested elements
 * (`sp-overlay`, `sp-close-button`, `sp-tooltip-openable`) are auto-registered by
 * their packages, so they are NOT stubbed (would throw on duplicate definition).
 */
const SWC_LIT_TEMPLATE_STUBS = ['sp-tooltip', 'sp-toast'];

for (const tag of SWC_LIT_TEMPLATE_STUBS) {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, class extends HTMLElement {});
  }
}
