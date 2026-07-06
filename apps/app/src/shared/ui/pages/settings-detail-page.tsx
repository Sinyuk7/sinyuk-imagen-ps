import { useEffect, useRef, useState } from 'react';
import type { ProviderProfile, ProviderProfileConfig, ProviderProfileConfigValue, UserModelConfig } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import {
  apiFormatLabel,
  billingFieldError,
  billingModeOptions,
  connectionProbeResultById,
  defaultApiPathDraft,
  descriptorForApiFormat,
  formatBillingDetail,
  mergeApiPathDraft,
  normalizeProviderConnectionDraft,
  providerSupportsBalanceQuery,
  providerConfigFromForm,
  readApiPathDraft,
  readProviderBillingDraft,
  readProviderConnectionDraft,
  sanitizeProviderDisplayName,
  sanitizeProviderSecretValue,
  useProfileDetail,
  useProviderCatalog,
  type ApiPathDraft,
  type ProviderBillingDraft,
  type ProviderConnectionDraft,
} from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { ProviderBillingSettings } from '../components/provider-billing-settings';
import { ProviderProfileEditor } from '../components/provider-profile-editor';
import {
  ProviderAdvancedPathSection,
  ProviderDefaultModelSection,
  ProviderSettingsFooter,
  ProviderSettingsPageHeader,
} from '../components/provider-settings-sections';
import { StatusNotice } from '../components/status-notice';
import { useToast } from '../components/toast-host';
import { useI18n } from '../i18n/i18n-context';
import { IconButton } from '../primitives/icon-button';
import {
  statusFromEndpointMeasurementResult,
  statusFromProviderConnectionTestResult,
} from '../provider-status';
import { useProfileBilling } from '../hooks/use-profile-billing';
import { formatBalanceChange, formatBillingPrimary, formatExactTaskCost } from '../../domain/mappers';
import { importProviderEndpointInput } from '../hooks/provider-endpoint-import';
import { userModelConfigVisibleLabel } from '../model-info';

interface SettingsDetailPageProps {
  readonly onNav: (view: string) => void;
  readonly profileId: string | null;
  readonly onProfilesChanged: (profileId: string | null) => Promise<void>;
  readonly onSaved?: (message: string) => void;
  readonly onOpenModelConfiguration?: (input: {
    readonly source: 'profile-detail';
    readonly profileId: string;
    readonly apiFormat: ProviderProfile['apiFormat'];
    readonly modelId?: string | null;
  }) => void;
}

type ConnectionUpdater = (connection: ProviderConnectionDraft) => ProviderConnectionDraft;
type BillingUpdater = (billing: ProviderBillingDraft) => ProviderBillingDraft;

function profileFormCheckpointAttrs(
  profile: ProviderProfile | null,
  form: {
    readonly apiKey: string;
    readonly defaultModel: string;
    readonly billingAccessToken?: string;
  },
): Record<string, unknown> {
  return {
    profileId: profile?.profileId ?? null,
    apiFormat: profile?.apiFormat ?? null,
    configKeyCount: profile ? Object.keys(profile.config).length : 0,
    hasDirtyCredential: form.apiKey.trim().length > 0,
    hasDirtyBillingCredential: (form.billingAccessToken ?? '').trim().length > 0,
    modelIdLength: form.defaultModel.trim().length,
  };
}

function mergeProfileConfigForSave(
  profile: ProviderProfile,
  nextConfig: ProviderProfileConfig,
): ProviderProfileConfig {
  const merged = {
    ...profile.config,
    ...nextConfig,
  } as Record<string, ProviderProfileConfigValue>;
  delete merged.providerId;
  delete merged.family;
  return merged;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeConfigForDraftCompare(config: ProviderProfileConfig): string {
  const normalized: Record<string, unknown> = { ...config };
  const billing = normalized.billing;
  if (
    typeof billing === 'object' &&
    billing !== null &&
    !Array.isArray(billing) &&
    (billing as { readonly mode?: unknown }).mode === 'none'
  ) {
    delete normalized.billing;
  }
  return stableSerialize(normalized);
}

function profileCanCreateModelConfig(profile: ProviderProfile | null): boolean {
  if (!profile) {
    return false;
  }
  const connection = profile.config.connection;
  if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
    return false;
  }
  const endpoints = (connection as { readonly endpoints?: readonly { readonly url?: string; readonly enabled?: boolean }[] }).endpoints;
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return false;
  }
  return endpoints.some((endpoint) => endpoint.enabled !== false && typeof endpoint.url === 'string' && endpoint.url.trim().length > 0);
}

function selectedModelInput(defaultModel: string, existingSelectedModelIds: readonly string[]): {
  readonly selectedModelIds: readonly string[];
  readonly defaultModelId?: string;
} {
  const modelId = defaultModel.trim();
  if (modelId.length === 0) {
    return { selectedModelIds: [] };
  }
  const selectedModelIds = existingSelectedModelIds.includes(modelId)
    ? existingSelectedModelIds
    : [modelId, ...existingSelectedModelIds.filter((id) => id !== modelId)];
  return { selectedModelIds, defaultModelId: modelId };
}

function hasDraftChanges(
  profile: ProviderProfile,
  draft: {
    readonly displayName: string;
    readonly connection: ProviderConnectionDraft;
    readonly defaultModel: string;
    readonly paths: ApiPathDraft;
    readonly billing: ProviderBillingDraft;
    readonly systemInstruction: string;
    readonly apiKey: string;
    readonly apiKeyRemovalPending: boolean;
    readonly billingAccessTokenRemovalPending: boolean;
  },
): boolean {
  if (
    draft.apiKey.trim().length > 0 ||
    draft.billing.accessToken.trim().length > 0 ||
    draft.apiKeyRemovalPending ||
    draft.billingAccessTokenRemovalPending
  ) {
    return true;
  }
  const nextDisplayName = sanitizeProviderDisplayName(draft.displayName) || profile.displayName;
  const nextConfig = mergeProfileConfigForSave(
    profile,
    providerConfigFromForm(
      profile.apiFormat,
      nextDisplayName,
      draft.connection,
      draft.defaultModel,
      draft.paths,
      draft.billing,
    ),
  );
  return (
    nextDisplayName !== profile.displayName ||
    draft.systemInstruction !== (profile.systemInstruction ?? '') ||
    draft.defaultModel.trim() !== (profile.defaultModelId ?? '') ||
    normalizeConfigForDraftCompare(nextConfig) !== normalizeConfigForDraftCompare(profile.config)
  );
}

function duplicateEndpointErrors(
  connection: ProviderConnectionDraft,
  message: string,
): ReadonlyMap<string, string> {
  const seen = new Map<string, string>();
  const errors = new Map<string, string>();
  for (const endpoint of connection.endpoints) {
    const key = endpoint.url.trim().replace(/\/+$/, '').toLowerCase();
    if (!key) {
      continue;
    }
    const previousId = seen.get(key);
    if (previousId) {
      errors.set(previousId, message);
      errors.set(endpoint.id, message);
      continue;
    }
    seen.set(key, endpoint.id);
  }
  return errors;
}

function billingDraftForSave(
  billing: ProviderBillingDraft,
  removeAccessToken: boolean,
): ProviderBillingDraft {
  return removeAccessToken
    ? { ...billing, accessToken: '', hasSavedAccessToken: false }
    : billing;
}

export function SettingsDetailPage({ onNav, profileId, onProfilesChanged, onSaved, onOpenModelConfiguration }: SettingsDetailPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const providers = useProviderCatalog(services);
  const detail = useProfileDetail(services, profileId);
  const { show } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [systemInstruction, setSystemInstruction] = useState('');
  const [connection, setConnection] = useState<ProviderConnectionDraft>(readProviderConnectionDraft(null));
  const [defaultModel, setDefaultModel] = useState('');
  const [paths, setPaths] = useState<ApiPathDraft>(defaultApiPathDraft(null));
  const [billingDraft, setBillingDraft] = useState<ProviderBillingDraft>(readProviderBillingDraft(null));
  const [billingModeMenuOpen, setBillingModeMenuOpen] = useState(false);
  const [authModeMenuOpen, setAuthModeMenuOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyRemovalPending, setApiKeyRemovalPending] = useState(false);
  const [billingAccessTokenRemovalPending, setBillingAccessTokenRemovalPending] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [connectionTestBusy, setConnectionTestBusy] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [userModelOptions, setUserModelOptions] = useState<readonly { readonly id: string; readonly label: string }[]>([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null);
  const lastLoadedProfileIdRef = useRef<string | null>(null);
  const connectionRef = useRef(connection);
  const billingDraftRef = useRef(billingDraft);
  const saveBusyRef = useRef(false);
  const connectionTestBusyRef = useRef(false);
  const providerDescriptor = detail.profile ? descriptorForApiFormat(providers, detail.profile.apiFormat) : undefined;
  const billingSupported = providerSupportsBalanceQuery(providerDescriptor, detail.profile);
  const billing = useProfileBilling(services, profileId, billingSupported);
  const busy = saveBusy;
  const measurementSupported = Boolean(providerDescriptor && providerDescriptor.connectivity?.endpointMeasurement !== 'unsupported');
  const connectionTestSupported = Boolean(providerDescriptor && providerDescriptor.connectivity?.connectionTest !== 'unsupported');

  const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
  const billingValidation = billingFieldError(effectiveBillingDraft, providerDescriptor);
  const endpointErrors = duplicateEndpointErrors(connection, t.settings.duplicateEndpointUrl);
  const draftDirty = detail.profile
    ? hasDraftChanges(
        detail.profile,
        {
          displayName,
          connection,
          defaultModel,
          paths,
          billing: billingDraft,
          systemInstruction,
          apiKey,
          apiKeyRemovalPending,
          billingAccessTokenRemovalPending,
        },
      )
    : false;

  function invalidateDraftProofs() {
    return;
  }

  const updateApiKey = (value: string) => {
    setApiKey(sanitizeProviderSecretValue(value));
    setApiKeyRemovalPending(false);
    invalidateDraftProofs();
  };

  const updateBillingDraft = (updater: BillingUpdater) => {
    const nextBilling = updater(billingDraftRef.current);
    billingDraftRef.current = nextBilling;
    setBillingDraft(nextBilling);
    if (nextBilling.accessToken.trim()) {
      setBillingAccessTokenRemovalPending(false);
    }
    invalidateDraftProofs();
  };

  const updateConnectionDraft = (updater: ConnectionUpdater) => {
    const previous = connectionRef.current;
    let nextConnection = normalizeProviderConnectionDraft(updater(connectionRef.current));
    const changedEndpoint = nextConnection.endpoints.find((endpoint) => {
      const previousEndpoint = previous.endpoints.find((item) => item.id === endpoint.id);
      return previousEndpoint && previousEndpoint.url !== endpoint.url;
    });
    if (changedEndpoint && detail.profile) {
      const imported = importProviderEndpointInput({
        rawValue: changedEndpoint.url,
        apiFormat: detail.profile.apiFormat,
        currentPaths: paths,
        currentConnection: nextConnection,
        endpointId: changedEndpoint.id,
        previousConnection: previous,
        profiles: [],
        nameTouched: true,
        defaultModel,
        defaultPathsForApiFormat: defaultApiPathDraft,
        mergeApiPathDraft,
        classifyEndpoint: services.commands.classifyEndpoint,
      });
      if (imported.classification.status !== 'unsupported') {
        if (imported.classification.apiFormat !== detail.profile.apiFormat) {
          show(
            t.settings.apiFormatConflict(apiFormatLabel(detail.profile.apiFormat), apiFormatLabel(imported.classification.apiFormat)),
            'negative',
            { durationMs: null, copyable: false },
          );
          nextConnection = previous;
        } else {
          setPaths(imported.nextPaths);
          nextConnection = imported.nextConnection;
          void services.diagnostics?.checkpoint('uxp.ui.settings_detail.endpoint_import', {
            apiFormat: detail.profile.apiFormat,
            aliasApplied: imported.diagnostics.aliasApplied,
            aliasCandidate: imported.diagnostics.aliasCandidate ?? null,
            aliasSkippedReason: imported.diagnostics.aliasSkippedReason ?? null,
            importedModel: imported.diagnostics.importedModel ?? null,
            classificationStatus: imported.classification.status,
            classificationSource: imported.classification.source,
          }, {
            profile_id: detail.profile.profileId,
            api_format: detail.profile.apiFormat,
          });
        }
      }
    }
    connectionRef.current = nextConnection;
    setConnection(nextConnection);
    invalidateDraftProofs();
    if (
      previous.selectionMode !== 'auto' &&
      nextConnection.selectionMode === 'auto' &&
      detail.profile &&
      measurementSupported &&
      nextConnection.endpoints.some((endpoint) => endpoint.enabled && endpoint.url.trim())
    ) {
      void probeEndpoints();
    }
  };

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    setDisplayName(detail.profile.displayName);
    setSystemInstruction(detail.profile.systemInstruction ?? '');
    const nextConnection = readProviderConnectionDraft(detail.profile);
    connectionRef.current = nextConnection;
    setConnection(nextConnection);
    setPaths(readApiPathDraft(detail.profile));
    setDefaultModel(detail.profile.defaultModelId ?? '');
    const nextBillingDraft = readProviderBillingDraft(detail.profile);
    billingDraftRef.current = nextBillingDraft;
    setBillingDraft(nextBillingDraft);
    setBillingModeMenuOpen(false);
    setApiKey('');
    setApiKeyRemovalPending(false);
    setBillingAccessTokenRemovalPending(false);
    setAliasError(null);
    setModelMenuOpen(false);
  }, [detail.profile]);

  useEffect(() => {
    const nextProfileId = detail.profile?.profileId ?? null;
    if (lastLoadedProfileIdRef.current === nextProfileId) {
      return;
    }
    lastLoadedProfileIdRef.current = nextProfileId;
  }, [detail.profile?.profileId]);

  useEffect(() => {
    if (!detail.profile) {
      setUserModelOptions([]);
      setModelOptionsLoading(false);
      setModelOptionsError(null);
      return;
    }
    let cancelled = false;
    setModelOptionsLoading(true);
    void Promise.all([
      services.commands.listUserModelConfigs(detail.profile.apiFormat),
      services.commands.listOfficialModelConfigPresets(detail.profile.apiFormat),
    ])
      .then(([
        result,
        presetsResult,
      ]: readonly [
        Awaited<ReturnType<typeof services.commands.listUserModelConfigs>>,
        Awaited<ReturnType<typeof services.commands.listOfficialModelConfigPresets>>,
      ]) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setUserModelOptions([]);
          setModelOptionsError(`${result.error.category}: ${result.error.message}`);
          return;
        }
        if (!presetsResult.ok) {
          setUserModelOptions([]);
          setModelOptionsError(`${presetsResult.error.category}: ${presetsResult.error.message}`);
          return;
        }
        const officialDisplayNames = new Map(
          presetsResult.value.map((preset) => [preset.modelId, preset.displayName] as const),
        );
        const nextOptions = result.value.map((config: UserModelConfig) => ({
          id: config.modelId,
          label: userModelConfigVisibleLabel(config, officialDisplayNames),
        }));
        setUserModelOptions(nextOptions);
        setModelOptionsError(null);
        if (defaultModel && !nextOptions.some((option) => option.id === defaultModel)) {
          setDefaultModel('');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setUserModelOptions([]);
        setModelOptionsError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setModelOptionsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [defaultModel, detail.profile, services.commands]);

  const persistProfile = async (): Promise<ProviderProfile | null> => {
    if (!detail.profile) {
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.persist.no_profile', { profileId });
      return null;
    }
    await services.diagnostics?.checkpoint(
      'uxp.ui.settings_detail.persist.input_prepared',
      profileFormCheckpointAttrs(detail.profile, { apiKey, defaultModel, billingAccessToken: billingDraft.accessToken }),
      {
        profile_id: detail.profile.profileId,
        api_format: detail.profile.apiFormat,
      },
    );
    const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
    const removedSecretNames = [
      ...(apiKeyRemovalPending ? ['apiKey'] : []),
      ...(billingAccessTokenRemovalPending ? ['billingAccessToken'] : []),
    ];
    return detail.save({
      profileId: detail.profile.profileId,
      apiFormat: detail.profile.apiFormat,
      displayName: sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
      systemInstruction,
      enabled: detail.profile.enabled,
      config: mergeProfileConfigForSave(
        detail.profile,
        providerConfigFromForm(
          detail.profile.apiFormat,
          sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
          connection,
          defaultModel,
          paths,
          effectiveBillingDraft,
        ),
      ),
      ...selectedModelInput(defaultModel, detail.profile.selectedModelIds),
      ...(removedSecretNames.length > 0 ? { removedSecretNames } : {}),
      ...((apiKey.trim() || effectiveBillingDraft.accessToken.trim())
        ? {
            secretValues: {
              ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
              ...(effectiveBillingDraft.accessToken.trim() ? { billingAccessToken: effectiveBillingDraft.accessToken.trim() } : {}),
            },
          }
        : {}),
    });
  };

  const buildDraftCommandInput = () => {
    if (!detail.profile) {
      throw new Error('No provider profile selected.');
    }
    const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
    const removedSecretNames = [
      ...(apiKeyRemovalPending ? ['apiKey'] : []),
      ...(billingAccessTokenRemovalPending ? ['billingAccessToken'] : []),
    ];
    return {
      profileId: detail.profile.profileId,
      apiFormat: detail.profile.apiFormat,
      displayName: sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
      systemInstruction,
      config: mergeProfileConfigForSave(
        detail.profile,
        providerConfigFromForm(
          detail.profile.apiFormat,
          sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
          connection,
          defaultModel,
          paths,
          effectiveBillingDraft,
        ),
      ),
      ...selectedModelInput(defaultModel, detail.profile.selectedModelIds),
      ...(removedSecretNames.length > 0 ? { removedSecretNames } : {}),
      ...((apiKey.trim() || effectiveBillingDraft.accessToken.trim())
        ? {
            secretValues: {
              ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
              ...(effectiveBillingDraft.accessToken.trim() ? { billingAccessToken: effectiveBillingDraft.accessToken.trim() } : {}),
            },
          }
        : {}),
    };
  };

  const testCurrentDraftConnection = async () => services.commands.testProviderProfileConnection(buildDraftCommandInput());

  const save = async () => {
    if (saveBusyRef.current) {
      return;
    }
    saveBusyRef.current = true;
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.entered', { profileId });
    setSaveBusy(true);
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.busy_set', { busy: true, profileId });
    setAliasError(null);
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.status_cleared', { profileId });
    try {
      const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
      const validation = billingFieldError(effectiveBillingDraft, providerDescriptor);
      if (validation === 'user-id') {
        throw new Error(t.settings.billingValidationUserId);
      }
      if (validation === 'token') {
        throw new Error(t.settings.billingValidationAccessToken);
      }
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_persist', { profileId });
      const profile = await persistProfile();
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_persist', {
        profileId: profile?.profileId ?? null,
        apiFormat: profile?.apiFormat ?? null,
        hasProfile: profile !== null,
      }, {
        ...(profile ? { profile_id: profile.profileId, api_format: profile.apiFormat } : {}),
      });
      if (profile) {
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_success_feedback', {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
        }, {
          profile_id: profile.profileId,
          api_format: profile.apiFormat,
        });
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_success_feedback', {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
        }, {
          profile_id: profile.profileId,
          api_format: profile.apiFormat,
        });
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_profiles_changed', {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
        }, {
          profile_id: profile.profileId,
          api_format: profile.apiFormat,
        });
        await onProfilesChanged(profile.profileId);
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_profiles_changed', {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
        }, {
          profile_id: profile.profileId,
          api_format: profile.apiFormat,
        });
        onSaved?.(t.settings.saved);
        onNav('settings');
      }
    } catch (error) {
      await services.diagnostics?.failure('uxp.ui.settings_detail.save.failed', error, { profileId });
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('displayName')) {
        setAliasError(t.settings.duplicateDisplayName(sanitizeProviderDisplayName(displayName)));
      }
      show(message, 'negative', { key: 'settings-detail-save-error', durationMs: null, copyable: true });
    } finally {
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_busy_clear', { profileId });
      saveBusyRef.current = false;
      setSaveBusy(false);
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_busy_clear', { profileId });
    }
  };

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    void services.diagnostics?.checkpoint('uxp.ui.settings_detail.render.ready', {
      profileId: detail.profile.profileId,
      apiFormat: detail.profile.apiFormat,
      busy,
      hasStatus: false,
      }, {
        profile_id: detail.profile.profileId,
        api_format: detail.profile.apiFormat,
      });
  }, [busy, detail.profile, services.diagnostics]);

  const test = async () => {
    if (connectionTestBusyRef.current) {
      return;
    }
    connectionTestBusyRef.current = true;
    setConnectionTestBusy(true);
    try {
      const result = await testCurrentDraftConnection();
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      const status = statusFromProviderConnectionTestResult(result.value, t);
      show(status.message, status.tone, {
        key: 'settings-detail-connection-test',
        durationMs: status.durationMs,
        dismissible: status.dismissible,
        copyable: status.copyable,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      show(`${t.settings.connectionFailed}: ${detail}`, 'negative', {
        key: 'settings-detail-connection-test-error',
        durationMs: null,
        copyable: true,
      });
    } finally {
      connectionTestBusyRef.current = false;
      setConnectionTestBusy(false);
    }
  };

  const probeEndpoints = async () => {
    try {
      const result = await services.commands.measureProfileEndpoints(buildDraftCommandInput());
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      const status = statusFromEndpointMeasurementResult(result.value, t);
      show(status.message, status.tone, {
        key: 'settings-detail-endpoint-probe',
        durationMs: status.durationMs,
        dismissible: status.dismissible,
        copyable: status.copyable,
      });
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', {
        key: 'settings-detail-endpoint-probe-error',
        durationMs: null,
        copyable: true,
      });
    }
  };

  const visibleDefaultModelId = userModelOptions.some((model) => model.id === defaultModel)
    ? defaultModel
    : '';

  const remove = async () => {
    if (saveBusyRef.current) {
      return;
    }
    saveBusyRef.current = true;
    setSaveBusy(true);
    try {
      await detail.remove();
      await onProfilesChanged(null);
      onNav('settings');
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', { key: 'settings-detail-delete-error', durationMs: null, copyable: true });
    } finally {
      saveBusyRef.current = false;
      setSaveBusy(false);
    }
  };

  const modelSelectionLabel = userModelOptions.find((option) => option.id === visibleDefaultModelId)?.label ?? '';
  const modelTriggerValue = modelSelectionLabel || t.settings.chooseFromList;
  const saveDisabled = busy || !detail.profile || !draftDirty || endpointErrors.size > 0 || Boolean(aliasError);
  const modelEmptyState = detail.profile && userModelOptions.length === 0
    ? {
        tone: modelOptionsError ? 'warning' as const : 'info' as const,
        message: modelOptionsError ? t.settings.modelListFailed : t.settings.modelSelectionEmpty,
        detail: modelOptionsError ?? t.settings.modelSelectionCreateFirst,
        actionLabel: t.settings.createModelConfiguration,
        onAction: () => {
          onOpenModelConfiguration?.({
            source: 'profile-detail',
            profileId: detail.profile!.profileId,
            apiFormat: detail.profile!.apiFormat,
            modelId: null,
          });
        },
      }
    : null;

  const updatePath = (next: Partial<ApiPathDraft>) => {
    setPaths((current) => ({ ...current, ...next }));
    invalidateDraftProofs();
  };

  const renderBillingSection = () => {
    const balance = formatBillingPrimary(billing.billing);
    const checkedAt = billing.billing?.balance?.checkedAt;
    const isConfigured = Boolean(balance) || billingDraft.mode !== 'none' || Boolean(billing.billing?.balance);
    const billingHint = !isConfigured
      ? t.settings.billingDisabled
      : balance
        ? `${t.settings.billingBalanceLabel} ${balance}`
        : t.settings.billingModeHint;

    return (
      <div className="provider-embedded-section">
        <div className="settings-inline-heading-row billing-inline-heading">
          <div className="section-title settings-section-heading">{t.settings.billing}</div>
          <div className="billing-inline-summary">{billingHint}</div>
        </div>
        <ProviderBillingSettings
          billing={effectiveBillingDraft}
          onBillingChange={updateBillingDraft}
          billingModeOptions={billingModeOptions(providerDescriptor)}
          modeMenuOpen={billingModeMenuOpen}
          onModeMenuOpenChange={setBillingModeMenuOpen}
          disabled={busy}
          accessTokenPlaceholder="sk-..."
          accessTokenSavedMeta={billingDraft.hasSavedAccessToken && !billingAccessTokenRemovalPending ? t.settings.savedSecretPlaceholder : null}
          accessTokenRemovalPending={billingAccessTokenRemovalPending}
          onAccessTokenRemove={() => {
            const nextBillingDraft = { ...billingDraftRef.current, accessToken: '', hasSavedAccessToken: false };
            billingDraftRef.current = nextBillingDraft;
            setBillingDraft(nextBillingDraft);
            setBillingAccessTokenRemovalPending(true);
            invalidateDraftProofs();
          }}
          userIdError={billingValidation === 'user-id' ? t.settings.billingValidationUserId : null}
          accessTokenError={billingValidation === 'token' ? t.settings.billingValidationAccessToken : null}
        />
        {billing.billing?.balance?.snapshot.details?.length ? (
          <div className="billing-detail-list">
            <div className="billing-detail-title">{t.settings.billingDetails}</div>
            {billing.billing.balance.snapshot.details.map((billingDetail, index) => (
              <div
                key={`${billingDetail.kind}:${index}`}
                className={`billing-detail-item${index > 0 ? ' billing-detail-item-spaced' : ''}`}
              >
                {formatBillingDetail(billingDetail)}
              </div>
            ))}
          </div>
        ) : null}
        {billing.billing?.refreshState === 'error' && (
          <div className="billing-error">
            <StatusNotice
              tone="warning"
              message={t.settings.billingErrorStale}
              detail={billing.error}
              copyText={billing.error ?? t.settings.billingErrorStale}
            />
          </div>
        )}
        {checkedAt ? (
          <div className="billing-last-cost">
            {t.settings.billingCheckedAt}: {new Date(checkedAt).toLocaleString()}
          </div>
        ) : null}
        {formatExactTaskCost(billing.billing?.lastExactTaskCost) && (
          <div className="billing-last-cost">
            {t.main.billingLastCost}: {formatExactTaskCost(billing.billing?.lastExactTaskCost)}
          </div>
        )}
        {!formatExactTaskCost(billing.billing?.lastExactTaskCost) && formatBalanceChange(billing.billing?.lastBalanceChange) && (
          <div className="billing-last-cost">
            {t.main.billingLastChange}: {formatBalanceChange(billing.billing?.lastBalanceChange)}
          </div>
        )}
      </div>
    );
  };

  if (!profileId) {
    return (
      <div className="page page-enter">
        <ProviderSettingsPageHeader title={t.common.provider} onBack={() => onNav('settings')} />
        <div className="scroll">
          <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.noProfileSelected}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-enter settings-page">
      <ProviderSettingsPageHeader
        backButtonTestId="provider-detail-back-button"
        title={(
          <div className="page-header-meta">
            <div className="hdr-title page-header-title">{detail.profile?.displayName ?? t.common.provider}</div>
          </div>
        )}
        onBack={() => onNav('settings')}
        rightSlot={(
          <IconButton
            data-testid="provider-delete-button"
            className="hdr-btn"
            hostClassName="hdr-btn-danger"
            quiet
            icon={<Icon name="trash" />}
            tooltip={t.common.delete}
            disabled={busy || !detail.profile}
            onClick={() => void remove()}
          />
        )}
      />

      <div className="scroll scroll-footer-pad scroll-footer-pad-detail">
        {detail.loading && <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>}
        {detail.error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{detail.error}</div>}
        {detail.profile && (
          <>
            <ProviderProfileEditor
              aliasValue={displayName}
              onAliasValue={(value) => {
                setDisplayName(value);
                setAliasError(null);
              }}
              aliasError={aliasError}
              systemInstructionValue={systemInstruction}
              onSystemInstructionValue={setSystemInstruction}
              systemInstructionNativeEditorSuspended={modelMenuOpen}
              apiFormatLabel={apiFormatLabel(detail.profile.apiFormat)}
              apiFormatStatus={apiFormatLabel(detail.profile.apiFormat)}
              apiFormatTone="positive"
              connection={connection}
              onConnectionChange={updateConnectionDraft}
              endpointErrors={endpointErrors}
              measurementResults={connectionProbeResultById([])}
              measurementBusy={false}
              measurementSupported={measurementSupported}
              onMeasure={() => void probeEndpoints()}
              defaultModelSection={(
                <ProviderDefaultModelSection
                  wrapInSection={false}
                  disabled={busy}
                  loading={modelOptionsLoading}
                  canCreateModelConfig={profileCanCreateModelConfig(detail.profile)}
                  modelMenuOpen={modelMenuOpen}
                  modelOptions={userModelOptions}
                  defaultModel={visibleDefaultModelId}
                  triggerValue={modelTriggerValue}
                  modelFieldHelp={null}
                  emptyStateNotice={modelEmptyState}
                  onCreateModelConfig={() => {
                    if (!detail.profile) {
                      return;
                    }
                    onOpenModelConfiguration?.({
                      source: 'profile-detail',
                      profileId: detail.profile.profileId,
                      apiFormat: detail.profile.apiFormat,
                      modelId: null,
                    });
                  }}
                  onModelMenuOpenChange={setModelMenuOpen}
                  onDefaultModelSelect={(id) => {
                    setDefaultModel(id);
                    setModelMenuOpen(false);
                    invalidateDraftProofs();
                  }}
                />
              )}
              balanceSection={renderBillingSection()}
              apiKeyValue={apiKey}
              onApiKeyValue={updateApiKey}
              apiKeyPlaceholder="sk-..."
              showKey={showKey}
              onShowKeyChange={setShowKey}
              apiKeySaved={Boolean(detail.profile.secretRefs?.apiKey) && !apiKeyRemovalPending}
              apiKeyRemovalPending={apiKeyRemovalPending}
              pathSettings={(
                <ProviderAdvancedPathSection
                  wrapInSection={false}
                  apiFormat={detail.profile.apiFormat}
                  paths={paths}
                  authModeMenuOpen={authModeMenuOpen}
                  disabled={busy}
                  onAuthModeMenuOpenChange={setAuthModeMenuOpen}
                  onPathChange={updatePath}
                />
              )}
              disabled={busy}
            />
          </>
        )}
      </div>

      <ProviderSettingsFooter
        testBusy={connectionTestBusy}
        saveBusy={busy}
        testSupported={connectionTestSupported}
        saveDisabled={saveDisabled}
        onTest={() => void test()}
        onSave={() => void save()}
      />
    </div>
  );
}
