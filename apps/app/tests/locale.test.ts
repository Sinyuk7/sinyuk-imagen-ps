import { describe, expect, it } from 'vitest';
import { normalizeLocale } from '../src/shared/locale';

describe('normalizeLocale', () => {
  it('maps UXP and browser locale forms to supported app locales', () => {
    expect(normalizeLocale('en_US')).toBe('en');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('zh_CN')).toBe('zh-CN');
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeLocale('fr_FR')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });
});
