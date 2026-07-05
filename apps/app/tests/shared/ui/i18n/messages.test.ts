import { describe, expect, it } from 'vitest';
import { APP_MESSAGES } from '../../../../src/shared/ui/i18n/messages';

function keys(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.keys(value as Record<string, unknown>).flatMap((key) =>
    keys((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key),
  );
}

describe('app i18n messages', () => {
  it('keeps English and Chinese catalogs structurally aligned', () => {
    expect(keys(APP_MESSAGES.en).sort()).toEqual(keys(APP_MESSAGES['zh-CN']).sort());
  });
});
