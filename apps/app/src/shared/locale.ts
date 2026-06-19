export type SupportedLocale = 'en' | 'zh-CN';

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function normalizeLocale(value: string | undefined): SupportedLocale {
  const normalized = value?.replace('_', '-').toLowerCase();
  if (!normalized) {
    return DEFAULT_LOCALE;
  }
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }
  if (normalized.startsWith('en')) {
    return 'en';
  }
  return DEFAULT_LOCALE;
}
