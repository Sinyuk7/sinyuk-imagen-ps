import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileBillingState } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import { observeProfileBillingRefresh } from './task-billing-feedback';

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

export interface ProfileBillingViewState {
  readonly billing: ProfileBillingState | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly observeAsyncRefresh: (input?: { readonly signal?: AbortSignal }) => Promise<ProfileBillingState | null>;
  readonly applyObservedState: (state: ProfileBillingState) => void;
}

export function useProfileBilling(
  services: AppServices,
  profileId: string | null,
  enabled = true,
): ProfileBillingViewState {
  const [billing, setBilling] = useState<ProfileBillingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const billingRef = useRef<ProfileBillingState | null>(null);

  const applyBilling = useCallback((next: ProfileBillingState | null) => {
    billingRef.current = next;
    setBilling(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!profileId || !enabled) {
      applyBilling(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await services.commands.refreshProfileBalance({ profileId });
    if (result.ok) {
      applyBilling(result.value.state);
      setError(null);
    } else {
      setError(commandMessage(result.error));
      const state = await services.commands.getProfileBillingState(profileId);
      if (state.ok) {
        applyBilling(state.value);
      }
    }
    setLoading(false);
  }, [applyBilling, enabled, profileId, services]);

  const observeAsyncRefresh = useCallback(async (
    input?: { readonly signal?: AbortSignal },
  ): Promise<ProfileBillingState | null> => {
    if (!profileId || !enabled) {
      return null;
    }
    const observation = await observeProfileBillingRefresh({
      commands: services.commands,
      profileId,
      baseline: billingRef.current,
      balanceSupported: enabled,
      signal: input?.signal,
    });
    if (!observation?.state) {
      return null;
    }
    applyBilling(observation.state);
    setError(null);
    return observation.state;
  }, [applyBilling, enabled, profileId, services.commands]);

  const applyObservedState = useCallback((state: ProfileBillingState) => {
    applyBilling(state);
    setError(null);
  }, [applyBilling]);

  useEffect(() => {
    if (!profileId || !enabled) {
      applyBilling(null);
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
        applyBilling(result.value);
        setError(null);
        if (
          result.value.balance === undefined &&
          result.value.refreshState === 'idle'
        ) {
          void refresh();
        }
      } else {
        applyBilling(null);
        setError(commandMessage(result.error));
      }
      setLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, [applyBilling, enabled, profileId, refresh, services]);

  return { billing, loading, error, refresh, observeAsyncRefresh, applyObservedState };
}
