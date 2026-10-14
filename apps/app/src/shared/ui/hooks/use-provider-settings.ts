import { useCallback, useEffect, useState } from 'react';
import type { AppServices } from '../../ports/app-services';

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

export interface ProviderAccountsState {
  readonly accounts: readonly import('@imagen-ps/application').ProviderAccount[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

/** 读取固定 provider 的单账号状态。 */
export function useProviderAccounts(services: AppServices): ProviderAccountsState {
  const [accounts, setAccounts] = useState<readonly import('@imagen-ps/application').ProviderAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    const result = await services.commands.listProviderAccounts();
    if (result.ok) { setAccounts(result.value); setError(null); }
    else setError(commandMessage(result.error));
    setLoading(false);
  }, [services.commands]);
  useEffect(() => { void reload(); }, [reload]);
  return { accounts, loading, error, reload };
}
