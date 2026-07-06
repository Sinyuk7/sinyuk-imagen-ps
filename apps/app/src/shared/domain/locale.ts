export type SupportedLocale = 'en' | 'zh-CN';

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/** 应用级语言预览开关。需要强制看某个语言效果时，临时改这里。 */
export const APP_LOCALE_OVERRIDE: SupportedLocale | undefined = 'zh-CN';

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

export function resolveAppLocale(
  value: string | undefined,
  override: SupportedLocale | undefined = APP_LOCALE_OVERRIDE,
): SupportedLocale {
  return override ?? normalizeLocale(value);
}
