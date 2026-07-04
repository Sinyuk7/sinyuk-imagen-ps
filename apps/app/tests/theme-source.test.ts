import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PANEL_CSS } from '../src/shared/ui/panel-css';

const appRoot = path.resolve(__dirname, '..');

describe('theme source CSS', () => {
  it('keeps the generated theme wired into panel CSS', () => {
    expect(PANEL_CSS).toContain('--md-extended-color-blue-color:#99CBFF');
    expect(PANEL_CSS).toContain('--md-extended-color-orange-color:#FFB689');
    expect(PANEL_CSS).toContain('.panel[data-app-theme="light"]');
    expect(PANEL_CSS).toContain('--app-color-notice:var(--md-extended-color-yellow-color)');
    expect(PANEL_CSS).toContain('--app-color-positive:var(--md-extended-color-green-color)');
    expect(PANEL_CSS).toContain('--app-notice-info-background:var(--app-color-informative-subtle)');
    expect(PANEL_CSS).toContain('--app-notice-negative-icon:var(--app-color-negative)');
    expect(PANEL_CSS).toContain('--toast-bg-positive:#303C33');
    expect(PANEL_CSS).toContain('--toast-bg-positive:#E4ECE2');
    expect(PANEL_CSS).toContain('--toast-icon-info:#ACC7FF');
    expect(PANEL_CSS).toContain('--toast-icon-info:#426EA8');
  });

  it('renders every toast tone as a muted solid semantic surface', () => {
    expect(PANEL_CSS).toContain('padding-top:0; padding-right:0; padding-bottom:0; padding-left:var(--toast-padding-x); border:none; border-radius:var(--toast-radius);');
    expect(PANEL_CSS).toContain('.ui-toast[data-variant="positive"]{ --toast-bg-current:var(--toast-bg-positive); --toast-icon-current:var(--toast-icon-positive); }');
    expect(PANEL_CSS).toContain('.ui-toast[data-variant="negative"]{ --toast-bg-current:var(--toast-bg-negative); --toast-icon-current:var(--toast-icon-negative); }');
    expect(PANEL_CSS).toContain('.ui-toast[data-variant="warning"]{ --toast-bg-current:var(--toast-bg-warning); --toast-icon-current:var(--toast-icon-warning); }');
    expect(PANEL_CSS).toContain('.ui-toast[data-variant="info"]{ --toast-bg-current:var(--toast-bg-info); --toast-icon-current:var(--toast-icon-info); }');
    expect(PANEL_CSS).toContain('.ui-toast[data-variant="neutral"]{ --toast-bg-current:var(--toast-bg-neutral); --toast-icon-current:var(--toast-icon-neutral); }');
    expect(PANEL_CSS).toContain('.ui-toast-content{');
    expect(PANEL_CSS).toContain('.ui-toast-message-wrap{');
    expect(PANEL_CSS).toContain('.ui-toast-icon{');
    expect(PANEL_CSS).toContain('.ui-toast[data-text-size="sm"] .ui-toast-message{');
    expect(PANEL_CSS).toContain('.ui-toast[data-text-size="xs"] .ui-toast-message{');
    expect(PANEL_CSS).toContain('border-left:1px solid color-mix(in srgb, var(--toast-fg-secondary) 24%, transparent);');
    expect(PANEL_CSS).toContain('color:var(--toast-icon-current);');
    expect(PANEL_CSS).toContain('font-weight:600;');
    expect(PANEL_CSS).toContain('.status-notice{');
    expect(PANEL_CSS).toContain('--status-notice-background:var(--app-notice-neutral-background);');
    expect(PANEL_CSS).not.toContain('.status-notice.info{ border-color:color-mix');
    expect(PANEL_CSS).not.toContain('.status-notice.warning{ border-color:color-mix');
    expect(PANEL_CSS).not.toContain('.status-notice.error{ border-color:color-mix');
  });

  it('uses the generated theme module instead of legacy hand-written theme modules', () => {
    const panelCss = fs.readFileSync(path.join(appRoot, 'src/shared/ui/panel-css.ts'), 'utf8');
    expect(panelCss).toContain('./styles/generated/theme-css');
    expect(panelCss).not.toContain('./styles/tokens');
    expect(panelCss).not.toContain('./styles/extra-themes');
  });
});
