import { describe, expect, it } from 'vitest';
import { APP_LOCALE_OVERRIDE, normalizeLocale, resolveAppLocale } from '../../src/shared/locale';

describe('locale contract', () => {
  it('maps UXP and browser locale forms to supported app locales', () => {
    expect(normalizeLocale('en_US')).toBe('en');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('zh_CN')).toBe('zh-CN');
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeLocale('fr_FR')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });

  it('lets app override host locale for local language preview', () => {
    expect(resolveAppLocale('en-US', 'zh-CN')).toBe('zh-CN');
    expect(resolveAppLocale('zh-CN', 'en')).toBe('en');
    expect(resolveAppLocale('fr-FR')).toBe(APP_LOCALE_OVERRIDE ?? 'en');
  });
});
