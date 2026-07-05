import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApiFormat,
  EndpointMeasurementResult,
  MeasureProfileEndpointsResult,
  ProviderDescriptor,
  ProviderModelInfo,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileConfigValue,
  ProviderProfileConnectionTestResult,
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
  return useMemo(() => services.commands.listProviders(), [services]);
}

export function apiFormatLabel(apiFormat: ApiFormat | null | undefined): string {
  if (apiFormat === 'openai-images') {
    return 'OpenAI Images';
  }
  if (apiFormat === 'openai-chat-completions') {
    return 'OpenAI Chat Completions';
  }
  if (apiFormat === 'gemini-generate-content') {
    return 'Gemini GenerateContent';
  }
  return 'Auto Detect';
}

export function descriptorForApiFormat(
  providers: readonly ProviderDescriptor[],
  apiFormat: ApiFormat | null | undefined,
): ProviderDescriptor | undefined {
  if (!apiFormat) {
    return undefined;
  }
  return providers.find((provider) => provider.apiFormat === apiFormat && provider.id !== 'mock')
    ?? providers.find((provider) => provider.apiFormat === apiFormat);
}

export interface ProviderProfileUpsertCapabilities {
  readonly canDeleteProfile: boolean;
  readonly canRemoveSavedApiKey: boolean;
  readonly canRemoveSavedBillingToken: boolean;
  readonly canRefreshPersistedModelCache: boolean;
  readonly canReadBillingState: boolean;
}

export function providerSupportsBalanceQuery(
  descriptor: ProviderDescriptor | null | undefined,
  profile: ProviderProfile | null,
): boolean {
  const query = descriptor?.billing?.query;
  if (query === 'supported') {
    return true;
  }
  if (query === 'unsupported' || !profile) {
    return false;
  }
  if (query === 'mode-dependent') {
    const billing = profile.config.billing;
    if (!billing || typeof billing !== 'object' || Array.isArray(billing)) {
      return descriptor?.billing?.defaultMode !== 'none';
    }
    return (billing as { readonly mode?: unknown }).mode !== 'none';
  }
  return true;
}

export function providerProfileUpsertCapabilities(
  profile: ProviderProfile | null,
  descriptor?: ProviderDescriptor | null,
): ProviderProfileUpsertCapabilities {
  return {
    canDeleteProfile: Boolean(profile),
    canRemoveSavedApiKey: Boolean(profile?.secretRefs?.apiKey),
    canRemoveSavedBillingToken: Boolean(profile?.secretRefs?.billingAccessToken),
    canRefreshPersistedModelCache: Boolean(profile),
    canReadBillingState: providerSupportsBalanceQuery(descriptor, profile),
  };
}

export function providerModelOptions(
  models: readonly ProviderModelInfo[],
): readonly { readonly id: string; readonly label: string }[] {
  return models.map((model) => ({
    id: model.id,
    label: model.displayName ?? model.id,
  }));
}

export interface ProviderDraftModelCatalogOptions {
  readonly services: AppServices;
  readonly persistedProfileId: string | null;
  readonly persistedRevisionKey?: string;
  readonly configuredDefaultModel: string;
  readonly descriptorDefaultModels?: readonly ProviderModelInfo[];
  readonly discoverySupported: boolean;
  readonly canRefreshPersistedModelCache: boolean;
  readonly isDraftDirty: boolean;
  readonly resetKey: string;
  readonly refreshDraftModels: () => Promise<
    | { readonly ok: true; readonly value: readonly ProviderModelInfo[] }
    | { readonly ok: false; readonly error: { readonly category: string; readonly message: string } }
  >;
}

export interface ProviderDraftModelCatalogState {
  readonly models: readonly ProviderModelInfo[];
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly selectedModelInfo: ProviderModelInfo | undefined;
  readonly persistedLoading: boolean;
  readonly refreshBusy: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly stale: boolean;
  readonly measurementResults: readonly EndpointMeasurementResult[];
  readonly resolvedEndpointId?: string;
  readonly refresh: () => Promise<readonly ProviderModelInfo[]>;
  readonly invalidate: () => void;
  readonly clearProofs: () => void;
  readonly applyProbeResult: (result: MeasureProfileEndpointsResult) => void;
  readonly applyConnectionTestResult: (result: ProviderProfileConnectionTestResult) => void;
}

export function useProviderDraftModelCatalog(
  options: ProviderDraftModelCatalogOptions,
): ProviderDraftModelCatalogState {
  const {
    services,
    persistedProfileId,
    persistedRevisionKey,
    configuredDefaultModel,
    descriptorDefaultModels = [],
    discoverySupported,
    canRefreshPersistedModelCache,
    isDraftDirty,
    resetKey,
    refreshDraftModels,
  } = options;
  const persisted = useProfileModels(services, persistedProfileId, persistedRevisionKey);
  const [draftModels, setDraftModels] = useState<readonly ProviderModelInfo[] | null>(null);
  const [stale, setStale] = useState(false);
  const [measurementResults, setMeasurementResults] = useState<readonly EndpointMeasurementResult[]>([]);
  const [resolvedEndpointId, setResolvedEndpointId] = useState<string | undefined>();
  const [refreshBusy, setRefreshBusy] = useState(false);

  useEffect(() => {
    setDraftModels(null);
    setStale(false);
    setMeasurementResults([]);
    setResolvedEndpointId(undefined);
    setRefreshBusy(false);
  }, [resetKey]);

  const fallbackModels = useMemo(
    () => descriptorDefaultModels.map((model) => ({
      ...model,
      supportStatus: model.supportStatus ?? 'selectable',
    })),
    [descriptorDefaultModels],
  );

  const models = useMemo(() => {
    if (draftModels) {
      return draftModels;
    }
    if (persisted.models.length > 0) {
      return persisted.models;
    }
    return fallbackModels;
  }, [draftModels, fallbackModels, persisted.models]);

  const optionsList = useMemo(() => providerModelOptions(models), [models]);
  const selectedModelInfo = useMemo(
    () => models.find((model) => model.id === configuredDefaultModel.trim()),
    [configuredDefaultModel, models],
  );

  const clearProofs = useCallback(() => {
    setMeasurementResults([]);
    setResolvedEndpointId(undefined);
  }, []);

  const invalidate = useCallback(() => {
    clearProofs();
    if (!discoverySupported) {
      return;
    }
    if (draftModels || persisted.models.length > 0) {
      setStale(true);
    }
  }, [clearProofs, discoverySupported, draftModels, persisted.models.length]);

  const applyProbeResult = useCallback((result: MeasureProfileEndpointsResult) => {
    setMeasurementResults(result.results);
    setResolvedEndpointId(result.resolvedEndpointId);
    setStale(false);
  }, []);

  const applyConnectionTestResult = useCallback((result: ProviderProfileConnectionTestResult) => {
    if (result.models) {
      setDraftModels(result.models);
      setStale(false);
    }
  }, []);

  const refresh = useCallback(async (): Promise<readonly ProviderModelInfo[]> => {
    if (!discoverySupported) {
      throw new Error('Model discovery unsupported.');
    }
    setRefreshBusy(true);
    try {
      if (!persistedProfileId || isDraftDirty || !canRefreshPersistedModelCache) {
        const result = await refreshDraftModels();
        if (!result.ok) {
          throw new Error(commandMessage(result.error));
        }
        setDraftModels(result.value);
        setStale(false);
        clearProofs();
        return result.value;
      }
      const value = await persisted.refresh();
      setDraftModels(null);
      setStale(false);
      clearProofs();
      return value;
    } finally {
      setRefreshBusy(false);
    }
  }, [
    canRefreshPersistedModelCache,
    clearProofs,
    discoverySupported,
    isDraftDirty,
    persisted,
    persistedProfileId,
    refreshDraftModels,
  ]);

  return {
    models,
    options: optionsList,
    selectedModelInfo,
    persistedLoading: persisted.loading,
    refreshBusy,
    loading: persisted.loading || refreshBusy,
    error: persisted.error,
    stale,
    measurementResults,
    resolvedEndpointId,
    refresh,
    invalidate,
    clearProofs,
    applyProbeResult,
    applyConnectionTestResult,
  };
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
  const sequenceRef = useRef(0);

  const reload = useCallback(async () => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    if (!profileId) {
      setModels([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await services.commands.listProfileModels(profileId);
      if (sequenceRef.current !== sequence) {
        return;
      }
      if (result.ok) {
        setModels(result.value);
        setError(null);
      } else {
        setModels([]);
        setError(commandMessage(result.error));
      }
    } catch (error) {
      if (sequenceRef.current !== sequence) {
        return;
      }
      setModels([]);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (sequenceRef.current === sequence) {
        setLoading(false);
      }
    }
  }, [profileId, revisionKey, services]);

  const refresh = useCallback(async (): Promise<readonly ProviderModelInfo[]> => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    if (!profileId) {
      return [];
    }
    setLoading(true);
    try {
      const result = await services.commands.refreshProfileModels(profileId);
      if (sequenceRef.current !== sequence) {
        return result.ok ? result.value : [];
      }
      if (result.ok) {
        setModels(result.value);
        setError(null);
        return result.value;
      }
      const message = commandMessage(result.error);
      setError(message);
      throw new Error(message);
    } finally {
      if (sequenceRef.current === sequence) {
        setLoading(false);
      }
    }
  }, [profileId, services]);

  const replace = useCallback((nextModels: readonly ProviderModelInfo[]) => {
    sequenceRef.current += 1;
    setModels(nextModels);
    setError(null);
    setLoading(false);
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
        apiFormat: input.apiFormat ?? null,
        enabled: input.enabled ?? null,
        hasSecretValues: Object.keys(input.secretValues ?? {}).length > 0,
        configKeyCount: Object.keys(input.config ?? {}).length,
      }, {
        profile_id: input.profileId,
        ...(input.apiFormat ? { api_format: input.apiFormat } : {}),
      });
      const result = await services.commands.saveProviderProfile(input);
      await services.diagnostics?.checkpoint('uxp.ui.profile_detail.save.after_command', {
        profileId: input.profileId,
        ok: result.ok,
      }, {
        profile_id: input.profileId,
        ...(result.ok ? { api_format: result.value.apiFormat } : {}),
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
        apiFormat: result.value.apiFormat,
      }, {
        profile_id: result.value.profileId,
        api_format: result.value.apiFormat,
      });
      setProfile(result.value);
      await services.diagnostics?.checkpoint('uxp.ui.profile_detail.save.after_set_profile', {
        profileId: result.value.profileId,
        apiFormat: result.value.apiFormat,
      }, {
        profile_id: result.value.profileId,
        api_format: result.value.apiFormat,
      });
      setError(null);
      await services.diagnostics?.checkpoint('uxp.ui.profile_detail.save.error_cleared', {
        profileId: result.value.profileId,
        apiFormat: result.value.apiFormat,
      }, {
        profile_id: result.value.profileId,
        api_format: result.value.apiFormat,
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
  readonly selectedEndpointId?: string;
  readonly endpoints: readonly ProviderEndpointDraft[];
}

export type BillingModeDraft = 'none' | 'official' | 'new-api';
export type AuthModeDraft = 'bearer' | 'x-goog-api-key' | 'none';

export interface ApiPathDraft {
  readonly generation: string;
  readonly edit: string;
  readonly invoke: string;
  readonly invokeTemplate: string;
  readonly authMode: AuthModeDraft;
}

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

export function defaultApiPathDraft(apiFormat: ApiFormat | null | undefined): ApiPathDraft {
  if (apiFormat === 'openai-images') {
    return {
      generation: '/images/generations',
      edit: '/images/edits',
      invoke: '/chat/completions',
      invokeTemplate: '/models/{model}:generateContent',
      authMode: 'bearer',
    };
  }
  if (apiFormat === 'gemini-generate-content') {
    return {
      generation: '/images/generations',
      edit: '/images/edits',
      invoke: '/chat/completions',
      invokeTemplate: '/models/{model}:generateContent',
      authMode: 'x-goog-api-key',
    };
  }
  return {
    generation: '/images/generations',
    edit: '/images/edits',
    invoke: '/chat/completions',
    invokeTemplate: '/models/{model}:generateContent',
    authMode: 'bearer',
  };
}

function readPathRecord(profile: ProviderProfile | null): Record<string, unknown> {
  const paths = profile?.config.paths;
  return typeof paths === 'object' && paths !== null && !Array.isArray(paths)
    ? paths as Record<string, unknown>
    : {};
}

export function readApiPathDraft(profile: ProviderProfile | null): ApiPathDraft {
  const defaults = defaultApiPathDraft(profile?.apiFormat);
  const paths = readPathRecord(profile);
  const authMode = profile?.config.authMode;
  return {
    generation: typeof paths.generation === 'string' ? paths.generation : defaults.generation,
    edit: typeof paths.edit === 'string' ? paths.edit : defaults.edit,
    invoke: typeof paths.invoke === 'string' ? paths.invoke : defaults.invoke,
    invokeTemplate: typeof paths.invokeTemplate === 'string' ? paths.invokeTemplate : defaults.invokeTemplate,
    authMode: authMode === 'bearer' || authMode === 'x-goog-api-key' || authMode === 'none' ? authMode : defaults.authMode,
  };
}

export function mergeApiPathDraft(
  draft: ApiPathDraft,
  paths: unknown,
  apiFormat: ApiFormat,
): ApiPathDraft {
  const record = typeof paths === 'object' && paths !== null && !Array.isArray(paths)
    ? paths as Record<string, unknown>
    : {};
  return {
    ...draft,
    ...(apiFormat === 'openai-images' && typeof record.generation === 'string' ? { generation: record.generation } : {}),
    ...(apiFormat === 'openai-images' && typeof record.edit === 'string' ? { edit: record.edit } : {}),
    ...(apiFormat === 'openai-chat-completions' && typeof record.invoke === 'string' ? { invoke: record.invoke } : {}),
    ...(apiFormat === 'gemini-generate-content' && typeof record.invokeTemplate === 'string' ? { invokeTemplate: record.invokeTemplate } : {}),
  };
}

export function pathConfigFromDraft(apiFormat: ApiFormat, draft: ApiPathDraft): ProviderProfileConfigValue {
  if (apiFormat === 'openai-images') {
    return {
      generation: draft.generation.trim(),
      ...(draft.edit.trim() ? { edit: draft.edit.trim() } : {}),
    };
  }
  if (apiFormat === 'openai-chat-completions') {
    return { invoke: draft.invoke.trim() };
  }
  return { invokeTemplate: draft.invokeTemplate.trim() };
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
      endpoints,
    };
  }
  const selectedEndpointId = endpoints.some((endpoint) => endpoint.id === cleanedDraft.selectedEndpointId && endpoint.enabled)
    ? cleanedDraft.selectedEndpointId
    : nextPreferredEndpointId(endpoints);
  return {
    selectionMode: 'manual',
    ...(selectedEndpointId ? { selectedEndpointId } : {}),
    endpoints,
  };
}

export function readProviderConnectionDraft(profile: ProviderProfile | null): ProviderConnectionDraft {
  const config = profile?.config;
  const connection = config?.connection;
  if (typeof connection === 'object' && connection !== null && !Array.isArray(connection)) {
    const record = connection as {
      readonly selectionMode?: 'manual' | 'auto';
      readonly selectedEndpointId?: string;
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
      selectedEndpointId: typeof record.selectedEndpointId === 'string' ? record.selectedEndpointId : undefined,
      endpoints,
    });
  }
  return normalizeProviderConnectionDraft({
    selectionMode: 'manual',
    endpoints: [createProviderEndpointDraft()],
  });
}

export function connectionProbeResultById(
  results: readonly EndpointMeasurementResult[] | undefined,
): ReadonlyMap<string, EndpointMeasurementResult> {
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
  apiFormat: ApiFormat,
  displayName: string,
  connection: ProviderConnectionDraft,
  defaultModel: string,
  paths: ApiPathDraft,
  billing?: ProviderBillingDraft,
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
    apiFormat,
    displayName: sanitizeProviderDisplayName(displayName),
    paths: pathConfigFromDraft(apiFormat, paths),
    connection: {
      selectionMode: normalizedConnection.selectionMode,
      ...(normalizedConnection.selectedEndpointId ? { selectedEndpointId: normalizedConnection.selectedEndpointId } : {}),
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
  if (apiFormat === 'gemini-generate-content') {
    config.authMode = paths.authMode;
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
