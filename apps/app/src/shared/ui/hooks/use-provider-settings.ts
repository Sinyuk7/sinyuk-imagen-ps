import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EndpointProbeResult,
  ProviderDescriptor,
  ProviderModelInfo,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileConfigValue,
  ProviderProfileInput,
  ProviderProfileTestResult,
} from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import { formatCompactMetric } from '../../domain/mappers';

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
  readonly replace: (models: readonly ProviderModelInfo[]) => void;
}

export function useProfileModels(
  services: AppServices,
  profileId: string | null,
  revisionKey?: string,
): ProfileModelsState {
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
  }, [profileId, revisionKey, services]);

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

  const replace = useCallback((nextModels: readonly ProviderModelInfo[]) => {
    setModels(nextModels);
    setError(null);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { models, loading, error, reload, refresh, replace };
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
  const reloadSequenceRef = useRef(0);

  const reload = useCallback(async () => {
    const sequence = reloadSequenceRef.current + 1;
    reloadSequenceRef.current = sequence;
    if (!profileId) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await services.commands.getProviderProfile(profileId);
    if (reloadSequenceRef.current !== sequence) {
      return;
    }
    if (result.ok) {
      setProfile(result.value);
      setError(null);
    } else {
      setProfile(null);
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

function configString(config: ProviderProfileConfig, key: string): string {
  const value = config[key];
  return typeof value === 'string' ? value : '';
}

export interface ProviderEndpointDraft {
  readonly id: string;
  readonly url: string;
  readonly enabled: boolean;
}

export interface ProviderConnectionDraft {
  readonly selectionMode: 'manual' | 'auto';
  readonly failoverEnabled: boolean;
  readonly preferredEndpointId?: string;
  readonly endpoints: readonly ProviderEndpointDraft[];
}

export type BillingModeDraft = 'none' | 'official' | 'new-api';

export interface ProviderBillingDraft {
  readonly mode: BillingModeDraft;
  readonly userId: string;
  readonly accessToken: string;
  readonly hasSavedAccessToken: boolean;
}

function createEndpointId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `endpoint-${crypto.randomUUID()}`;
  }
  return `endpoint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextPreferredEndpointId(endpoints: readonly ProviderEndpointDraft[]): string | undefined {
  return endpoints.find((endpoint) => endpoint.enabled)?.id;
}

export function sanitizeProviderDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function sanitizeProviderEndpointUrl(value: string): string {
  return value.replace(/[\r\n]+/g, '').trim();
}

export function sanitizeProviderSecretValue(value: string): string {
  return value.trim();
}

export function sanitizeProviderConnectionDraft(
  draft: ProviderConnectionDraft,
): ProviderConnectionDraft {
  return {
    ...draft,
    endpoints: draft.endpoints.map((endpoint) => ({
      ...endpoint,
      url: sanitizeProviderEndpointUrl(endpoint.url),
    })),
  };
}

export function createProviderEndpointDraft(url = ''): ProviderEndpointDraft {
  return {
    id: createEndpointId(),
    url: sanitizeProviderEndpointUrl(url),
    enabled: true,
  };
}

export function normalizeProviderConnectionDraft(
  draft: ProviderConnectionDraft,
): ProviderConnectionDraft {
  const cleanedDraft = sanitizeProviderConnectionDraft(draft);
  const endpoints = cleanedDraft.endpoints.length > 0
    ? cleanedDraft.endpoints
    : [createProviderEndpointDraft()];
  if (cleanedDraft.selectionMode === 'auto') {
    return {
      selectionMode: 'auto',
      failoverEnabled: cleanedDraft.failoverEnabled,
      endpoints,
    };
  }
  const preferredEndpointId = endpoints.some((endpoint) => endpoint.id === cleanedDraft.preferredEndpointId && endpoint.enabled)
    ? cleanedDraft.preferredEndpointId
    : nextPreferredEndpointId(endpoints);
  return {
    selectionMode: 'manual',
    failoverEnabled: cleanedDraft.failoverEnabled,
    ...(preferredEndpointId ? { preferredEndpointId } : {}),
    endpoints,
  };
}

export function readProviderConnectionDraft(profile: ProviderProfile | null): ProviderConnectionDraft {
  const config = profile?.config;
  const connection = config?.connection;
  if (typeof connection === 'object' && connection !== null && !Array.isArray(connection)) {
    const record = connection as {
      readonly selectionMode?: 'manual' | 'auto';
      readonly failoverEnabled?: boolean;
      readonly preferredEndpointId?: string;
      readonly endpoints?: readonly ProviderEndpointDraft[];
    };
    const endpoints = Array.isArray(record.endpoints)
      ? record.endpoints
          .filter((endpoint): endpoint is ProviderEndpointDraft => typeof endpoint?.id === 'string')
          .map((endpoint) => ({
            id: endpoint.id,
            url: typeof endpoint.url === 'string' ? endpoint.url : '',
            enabled: endpoint.enabled !== false,
          }))
      : [];
    return normalizeProviderConnectionDraft({
      selectionMode: record.selectionMode === 'auto' ? 'auto' : 'manual',
      failoverEnabled: record.failoverEnabled === true,
      preferredEndpointId: record.preferredEndpointId,
      endpoints,
    });
  }
  return normalizeProviderConnectionDraft({
    selectionMode: 'manual',
    failoverEnabled: false,
    endpoints: [createProviderEndpointDraft()],
  });
}

export function connectionProbeResultById(
  results: readonly EndpointProbeResult[] | undefined,
): ReadonlyMap<string, EndpointProbeResult> {
  return new Map((results ?? []).map((result) => [result.endpointId, result] as const));
}

export function readProviderConfigString(profile: ProviderProfile, key: string): string {
  return configString(profile.config, key);
}

export function readProviderBillingDraft(profile: ProviderProfile | null): ProviderBillingDraft {
  const billing = profile?.config.billing;
  if (typeof billing !== 'object' || billing === null || Array.isArray(billing)) {
    return {
      mode: 'none',
      userId: '',
      accessToken: '',
      hasSavedAccessToken: false,
    };
  }
  const record = billing as {
    readonly mode?: BillingModeDraft;
    readonly userId?: string;
    readonly accessTokenSecretRef?: string;
  };
  return {
    mode: record.mode === 'official' || record.mode === 'new-api' ? record.mode : 'none',
    userId: typeof record.userId === 'string' ? record.userId : '',
    accessToken: '',
    hasSavedAccessToken:
      record.mode === 'new-api' &&
      typeof record.accessTokenSecretRef === 'string' &&
      record.accessTokenSecretRef.length > 0,
  };
}

export function billingModeOptions(provider: ProviderDescriptor | undefined): readonly {
  readonly id: BillingModeDraft;
  readonly label: string;
}[] {
  const supported = provider?.billing?.supportedModes ?? ['none'];
  const options: { readonly id: BillingModeDraft; readonly label: string }[] = [];
  for (const mode of supported) {
    if (mode === 'none') {
      options.push({ id: 'none', label: 'Disabled' });
      continue;
    }
    if (mode === 'official') {
      options.push({ id: 'official', label: 'Official' });
      continue;
    }
    if (mode === 'new-api') {
      options.push({ id: 'new-api', label: 'New API' });
    }
  }
  return options;
}

export function defaultBillingDraft(provider: ProviderDescriptor | undefined): ProviderBillingDraft {
  const defaultMode = provider?.billing?.defaultMode;
  const supported = new Set(provider?.billing?.supportedModes ?? ['none']);
  const requiresExtraFields = defaultMode === 'new-api';
  const mode: BillingModeDraft =
    requiresExtraFields && supported.has('none')
      ? 'none'
      : defaultMode === 'official' || defaultMode === 'new-api' || defaultMode === 'none'
      ? defaultMode
      : supported.has('none')
        ? 'none'
        : supported.has('new-api')
          ? 'new-api'
          : supported.has('official')
            ? 'official'
            : 'none';
  return {
    mode,
    userId: '',
    accessToken: '',
    hasSavedAccessToken: false,
  };
}

export function providerConfigFromForm(
  providerId: string,
  displayName: string,
  family: string,
  connection: ProviderConnectionDraft,
  defaultModel: string,
  billing?: ProviderBillingDraft,
  instruction?: string,
): ProviderProfileConfig {
  const normalizedConnection = normalizeProviderConnectionDraft(connection);
  const normalizedBilling = billing
    ? {
        ...billing,
        userId: sanitizeProviderSecretValue(billing.userId),
        accessToken: sanitizeProviderSecretValue(billing.accessToken),
      }
    : undefined;
  const config: Record<string, ProviderProfileConfigValue> = {
    providerId,
    displayName: sanitizeProviderDisplayName(displayName),
    family,
    connection: {
      selectionMode: normalizedConnection.selectionMode,
      failoverEnabled: normalizedConnection.failoverEnabled,
      ...(normalizedConnection.preferredEndpointId ? { preferredEndpointId: normalizedConnection.preferredEndpointId } : {}),
      endpoints: normalizedConnection.endpoints.map((endpoint) => ({
        id: endpoint.id,
        url: endpoint.url,
        enabled: endpoint.enabled,
      })),
    },
  };
  if (defaultModel.trim()) {
    config.defaultModel = defaultModel.trim();
  }
  if (normalizedBilling) {
    if (normalizedBilling.mode === 'none') {
      config.billing = { mode: 'none' };
    } else if (normalizedBilling.mode === 'official') {
      config.billing = { mode: 'official' };
    } else {
      config.billing = {
        mode: 'new-api',
        userId: normalizedBilling.userId,
        accessTokenSecretRef: normalizedBilling.hasSavedAccessToken || normalizedBilling.accessToken
          ? 'secret:pending:billingAccessToken'
          : '',
      };
    }
  }
  if (instruction && instruction.trim()) {
    config.instruction = instruction.trim();
  }
  return config;
}

export function billingSecretValuesFromDraft(billing: ProviderBillingDraft): Readonly<Record<string, string>> | undefined {
  if (billing.mode !== 'new-api') {
    return undefined;
  }
  const token = billing.accessToken.trim();
  if (!token) {
    return undefined;
  }
  return { billingAccessToken: token };
}

export function billingFieldError(
  billing: ProviderBillingDraft,
  provider: ProviderDescriptor | undefined,
): string | null {
  if (!provider?.billing) {
    return null;
  }
  if (!provider.billing.supportedModes.includes(billing.mode)) {
    return 'unsupported';
  }
  if (billing.mode !== 'new-api') {
    return null;
  }
  if (!/^\d+$/.test(billing.userId.trim())) {
    return 'user-id';
  }
  if (!billing.hasSavedAccessToken && billing.accessToken.trim().length === 0) {
    return 'token';
  }
  return null;
}

export function formatBillingDetail(detail: {
  readonly kind: 'money' | 'quota';
  readonly label: string;
  readonly amount?: string;
  readonly currency?: string;
  readonly value?: string;
  readonly unit?: string;
}): string {
  if (detail.kind === 'money') {
    return `${detail.label}: ${detail.amount ?? ''} ${detail.currency ?? ''}`.trim();
  }
  return `${detail.label}: ${formatCompactMetric(detail.value) ?? ''} ${detail.unit ?? ''}`.trim();
}
