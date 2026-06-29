import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ProviderDescriptor,
  ProviderModelInfo,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileConfigValue,
  ProviderProfileInput,
  ProviderProfileTestResult,
} from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';

export interface ProviderProfilesState {
  readonly profiles: readonly ProviderProfile[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
}

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

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
  }, [services]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profiles, loading, error, reload };
}

export function useProviderCatalog(services: AppServices): readonly ProviderDescriptor[] {
  return useMemo(
    () => services.commands.listProviders().filter((provider) => provider.id !== 'prompt-optimize'),
    [services],
  );
}

export interface ProfileModelsState {
  readonly models: readonly ProviderModelInfo[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly refresh: () => Promise<readonly ProviderModelInfo[]>;
}

export function useProfileModels(services: AppServices, profileId: string | null): ProfileModelsState {
  const [models, setModels] = useState<readonly ProviderModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!profileId) {
      setModels([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await services.commands.listProfileModels(profileId);
    if (result.ok) {
      setModels(result.value);
      setError(null);
    } else {
      setModels([]);
      setError(commandMessage(result.error));
    }
    setLoading(false);
  }, [profileId, services]);

  const refresh = useCallback(async (): Promise<readonly ProviderModelInfo[]> => {
    if (!profileId) {
      return [];
    }
    setLoading(true);
    try {
      const result = await services.commands.refreshProfileModels(profileId);
      if (result.ok) {
        setModels(result.value);
        setError(null);
        return result.value;
      }
      const message = commandMessage(result.error);
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [profileId, services]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { models, loading, error, reload, refresh };
}

export interface ProfileDetailState {
  readonly profile: ProviderProfile | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly save: (input: ProviderProfileInput) => Promise<ProviderProfile>;
  readonly remove: () => Promise<void>;
  readonly test: (connect?: boolean) => Promise<ProviderProfileTestResult>;
}

export function useProfileDetail(services: AppServices, profileId: string | null): ProfileDetailState {
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!profileId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    const result = await services.commands.getProviderProfile(profileId);
    if (result.ok) {
      setProfile(result.value);
      setError(null);
    } else {
      setError(commandMessage(result.error));
    }
    setLoading(false);
  }, [profileId, services]);

  const save = useCallback(
    async (input: ProviderProfileInput): Promise<ProviderProfile> => {
      await services.diagnostics?.checkpoint('uxp.ui.profile_detail.save.before_command', {
        profileId: input.profileId,
        providerId: input.providerId ?? null,
        enabled: input.enabled ?? null,
        hasSecretValues: Object.keys(input.secretValues ?? {}).length > 0,
        configKeyCount: Object.keys(input.config ?? {}).length,
      }, {
        profile_id: input.profileId,
        ...(input.providerId ? { provider_id: input.providerId } : {}),
      });
      const result = await services.commands.saveProviderProfile(input);
      await services.diagnostics?.checkpoint('uxp.ui.profile_detail.save.after_command', {
        profileId: input.profileId,
        ok: result.ok,
      }, {
        profile_id: input.profileId,
        ...(result.ok ? { provider_id: result.value.providerId } : {}),
      });
      if (!result.ok) {
        const message = commandMessage(result.error);
        setError(message);
        await services.diagnostics?.checkpoint('uxp.ui.profile_detail.save.error_state_set', {
          profileId: input.profileId,
          category: result.error.category,
        }, {
          profile_id: input.profileId,
        });
        throw new Error(message);
      }
      await services.diagnostics?.checkpoint('uxp.ui.profile_detail.save.before_set_profile', {
        profileId: result.value.profileId,
        providerId: result.value.providerId,
      }, {
        profile_id: result.value.profileId,
        provider_id: result.value.providerId,
      });
      setProfile(result.value);
      await services.diagnostics?.checkpoint('uxp.ui.profile_detail.save.after_set_profile', {
        profileId: result.value.profileId,
        providerId: result.value.providerId,
      }, {
        profile_id: result.value.profileId,
        provider_id: result.value.providerId,
      });
      setError(null);
      await services.diagnostics?.checkpoint('uxp.ui.profile_detail.save.error_cleared', {
        profileId: result.value.profileId,
        providerId: result.value.providerId,
      }, {
        profile_id: result.value.profileId,
        provider_id: result.value.providerId,
      });
      return result.value;
    },
    [services],
  );

  const remove = useCallback(async (): Promise<void> => {
    if (!profileId) {
      return;
    }
    const result = await services.commands.deleteProviderProfile(profileId);
    if (!result.ok) {
      const message = commandMessage(result.error);
      setError(message);
      throw new Error(message);
    }
    setProfile(null);
  }, [profileId, services]);

  const test = useCallback(
    async (connect = true): Promise<ProviderProfileTestResult> => {
      if (!profileId) {
        throw new Error('No provider profile selected.');
      }
      const result = await services.commands.testProviderProfile(profileId, { connect });
      if (!result.ok) {
        const message = commandMessage(result.error);
        setError(message);
        throw new Error(message);
      }
      setError(null);
      return result.value;
    },
    [profileId, services],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profile, loading, error, reload, save, remove, test };
}

export function providerConfigFromForm(
  providerId: string,
  displayName: string,
  family: string,
  baseURL: string,
  defaultModel: string,
  instruction?: string,
): ProviderProfileConfig {
  const config: Record<string, ProviderProfileConfigValue> = {
    providerId,
    displayName,
    family,
    baseURL,
  };
  if (family === 'image-endpoint' || family === 'chat-image') {
    config.imageMaxSide = 2048;
  }
  if (defaultModel.trim()) {
    config.defaultModel = defaultModel.trim();
  }
  if (instruction && instruction.trim()) {
    config.instruction = instruction.trim();
  }
  return config;
}
