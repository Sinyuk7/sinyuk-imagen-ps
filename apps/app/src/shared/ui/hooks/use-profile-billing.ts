import { useCallback, useEffect, useState } from 'react';
import type { ProfileBillingState } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

export interface ProfileBillingViewState {
  readonly billing: ProfileBillingState | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly observeAsyncRefresh: () => Promise<ProfileBillingState | null>;
}

function billingStateKey(state: ProfileBillingState | null | undefined): string {
  return JSON.stringify(state ?? null);
}

export function useProfileBilling(
  services: AppServices,
  profileId: string | null,
): ProfileBillingViewState {
  const [billing, setBilling] = useState<ProfileBillingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId) {
      setBilling(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await services.commands.refreshProfileBalance({ profileId });
    if (result.ok) {
      setBilling(result.value.state);
      setError(null);
    } else {
      setError(commandMessage(result.error));
      const state = await services.commands.getProfileBillingState(profileId);
      if (state.ok) {
        setBilling(state.value);
      }
    }
    setLoading(false);
  }, [profileId, services]);

  const observeAsyncRefresh = useCallback(async (): Promise<ProfileBillingState | null> => {
    if (!profileId) {
      return null;
    }
    const initial = await services.commands.getProfileBillingState(profileId);
    const initialState = initial.ok ? initial.value : null;
    const initialKey = billingStateKey(initialState);
    let sawRefreshing = initialState?.refreshState === 'refreshing';
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      const result = await services.commands.getProfileBillingState(profileId);
      if (!result.ok) {
        setError(commandMessage(result.error));
        continue;
      }
      setBilling(result.value);
      setError(null);
      if (result.value.refreshState === 'refreshing') {
        sawRefreshing = true;
        continue;
      }
      if (sawRefreshing || billingStateKey(result.value) !== initialKey) {
        return result.value;
      }
    }
    return initialState;
  }, [profileId, services]);

  useEffect(() => {
    if (!profileId) {
      setBilling(null);
      setError(null);
      setLoading(false);
      return;
    }
    let disposed = false;
    setLoading(true);
    void services.commands.getProfileBillingState(profileId).then((result) => {
      if (disposed) {
        return;
      }
      if (result.ok) {
        setBilling(result.value);
        setError(null);
        if (
          result.value.balance === undefined &&
          result.value.refreshState === 'idle'
        ) {
          void refresh();
        }
      } else {
        setBilling(null);
        setError(commandMessage(result.error));
      }
      setLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, [profileId, refresh, services]);

  return { billing, loading, error, refresh, observeAsyncRefresh };
}
