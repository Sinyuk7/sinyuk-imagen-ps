import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { SupportedLocale } from '../../domain/locale';
import { APP_MESSAGES, type AppMessages } from './messages';

export interface I18nState {
  readonly locale: SupportedLocale;
  readonly messages: AppMessages;
}

const I18nContext = createContext<I18nState>({
  locale: 'en',
  messages: APP_MESSAGES.en,
});

export function I18nProvider({ locale, children }: { readonly locale: SupportedLocale; readonly children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, messages: APP_MESSAGES[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nState {
  return useContext(I18nContext);
}
