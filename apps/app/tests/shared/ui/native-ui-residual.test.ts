import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = process.cwd();
const UI_ROOT = join(APP_ROOT, 'src', 'shared', 'ui');

function walkUiFiles(root: string): readonly string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return walkUiFiles(path);
    }
    return path.endsWith('.tsx') || path.endsWith('.ts') ? [path] : [];
  });
}

const UI_FILES = walkUiFiles(UI_ROOT);
const UI_SOURCE = UI_FILES.map((path) => ({
  path,
  source: readFileSync(path, 'utf8'),
}));
describe('Native-first UI residual guard', () => {
  it('does not re-introduce the legacy CSS Tip tooltip component', () => {
    for (const { path, source } of UI_SOURCE) {
      expect(source, `${path} still imports/uses Tip`).not.toMatch(/from ['"][^'"]*\/tip['"]|<Tip\b/u);
    }
  });

  it('does not re-introduce the legacy CSS tooltip markup', () => {
    for (const { path, source } of UI_SOURCE) {
      expect(source, `${path} still uses tt-wrap`).not.toMatch(/\btt-wrap\b/u);
    }
  });

  it('does not import web component packages in shared UI', () => {
    for (const { path, source } of UI_SOURCE) {
      expect(source, `${path} still imports spectrum web component packages`).not.toMatch(/@spectrum-web-components\//u);
      expect(source, `${path} still imports uxp web component wrappers`).not.toMatch(/@swc-uxp-wrappers\//u);
    }
  });

  it('does not render Spectrum tags in shared UI', () => {
    const forbiddenTags = [
      'sp-dropdown',
      'sp-menu',
      'sp-menu-item',
      'sp-action-button',
      'sp-button',
      'sp-textfield',
      'sp-tooltip',
      'sp-toast',
      'sp-field-label',
      'sp-help-text',
      'sp-divider',
    ];
    for (const { path, source } of UI_SOURCE) {
      for (const tag of forbiddenTags) {
        expect(source, `${path} still renders <${tag}>`).not.toContain(`<${tag}`);
      }
      expect(source, `${path} still references workflow icon custom elements`).not.toMatch(/\bsp-icon-[a-z0-9-]+\b/u);
    }
  });
});
