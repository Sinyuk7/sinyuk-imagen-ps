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
}

export function useProfileBilling(
  services: AppServices,
  profileId: string | null,
  enabled = true,
): ProfileBillingViewState {
  const [billing, setBilling] = useState<ProfileBillingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId || !enabled) {
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
  }, [enabled, profileId, services]);

  useEffect(() => {
    if (!profileId || !enabled) {
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
  }, [enabled, profileId, refresh, services]);

  return { billing, loading, error, refresh };
}
