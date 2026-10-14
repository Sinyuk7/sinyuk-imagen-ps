import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import { modelInfoFromProfileItem, type UiModelInfo } from '../model-info';

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

export interface ProviderProfilesState {
  readonly profiles: readonly ProviderProfile[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

/** 读取 ready Provider Profile 列表。 */
export function useProviderProfiles(services: AppServices): ProviderProfilesState {
  const [profiles, setProfiles] = useState<readonly ProviderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await services.commands.listProviderProfiles();
    if (result.ok) {
      setProfiles(result.value);
      setError(null);
    } else {
      setError(commandMessage(result.error));
    }
    setLoading(false);
  }, [services.commands]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profiles, loading, error, reload };
}

export interface ProfileModelsState {
  readonly models: readonly UiModelInfo[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly resolved: boolean;
  readonly reload: () => Promise<void>;
}

/** 从 Application 投影 Profile 的只读静态模型列表。 */
export function useProfileModels(
  services: AppServices,
  profileId: string | null,
  revisionKey?: string,
): ProfileModelsState {
  const [models, setModels] = useState<readonly UiModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const sequenceRef = useRef(0);

  useEffect(() => {
    setResolved(false);
  }, [profileId]);

  const reload = useCallback(async () => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    if (!profileId) {
      setModels([]);
      setError(null);
      setLoading(false);
      setResolved(true);
      return;
    }
    setLoading(true);
    try {
      const result = await services.commands.listProfileModels(profileId);
      if (sequenceRef.current !== sequence) return;
      if (result.ok) {
        setModels(result.value.map(modelInfoFromProfileItem));
        setError(null);
      } else {
        setModels([]);
        setError(commandMessage(result.error));
      }
    } catch (caught) {
      if (sequenceRef.current !== sequence) return;
      setModels([]);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (sequenceRef.current === sequence) {
        setLoading(false);
        setResolved(true);
      }
    }
  }, [profileId, revisionKey, services.commands]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { models, loading, error, resolved, reload };
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
