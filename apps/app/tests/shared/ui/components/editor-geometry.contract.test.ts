import { describe, expect, it } from 'vitest';
import { COMPOSER_CSS } from '../../../../src/shared/ui/styles/composer';
import { PAGES_CSS } from '../../../../src/shared/ui/styles/pages';

describe('editor geometry CSS contract', () => {
  it('lets composer textarea own full shell height without a fixed cap', () => {
    expect(COMPOSER_CSS).toContain(
      '.cmp-ta{\n  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;\n  display:block;\n  flex:1 1 auto;\n  min-height:0;\n  max-height:none;\n  width:100%;\n  height:100%;\n}',
    );
    expect(COMPOSER_CSS).toContain(
      '.cmp-ta-shell{\n  display:flex;\n  flex-direction:column;\n  flex:1 1 auto;\n  width:100%;\n  min-height:82px;\n  min-width:0;\n  align-items:stretch;\n}',
    );
    expect(COMPOSER_CSS).not.toContain('max-height:96px');
  });

  it('disables nested Spectrum textfield skin through supported modifier variables', () => {
    expect(PAGES_CSS).toContain('--mod-textfield-background-color:transparent;');
    expect(PAGES_CSS).toContain('--mod-textfield-border-width:0px;');
    expect(PAGES_CSS).toContain('--mod-textfield-border-color:transparent;');
    expect(PAGES_CSS).toContain('--mod-textfield-corner-radius:0px;');
    expect(PAGES_CSS).toContain('--mod-textfield-focus-indicator-width:0px;');
    expect(PAGES_CSS).toContain('--mod-textfield-focus-indicator-color:transparent;');
    expect(PAGES_CSS).toContain('--mod-textfield-border-color-focus:transparent;');
    expect(PAGES_CSS).toContain('--mod-textfield-border-color-keyboard-focus:transparent;');
    expect(PAGES_CSS).toContain('--mod-textfield-background-color-disabled:transparent;');
    expect(PAGES_CSS).toContain('--mod-textfield-border-color-disabled:transparent;');
  });
});
