import { createContext, useContext } from 'react';
import type { AppServices } from './app-services';

const AppServicesContext = createContext<AppServices | null>(null);

export interface AppServicesProviderProps {
  readonly services: AppServices;
  readonly children: React.ReactNode;
}

export function AppServicesProvider({ services, children }: AppServicesProviderProps) {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (!services) {
    throw new Error('AppServicesProvider is missing.');
  }
  return services;
}

/** 读取可选 App services；独立组件 harness 未装配 Provider 时返回 null。 */
export function useOptionalAppServices(): AppServices | null {
  return useContext(AppServicesContext);
}
