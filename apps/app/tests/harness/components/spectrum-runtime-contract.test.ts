import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = process.cwd();

function source(...segments: readonly string[]): string {
  return readFileSync(join(APP_ROOT, ...segments), 'utf8');
}

describe('Spectrum runtime contract', () => {
  it('keeps the required Spectrum feature flag and component registry', () => {
    const manifest = JSON.parse(source('public', 'manifest.json')) as { readonly featureFlags?: Record<string, unknown> };
    const registry = source('src', 'shared', 'ui', 'primitives', 'spectrum-registry.ts');

    expect(manifest.featureFlags?.enableSWCSupport).toBe(true);
    expect(registry).toContain("import '@spectrum-web-components/theme/sp-theme.js';");
    expect(registry).toContain("customElements.define('sp-button', Button);");
    expect(registry).toContain("customElements.define('sp-action-button', ActionButton);");
    expect(registry).toContain("customElements.define('sp-textfield', Textfield);");
  });

  it('keeps the UXP classic-script compatibility path around the locked wrappers', () => {
    const config = source('vite.uxp.config.ts');

    expect(config).toContain("@swc-uxp-wrappers/utils");
    expect(config).toContain('uxpSwcFocusVisibleCompatPlugin()');
    expect(config).toContain('uxpImportMetaCompatPlugin()');
    expect(config).toContain('inlineDynamicImports: true');
    expect(config).toContain('modulePreload: false');
  });

  it('keeps the real Spectrum controls in the first-frame geometry harness', () => {
    const harness = source('src', 'harness', 'components', 'uxp-css-contract', 'uxp-css-contract-harness.tsx');

    expect(harness).toContain('function SpectrumRuntimeSpecimen()');
    expect(harness).toContain('<sp-theme color="dark" scale="medium"');
    expect(harness).toContain('data-testid="uxp-css-spectrum-action-button"');
    expect(harness).toContain('data-testid="uxp-css-spectrum-button"');
    expect(harness).toContain('data-testid="uxp-css-spectrum-textfield"');
    expect(harness).toContain('data-testid="uxp-css-spectrum-first-frame"');
    expect(harness).toContain('data-testid="uxp-css-spectrum-after-50ms"');
    expect(harness).toContain('setAfterDelay(spectrumRuntimeSnapshot(rootRef.current)), 50');
  });

  it('keeps host semantic tokens and interactive control states out of page CSS', () => {
    const generator = source('scripts', 'generate-theme-css.mjs');
    const generatedTheme = source('src', 'shared', 'ui', 'styles', 'generated', 'theme-css.ts');
    const iconButton = source('src', 'shared', 'ui', 'primitives', 'icon-button.tsx');
    const textArea = source('src', 'shared', 'ui', 'components', 'uxp-form-controls.tsx');
    const mainPage = source('src', 'shared', 'ui', 'pages', 'main-page.tsx');
    const composer = source('src', 'shared', 'ui', 'styles', 'composer.ts');
    const pageStyles = source('src', 'shared', 'ui', 'styles', 'pages.ts');
    const patterns = source('src', 'shared', 'ui', 'styles', 'patterns.ts');

    expect(generator).not.toContain('theme-source');
    expect(generatedTheme).not.toMatch(/--md-(?:sys|extended)-/u);
    expect(iconButton).toContain('quiet = true');
    expect(mainPage).toContain('variant="accent"');
    expect(textArea).toContain('<sp-textarea');
    expect(textArea).toContain('data-uxp-textarea-spectrum="true"');
    expect(textArea).not.toContain('<textarea');
    expect(composer).not.toMatch(/\.cmp-(?:add|send|capture|opt-icon-button|mask-toggle)[^{]*:(?:hover|active|focus-visible|disabled)/u);
    expect(pageStyles).not.toMatch(/\.settings-icon-button[^{]*:(?:hover|active|focus-visible)/u);
    expect(patterns).not.toMatch(/\.ui-page-header-back[^{]*:(?:hover|active|focus-visible)/u);
  });
});
