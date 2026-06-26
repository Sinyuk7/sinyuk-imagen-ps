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

/**
 * 残留检查：防止已迁移到 SWC 的通用组件以旧形式重新进入 shared UI。
 * 这些断言保护一次性收敛成果，而不是业务布局里保留的原生按钮（send / att-rm /
 * err-retry / empty-hint / layer-back / img-act / lightbox 等）。
 */
describe('SWC migration residual guard', () => {
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

  it('does not render the migrated generic button classes on native <button> elements', () => {
    // 这些 class 现在只应出现在 sp-action-button / sp-button 上（用于 sizing），
    // 不应再回到原生 <button>。
    const migratedClasses = [
      'hdr-btn',
      'act-ico',
      'cmp-add',
      'copy-btn',
      'pw-toggle',
      'btn-save',
      'btn-del',
      'btn-cancel',
      'test-btn',
      'fchip',
    ];
    for (const { path, source } of UI_SOURCE) {
      const nativeButtonTags = source.match(/<button[^>]*>/gu) ?? [];
      for (const tag of nativeButtonTags) {
        for (const cls of migratedClasses) {
          expect(tag, `${path}: native <button> must not carry migrated class "${cls}"`).not.toContain(cls);
        }
      }
    }
  });

  it('does not render the old plain <div className="toast"> host', () => {
    for (const { path, source } of UI_SOURCE) {
      // sp-toast 宿主用 data-testid="toast"；旧的 <div className="toast"> 不应再出现。
      expect(source, `${path} still uses legacy div toast`).not.toMatch(/<div[^>]*class(?:Name)?=["{`][^">]*\btoast\b/u);
    }
  });

  it('uses the unified SWC primitives across the shared UI', () => {
    const allSource = UI_SOURCE.map((entry) => entry.source).join('\n');
    const requiredTags = [
      'sp-action-button',
      'sp-button',
      'sp-tooltip',
      'sp-toast',
      'sp-field-label',
      'sp-help-text',
      'sp-tag',
      'sp-divider',
    ];
    for (const tag of requiredTags) {
      expect(allSource, `${tag} should be used in shared UI`).toContain(tag);
    }
  });
});
