import { AppServicesProvider } from '../../src/app-services/app-services-context';
import type { AppServices } from '../../src/app-services/app-services';
import type { SupportedLocale } from '../../src/shared/locale';
import { I18nProvider } from '../../src/shared/ui/i18n/i18n-context';
import { ToastHost, ToastProvider } from '../../src/shared/ui/components/toast-host';
import { PopupLayerProvider, PopupLayerRoot } from '../../src/shared/ui/components/popup-layer';
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
      <ToastProvider>
        <PopupLayerProvider>
          <AppServicesProvider services={services}>
            {children}
            <ToastHost />
            <PopupLayerRoot />
          </AppServicesProvider>
        </PopupLayerProvider>
      </ToastProvider>
    </TestI18nProvider>
  );
}

export function TestToastSurface({
  children,
  locale = 'zh-CN',
}: {
  readonly children: ReactNode;
  readonly locale?: SupportedLocale;
}) {
  return (
    <TestI18nProvider locale={locale}>
      <ToastProvider>
        <div className="panel">
          {children}
          <ToastHost />
        </div>
      </ToastProvider>
    </TestI18nProvider>
  );
}
