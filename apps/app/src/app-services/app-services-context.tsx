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
