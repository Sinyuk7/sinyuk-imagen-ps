import { AppServicesProvider } from '../src/app-services/app-services-context';
import type { AppServices } from '../src/app-services/app-services';
import type { SupportedLocale } from '../src/shared/locale';
import { I18nProvider } from '../src/shared/ui/i18n/i18n-context';
import type { ReactNode } from 'react';

export function TestI18nProvider({
  children,
  locale = 'zh-CN',
}: {
  readonly children: ReactNode;
  readonly locale?: SupportedLocale;
}) {
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

export function TestAppProviders({
  children,
  services,
  locale = 'zh-CN',
}: {
  readonly children: ReactNode;
  readonly services: AppServices;
  readonly locale?: SupportedLocale;
}) {
  return (
    <TestI18nProvider locale={locale}>
      <AppServicesProvider services={services}>{children}</AppServicesProvider>
    </TestI18nProvider>
  );
}
